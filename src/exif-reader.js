/**
 * ExifReader
 * http://github.com/mattiasw/exifreader
 * Copyright (C) 2011-2026  Mattias Wallander <mattias@wallander.eu>
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {objectAssign, withDecompressBudget, getDataView, getDataViewFromBytes, assertPromiseSupport, MAX_METADATA_BLOCKS} from './utils.js';
import {isFilePathOrURL, isBrowserFileObject, loadFile, loadFileObject} from './file-loaders.js';
import {makeLoadAuto, validateAutoOptions} from './load-auto.js';
import Constants from './constants.js';
import ImageHeader from './image-header.js';
import {createTagFilter, filterTagsForReturn} from './tag-filter.js';
import {getBase64Image} from './base64-image.js';
import DOMParser from './dom-parser.js';
import {buildTagsFromMergeBlocks} from './loadview-pipeline.js';
import {run, createContext} from './engine.js';
import exifErrors from './errors.js';
import Composition from './composable/composition.js';
import {isPngTextChunkBlock} from './composable/group-helpers.js';
import {tiff} from './composable/formats/tiff.js';
import {jpegHeader, file, jfif} from './composable/formats/jpeg.js';
import {pngHeader, pngFile, pngText, pngChunk} from './composable/formats/png.js';
import {heic} from './composable/formats/heic.js';
import {avif} from './composable/formats/avif.js';
import {jxl} from './composable/formats/jxl.js';
import {webp} from './composable/formats/webp.js';
import {gif} from './composable/formats/gif.js';
import {xml} from './composable/formats/xml.js';
import {exif} from './composable/groups/exif.js';
import {iptc} from './composable/groups/iptc.js';
import {xmp} from './composable/groups/xmp.js';
import {icc} from './composable/groups/icc.js';
import {photoshop} from './composable/groups/photoshop.js';
import {mpf} from './composable/groups/mpf.js';
import {makerNotes} from './composable/groups/maker-notes.js';
import {gps} from './composable/groups/gps.js';
import {composite} from './composable/groups/composite.js';
import {thumbnail} from './composable/groups/thumbnail.js';

export default {
    load,
    loadView,
    errors: exifErrors,
};

// Composing costs more than a small load, so the composition is kept until the
// tables change; they only do when the unit tests swap the Constants.
let defaultComposition;
let defaultCompositionEntries;

// Builds the default composition once at import, so that a cycle in the
// groups' emission graph throws here rather than on the first load.
getDefaultComposition();

export const errors = exifErrors;

export function load(data, options = {}) {
    if (options.length === 'auto') {
        validateAutoOptions(options);
        return makeLoadAuto(loadFromData)(data, options);
    }
    if (isFilePathOrURL(data) || isBrowserFileObject(data)) {
        assertPromiseSupport();
        const loadFileFunction = isFilePathOrURL(data) ? loadFile : loadFileObject;
        const asyncOptions = objectAssign({}, options, {async: true});

        return loadFileFunction(data, asyncOptions).then((fileContents) => loadFromData(fileContents, asyncOptions));
    }
    return loadFromData(data, options);
}

function loadFromData(data, options) {
    return loadView(getDataViewFromBytes(data), options);
}

export function loadView(dataView, options = {}) {
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

    const composition = getDefaultComposition();
    const {fileType, blocks: allBlocks, ranges, truncated} = ImageHeader.parseAppMarkers(dataView, expanded && includeOffsets, composition.formats);
    if (async) {
        assertPromiseSupport();
    }
    const blocks = async ? allBlocks : allBlocks.filter((block) => !composition.isHiddenInSyncMode(block));

    const tagFilter = createTagFilter({includeTags, excludeTags});
    const context = createContext({
        dataView,
        options: {expanded, async, computed, includeUnknown, includeOffsets, domParser, includeTags, excludeTags},
        tagFilter,
        decompressConfig: withDecompressBudget(decompressConfig),
        getBase64Image,
        getDomParser: DOMParser.get,
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

function isNamedCompressedPngTextChunk(block) {
    return block.compression !== undefined && block.text.name !== undefined;
}

function getDefaultComposition() {
    const tables = getDefaultTables();
    const entries = getTableEntries(tables);
    if (defaultComposition === undefined || !haveSameItems(entries, defaultCompositionEntries)) {
        defaultComposition = Composition.createComposition(tables);
        defaultCompositionEntries = entries;
    }
    return defaultComposition;
}

// Every format and group, each inside its build gate so that a custom build
// folds the import away. A format-bound reader has its own gate, so the jpeg
// and png formats are listed by header and readers rather than whole.
function getDefaultTables() {
    return {
        formats: [
            Constants.USE_TIFF ? tiff : undefined,
            Constants.USE_JPEG ? {
                header: jpegHeader,
                readers: [
                    Constants.USE_FILE ? file : undefined,
                    Constants.USE_JFIF ? jfif : undefined,
                ],
            } : undefined,
            Constants.USE_PNG ? {
                header: pngHeader,
                readers: [
                    Constants.USE_PNG_FILE ? pngFile : undefined,
                    pngText,
                    pngChunk,
                ],
            } : undefined,
            Constants.USE_HEIC ? heic : undefined,
            Constants.USE_AVIF ? avif : undefined,
            Constants.USE_JXL ? jxl : undefined,
            Constants.USE_WEBP ? webp : undefined,
            Constants.USE_GIF ? gif : undefined,
            Constants.USE_XMP ? xml : undefined,
        ].filter(Boolean),
        groups: [
            Constants.USE_EXIF ? exif : undefined,
            Constants.USE_IPTC ? iptc : undefined,
            Constants.USE_XMP ? xmp : undefined,
            Constants.USE_ICC ? icc : undefined,
            Constants.USE_MPF ? mpf : undefined,
            Constants.USE_PHOTOSHOP ? photoshop : undefined,
            Constants.USE_MAKER_NOTES ? makerNotes : undefined,
            Constants.USE_EXIF && Constants.USE_THUMBNAIL ? thumbnail : undefined,
            Constants.USE_EXIF ? gps : undefined,
            Constants.USE_EXIF || Constants.USE_XMP ? composite : undefined,
        ].filter(Boolean),
    };
}

// The jpeg and png formats are new objects on every call, so they compare by
// header and readers.
function getTableEntries({formats, groups}) {
    let entries = [];
    for (let i = 0; i < formats.length; i++) {
        entries = entries.concat([formats[i].header], formats[i].readers);
    }
    return entries.concat(groups);
}

function haveSameItems(items, otherItems) {
    if (items.length !== otherItems.length) {
        return false;
    }
    for (let i = 0; i < items.length; i++) {
        if (items[i] !== otherItems[i]) {
            return false;
        }
    }
    return true;
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

// A kind no composed group consumes is not parsed; a text chunk is parsed
// whenever the png format is composed.
function isParsedRangeType(composition, block) {
    return composition.composed.kinds[composition.dispatchKind(block)] === true;
}

function hasPngTextData(pngTextBlocks) {
    return Array.isArray(pngTextBlocks) && pngTextBlocks.length > 0;
}
