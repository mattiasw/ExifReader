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
    return loadView(getDataView(data), options);
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
        const {Thumbnail: thumbnailTags, ...readTags} = Tags.read(dataView, tiffHeaderOffset);

        if (options.expanded) {
            tags.exif = readTags;
        } else {
            tags = objectAssign({}, tags, readTags);
        }
        if (thumbnailTags) {
            tags.Thumbnail = thumbnailTags;
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

    if (Constants.USE_JPEG && Constants.USE_ICC && hasIccData(iccChunks)) {
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

    const thumbnail = Constants.USE_JPEG
        && Constants.USE_EXIF
        && Constants.USE_THUMBNAIL
        && Thumbnail.get(dataView, tags.Thumbnail, tiffHeaderOffset);
    if (thumbnail) {
        tags.Thumbnail = thumbnail;
        foundMetaData = true;
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
