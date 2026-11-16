/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Thumbnail from '../../thumbnail.js';
import {filterTagsForParse} from '../../tag-filter.js';
import {getInputSizeBound} from '../group-helpers.js';
import {GROUP_BRAND} from '../brand.js';
import {removeThumbnailTag} from '../../loadview-pipeline.js';

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
    mergeModes: {thumbnailCandidate: addThumbnailCandidate, thumbnail: addThumbnail},
    fromExif: getThumbnailBlockFromExif,
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

function addThumbnailCandidate(tags, block, context) {
    context.thumbnails.push({rank: block.rank, thumbnail: block.tags});
    return tags;
}

// The main thumbnail when it has an image, else the first embedded Exif
// thumbnail with one, else the main thumbnail without an image.
function addThumbnail(tags, block, context) {
    removeThumbnailTag(tags);

    if (
        !context.tagFilter.shouldReturnGroup('thumbnail')
        || !context.tagFilter.shouldReturnTag('thumbnail', 'Thumbnail')
    ) {
        return tags;
    }

    const selected = selectThumbnail(context.thumbnails);
    if (selected) {
        tags.Thumbnail = selected;
    }

    return tags;
}

function selectThumbnail(candidates) {
    const main = candidates.filter((candidate) => candidate.rank === 'main')[0];
    if (main && hasImage(main.thumbnail)) {
        return main.thumbnail;
    }
    const embedded = candidates.filter((candidate) => candidate.rank === 'embedded' && hasImage(candidate.thumbnail))[0];
    if (embedded) {
        return embedded.thumbnail;
    }
    return main ? main.thumbnail : undefined;
}

function hasImage(thumbnailTags) {
    return !!thumbnailTags && !!thumbnailTags.image;
}

function getThumbnailBlockFromExif(parsed, exif) {
    return exif.thumbnailIfdTags && {
        kind: 'thumbnail',
        dataView: exif.view,
        tiffHeaderOffset: exif.tiffHeaderOffset,
        ifd1Tags: exif.thumbnailIfdTags,
        decompressed: exif.decompressed,
        rank: exif.carried === 'main' ? 'main' : 'embedded',
    };
}
