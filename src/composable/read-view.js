/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign, withDecompressBudget, getDataView, assertPromiseSupport, MAX_METADATA_BLOCKS} from '../utils.js';
import ImageHeader from '../image-header.js';
import {filterTagsForReturn} from '../tag-filter.js';
import {buildTagsFromMergeBlocks} from '../loadview-pipeline.js';
import {run, createContext} from '../engine.js';
import {isPngTextChunkBlock} from './group-helpers.js';

/**
 * Runs a composition over an image's bytes and builds its tags.
 *
 * @param {object} composition From Composition.createComposition.
 * @param {DataView} dataView The image. A window into a larger buffer is
 *     copied out first.
 * @param {object} options The load options (`expanded`, `async`, `computed`,
 *     `includeUnknown`, `includeOffsets`, `domParser`, `includeTags`,
 *     `excludeTags`, `decompress`).
 * @param {{getDomParser: function, getBase64Image: function, createTagFilter: function, includeTagsIsLimit: (boolean|undefined)}} environment
 *     How XMP gets a DOM parser and a thumbnail its base64, what builds the
 *     tag filter from includeTags, excludeTags and includeTagsIsLimit, and
 *     whether includeTags only caps what is read (see createTagFilter in
 *     tag-filter.js).
 * @returns {object|Promise<object>} The tags, or a promise of them when
 *     `options.async` is set.
 * @throws {UnsupportedFormatError} Synchronously, when no composed format
 *     recognizes the image.
 */
export function readView(composition, dataView, options, environment) {
    const {
        expanded = false,
        async = false,
        computed = false,
        includeUnknown = false,
        includeOffsets = false,
        domParser = undefined,
        includeTags = undefined,
        excludeTags = undefined,
        decompress: decompressConfig = undefined
    } = options;
    dataView = getSelfContainedDataView(dataView);

    const {fileType, blocks: allBlocks, ranges, truncated} = ImageHeader.parseAppMarkers(dataView, expanded && includeOffsets, composition.formats);
    if (async) {
        assertPromiseSupport();
    }
    const blocks = async ? allBlocks : allBlocks.filter((block) => !composition.isHiddenInSyncMode(block));

    const tagFilter = environment.createTagFilter({includeTags, excludeTags, includeTagsIsLimit: environment.includeTagsIsLimit});
    const context = createContext({
        dataView,
        options: {expanded, async, computed, includeUnknown, includeOffsets, domParser, includeTags, excludeTags},
        tagFilter,
        decompressConfig: withDecompressBudget(decompressConfig),
        getBase64Image: environment.getBase64Image,
        getDomParser: environment.getDomParser,
        composed: composition.composed,
    });
    // The pipeline copies png into pngText only when png is returned, so the
    // filter needs no check here.
    const pngTextBlocks = blocks.filter(isPngTextChunkBlock);
    const pngTextIsAsync = async && composition.composed.formats.png === true && pngTextBlocks.some(isNamedCompressedPngTextChunk);

    const result = run(composition, blocks, context);

    return async ? result.then(finish) : finish(result);

    function finish({mergeBlocks}) {
        return buildTagsFromMergeBlocks({
            mergeBlocks: combineUncompressedPngTextBlocks(mergeBlocks).concat(getDerivedBlocks(composition, {expanded, includeOffsets, async, ranges, truncated})),
            parsedGroups: Object.create(null),
            expanded,
            tagFilter,
            dataView,
            fileType,
            pngTextBlocks,
            pngTextIsAsync,
            deps: getMergeDeps(composition.derived),
        });
    }
}

// A caller-supplied DataView can be a window into a larger buffer. Extractors
// slice dataView.buffer, so copy the window out to keep them inside the image.
function getSelfContainedDataView(dataView) {
    if (isWindowIntoLargerBuffer(dataView)) {
        return getDataView(dataView.buffer.slice(dataView.byteOffset, dataView.byteOffset + dataView.byteLength));
    }
    return dataView;
}

function isWindowIntoLargerBuffer(dataView) {
    return isDataViewLike(dataView)
        && ((dataView.byteOffset > 0) || (dataView.byteLength < dataView.buffer.byteLength));
}

