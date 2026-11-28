/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign, getByteString, isThenable, setProperty, getTagKey} from '../utils.js';
import {filterTagsForParse} from '../tag-filter.js';
import TagNames0thIfd from '../tag-names-0th-ifd.js';
import {GROUP_BRAND} from './brand.js';
import {getEmbeddableMergeDescriptor, mergeMakerNoteGroups, readMakerNoteWithDecoders, getMakerNoteBlockFromExif} from './group-helpers.js';
import {exif} from './groups/exif.js';
import {composedIptc as iptcGroup} from './groups/iptc.js';
import {xmp as xmpGroup} from './groups/xmp.js';
import {icc as iccGroup} from './groups/icc.js';
import {photoshop as photoshopGroup} from './groups/photoshop.js';
import {mpf as mpfGroup} from './groups/mpf.js';
import {canon as canonGroup} from './groups/canon.js';
import {pentax as pentaxGroup} from './groups/pentax.js';
import {makerNotes as makerNotesGroup} from './groups/maker-notes.js';
import {gps as gpsGroup} from './groups/gps.js';
import {composite as compositeGroup} from './groups/composite.js';
import {thumbnail as thumbnailGroup} from './groups/thumbnail.js';
import {
    JPEGInterchangeFormat,
    JPEGInterchangeFormatLength,
    IPTCNAA,
    ApplicationNotes,
    ICC_Profile,
    ImageSourceData,
    PhotoshopSettings,
    MakerNote,
    Make,
    Model,
    GPSLatitude,
    GPSLatitudeRef,
    GPSLongitude,
    GPSLongitudeRef,
    GPSAltitude,
    GPSAltitudeRef,
    FocalLength,
    FocalPlaneXResolution,
    FocalPlaneYResolution,
    FocalPlaneResolutionUnit,
    FocalLengthIn35mmFilm,
    PixelXDimension,
    PixelYDimension,
} from './tags/exif.js';

// These copies carry the descriptors of the Exif tags their groups read through
// Exif and, for xmp, thumbnail and mpf, what the composable reader needs from
// its environment, here and not in the modules, which the default entry also
// imports.
export const iptc = /* #__PURE__ */ withAdditions(iptcGroup, {exifDependencies: [IPTCNAA]});
export const xmp = /* #__PURE__ */ withAdditions(xmpGroup, {
    exifDependencies: [ApplicationNotes],
    environment: {getDomParser},
    assertEnvironment: assertDomParserAvailable,
});
export const icc = /* #__PURE__ */ withAdditions(iccGroup, {exifDependencies: [ICC_Profile]});
export const photoshop = /* #__PURE__ */ withAdditions(photoshopGroup, {exifDependencies: [ImageSourceData, PhotoshopSettings]});
export const canon = /* #__PURE__ */ withAdditions(canonGroup, {exifDependencies: [MakerNote, Make, Model]});
export const pentax = /* #__PURE__ */ withAdditions(pentaxGroup, {exifDependencies: [MakerNote, Make, Model]});
export const makerNotes = /* #__PURE__ */ withAdditions(makerNotesGroup, {exifDependencies: [MakerNote, Make, Model]});
export const gps = /* #__PURE__ */ withAdditions(gpsGroup, {
    exifDependencies: [GPSLatitude, GPSLatitudeRef, GPSLongitude, GPSLongitudeRef, GPSAltitude, GPSAltitudeRef],
});
export const composite = /* #__PURE__ */ withAdditions(compositeGroup, {
    exifDependencies: [
        FocalLength,
        FocalPlaneXResolution,
        FocalPlaneYResolution,
        FocalPlaneResolutionUnit,
        FocalLengthIn35mmFilm,
        PixelXDimension,
        PixelYDimension,
    ],
});
export const thumbnail = /* #__PURE__ */ withAdditions(thumbnailGroup, {
    exifDependencies: [JPEGInterchangeFormat, JPEGInterchangeFormatLength],
    ifd1TagNames: TagNames0thIfd,
    environment: {getBase64Image},
});
export const mpf = /* #__PURE__ */ withAdditions(mpfGroup, {environment: {getBase64Image}});

export {exif};

// Without canon and pentax, since makerNotes is their union: leaving makerNotes
// out of this list leaves out every maker note.
export const allGroups = [exif, iptc, xmp, icc, photoshop, mpf, makerNotes, gps, composite, thumbnail];

const DECODER_DEFINITION_MESSAGE = 'createMakerNoteDecoder: takes {matches, read}, two functions';

/**
 * Makes a maker note decoder to pass in `groups`. Decoders made here are tried
 * before canon and pentax, in the order of `groups`, and the first whose
 * `matches` returns true reads the maker note into `makerNotes`.
 *
 * @param {{matches: function({make, model, bytes}): boolean, read: function({tiffView, tiffHeaderOffset, makerNoteOffset, byteOrder, context}): (object|Promise<object>)}} definition
 *     Both functions are read once, here, and called without a `this`. A
 *     `matches` that throws counts as no match. `read` returns the tags
 *     (`{Name: {value, description}}`) or a Promise of them; each tag keeps
 *     `value`, `description`, a numeric `id` and `computed`.
 * @returns {object} The decoder, a group value.
 * @throws {TypeError} When `definition` is not an object holding the two
 *     functions and nothing else.
 */
