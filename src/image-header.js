/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Tiff from './image-header-tiff';
import Jpeg from './image-header-jpeg';
import Png from './image-header-png';
import Heic from './image-header-heic';

export default {
    parseAppMarkers
};

function parseAppMarkers(dataView) {
    if (Tiff && Tiff.isTiffFile(dataView)) {
        return Tiff.findTiffOffsets();
    }

    if (Jpeg && Jpeg.isJpegFile(dataView)) {
        return Jpeg.findJpegOffsets(dataView);
    }

    if (Png && Png.isPngFile(dataView)) {
        return Png.findPngOffsets(dataView);
    }

    if (Heic && Heic.isHeicFile(dataView)) {
        return Heic.findHeicOffsets(dataView);
    }

    throw new Error('Invalid image format');
}
