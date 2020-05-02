/**
 * ExifReader
 * http://github.com/mattiasw/exifreader
 * Copyright (C) 2011-2020  Mattias Wallander <mattias@wallander.eu>
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {objectAssign} from './utils.js';
import DataViewWrapper from './dataview.js';
import Constants from './constants.js';
import {getStringValueFromArray} from './utils.js';
import {getCalculatedGpsValue} from './tag-names-utils.js';
import ImageHeader from './image-header.js';
import Tags from './tags.js';
import FileTags from './file-tags.js';
import IptcTags from './iptc-tags.js';
import XmpTags from './xmp-tags.js';
import IccTags from './icc-tags.js';
import PngFileTags from './png-file-tags.js';
import Thumbnail from './thumbnail.js';
import exifErrors from './errors.js';

export default {
    load,
    loadView,
    errors: exifErrors,
};

export const errors = exifErrors;

export function load(data, options = {expanded: false}) {
    if (isNodeBuffer(data)) {
        // File data read in Node can share the underlying buffer with other
        // data. Therefore it's safest to get a new one to avoid weird bugs.
        data = (new Uint8Array(data)).buffer;
    }
    return loadView(getDataView(data), options);
}

function isNodeBuffer(data) {
    try {
        return Buffer.isBuffer(data); // eslint-disable-line no-undef
    } catch (error) {
        return false;
    }
}

function getDataView(data) {
    try {
        return new DataView(data);
    } catch (error) {
        return new DataViewWrapper(data);
    }
}

export function loadView(dataView, options = {expanded: false}) {
    let foundMetaData = false;
    let tags = {};

    const {fileDataOffset, tiffHeaderOffset, iptcDataOffset, xmpChunks, iccChunks, pngHeaderOffset} = ImageHeader.parseAppMarkers(dataView);

    if (Constants.USE_JPEG && Constants.USE_FILE && hasFileData(fileDataOffset)) {
        foundMetaData = true;
        const readTags = FileTags.read(dataView, fileDataOffset);
        if (options.expanded) {
            tags.file = readTags;
        } else {
            tags = objectAssign({}, tags, readTags);
        }
    }

    if (Constants.USE_EXIF && hasExifData(tiffHeaderOffset)) {
        foundMetaData = true;
        const readTags = Tags.read(dataView, tiffHeaderOffset);
        if (readTags.Thumbnail) {
            tags.Thumbnail = readTags.Thumbnail;
            delete readTags.Thumbnail;
        }

        if (options.expanded) {
            tags.exif = readTags;
            addGpsGroup(tags);
        } else {
            tags = objectAssign({}, tags, readTags);
        }

        if (Constants.USE_TIFF && Constants.USE_IPTC && readTags['IPTC-NAA'] && !hasIptcData(iptcDataOffset)) {
            const readIptcTags = IptcTags.read(readTags['IPTC-NAA'].value, 0);
            if (options.expanded) {
                tags.iptc = readIptcTags;
            } else {
                tags = objectAssign({}, tags, readIptcTags);
            }
        }

        if (Constants.USE_TIFF && Constants.USE_XMP && readTags['ApplicationNotes'] && !hasXmpData(xmpChunks)) {
            const readXmpTags = XmpTags.read(getStringValueFromArray(readTags['ApplicationNotes'].value));
            if (options.expanded) {
                tags.xmp = readXmpTags;
            } else {
                tags = objectAssign({}, tags, readXmpTags);
            }
        }

        if (Constants.USE_TIFF && Constants.USE_ICC && readTags['ICC_Profile'] && !hasIccData(iccChunks)) {
            const readIccTags = IccTags.read(
                readTags['ICC_Profile'].value,
                [{
                    offset: 0,
                    length: readTags['ICC_Profile'].value.length,
                    chunkNumber: 1,
                    chunksTotal: 1
                }]
            );
            if (options.expanded) {
                tags.icc = readIccTags;
            } else {
                tags = objectAssign({}, tags, readIccTags);
            }
        }
    }

    if (Constants.USE_JPEG && Constants.USE_IPTC && hasIptcData(iptcDataOffset)) {
        foundMetaData = true;
        const readTags = IptcTags.read(dataView, iptcDataOffset);
        if (options.expanded) {
            tags.iptc = readTags;
        } else {
            tags = objectAssign({}, tags, readTags);
        }
    }

    if (Constants.USE_XMP && hasXmpData(xmpChunks)) {
        foundMetaData = true;
        const readTags = XmpTags.read(dataView, xmpChunks);
        if (options.expanded) {
            tags.xmp = readTags;
        } else {
            tags = objectAssign({}, tags, readTags);
        }
    }

    if ((Constants.USE_JPEG || Constants.USE_WEBP) && Constants.USE_ICC && hasIccData(iccChunks)) {
        foundMetaData = true;
        const readTags = IccTags.read(dataView, iccChunks);
        if (options.expanded) {
            tags.icc = readTags;
        } else {
            tags = objectAssign({}, tags, readTags);
        }
    }

    if (Constants.USE_PNG && Constants.USE_PNG_FILE && hasPngFileData(pngHeaderOffset)) {
        foundMetaData = true;
        const readTags = PngFileTags.read(dataView, pngHeaderOffset);
        if (options.expanded) {
            tags.pngFile = readTags;
        } else {
            tags = objectAssign({}, tags, readTags);
        }
    }

    const thumbnail = (Constants.USE_JPEG || Constants.USE_WEBP)
        && Constants.USE_EXIF
        && Constants.USE_THUMBNAIL
        && Thumbnail.get(dataView, tags.Thumbnail, tiffHeaderOffset);
    if (thumbnail) {
        foundMetaData = true;
        tags.Thumbnail = thumbnail;
    } else {
        delete tags.Thumbnail;
    }

    if (!foundMetaData) {
        throw new exifErrors.MetadataMissingError();
    }

    return tags;
}

function hasFileData(fileDataOffset) {
    return fileDataOffset !== undefined;
}

function hasExifData(tiffHeaderOffset) {
    return tiffHeaderOffset !== undefined;
}

function addGpsGroup(tags) {
    if (tags.exif) {
        if (tags.exif.GPSLatitude && tags.exif.GPSLatitudeRef) {
            tags.gps = tags.gps || {};
            tags.gps.Latitude = getCalculatedGpsValue(tags.exif.GPSLatitude.value);
            if (tags.exif.GPSLatitudeRef.value.join('') === 'S') {
                tags.gps.Latitude = -tags.gps.Latitude;
            }
        }

        if (tags.exif.GPSLongitude && tags.exif.GPSLongitudeRef) {
            tags.gps = tags.gps || {};
            tags.gps.Longitude = getCalculatedGpsValue(tags.exif.GPSLongitude.value);
            if (tags.exif.GPSLongitudeRef.value.join('') === 'W') {
                tags.gps.Longitude = -tags.gps.Longitude;
            }
        }

        if (tags.exif.GPSAltitude && tags.exif.GPSAltitudeRef) {
            tags.gps = tags.gps || {};
            tags.gps.Altitude = tags.exif.GPSAltitude.value[0] / tags.exif.GPSAltitude.value[1];
            if (tags.exif.GPSAltitudeRef.value === 1) {
                tags.gps.Altitude = -tags.gps.Altitude;
            }
        }
    }
}

function hasIptcData(iptcDataOffset) {
    return iptcDataOffset !== undefined;
}

function hasXmpData(xmpChunks) {
    return Array.isArray(xmpChunks) && xmpChunks.length > 0;
}

function hasIccData(iccDataOffsets) {
    return Array.isArray(iccDataOffsets) && iccDataOffsets.length > 0;
}

function hasPngFileData(pngFileDataOffset) {
    return pngFileDataOffset !== undefined;
}