export function createMakerNoteDecoder(definition) {
    if (typeof definition !== 'object' || definition === null) {
        throw new TypeError(DECODER_DEFINITION_MESSAGE);
    }
    const matches = definition.matches;
    const read = definition.read;
    if (typeof matches !== 'function' || typeof read !== 'function') {
        throw new TypeError(DECODER_DEFINITION_MESSAGE);
    }
    assertDecoderDefinitionKeys(definition);

    const group = {
        key: 'makerNotes',
        consumes: ['makerNote'],
        emits: [],
        decoders: [{
            matches: (input) => matchesWithoutThrowing(matches, input),
            read: (input) => readCallerTags(read, input),
        }],
        read: (block, ctx) => readMakerNoteWithDecoders(block, ctx, group.decoders),
        merge: (block) => getEmbeddableMergeDescriptor(block, 'makerNotes', 'carriedMakerNotes'),
        combine: mergeMakerNoteGroups,
        fromExif: getMakerNoteBlockFromExif,
        exifDependencies: [MakerNote, Make, Model],
        brand: GROUP_BRAND,
    };
    return group;
}

function assertDecoderDefinitionKeys(definition) {
    for (const key in definition) {
        if (key !== 'matches' && key !== 'read') {
            throw new TypeError('createMakerNoteDecoder: unknown key \'' + key + '\': the keys are matches and read');
        }
    }
}

function matchesWithoutThrowing(matches, input) {
    try {
        return matches({make: input.make, model: input.model, bytes: getMakerNoteBytes(input.bytes)}) === true;
    } catch (error) {
        return false;
    }
}

// The Exif reader gives a one-value tag as the value alone and the bytes of a
// MakerNote stored as SBYTE as numbers from -128, and a MakerNote stored with
// another type can hold other values.
function getMakerNoteBytes(value) {
    if (!Array.isArray(value)) {
        return isByteValue(value) ? [getUnsignedByte(value)] : [];
    }
    let hasSignedByte = false;
    for (let i = 0; i < value.length; i++) {
        if (!isByteValue(value[i])) {
            return [];
        }
        hasSignedByte = hasSignedByte || value[i] < 0;
    }
    return hasSignedByte ? value.map(getUnsignedByte) : value;
}

function isByteValue(value) {
    return typeof value === 'number' && value >= -128 && value <= 255 && Math.floor(value) === value;
}

function getUnsignedByte(value) {
    return value < 0 ? value + 256 : value;
}

// The caller's read gets a context without the engine context, so it cannot
// reach the shared value budget or the tag filter.
function readCallerTags(read, input) {
    const engineContext = input.context.engineContext;
    const result = read({
        tiffView: input.tiffView,
        tiffHeaderOffset: input.tiffHeaderOffset,
        makerNoteOffset: input.makerNoteOffset,
        byteOrder: input.byteOrder,
        context: {includeUnknown: input.context.includeUnknown, computed: input.context.computed},
    });
    if (isThenable(result)) {
        return Promise.resolve(result).then((resolvedResult) => getCallerTags(resolvedResult, engineContext));
    }
    return getCallerTags(result, engineContext);
}

function getCallerTags(result, engineContext) {
    return filterTagsForParse('makerNotes', copyCallerTags(result), engineContext.tagFilter);
}

// Each entry is rebuilt from fields read once, so a getter or a Proxy in the
// caller's result cannot throw or change later, in the merge or the filters.
function copyCallerTags(result) {
    if (!isTagObject(result)) {
        return undefined;
    }
    const tags = {};
    const names = Object.keys(result);
    for (let i = 0; i < names.length; i++) {
        const entry = result[names[i]];
        if (isTagObject(entry)) {
            setProperty(tags, getTagKey(names[i]), copyCallerTag(entry));
        }
    }
    return tags;
}

function isTagObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function copyCallerTag(entry) {
    const value = entry.value;
    const description = entry.description;
    const id = entry.id;
    const computed = entry.computed;
    const tag = {value, description};
    if (typeof id === 'number') {
        tag.id = id;
    }
    if (computed !== undefined) {
        tag.computed = computed;
    }
    return tag;
}

function withAdditions(group, additions) {
    return objectAssign({}, group, additions);
}

function getDomParser(domParser) {
    return {parser: domParser || new DOMParser()};
}

function assertDomParserAvailable(domParser) {
    if (!domParser && typeof DOMParser === 'undefined') {
        throw new Error('reader.load: xmp is in groups but no DOM parser is available: pass domParser to createReader, for example new DOMParser({onError: onErrorStopParsing}) from @xmldom/xmldom, or leave xmp out of groups');
    }
}

function getBase64Image(image) {
    if (typeof btoa === 'undefined') {
        return undefined;
    }
    return btoa(getByteString(new Uint8Array(image)));
}
