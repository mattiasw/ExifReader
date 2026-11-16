/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getCompressionMethod} from '../../utils.js';
import XmpTags from '../../xmp-tags.js';
import {parsedTags, getBlockDataView, getBrobDataView, getInputSizeBound, getEmbeddableMergeDescriptor} from '../group-helpers.js';
import {GROUP_BRAND} from '../brand.js';
import {assignGroupTags} from '../../loadview-pipeline.js';

// Brob XMP is bounded by the file size, as brob Exif is, plus room for one JPEG
// standard XMP segment so that a small file can still carry a typical packet.
const BROB_XMP_SIZE_PER_INPUT_SIZE = 4;
const BROB_XMP_SIZE_ALLOWANCE = 64 * 1024;

export const xmp = {
    key: 'xmp',
    consumes: ['xmp'],
    emits: [],
    read: readXmpBlock,
    merge: getXmpMergeDescriptor,
    suppressions: [{kind: 'xmp', isSuppressed: isCarriedXmpSuppressed}],
    mergeModes: {brobXmp: assignBrobXmpTags},
    brand: GROUP_BRAND,
};

// Only the JPEG XL finder makes a compressed (brob) block.
function readXmpBlock(block, ctx) {
    const {domParser} = ctx.options;
    if (block.compression !== undefined) {
        if (!ctx.composed.formats.jxl) {
            return undefined;
        }
        return ctx.decompress(getBrobDataView(ctx.dataView, block), getCompressionMethod(block.compression), undefined, 'dataview')
            .then((view) => readBrobXmpView(view, ctx));
    }
    if (block.carried !== undefined) {
        if (block.decompressed && !takeDecompressedApplicationNotesAllowance(ctx, block.byteLength)) {
            return undefined;
        }
        return parsedTags('xmp', XmpTags.read(getBlockDataView(block, ctx), undefined, domParser, ctx.getDomParser), ctx);
    }
    if (!hasXmpData(block)) {
        return undefined;
    }
    return parsedTags('xmp', XmpTags.read(block.dataView || ctx.dataView, block.chunks, domParser, ctx.getDomParser), ctx);
}

function readBrobXmpView(view, ctx) {
    if (exceedsBrobXmpSizeBound(ctx, view.byteLength)) {
        return parsedTags('xmp', {}, ctx);
    }
    return parsedTags('xmp', XmpTags.read(view, [{dataOffset: 0, length: view.byteLength}], ctx.options.domParser, ctx.getDomParser), ctx);
}

// The brob XMP bound covers the decompressed Exif blocks of a file together, so
// that several cannot each pass it.
function takeDecompressedApplicationNotesAllowance(ctx, byteLength) {
    if (!(typeof byteLength === 'number' && byteLength >= 0)) {
        return false;
    }
    const total = (ctx.decompressedApplicationNotesSize || 0) + byteLength;
    if (exceedsBrobXmpSizeBound(ctx, total)) {
        return false;
    }
    ctx.decompressedApplicationNotesSize = total;
    return true;
}

function exceedsBrobXmpSizeBound(ctx, byteLength) {
    return !(typeof byteLength === 'number' && byteLength <= getInputSizeBound(ctx.dataView, BROB_XMP_SIZE_PER_INPUT_SIZE, BROB_XMP_SIZE_ALLOWANCE));
}

function getXmpMergeDescriptor(block) {
    if (block.compression !== undefined) {
        return {slot: 'brobXmp', mode: 'brobXmp'};
    }
    return getEmbeddableMergeDescriptor(block, 'xmp', 'carriedXmp');
}

// A brob XMP box has no chunks, so it does not suppress.
function isCarriedXmpSuppressed(block, finderBlocks) {
    return block.carried !== undefined && finderBlocks.some((finderBlock) => finderBlock.kind === 'xmp' && hasXmpData(finderBlock));
}

// In expanded output a brob XMP replaces the xmp group, in flat output it
// merges key by key, and an empty, failed or over-bound one leaves the earlier
// xmp group as it is.
function assignBrobXmpTags(tags, block, context) {
    if (!block.tags || Object.keys(block.tags).length === 0) {
        return tags;
    }

    return assignGroupTags(tags, block, context);
}

// A brob block carries compressed XMP, not chunks.
function hasXmpData(xmpBlock) {
    return xmpBlock !== undefined && xmpBlock.compression === undefined && xmpBlock.chunks.length > 0;
}
