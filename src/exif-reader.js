/**
 * ExifReader
 * http://github.com/mattiasw/exifreader
 * Copyright (C) 2011-2021  Mattias Wallander <mattias@wallander.eu>
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/* global Buffer, __non_webpack_require__ */

import {objectAssign} from './utils.js';
import DataViewWrapper from './dataview.js';
import Constants from './constants.js';
import {getStringValueFromArray} from './utils.js';
import {getCalculatedGpsValue} from './tag-names-utils.js';
import ImageHeader from './image-header.js';
import Tags from './tags.js';
import FileTags from './file-tags.js';
import JfifTags from './jfif-tags.js';
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

export function load(data, options) {
    if (isFilePathOrURL(data)) {
        return loadFile(data).then((fileContents) => loadFromData(fileContents, options));
    }
    if (isBrowserFileObject(data)) {
        return loadFileObject(data).then((fileContents) => loadFromData(fileContents, options));
    }
    return loadFromData(data, options);
}

function isFilePathOrURL(data) {
    return typeof data === 'string';
}

function loadFile(filename) {
    if (typeof fetch !== 'undefined') {
        return browserFetchRemoteFile(filename);
    }

    if (/^https?:\/\//.test(filename)) {
        return nodeFetchRemoteFile(filename);
    }

    return loadLocalFile(filename);
}

function browserFetchRemoteFile(url) {
    return fetch(url).then((response) => response.arrayBuffer());
}

function nodeFetchRemoteFile(url) {
    return new Promise((resolve, reject) => {
        const get = requireNodeGet(url);
        get(url, (response) => {
            if ((response.statusCode >= 200) && (response.statusCode <= 299)) {
                const data = [];
                response.on('data', (chunk) => data.push(Buffer.from(chunk)));
                response.on('error', (error) => reject(error));
                response.on('end', () => resolve(Buffer.concat(data)));
            } else {
                reject(`Could not fetch file: ${response.statusCode} ${response.statusMessage}`);
                response.resume();
            }
        }).on('error', (error) => reject(error));
    });
}

function requireNodeGet(url) {
    if (/^https:\/\//.test(url)) {
        return __non_webpack_require__('https').get;
    }
    return __non_webpack_require__('http').get;
}

function loadLocalFile(filename) {
    return new Promise((resolve, reject) => {
        const fs = requireNodeFs();
        fs.open(filename, (error, fd) => {
            if (error) {
                reject(error);
            } else {
                fs.stat(filename, (error, stat) => {
                    if (error) {
                        reject(error);
                    } else {
                        const buffer = Buffer.alloc(stat.size);
                        fs.read(fd, {buffer}, (error) => {
                            if (error) {
                                reject(error);
                            } else {
                                fs.close(fd, (error) => {
                                    if (error) {
                                        console.warn(`Could not close file ${filename}:`, error); // eslint-disable-line no-console
                                    }
                                    resolve(buffer);
                                });
                            }
                        });
                    }
                });
            }
        });
    });
}

function requireNodeFs() {
    try {
        return __non_webpack_require__('fs');
    } catch (error) {
        return undefined;
    }
}

function isBrowserFileObject(data) {
    return (typeof window !== 'undefined') && (typeof File !== 'undefined') && (data instanceof File);
}

