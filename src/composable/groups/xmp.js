/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getCompressionMethod} from '../../utils.js';
import XmpTags from '../../xmp-tags.js';
import {IFD_TYPE_0TH} from '../../ifd-types.js';
import {parsedTags, getBlockDataView, getBrobDataView, getEmbeddableMergeDescriptor} from '../group-helpers.js';
import {GROUP_BRAND} from '../brand.js';

export const xmp = {
    key: 'xmp',
    consumes: ['xmp'],
    emits: [],
    // ApplicationNotes.
    descriptors: [{ifd: IFD_TYPE_0TH, id: 0x02bc}],
    read: readXmpBlock,
    merge: getXmpMergeDescriptor,
    suppressions: [{kind: 'xmp', isSuppressed: isCarriedXmpSuppressed}],
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
        if (block.decompressed && !ctx.takeDecompressedApplicationNotesAllowance(block.byteLength)) {
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
    if (ctx.exceedsBrobXmpSizeBound(view.byteLength)) {
        return parsedTags('xmp', {}, ctx);
    }
    return parsedTags('xmp', XmpTags.read(view, [{dataOffset: 0, length: view.byteLength}], ctx.options.domParser, ctx.getDomParser), ctx);
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

// A brob block carries compressed XMP, not chunks.
function hasXmpData(xmpBlock) {
    return xmpBlock !== undefined && xmpBlock.compression === undefined && xmpBlock.chunks.length > 0;
}
