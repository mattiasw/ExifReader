/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import ByteOrder from './byte-order.js';
import Constants from './constants.js';

export default {
    isTiffFile,
    findTiffOffsets
};

function isTiffFile(dataView) {
    const MIN_TIFF_DATA_BUFFER_LENGTH = 4;

    return !!dataView && (dataView.byteLength >= MIN_TIFF_DATA_BUFFER_LENGTH) && hasTiffMarker(dataView);
}

function hasTiffMarker(dataView) {
    const TIFF_ID = 0x2a;
    const TIFF_ID_OFFSET = 2;

    const littleEndian = dataView.getUint16(0) === ByteOrder.LITTLE_ENDIAN;
    return dataView.getUint16(TIFF_ID_OFFSET, littleEndian) === TIFF_ID;
}

function findTiffOffsets() {
    const TIFF_FILE_HEADER_OFFSET = 0;

    if (Constants.USE_EXIF) {
        return {
            hasAppMarkers: true,
            tiffHeaderOffset: TIFF_FILE_HEADER_OFFSET
        };
    }
    return {};
}
