/**
 * ExifReader
 * http://github.com/mattiasw/exifreader
 * Copyright (C) 2011-2018  Mattias Wallander <mattias@wallander.eu>
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import DataViewWrapper from './dataview';
import ImageHeader from './image-header';
import Tags from './tags';
import FileTags from './file-tags';
import IptcTags from './iptc-tags';
import XmpTags from './xmp-tags';
import IccTags from './icc-tags';
import exifErrors from './errors';

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

    const {fileDataOffset, tiffHeaderOffset, iptcDataOffset, xmpDataOffset, xmpFieldLength, iccChunks} = ImageHeader.parseAppMarkers(dataView);

    if (hasFileData(fileDataOffset)) {
        foundMetaData = true;
        const readTags = FileTags.read(dataView, fileDataOffset);
        if (options.expanded) {
            tags.file = readTags;
        } else {
            tags = Object.assign({}, tags, readTags);
        }
    }
    if (hasExifData(tiffHeaderOffset)) {
        foundMetaData = true;
        const readTags = Tags.read(dataView, tiffHeaderOffset);
        if (options.expanded) {
            tags.exif = readTags;
        } else {
            tags = Object.assign({}, tags, readTags);
        }
    }
    if (hasIptcData(iptcDataOffset)) {
        foundMetaData = true;
        const readTags = IptcTags.read(dataView, iptcDataOffset);
        if (options.expanded) {
            tags.iptc = readTags;
        } else {
            tags = Object.assign({}, tags, readTags);
        }
    }
    if (hasXmpData(xmpDataOffset)) {
        foundMetaData = true;
        const readTags = XmpTags.read(dataView, xmpDataOffset, xmpFieldLength);
        if (options.expanded) {
            tags.xmp = readTags;
        } else {
            tags = Object.assign({}, tags, readTags);
        }
    }
    if (hasIccData(iccChunks)) {
        foundMetaData = true;
        const readTags = IccTags.read(dataView, iccChunks);
        if (options.expanded) {
            tags.icc = readTags;
        } else {
            tags = Object.assign({}, tags, readTags);
        }
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

function hasXmpData(xmpDataOffset) {
    return xmpDataOffset !== undefined;
}

function hasIccData(iccDataOffsets) {
    return Array.isArray(iccDataOffsets) && iccDataOffsets.length > 0;
}
