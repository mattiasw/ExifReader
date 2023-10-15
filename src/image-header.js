/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Constants from './constants.js';
import Tiff from './image-header-tiff.js';
import Jpeg from './image-header-jpeg.js';
import Png from './image-header-png.js';
import Heic from './image-header-heic.js';
import Webp from './image-header-webp.js';
import {objectAssign} from './utils.js';

export default {
    parseAppMarkers
};

function parseAppMarkers(dataView) {
    if (Constants.USE_TIFF && Tiff.isTiffFile(dataView)) {
        return addFileType(Tiff.findTiffOffsets(), 'tiff', 'TIFF');
    }

    if (Constants.USE_JPEG && Jpeg.isJpegFile(dataView)) {
        return addFileType(Jpeg.findJpegOffsets(dataView), 'jpeg', 'JPEG');
    }

    if (Constants.USE_PNG && Png.isPngFile(dataView)) {
        return addFileType(Png.findPngOffsets(dataView), 'png', 'PNG');
    }

    if (Constants.USE_HEIC && Heic.isHeicFile(dataView)) {
        return addFileType(Heic.findHeicOffsets(dataView), 'heic', 'HEIC');
    }

    if (Constants.USE_WEBP && Webp.isWebpFile(dataView)) {
        return addFileType(Webp.findOffsets(dataView), 'webp', 'WebP');
    }

    throw new Error('Invalid image format');
}

function addFileType(offsets, fileType, fileTypeDescription) {
    return objectAssign({}, offsets, {fileType: {value: fileType, description: fileTypeDescription}});
}
