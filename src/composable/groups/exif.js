/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign, getCompressionMethod, getByteString} from '../../utils.js';
import ByteOrder from '../../byte-order.js';
import {getTiffHeaderOffset} from '../../image-header-iso-bmff.js';
import Tags from '../../tags.js';
import TagNames0thIfd from '../../tag-names-0th-ifd.js';
import TagNamesExifIfd from '../../tag-names-exif-ifd.js';
import TagNamesGpsIfd from '../../tag-names-gps-ifd.js';
import TagNamesInteroperabilityIfd from '../../tag-names-interoperability-ifd.js';
import {IFD_TYPE_0TH, IFD_TYPE_1ST, IFD_TYPE_EXIF, IFD_TYPE_GPS, IFD_TYPE_INTEROPERABILITY} from '../../ifd-types.js';
import {addDecompressedValueAllowance} from '../../tags-helpers.js';
import {filterTagsForParse} from '../../tag-filter.js';
import {getBlockDataView, getBrobDataView} from '../group-helpers.js';

// Merged on the first read rather than at import, so that a bundle without
// this group drops the dictionaries.
let tagNames0thAndExifIfds;

export const exif = {
    key: 'exif',
    consumes: ['exif'],
    emits: ['iptc', 'xmp', 'photoshop', 'icc', 'makerNote', 'thumbnail'],
    descriptors: [],
    read: readExifBlock,
    merge: getExifMergeDescriptor,
};

// A brob Exif box decompresses through the pool; a decompression failure or a
// bad header rejects, which drops the block. Only the JPEG XL finder makes one.
// A JXL Exif box too short for its header has no tiffHeaderOffset and reads
// nothing.
function readExifBlock(block, ctx) {
    if (block.compression !== undefined) {
        if (!ctx.composed.formats.jxl) {
            return undefined;
        }
        return ctx.decompress(getBrobDataView(ctx.dataView, block), getCompressionMethod(block.compression), undefined, 'dataview')
            .then((view) => readExifView(view, getTiffHeaderOffset(view, 0), ctx, {carried: 'brob', decompressed: true}));
    }
    if (block.tiffHeaderOffset === undefined) {
        return undefined;
    }
    return readExifView(getBlockDataView(block, ctx), block.tiffHeaderOffset, ctx, {
        carried: block.origin || 'main',
        decompressed: block.decompressed === true,
    });
}

// The main block creates the value budget from its view; an embedded block
// draws from the shared one and, when decompressed, adds its allowance.
function readExifView(view, tiffHeaderOffset, ctx, {carried, decompressed}) {
    const isMain = carried === 'main';
    const valueBudget = isMain ? ctx.getValueBudget(view) : ctx.getValueBudget();
    if (decompressed) {
        addDecompressedValueAllowance(valueBudget, view.byteLength);
    }
    const read = isMain ? readExifTagsSafely : readExifTags;
    const {tags, byteOrder, makerNoteOffset} = read(view, tiffHeaderOffset, ctx, valueBudget);
    const thumbnailIfdTags = tags.Thumbnail;
    delete tags.Thumbnail;

    const parsed = filterTagsForParse('exif', tags, ctx.tagFilter);
    const blocks = getExifEmittedBlocks(parsed, {view, tiffHeaderOffset, byteOrder, makerNoteOffset, thumbnailIfdTags, carried, decompressed});
    if (carried === 'brob' && Object.keys(parsed).length === 0) {
        return {tags: undefined, blocks};
    }
    return {tags: parsed, blocks};
}

function readExifTagsSafely(dataView, tiffHeaderOffset, ctx, valueBudget) {
    try {
        return readExifTags(dataView, tiffHeaderOffset, ctx, valueBudget);
    } catch (error) {
        // A malformed TIFF header (an out-of-bounds offset or an invalid byte
        // order marker, e.g. from a HEIC/AVIF iloc that does not point at real
        // Exif) must not abort the whole parse. Skip Exif instead, but keep the
        // same shape so callers can destructure safely.
        return {tags: {}, byteOrder: ByteOrder.BIG_ENDIAN, makerNoteOffset: undefined};
    }
}

