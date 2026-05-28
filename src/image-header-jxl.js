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

/**
 * Checks if the provided data view represents a JPEG XL file (container or
 * bare codestream).
 *
 * @param {DataView} dataView The data view to check.
 * @returns {boolean} True for either a JXL container signature or a bare
 *     codestream signature.
 */
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

/**
 * Walks the JPEG XL box list and reports the offsets ExifReader needs.
 *
 * @param {DataView} dataView The data view to find offsets in.
 * @param {Array<Object>=} metadataBlocks Optional out-array. When provided,
 *     receives one block per recognized box (Exif, xml, brob with Exif or
 *     xml original type). The codestream box (`jxlc`/`jxlp`) does not emit
 *     a block because it wraps the encoded image, not metadata.
 * @returns {Object} hasAppMarkers and the per-section offsets.
 */
function findJxlOffsets(dataView, metadataBlocks) {
    let offset = 0;
    let tiffHeaderOffset;
    let xmpChunks;
    let brobExifChunk;
    let brobXmpChunk;
    let jxlCodestreamOffset;

    if (isJxlCodestream(dataView)) {
        // A bare codestream has no box structure, so the box walk below
        // would only ever misinterpret codestream bytes as box headers.
        return {
            hasAppMarkers: true,
            tiffHeaderOffset: undefined,
            xmpChunks: undefined,
            brobExifChunk: undefined,
            brobXmpChunk: undefined,
            jxlCodestreamOffset: 0,
        };
    }

    while (offset + BOX_HEADER_MIN_SIZE <= dataView.byteLength) {
        const {length, contentOffset} = getBoxLength(dataView, offset);
        if (length < BOX_HEADER_MIN_SIZE) {
            break;
        }

        const boxType = dataView.getUint32(offset + BOX_TYPE_OFFSET);
        let blockType;

        if (Constants.USE_EXIF && boxType === TYPE_EXIF) {
            try {
                tiffHeaderOffset = getTiffHeaderOffset(dataView, contentOffset);
            } catch (_error) {
                // Truncated Exif data.
            }
            blockType = 'exif';
        }

        if (Constants.USE_XMP && boxType === TYPE_XML) {
            xmpChunks = [{
                dataOffset: contentOffset,
                length: length - (contentOffset - offset)
            }];
            blockType = 'xmp';
        }

        if (boxType === TYPE_JXLC && jxlCodestreamOffset === undefined) {
            jxlCodestreamOffset = contentOffset;
            // No block emitted: the codestream box wraps the encoded image,
            // marking it would inflate metadataRange.end past pixel data.
        }

        if (boxType === TYPE_JXLP && jxlCodestreamOffset === undefined
            && contentOffset + JXLP_SEQUENCE_NUMBER_SIZE <= dataView.byteLength) {
            const sequenceNumber = dataView.getUint32(contentOffset) & 0x7FFFFFFF;
            if (sequenceNumber === 0) {
                jxlCodestreamOffset = contentOffset + JXLP_SEQUENCE_NUMBER_SIZE;
                // Same reason as TYPE_JXLC above.
            }
        }

        if (boxType === TYPE_BROB && contentOffset + BROB_ORIGINAL_TYPE_SIZE <= dataView.byteLength) {
            const originalType = dataView.getUint32(contentOffset);
            const compressedDataOffset = contentOffset + BROB_ORIGINAL_TYPE_SIZE;
            const compressedDataLength = length - (compressedDataOffset - offset);

            // Decouple block emission from parsing-source selection. A
            // brob(Exif) box must surface as an `exif` block even if a
            // plain Exif box already won the parsing race. The brob*Chunk
            // variables stay guarded to avoid double-parsing.
            if (Constants.USE_EXIF && originalType === TYPE_EXIF) {
                blockType = 'exif';
                if (tiffHeaderOffset === undefined && !brobExifChunk) {
                    brobExifChunk = {
                        dataOffset: compressedDataOffset,
                        length: compressedDataLength
                    };
                }
            }
            if (Constants.USE_XMP && originalType === TYPE_XML) {
                blockType = 'xmp';
                if (!xmpChunks && !brobXmpChunk) {
                    brobXmpChunk = {
                        dataOffset: compressedDataOffset,
                        length: compressedDataLength
                    };
                }
            }
        }

        if (metadataBlocks && blockType) {
            metadataBlocks.push({
                type: blockType,
                start: offset,
                end: offset + length,
            });
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
