/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getCompressionMethod, getByteString} from '../utils.js';
import ByteOrder from '../byte-order.js';
import {getTiffHeaderOffset} from '../image-header-iso-bmff.js';
import Tags from '../tags.js';
import {IFD_TYPE_0TH, IFD_TYPE_1ST, IFD_TYPE_EXIF, IFD_TYPE_GPS, IFD_TYPE_INTEROPERABILITY} from '../ifd-types.js';
import {addDecompressedValueAllowance} from '../tags-helpers.js';
import {filterTagsForParse} from '../tag-filter.js';
import {EXIF_POINTER_TAGS} from '../tag-filter-config.js';
import {getBlockDataView, getBrobDataView} from './group-helpers.js';
import {GROUP_BRAND} from './brand.js';

export const EXIF_EMITTED_KINDS = ['iptc', 'xmp', 'photoshop', 'icc', 'makerNote', 'thumbnail'];
const EXIF_DICTIONARIES = [IFD_TYPE_0TH, IFD_TYPE_EXIF, IFD_TYPE_GPS, IFD_TYPE_INTEROPERABILITY];

// The generated Exif tag descriptors link to this, so a createReader bundle
// carries Exif parsing only when it composes one.
export const exifBlockReader = {createParseOnlyGroup};

/**
 * An Exif group that reads with dictionaries of the given descriptors only.
 *
 * @param {Array<object>} descriptors Generated Exif tag descriptors.
 * @param {(object|undefined)} ifd1TagNames The dictionary of the thumbnail IFD,
 *     when the thumbnail group is composed.
 * @returns {object} An engine group keyed exif.
 */
function createParseOnlyGroup(descriptors, ifd1TagNames) {
    const tagNames = getTagNames(descriptors, ifd1TagNames);
    return {
        key: 'exif',
        consumes: ['exif'],
        emits: EXIF_EMITTED_KINDS,
        read: (block, ctx) => readExifBlock(block, ctx, tagNames),
        merge: getExifMergeDescriptor,
        brand: GROUP_BRAND,
    };
}

// Every bucket Tags.read walks must exist, as reading an IFD without its
// dictionary throws. A descriptor's dictionary key is its IFD type, and
// src/tags.js follows the sub-IFDs by the pointer names.
function getTagNames(descriptors, ifd1TagNames) {
    const tagNames0thAndExifIfds = {};
    tagNames0thAndExifIfds[0x8769] = EXIF_POINTER_TAGS.exifIfdPointer;
    tagNames0thAndExifIfds[0x8825] = EXIF_POINTER_TAGS.gpsInfoIfdPointer;
    tagNames0thAndExifIfds[0xa005] = EXIF_POINTER_TAGS.interoperabilityIfdPointer;

    // Assigned rather than computed keys, which Babel compiles to a helper call each.
    const tagNames = {};
    tagNames[IFD_TYPE_0TH] = tagNames0thAndExifIfds;
    tagNames[IFD_TYPE_EXIF] = tagNames0thAndExifIfds;
    tagNames[IFD_TYPE_GPS] = {};
    tagNames[IFD_TYPE_INTEROPERABILITY] = {};
    // Indexed by the reader's own names only: another reader may have accepted
    // a descriptor, and its dictionary could name what every object inherits.
    for (let i = 0; i < EXIF_DICTIONARIES.length; i++) {
        for (let j = 0; j < descriptors.length; j++) {
            if (descriptors[j].dictionary === EXIF_DICTIONARIES[i]) {
                addEntries(tagNames[EXIF_DICTIONARIES[i]], descriptors[j]);
            }
        }
    }
    if (ifd1TagNames) {
        tagNames[IFD_TYPE_1ST] = ifd1TagNames;
    }
    return tagNames;
}

// In the dictionaries' own shape. An id the descriptor's describedIds leaves
// out has no description in its dictionary.
function addEntries(dictionary, descriptor) {
    for (let i = 0; i < descriptor.ids.length; i++) {
        const id = descriptor.ids[i];
        if (descriptor.description && (!descriptor.describedIds || descriptor.describedIds.indexOf(id) !== -1)) {
            dictionary[id] = {name: descriptor.name, description: descriptor.description};
        } else {
            dictionary[id] = descriptor.name;
        }
    }
}

