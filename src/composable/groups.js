/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign} from '../utils.js';
import TagNames0thIfd from '../tag-names-0th-ifd.js';
import {exif} from './groups/exif.js';
import {composedIptc as iptcGroup} from './groups/iptc.js';
import {xmp as xmpGroup} from './groups/xmp.js';
import {icc as iccGroup} from './groups/icc.js';
import {photoshop as photoshopGroup} from './groups/photoshop.js';
import {mpf} from './groups/mpf.js';
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

// The groups that read through Exif carry the descriptors of the Exif tags they
// need here, not in their modules, which the default entry also imports.
export const iptc = /* #__PURE__ */ withExifDependencies(iptcGroup, {exifDependencies: [IPTCNAA]});
export const xmp = /* #__PURE__ */ withExifDependencies(xmpGroup, {exifDependencies: [ApplicationNotes]});
export const icc = /* #__PURE__ */ withExifDependencies(iccGroup, {exifDependencies: [ICC_Profile]});
export const photoshop = /* #__PURE__ */ withExifDependencies(photoshopGroup, {exifDependencies: [ImageSourceData, PhotoshopSettings]});
export const canon = /* #__PURE__ */ withExifDependencies(canonGroup, {exifDependencies: [MakerNote, Make]});
export const pentax = /* #__PURE__ */ withExifDependencies(pentaxGroup, {exifDependencies: [MakerNote, Make]});
export const makerNotes = /* #__PURE__ */ withExifDependencies(makerNotesGroup, {exifDependencies: [MakerNote, Make]});
export const gps = /* #__PURE__ */ withExifDependencies(gpsGroup, {
    exifDependencies: [GPSLatitude, GPSLatitudeRef, GPSLongitude, GPSLongitudeRef, GPSAltitude, GPSAltitudeRef],
});
export const composite = /* #__PURE__ */ withExifDependencies(compositeGroup, {
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
export const thumbnail = /* #__PURE__ */ withExifDependencies(thumbnailGroup, {
    exifDependencies: [JPEGInterchangeFormat, JPEGInterchangeFormatLength],
    ifd1TagNames: TagNames0thIfd,
});

export {exif, mpf};

// Without canon and pentax, since makerNotes is their union: leaving makerNotes
// out of this list leaves out every maker note.
export const allGroups = [exif, iptc, xmp, icc, photoshop, mpf, makerNotes, gps, composite, thumbnail];

function withExifDependencies(group, additions) {
    return objectAssign({}, group, additions);
}