function readExifTags(dataView, tiffHeaderOffset, ctx, valueBudget) {
    return Tags.read(
        dataView,
        tiffHeaderOffset,
        ctx.options.includeUnknown,
        ctx.options.computed,
        ctx.tagFilter,
        valueBudget,
        getExifTagNames(ctx),
        shouldReadThumbnailIfd(ctx)
    );
}

// Only the IFDs Tags.read walks; the MPF and maker note readers carry their own
// dictionaries. The thumbnail one must be there whenever shouldReadThumbnailIfd
// is true, since reading an IFD without its dictionary throws.
function getExifTagNames(ctx) {
    // Assigned rather than computed keys, which Babel compiles to a helper call each.
    const tagNames = {};
    tagNames[IFD_TYPE_0TH] = getTagNames0thAndExifIfds();
    tagNames[IFD_TYPE_EXIF] = getTagNames0thAndExifIfds();
    tagNames[IFD_TYPE_GPS] = TagNamesGpsIfd;
    tagNames[IFD_TYPE_INTEROPERABILITY] = TagNamesInteroperabilityIfd;
    if (ctx.composed.groups.thumbnail) {
        tagNames[IFD_TYPE_1ST] = TagNames0thIfd;
    }
    return tagNames;
}

function getTagNames0thAndExifIfds() {
    if (tagNames0thAndExifIfds === undefined) {
        tagNames0thAndExifIfds = objectAssign({}, TagNames0thIfd, TagNamesExifIfd);
    }
    return tagNames0thAndExifIfds;
}

function shouldReadThumbnailIfd(ctx) {
    return ctx.composed.groups.thumbnail === true && ctx.tagFilter.shouldParseGroup('thumbnail');
}

// In emission order; the engine drops a kind no composed group consumes.
function getExifEmittedBlocks(parsed, {view, tiffHeaderOffset, byteOrder, makerNoteOffset, thumbnailIfdTags, carried, decompressed}) {
    const blocks = [];

    if (parsed['IPTC-NAA']) {
        blocks.push({kind: 'iptc', dataView: parsed['IPTC-NAA'].value, dataOffset: 0, carried});
    }
    if (parsed['ApplicationNotes'] && isNumberArray(parsed['ApplicationNotes'].value)) {
        const applicationNotes = parsed['ApplicationNotes'].value;
        blocks.push({kind: 'xmp', carried, decompressed, byteLength: applicationNotes.length, getDataView: () => getByteString(applicationNotes)});
    }
    if (parsed['ImageSourceData'] && parsed['PhotoshopSettings'] && Array.isArray(parsed['PhotoshopSettings'].value)) {
        blocks.push({kind: 'photoshop', value: parsed['PhotoshopSettings'].value, carried});
    }
    if (parsed['ICC_Profile']) {
        const profile = parsed['ICC_Profile'].value;
        blocks.push({kind: 'icc', dataView: profile, chunks: [{offset: 0, length: profile.length, chunkNumber: 1, chunksTotal: 1}], carried});
    }
    if (parsed['MakerNote'] && makerNoteOffset !== undefined) {
        blocks.push({
            kind: 'makerNote',
            tiffView: view,
            tiffHeaderOffset,
            makerNoteOffset,
            byteOrder,
            make: parsed['Make'] && parsed['Make'].value,
            bytes: parsed['MakerNote'].value,
            carried,
        });
    }
    if (thumbnailIfdTags) {
        blocks.push({kind: 'thumbnail', dataView: view, tiffHeaderOffset, ifd1Tags: thumbnailIfdTags, decompressed, rank: carried === 'main' ? 'main' : 'embedded'});
    }

    return blocks;
}

// ASCII values hold strings and holes, values of two or more rationals hold
// number pairs: neither converts to the character codes of an XMP packet.
function isNumberArray(value) {
    return Array.isArray(value) && typeof value[0] === 'number';
}

function getExifMergeDescriptor(block) {
    if (block.compression !== undefined) {
        return {slot: 'exif', mode: 'merge', outerSlot: 'brobExif'};
    }
    return {slot: 'exif', mode: block.origin !== undefined ? 'merge' : 'assign'};
}
