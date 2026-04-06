/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Constants from './constants.js';
import {getBoxLength, getTiffHeaderOffset} from './image-header-iso-bmff.js';

export default {
    isJxlFile,
    findJxlOffsets
};

const JXL_CONTAINER_SIGNATURE = [
    0x00, 0x00, 0x00, 0x0C,
    0x4A, 0x58, 0x4C, 0x20,
    0x0D, 0x0A, 0x87, 0x0A
];
const JXL_CODESTREAM_SIGNATURE = [0xFF, 0x0A];

const BOX_TYPE_OFFSET = 4;
const BOX_HEADER_MIN_SIZE = 8;
const TYPE_EXIF = 0x45786966;
const TYPE_XML = 0x786D6C20;

function isJxlFile(dataView) {
    try {
        return isJxlContainer(dataView) || isJxlCodestream(dataView);
    } catch (_error) {
        return false;
    }
}

function isJxlContainer(dataView) {
    if (!dataView || dataView.byteLength < JXL_CONTAINER_SIGNATURE.length) {
        return false;
    }

    for (let i = 0; i < JXL_CONTAINER_SIGNATURE.length; i++) {
        if (dataView.getUint8(i) !== JXL_CONTAINER_SIGNATURE[i]) {
            return false;
        }
    }

    return true;
}

function isJxlCodestream(dataView) {
    if (!dataView || dataView.byteLength < JXL_CODESTREAM_SIGNATURE.length) {
        return false;
    }

    return dataView.getUint8(0) === JXL_CODESTREAM_SIGNATURE[0]
        && dataView.getUint8(1) === JXL_CODESTREAM_SIGNATURE[1];
}

function findJxlOffsets(dataView) {
    let offset = 0;
    let tiffHeaderOffset;
    let xmpChunks;

    while (offset + BOX_HEADER_MIN_SIZE <= dataView.byteLength) {
        const {length, contentOffset} = getBoxLength(dataView, offset);
        if (length < BOX_HEADER_MIN_SIZE) {
            break;
        }

        const boxType = dataView.getUint32(offset + BOX_TYPE_OFFSET);

        if (Constants.USE_EXIF && boxType === TYPE_EXIF) {
            try {
                tiffHeaderOffset = getTiffHeaderOffset(dataView, contentOffset);
            } catch (_error) {
                // Truncated Exif data.
            }
        }

        if (Constants.USE_XMP && boxType === TYPE_XML) {
            xmpChunks = [{
                dataOffset: contentOffset,
                length: length - (contentOffset - offset)
            }];
        }

        offset += length;
    }

    const hasAppMarkers = tiffHeaderOffset !== undefined || xmpChunks !== undefined;

    return {
        hasAppMarkers,
        tiffHeaderOffset,
        xmpChunks
    };
}