// A DataView from another realm, an iframe for example, fails instanceof, so
// match on the shape instead. A typed array has no getUint8, so it is not
// treated as a window here.
function isDataViewLike(dataView) {
    return !!dataView
        && (typeof dataView.getUint8 === 'function')
        && (typeof dataView.byteOffset === 'number')
        && (typeof dataView.byteLength === 'number')
        && !!dataView.buffer
        && (typeof dataView.buffer.slice === 'function');
}

function isNamedCompressedPngTextChunk(block) {
    return block.compression !== undefined && block.text.name !== undefined;
}

// Every uncompressed text chunk of a PNG merges as one tier, so that the text
// tags sort after an uncompressed raw-profile Exif whatever the chunk order and
// two raw profiles merge group by group. A compressed chunk stays its own tier.
function combineUncompressedPngTextBlocks(mergeBlocks) {
    const combined = [];
    const leaves = [];
    let tierIndex = -1;

    for (let i = 0; i < mergeBlocks.length; i++) {
        if (mergeBlocks[i].slot !== 'pngText') {
            combined.push(mergeBlocks[i]);
            continue;
        }
        if (tierIndex === -1) {
            tierIndex = combined.length;
            combined.push(undefined);
        }
        collectLeafBlocks(mergeBlocks[i], leaves);
    }

    if (tierIndex !== -1) {
        combined[tierIndex] = {slot: 'pngText', mode: 'nested', blocks: leaves};
    }
    return combined;
}

function collectLeafBlocks(block, leaves) {
    if (block.mode !== 'nested') {
        leaves.push(block);
        return;
    }
    for (let i = 0; i < block.blocks.length; i++) {
        collectLeafBlocks(block.blocks[i], leaves);
    }
}

function getDerivedBlocks(composition, {expanded, includeOffsets, async, ranges, truncated}) {
    const blocks = composition.derived.map((group) => group.merge());
    blocks.push({slot: 'thumbnail', mode: 'thumbnail'});
    blocks.push({slot: 'fileType', mode: 'fileType'});
    if (expanded && includeOffsets) {
        blocks.push({
            slot: 'metadataRange',
            mode: 'metadataRange',
            metadataBlocks: getMetadataRangeBlocks(composition, ranges, async),
            metadataTruncated: !!truncated,
        });
    }
    return blocks;
}

// Finders report every kind they find; list only the kinds this build parses,
// and in sync mode only the blocks it reads (isHiddenInSyncMode).
function getMetadataRangeBlocks(composition, ranges, async) {
    const entries = ranges || [];
    const isCapped = entries.length >= MAX_METADATA_BLOCKS;
    const lastIndex = entries.length - 1;
    const metadataBlocks = [];
    for (let i = 0; i < entries.length; i++) {
        const {block, start, end} = entries[i];
        // At the cap the last entry was widened over every later block, so it
        // stays whatever its own block is, hidden in sync mode or not parsed.
        const isWidenedLast = isCapped && i === lastIndex;
        if (isWidenedLast || ((async || !composition.isHiddenInSyncMode(block)) && isParsedRangeType(composition, block))) {
            metadataBlocks.push({type: getRangeType(block), start, end});
        }
    }
    return metadataBlocks;
}

// A kind no composed group consumes is not parsed; a text chunk is parsed
// whenever the png format is composed.
function isParsedRangeType(composition, block) {
    return composition.composed.kinds[composition.dispatchKind(block)] === true;
}

// The range types predate the block kinds and stay as they are.
function getRangeType(block) {
    if (isPngTextChunkBlock(block) || block.kind === 'pngChunk') {
        return 'png';
    }
    if (block.kind === 'pngFile') {
        return 'file';
    }
    return block.kind;
}

// The derived groups' dependencies replace the undefined placeholders.
function getMergeDeps(derivedGroups) {
    const deps = {
        objectAssign,
        hasPngTextData,
        filterTagsForReturn,
        getGpsGroupFromExifTags: undefined,
        Composite: undefined,
    };
    for (let i = 0; i < derivedGroups.length; i++) {
        objectAssign(deps, derivedGroups[i].mergeDeps);
    }
    return deps;
}

function hasPngTextData(pngTextBlocks) {
    return Array.isArray(pngTextBlocks) && pngTextBlocks.length > 0;
}
