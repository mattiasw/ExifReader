/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Png, {TYPE_ZTXT} from '../../image-header-png.js';
import PngFileTags from '../../png-file-tags.js';
import PngTextTags, {hasRawIptcProfile} from '../../png-text-tags.js';
import PngTags from '../../png-tags.js';
import {parsedTags, isPngTextChunkBlock} from '../group-helpers.js';
import {FORMAT_BRAND} from '../brand.js';
import {decompression} from '../../decompression.js';
import {objectAssign} from '../../utils.js';
import {addToCompositeInput} from '../../loadview-pipeline.js';

export const pngHeader = {
    fileType: {value: 'png', description: 'PNG'},
    detect: (dataView) => Png.isPngFile(dataView),
    find: (dataView, ranges) => Png.findPngOffsets(dataView, ranges),
    isHiddenInSyncMode: isCompressedTextChunkTypeBlock,
    decompression,
};

export const pngFile = {
    key: 'png',
    consumes: ['pngFile'],
    emits: [],
    read: (block, ctx) => parsedTags('png', PngFileTags.read(ctx.dataView, block.dataOffset), ctx),
    merge: () => ({slot: 'pngFile', mode: 'pngFile'}),
    mergeModes: {pngFile: mergePngFileTags},
};

export const pngText = {
    key: 'png',
    consumes: ['pngText'],
    emits: ['exif', 'iptc'],
    read: (block, ctx) => PngTextTags.read(block, ctx),
    merge: (block) => ({slot: block.compression !== undefined ? 'deferredPngText' : 'pngText', mode: 'pngTextTags'}),
    suppressions: [{kind: 'iptc', isSuppressed: isRawProfileIptcSuppressed}],
    mergeModes: {pngTextTags: mergePngTextTags},
    prepareMergeBlocks: combineUncompressedPngTextBlocks,
    finishTags: addPngTextCopyOfPng,
};

export const pngChunk = {
    key: 'png',
    consumes: ['pngChunk'],
    emits: [],
    read: (block, ctx) => parsedTags('png', PngTags.read(ctx.dataView, [block.dataOffset]), ctx),
    merge: () => ({slot: 'pngChunk', mode: 'merge'}),
};

export const png = {
    header: pngHeader,
    readers: [pngFile, pngText, pngChunk],
    brand: FORMAT_BRAND,
};

// Sync mode leaves the compressed-text chunk type out,
// whatever its header says (see isHiddenInSyncMode in composition.js).
function isCompressedTextChunkTypeBlock(block) {
    return isPngTextChunkBlock(block) && block.text.chunkType === TYPE_ZTXT;
}

// The png group gathers the file, text and chunk tags; pngFile keeps the file
// tags alone.
function mergePngFileTags(tags, block, context) {
    context.parsedGroups.pngFile = block.tags;
    addToCompositeInput(block.tags, context);
    if (!context.tagFilter.shouldReturnGroup('png')) {
        return tags;
    }
    const returnedTags = context.deps.filterTagsForReturn('png', block.tags, context.tagFilter);

    if (context.expanded) {
        context.merge.group(tags, 'png', returnedTags);
        tags.pngFile = returnedTags;

        return tags;
    }

    return context.merge.topLevel(tags, returnedTags);
}

// A raw profile's IPTC-NAA gives way to a raw IPTC chunk the text reader will
// read, compressed or not. The raw IPTC scan decodes text chunks, so its
// verdict is kept on the context: the finder blocks do not change within a
// load, and a PNG can hold thousands of raw profiles.
function isRawProfileIptcSuppressed(block, finderBlocks, ctx) {
    if (block.carried !== 'rawProfile') {
        return false;
    }
    if (ctx.hasRawIptcProfile === undefined) {
        ctx.hasRawIptcProfile = hasRawIptcProfile(finderBlocks, ctx.dataView);
    }
    return ctx.hasRawIptcProfile;
}

// pngText holds the text tags only when there are any; otherwise
// addPngTextCopyOfPng may fill it with a copy of png.
function mergePngTextTags(tags, block, context) {
    addToCompositeInput(block.tags, context);
    if (!context.tagFilter.shouldReturnGroup('png')) {
        return tags;
    }
    const returnedTags = context.deps.filterTagsForReturn('png', block.tags, context.tagFilter);

    if (context.expanded) {
        context.merge.group(tags, 'png', returnedTags);
        if (Object.keys(returnedTags).length > 0) {
            context.merge.group(tags, 'pngText', returnedTags);
        }

        return tags;
    }

    return context.merge.topLevel(tags, returnedTags);
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

// Expanded output gets a pngText group that copies png when the text chunks
// are read asynchronously, or when there are text chunks (raw profiles
// included) but none of them gave PNG text tags. `blocks` are the finder
// blocks the load reads, so in sync mode without the compressed-text chunks.
function addPngTextCopyOfPng(tags, {expanded, async, tagFilter, blocks}) {
    const pngTextBlocks = blocks.filter(isPngTextChunkBlock);

    if (
        expanded
        && async
        && pngTextBlocks.some(isNamedCompressedPngTextChunk)
        && tagFilter.shouldReturnGroup('png')
        && tags.png
    ) {
        tags.pngText = objectAssign({}, tags.png);
    }

    if (
        expanded
        && tagFilter.shouldReturnGroup('png')
        && pngTextBlocks.length > 0
        && tags.png
        && !tags.pngText
    ) {
        tags.pngText = objectAssign({}, tags.png);
    }

    return tags;
}

function isNamedCompressedPngTextChunk(block) {
    return block.compression !== undefined && block.text.name !== undefined;
}