/**
 * Reads an Exif block with the given dictionaries.
 *
 * A brob Exif box decompresses through the pool; a decompression failure or a
 * bad header rejects, which drops the block. Only the JPEG XL finder makes one.
 * A JXL Exif box too short for its header has no tiffHeaderOffset and reads
 * nothing.
 *
 * @param {object} block
 * @param {object} ctx The engine context.
 * @param {Object<string, object>} tagNames The dictionaries keyed by IFD type.
 * @returns {({tags: (object|undefined), blocks: Array<object>}|Promise|undefined)}
 */
export function readExifBlock(block, ctx, tagNames) {
    if (block.compression !== undefined) {
        if (!ctx.composed.formats.jxl) {
            return undefined;
        }
        return ctx.decompress(getBrobDataView(ctx.dataView, block), getCompressionMethod(block.compression), undefined, 'dataview')
            .then((view) => readExifView(view, getTiffHeaderOffset(view, 0), ctx, {carried: 'brob', decompressed: true}, tagNames));
    }
    if (block.tiffHeaderOffset === undefined) {
        return undefined;
    }
    return readExifView(getBlockDataView(block, ctx), block.tiffHeaderOffset, ctx, {
        carried: block.origin || 'main',
        decompressed: block.decompressed === true,
    }, tagNames);
}

// The main block creates the value budget from its view; an embedded block
// draws from the shared one and, when decompressed, adds its allowance.
function readExifView(view, tiffHeaderOffset, ctx, {carried, decompressed}, tagNames) {
    const isMain = carried === 'main';
    const valueBudget = isMain ? ctx.getValueBudget(view) : ctx.getValueBudget();
    if (decompressed) {
        addDecompressedValueAllowance(valueBudget, view.byteLength);
    }
    const read = isMain ? readExifTagsSafely : readExifTags;
    const {tags, byteOrder, makerNoteOffset} = read(view, tiffHeaderOffset, ctx, valueBudget, tagNames);
    const thumbnailIfdTags = tags.Thumbnail;
    delete tags.Thumbnail;

    const parsed = filterTagsForParse('exif', tags, ctx.tagFilter);
    const blocks = getExifEmittedBlocks(parsed, {view, tiffHeaderOffset, byteOrder, makerNoteOffset, thumbnailIfdTags, carried, decompressed});
    if (carried === 'brob' && Object.keys(parsed).length === 0) {
        return {tags: undefined, blocks};
    }
    return {tags: parsed, blocks};
}

function readExifTagsSafely(dataView, tiffHeaderOffset, ctx, valueBudget, tagNames) {
    try {
        return readExifTags(dataView, tiffHeaderOffset, ctx, valueBudget, tagNames);
    } catch (error) {
        // A malformed TIFF header (an out-of-bounds offset or an invalid byte
        // order marker, e.g. from a HEIC/AVIF iloc that does not point at real
        // Exif) must not abort the whole parse. Skip Exif instead, but keep the
        // same shape so callers can destructure safely.
        return {tags: {}, byteOrder: ByteOrder.BIG_ENDIAN, makerNoteOffset: undefined};
    }
}

function readExifTags(dataView, tiffHeaderOffset, ctx, valueBudget, tagNames) {
    return Tags.read(
        dataView,
        tiffHeaderOffset,
        ctx.options.includeUnknown,
        ctx.options.computed,
        ctx.tagFilter,
        valueBudget,
        tagNames,
        shouldReadThumbnailIfd(ctx)
    );
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

/**
 * Where an Exif block's tags go in the result.
 *
 * @param {object} block
 * @returns {{slot: string, mode: string, outerSlot: (string|undefined)}}
 */
export function getExifMergeDescriptor(block) {
    if (block.compression !== undefined) {
        return {slot: 'exif', mode: 'merge', outerSlot: 'brobExif'};
    }
    return {slot: 'exif', mode: block.origin !== undefined ? 'merge' : 'assign'};
}
