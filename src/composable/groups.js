/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign, getByteString} from '../utils.js';
import TagNames0thIfd from '../tag-names-0th-ifd.js';
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
export const canon = /* #__PURE__ */ withAdditions(canonGroup, {exifDependencies: [MakerNote, Make]});
export const pentax = /* #__PURE__ */ withAdditions(pentaxGroup, {exifDependencies: [MakerNote, Make]});
export const makerNotes = /* #__PURE__ */ withAdditions(makerNotesGroup, {exifDependencies: [MakerNote, Make]});
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
