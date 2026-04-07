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
const TYPE_BROB = 0x62726F62;
const TYPE_JXLC = 0x6a786c63;
const TYPE_JXLP = 0x6a786c70;
const JXLP_SEQUENCE_NUMBER_SIZE = 4;
const BROB_ORIGINAL_TYPE_SIZE = 4;

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
    let brobExifChunk;
    let brobXmpChunk;
    let jxlCodestreamOffset;

    if (isJxlCodestream(dataView)) {
        jxlCodestreamOffset = 0;
    }

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

        if (boxType === TYPE_JXLC && jxlCodestreamOffset === undefined) {
            jxlCodestreamOffset = contentOffset;
        }

        if (boxType === TYPE_JXLP && jxlCodestreamOffset === undefined
            && contentOffset + JXLP_SEQUENCE_NUMBER_SIZE <= dataView.byteLength) {
            const sequenceNumber = dataView.getUint32(contentOffset) & 0x7FFFFFFF;
            if (sequenceNumber === 0) {
                jxlCodestreamOffset = contentOffset + JXLP_SEQUENCE_NUMBER_SIZE;
            }
        }

        if (boxType === TYPE_BROB && contentOffset + BROB_ORIGINAL_TYPE_SIZE <= dataView.byteLength) {
            const originalType = dataView.getUint32(contentOffset);
            const compressedDataOffset = contentOffset + BROB_ORIGINAL_TYPE_SIZE;
            const compressedDataLength = length - (compressedDataOffset - offset);

            if (Constants.USE_EXIF && originalType === TYPE_EXIF && tiffHeaderOffset === undefined && !brobExifChunk) {
                brobExifChunk = {
                    dataOffset: compressedDataOffset,
                    length: compressedDataLength
                };
            }
            if (Constants.USE_XMP && originalType === TYPE_XML && !xmpChunks && !brobXmpChunk) {
                brobXmpChunk = {
                    dataOffset: compressedDataOffset,
                    length: compressedDataLength
                };
            }
        }

        offset += length;
    }

    const hasAppMarkers = tiffHeaderOffset !== undefined
        || xmpChunks !== undefined
        || brobExifChunk !== undefined
        || brobXmpChunk !== undefined
        || jxlCodestreamOffset !== undefined;

    return {
        hasAppMarkers,
        tiffHeaderOffset,
        xmpChunks,
        brobExifChunk,
        brobXmpChunk,
        jxlCodestreamOffset
    };
}