function loadFileObject(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (readerEvent) => resolve(readerEvent.target.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

function loadFromData(data, options) {
    if (isNodeBuffer(data)) {
        // File data read in Node can share the underlying buffer with other
        // data. Therefore it's safest to get a new one to avoid weird bugs.
        data = (new Uint8Array(data)).buffer;
    }
    return loadView(getDataView(data), options);
}

function isNodeBuffer(data) {
    try {
        return Buffer.isBuffer(data);
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

export function loadView(dataView, {expanded = false, includeUnknown = false} = {expanded: false, includeUnknown: false}) {
    let foundMetaData = false;
    let tags = {};

    const {
        fileDataOffset,
        jfifDataOffset,
        tiffHeaderOffset,
        iptcDataOffset,
        xmpChunks,
        iccChunks,
        mpfDataOffset,
        pngHeaderOffset
    } = ImageHeader.parseAppMarkers(dataView);

    if (Constants.USE_JPEG && Constants.USE_FILE && hasFileData(fileDataOffset)) {
        foundMetaData = true;
        const readTags = FileTags.read(dataView, fileDataOffset);
        if (expanded) {
            tags.file = readTags;
        } else {
            tags = objectAssign({}, tags, readTags);
        }
    }

    if (Constants.USE_JPEG && Constants.USE_JFIF && hasJfifData(jfifDataOffset)) {
        foundMetaData = true;
        const readTags = JfifTags.read(dataView, jfifDataOffset);
        if (expanded) {
            tags.jfif = readTags;
        } else {
            tags = objectAssign({}, tags, readTags);
        }
    }

    if (Constants.USE_EXIF && hasExifData(tiffHeaderOffset)) {
        foundMetaData = true;
        const readTags = Tags.read(dataView, tiffHeaderOffset, includeUnknown);
        if (readTags.Thumbnail) {
            tags.Thumbnail = readTags.Thumbnail;
            delete readTags.Thumbnail;
        }

        if (expanded) {
            tags.exif = readTags;
            addGpsGroup(tags);
        } else {
            tags = objectAssign({}, tags, readTags);
        }

        if (Constants.USE_TIFF && Constants.USE_IPTC && readTags['IPTC-NAA'] && !hasIptcData(iptcDataOffset)) {
            const readIptcTags = IptcTags.read(readTags['IPTC-NAA'].value, 0, includeUnknown);
            if (expanded) {
                tags.iptc = readIptcTags;
            } else {
                tags = objectAssign({}, tags, readIptcTags);
            }
        }

        if (Constants.USE_TIFF && Constants.USE_XMP && readTags['ApplicationNotes'] && !hasXmpData(xmpChunks)) {
            const readXmpTags = XmpTags.read(getStringValueFromArray(readTags['ApplicationNotes'].value));
            if (expanded) {
                tags.xmp = readXmpTags;
            } else {
                delete readXmpTags._raw;
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
            if (expanded) {
                tags.icc = readIccTags;
            } else {
                tags = objectAssign({}, tags, readIccTags);
            }
        }
    }

    if (Constants.USE_JPEG && Constants.USE_IPTC && hasIptcData(iptcDataOffset)) {
        foundMetaData = true;
        const readTags = IptcTags.read(dataView, iptcDataOffset, includeUnknown);
        if (expanded) {
            tags.iptc = readTags;
        } else {
            tags = objectAssign({}, tags, readTags);
        }
    }

    if (Constants.USE_XMP && hasXmpData(xmpChunks)) {
        foundMetaData = true;
        const readTags = XmpTags.read(dataView, xmpChunks);
        if (expanded) {
            tags.xmp = readTags;
        } else {
            delete readTags._raw;
            tags = objectAssign({}, tags, readTags);
        }
    }

    if ((Constants.USE_JPEG || Constants.USE_WEBP) && Constants.USE_ICC && hasIccData(iccChunks)) {
        foundMetaData = true;
        const readTags = IccTags.read(dataView, iccChunks);
        if (expanded) {
            tags.icc = readTags;
        } else {
            tags = objectAssign({}, tags, readTags);
        }
    }

    if (Constants.USE_MPF && hasMpfData(mpfDataOffset)) {
        foundMetaData = true;
        const readMpfTags = Tags.readMpf(dataView, mpfDataOffset, includeUnknown);
        if (expanded) {
            tags.mpf = readMpfTags;
        } else {
            tags = objectAssign({}, tags, readMpfTags);
        }
    }

    if (Constants.USE_PNG && Constants.USE_PNG_FILE && hasPngFileData(pngHeaderOffset)) {
        foundMetaData = true;
        const readTags = PngFileTags.read(dataView, pngHeaderOffset);
        if (expanded) {
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

function hasJfifData(jfifDataOffset) {
    return jfifDataOffset !== undefined;
}

function hasExifData(tiffHeaderOffset) {
    return tiffHeaderOffset !== undefined;
}

function addGpsGroup(tags) {
    if (tags.exif) {
        if (tags.exif.GPSLatitude && tags.exif.GPSLatitudeRef) {
            try {
                tags.gps = tags.gps || {};
                tags.gps.Latitude = getCalculatedGpsValue(tags.exif.GPSLatitude.value);
                if (tags.exif.GPSLatitudeRef.value.join('') === 'S') {
                    tags.gps.Latitude = -tags.gps.Latitude;
                }
            } catch (error) {
                // Ignore.
            }
        }

        if (tags.exif.GPSLongitude && tags.exif.GPSLongitudeRef) {
            try {
                tags.gps = tags.gps || {};
                tags.gps.Longitude = getCalculatedGpsValue(tags.exif.GPSLongitude.value);
                if (tags.exif.GPSLongitudeRef.value.join('') === 'W') {
                    tags.gps.Longitude = -tags.gps.Longitude;
                }
            } catch (error) {
                // Ignore.
            }
        }

        if (tags.exif.GPSAltitude && tags.exif.GPSAltitudeRef) {
            try {
                tags.gps = tags.gps || {};
                tags.gps.Altitude = tags.exif.GPSAltitude.value[0] / tags.exif.GPSAltitude.value[1];
                if (tags.exif.GPSAltitudeRef.value === 1) {
                    tags.gps.Altitude = -tags.gps.Altitude;
                }
            } catch (error) {
                // Ignore.
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

function hasMpfData(mpfDataOffset) {
    return mpfDataOffset !== undefined;
}

function hasPngFileData(pngFileDataOffset) {
    return pngFileDataOffset !== undefined;
}
