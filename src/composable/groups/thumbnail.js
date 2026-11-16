/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Thumbnail from '../../thumbnail.js';
import {filterTagsForParse} from '../../tag-filter.js';
import {getInputSizeBound} from '../group-helpers.js';
import {GROUP_BRAND} from '../brand.js';

// An embedded thumbnail is sliced from a decoded or decompressed view that can be
// far larger than the file. A real JPEG thumbnail shrinks only a little when
// compressed, so bound the embedded thumbnails of a file by twice its size in
// total, plus room for a typical thumbnail.
const EMBEDDED_THUMBNAIL_SIZE_PER_INPUT_SIZE = 2;
const EMBEDDED_THUMBNAIL_SIZE_ALLOWANCE = 64 * 1024;

export const thumbnail = {
    key: 'thumbnail',
    consumes: ['thumbnail'],
    emits: [],
    read: readThumbnailBlock,
    merge: (block) => ({slot: 'thumbnail', mode: 'thumbnailCandidate', rank: block.rank}),
    brand: GROUP_BRAND,
};

// The main block's thumbnail is a candidate with or without an image. An
// embedded one is a candidate only with an image, within the copy bound, and
// not once an uncompressed block gave one; the decompressed blocks of a file
// all get to try, since they are read after the uncompressed ones.
function readThumbnailBlock(block, ctx) {
    if (!ctx.tagFilter.shouldReturnTag('thumbnail', 'Thumbnail')) {
        return undefined;
    }
    const parsed = filterTagsForParse('thumbnail', block.ifd1Tags, ctx.tagFilter);
    if (block.rank === 'main') {
        return {tags: Thumbnail.get(block.dataView, parsed, block.tiffHeaderOffset, ctx.getBase64Image)};
    }
    if (ctx.hasEmbeddedThumbnailImage) {
        return undefined;
    }
    const lengthTag = parsed.JPEGInterchangeFormatLength;
    const copiedSize = ctx.copiedThumbnailSize || 0;
    const room = getInputSizeBound(ctx.dataView, EMBEDDED_THUMBNAIL_SIZE_PER_INPUT_SIZE, EMBEDDED_THUMBNAIL_SIZE_ALLOWANCE) - copiedSize;
    if (!(lengthTag && isNonNegativeInteger(lengthTag.value) && lengthTag.value <= room)) {
        return undefined;
    }
    const thumbnailTags = Thumbnail.get(block.dataView, parsed, block.tiffHeaderOffset, ctx.getBase64Image);
    if (!thumbnailTags.image) {
        return undefined;
    }
    ctx.copiedThumbnailSize = copiedSize + lengthTag.value;
    if (!block.decompressed) {
        ctx.hasEmbeddedThumbnailImage = true;
    }
    return {tags: thumbnailTags};
}

function isNonNegativeInteger(value) {
    return (typeof value === 'number') && (value >= 0) && (value % 1 === 0);
}
