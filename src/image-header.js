/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Constants from './constants.js';
import Tiff from './image-header-tiff.js';
import Jpeg from './image-header-jpeg.js';
import Png from './image-header-png.js';
import Heic from './image-header-heic.js';
import Webp from './image-header-webp.js';

export default {
    parseAppMarkers
};

function parseAppMarkers(dataView) {
    if (Constants.USE_TIFF && Tiff.isTiffFile(dataView)) {
        return Tiff.findTiffOffsets();
    }

    if (Constants.USE_JPEG && Jpeg.isJpegFile(dataView)) {
        return Jpeg.findJpegOffsets(dataView);
    }

    if (Constants.USE_PNG && Png.isPngFile(dataView)) {
        return Png.findPngOffsets(dataView);
    }

    if (Constants.USE_HEIC && Heic.isHeicFile(dataView)) {
        return Heic.findHeicOffsets(dataView);
    }

    if (Constants.USE_WEBP && Webp.isWebpFile(dataView)) {
        return Webp.findOffsets(dataView);
    }

    throw new Error('Invalid image format');
}
