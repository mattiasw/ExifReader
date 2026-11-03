/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Thumbnail from '../../thumbnail.js';
import {IFD_TYPE_1ST} from '../../ifd-types.js';
import {filterTagsForParse} from '../../tag-filter.js';

export const thumbnail = {
    key: 'thumbnail',
    consumes: ['thumbnail'],
    emits: [],
    // JPEGInterchangeFormat and JPEGInterchangeFormatLength.
    descriptors: [{ifd: IFD_TYPE_1ST, id: 0x0201}, {ifd: IFD_TYPE_1ST, id: 0x0202}],
    read: readThumbnailBlock,
    merge: (block) => ({slot: 'thumbnail', mode: 'thumbnailCandidate', rank: block.rank}),
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
    if (!lengthTag || typeof lengthTag.value !== 'number' || lengthTag.value > ctx.embeddedThumbnailSizeBound - ctx.copiedThumbnailSize) {
        return undefined;
    }
    const thumbnailTags = Thumbnail.get(block.dataView, parsed, block.tiffHeaderOffset, ctx.getBase64Image);
    if (!thumbnailTags.image) {
        return undefined;
    }
    ctx.copiedThumbnailSize += lengthTag.value;
    if (!block.decompressed) {
        ctx.hasEmbeddedThumbnailImage = true;
    }
    return {tags: thumbnailTags};
}
