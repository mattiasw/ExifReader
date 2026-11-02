/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getBoxLength, getTiffHeaderOffset, BOX_TYPE_OFFSET, BOX_MIN_LENGTH} from './image-header-iso-bmff.js';
import {pushRange} from './utils.js';

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

const TYPE_EXIF = 0x45786966;
const TYPE_XML = 0x786D6C20;
const TYPE_BROB = 0x62726F62;
const TYPE_JXLC = 0x6a786c63;
const TYPE_JXLP = 0x6a786c70;
const JXLP_SEQUENCE_NUMBER_SIZE = 4;
const BROB_ORIGINAL_TYPE_SIZE = 4;
const EXIF_TIFF_HEADER_OFFSET_SIZE = 4;

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
 * Walks the JPEG XL box list and reports the blocks ExifReader reads.
 *
 * An Exif box that holds its TIFF header offset wins over any brob(Exif) box,
 * otherwise the first brob(Exif) is reported; the same goes for the xml box
 * and brob(xml). The last Exif or xml box wins among its own kind. The
 * `jxlFile` block points at the codestream: the first jxlc box, or the first
 * jxlp box with sequence number 0. A bare codestream is only a `jxlFile`
 * block at offset 0.
 *
 * @param {DataView} dataView The data view to find blocks in.
 * @param {Array<Object>=} ranges Optional out-array. When provided, receives
 *     one `{block, start, end}` span per recognized box (Exif, xml, brob with
 *     Exif or xml original type), a brob box's span linked to its own block
 *     even when another box wins. The codestream box (`jxlc`/`jxlp`) gets no
 *     span because it wraps the encoded image, not metadata.
 * @returns {Array<Object>} The blocks: exif, xmp and jxlFile, each when found.
 */
function findJxlOffsets(dataView, ranges) {
    const blocks = [];
    let offset = 0;
    let exifBoxBlock;
    let brobExifBlock;
    let xmlBoxBlock;
    let brobXmpBlock;
    let jxlFileBlock;

    if (isJxlCodestream(dataView)) {
        // A bare codestream has no box structure, so the box walk below
        // would only ever misinterpret codestream bytes as box headers.
        return [{kind: 'jxlFile', codestreamOffset: 0}];
    }

    while (offset + BOX_MIN_LENGTH <= dataView.byteLength) {
        const {length, contentOffset} = getBoxLength(dataView, offset);
        if (length < contentOffset - offset) {
            break;
        }
        const contentEnd = Math.min(offset + length, dataView.byteLength);

        const boxType = dataView.getUint32(offset + BOX_TYPE_OFFSET);
        let block;

        if (boxType === TYPE_EXIF) {
            if (contentOffset + EXIF_TIFF_HEADER_OFFSET_SIZE <= contentEnd) {
                exifBoxBlock = exifBoxBlock || {kind: 'exif'};
                exifBoxBlock.tiffHeaderOffset = getTiffHeaderOffset(dataView, contentOffset);
                block = exifBoxBlock;
            } else {
                // Too short to hold its TIFF header offset: listed, never read,
                // and no bar to a brob(Exif) box.
                block = {kind: 'exif'};
            }
        }

        if (boxType === TYPE_XML) {
            xmlBoxBlock = xmlBoxBlock || {kind: 'xmp'};
            xmlBoxBlock.chunks = [{
                dataOffset: contentOffset,
                length: length - (contentOffset - offset)
            }];
            block = xmlBoxBlock;
        }

        if (boxType === TYPE_JXLC && jxlFileBlock === undefined) {
            jxlFileBlock = {kind: 'jxlFile', codestreamOffset: contentOffset};
            // No span listed: the codestream box wraps the encoded image,
            // marking it would inflate metadataRange.end past pixel data.
        }

        if (boxType === TYPE_JXLP && jxlFileBlock === undefined
            && contentOffset + JXLP_SEQUENCE_NUMBER_SIZE <= contentEnd) {
            const sequenceNumber = dataView.getUint32(contentOffset) & 0x7FFFFFFF;
            if (sequenceNumber === 0) {
                jxlFileBlock = {kind: 'jxlFile', codestreamOffset: contentOffset + JXLP_SEQUENCE_NUMBER_SIZE};
                // Same reason as TYPE_JXLC above.
            }
        }

        if (boxType === TYPE_BROB && contentOffset + BROB_ORIGINAL_TYPE_SIZE <= contentEnd) {
            const originalType = dataView.getUint32(contentOffset);
            const compressedDataOffset = contentOffset + BROB_ORIGINAL_TYPE_SIZE;
            const compressedDataLength = length - (compressedDataOffset - offset);

            // Every brob box gets its own block for its span, but only the
            // first of a kind can be the one read, and only when no plain box
            // of that kind holds the data.
            if (originalType === TYPE_EXIF) {
                block = {kind: 'exif', compression: 'brotli', dataOffset: compressedDataOffset, length: compressedDataLength};
                brobExifBlock = brobExifBlock || block;
            }
            if (originalType === TYPE_XML) {
                block = {kind: 'xmp', compression: 'brotli', dataOffset: compressedDataOffset, length: compressedDataLength};
                brobXmpBlock = brobXmpBlock || block;
            }
        }

        pushRange(ranges, block, offset, offset + length);

        offset += length;
    }

    pushDefinedBlock(blocks, exifBoxBlock || brobExifBlock);
    pushDefinedBlock(blocks, xmlBoxBlock || brobXmpBlock);
    pushDefinedBlock(blocks, jxlFileBlock);

    return blocks;
}

function pushDefinedBlock(blocks, block) {
    if (block !== undefined) {
        blocks.push(block);
    }
}
