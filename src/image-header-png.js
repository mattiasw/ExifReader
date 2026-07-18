/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Specification: http://www.libpng.org/pub/png/spec/1.2/

import {getStringFromDataView, getNullTerminatedStringFromDataView, pushMetadataBlock} from './utils.js';
import Constants from './constants.js';

export default {
    isPngFile,
    findPngOffsets
};

const PNG_ID = '\x89\x50\x4e\x47\x0d\x0a\x1a\x0a';
const PNG_CHUNK_LENGTH_SIZE = 4;
export const PNG_CHUNK_TYPE_SIZE = 4;
export const PNG_CHUNK_LENGTH_OFFSET = 0;
export const PNG_CHUNK_TYPE_OFFSET = PNG_CHUNK_LENGTH_SIZE;
export const PNG_CHUNK_DATA_OFFSET = PNG_CHUNK_LENGTH_SIZE + PNG_CHUNK_TYPE_SIZE;
const PNG_XMP_PREFIX = 'XML:com.adobe.xmp\x00';
export const TYPE_TEXT = 'tEXt';
export const TYPE_ITXT = 'iTXt';
export const TYPE_ZTXT = 'zTXt';
export const TYPE_PHYS = 'pHYs';
export const TYPE_TIME = 'tIME';
export const TYPE_EXIF = 'eXIf';
export const TYPE_ICCP = 'iCCP';

/**
 * Checks if the provided data view represents a PNG file.
 *
 * @param {DataView} dataView The data view to check.
 * @returns {boolean} True if the data view starts with the PNG signature.
 */
function isPngFile(dataView) {
    return !!dataView && getStringFromDataView(dataView, 0, PNG_ID.length) === PNG_ID;
}

/**
 * Walks the PNG chunk list and reports the offsets ExifReader needs.
 *
 * @param {DataView} dataView The data view to find offsets in.
 * @param {boolean} async Whether async parsing is enabled (gates zTXt/iCCP).
 * @param {Array<Object>=} metadataBlocks Optional out-array. When provided,
 *     receives one block per recognized chunk and gets `truncated` set to
 *     true if the loop never saw an IEND chunk.
 * @returns {Object} Per-section offsets plus `hasAppMarkers`.
 */
function findPngOffsets(dataView, async, metadataBlocks) {
    const PNG_CRC_SIZE = 4;
    const TYPE_IEND = 'IEND';

    const offsets = {
        hasAppMarkers: false
    };

    let offset = PNG_ID.length;
    let sawIEnd = false;

    while (offset + PNG_CHUNK_LENGTH_SIZE + PNG_CHUNK_TYPE_SIZE <= dataView.byteLength) {
        let blockType;
        const chunkDataLength = dataView.getUint32(offset + PNG_CHUNK_LENGTH_OFFSET);

        // The IEND check is only needed for the truncation signal, so skip
        // the per-chunk string read for default callers.
        if (metadataBlocks
            && getStringFromDataView(dataView, offset + PNG_CHUNK_TYPE_OFFSET, PNG_CHUNK_TYPE_SIZE) === TYPE_IEND) {
            sawIEnd = true;
        }
        if (Constants.USE_PNG_FILE && isPngImageHeaderChunk(dataView, offset)) {
            offsets.hasAppMarkers = true;
            offsets.pngHeaderOffset = offset + PNG_CHUNK_DATA_OFFSET;
            blockType = 'file';
        } else if (Constants.USE_XMP && isPngXmpChunk(dataView, offset)) {
            const dataOffset = getPngXmpDataOffset(dataView, offset);
            if (dataOffset !== undefined) {
                offsets.hasAppMarkers = true;
                offsets.xmpChunks = [{
                    dataOffset,
                    length: chunkDataLength - (dataOffset - (offset + PNG_CHUNK_DATA_OFFSET))
                }];
                blockType = 'xmp';
            }
        } else if (isPngTextChunk(dataView, offset, async)) {
            offsets.hasAppMarkers = true;
            const chunkType = getStringFromDataView(dataView, offset + PNG_CHUNK_TYPE_OFFSET, PNG_CHUNK_TYPE_SIZE);
            if (!offsets.pngTextChunks) {
                offsets.pngTextChunks = [];
            }
            offsets.pngTextChunks.push({
                length: chunkDataLength,
                type: chunkType,
                offset: offset + PNG_CHUNK_DATA_OFFSET
            });
            blockType = 'png';
        } else if (isPngExifChunk(dataView, offset)) {
            offsets.hasAppMarkers = true;
            offsets.tiffHeaderOffset = offset + PNG_CHUNK_DATA_OFFSET;
            blockType = 'exif';
        } else if (Constants.USE_ICC && async && isPngIccpChunk(dataView, offset)) {
            const iccHeaderOffset = offset + PNG_CHUNK_DATA_OFFSET;
            const iccHeader = parseIccHeader(dataView, iccHeaderOffset);
            if (iccHeader !== undefined) {
                offsets.hasAppMarkers = true;
                if (!offsets.iccChunks) {
                    offsets.iccChunks = [];
                }
                offsets.iccChunks.push({
                    offset: iccHeader.compressedProfileOffset,
                    length: chunkDataLength - (iccHeader.compressedProfileOffset - iccHeaderOffset),
                    chunkNumber: 1,
                    chunksTotal: 1,
                    profileName: iccHeader.profileName,
                    compressionMethod: iccHeader.compressionMethod
                });
                blockType = 'icc';
            }
        } else if (isPngChunk(dataView, offset)) {
            offsets.hasAppMarkers = true;
            if (!offsets.pngChunkOffsets) {
                offsets.pngChunkOffsets = [];
            }
            offsets.pngChunkOffsets.push(offset + PNG_CHUNK_LENGTH_OFFSET);
            blockType = 'png';
        }

        const chunkTotalSize = chunkDataLength
            + PNG_CHUNK_LENGTH_SIZE
            + PNG_CHUNK_TYPE_SIZE
            + PNG_CRC_SIZE;

        pushMetadataBlock(metadataBlocks, blockType, offset, offset + chunkTotalSize);

        offset += chunkTotalSize;
    }

    if (metadataBlocks) {
        metadataBlocks.truncated = !sawIEnd;
    }

    return offsets;
}

