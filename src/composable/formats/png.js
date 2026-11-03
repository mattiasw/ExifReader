/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Png, {TYPE_ZTXT} from '../../image-header-png.js';
import PngFileTags from '../../png-file-tags.js';
import PngTextTags, {hasRawIptcProfile} from '../../png-text-tags.js';
import PngTags from '../../png-tags.js';
import {parsedTags, isPngTextChunkBlock} from '../group-helpers.js';

export const pngHeader = {
    fileType: {value: 'png', description: 'PNG'},
    detect: (dataView) => Png.isPngFile(dataView),
    find: (dataView, ranges) => Png.findPngOffsets(dataView, ranges),
    isHiddenInSyncMode: isCompressedTextChunkTypeBlock,
};

export const pngFile = {
    key: 'png',
    consumes: ['pngFile'],
    emits: [],
    read: (block, ctx) => parsedTags('png', PngFileTags.read(ctx.dataView, block.dataOffset), ctx),
    merge: () => ({slot: 'pngFile', mode: 'pngFile'}),
};

export const pngText = {
    key: 'png',
    consumes: ['pngText'],
    emits: ['exif', 'iptc'],
    read: (block, ctx) => PngTextTags.read(block, ctx),
    merge: (block) => ({slot: block.compression !== undefined ? 'deferredPngText' : 'pngText', mode: 'pngTextTags'}),
    suppressions: [{kind: 'iptc', isSuppressed: isRawProfileIptcSuppressed}],
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
};

// Decision 2026-10-21: sync mode leaves the compressed-text chunk type out,
// whatever its header says (see isHiddenInSyncMode in composition.js).
function isCompressedTextChunkTypeBlock(block) {
    return isPngTextChunkBlock(block) && block.text.chunkType === TYPE_ZTXT;
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