function isPngImageHeaderChunk(dataView, offset) {
    const PNG_CHUNK_TYPE_IMAGE_HEADER = 'IHDR';
    return getStringFromDataView(dataView, offset + PNG_CHUNK_TYPE_OFFSET, PNG_CHUNK_TYPE_SIZE) === PNG_CHUNK_TYPE_IMAGE_HEADER;
}

function isPngXmpChunk(dataView, offset) {
    return (getStringFromDataView(dataView, offset + PNG_CHUNK_TYPE_OFFSET, PNG_CHUNK_TYPE_SIZE) === TYPE_ITXT)
        && (getStringFromDataView(dataView, offset + PNG_CHUNK_DATA_OFFSET, PNG_XMP_PREFIX.length) === PNG_XMP_PREFIX);
}

function isPngTextChunk(dataView, offset, async) {
    const chunkType = getStringFromDataView(dataView, offset + PNG_CHUNK_TYPE_OFFSET, PNG_CHUNK_TYPE_SIZE);
    return chunkType === TYPE_TEXT || chunkType === TYPE_ITXT || (chunkType === TYPE_ZTXT && async);
}

function isPngExifChunk(dataView, offset) {
    return getStringFromDataView(dataView, offset + PNG_CHUNK_TYPE_OFFSET, PNG_CHUNK_TYPE_SIZE) === TYPE_EXIF;
}

function isPngIccpChunk(dataView, offset) {
    return getStringFromDataView(dataView, offset + PNG_CHUNK_TYPE_OFFSET, PNG_CHUNK_TYPE_SIZE) === TYPE_ICCP;
}

function isPngChunk(dataView, offset) {
    const SUPPORTED_PNG_CHUNK_TYPES = [TYPE_PHYS, TYPE_TIME];
    const chunkType = getStringFromDataView(dataView, offset + PNG_CHUNK_TYPE_OFFSET, PNG_CHUNK_TYPE_SIZE);
    return SUPPORTED_PNG_CHUNK_TYPES.includes(chunkType);
}

function getPngXmpDataOffset(dataView, offset) {
    const COMPRESSION_FLAG_SIZE = 1;
    const COMPRESSION_METHOD_SIZE = 1;

    offset += PNG_CHUNK_DATA_OFFSET + PNG_XMP_PREFIX.length + COMPRESSION_FLAG_SIZE + COMPRESSION_METHOD_SIZE;

    let numberOfNullSeparators = 0;
    while (numberOfNullSeparators < 2 && offset < dataView.byteLength) {
        if (dataView.getUint8(offset) === 0x00) {
            numberOfNullSeparators++;
        }
        offset++;
    }
    if (numberOfNullSeparators < 2) {
        return undefined;
    }
    return offset;
}

function parseIccHeader(dataView, offset) {
    const NULL_SEPARATOR_SIZE = 1;
    const COMPRESSION_METHOD_SIZE = 1;

    const profileName = getNullTerminatedStringFromDataView(dataView, offset);
    offset += profileName.length + NULL_SEPARATOR_SIZE;

    if (offset + COMPRESSION_METHOD_SIZE > dataView.byteLength) {
        return undefined;
    }
    const compressionMethod = dataView.getUint8(offset);
    offset += COMPRESSION_METHOD_SIZE;

    return {
        profileName,
        compressionMethod,
        compressedProfileOffset: offset
    };
}
