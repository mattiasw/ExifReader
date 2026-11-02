/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringFromDataView, addBlock, pushRange} from './utils.js';

export default {
    isWebpFile,
    findOffsets
};

/**
 * Checks if the provided data view represents a WebP file.
 *
 * @param {DataView} dataView The data view to check.
 * @returns {boolean} True for a RIFF container with the WEBP marker.
 */
function isWebpFile(dataView) {
    const RIFF_ID_OFFSET = 0;
    const RIFF_ID = 'RIFF';
    const WEBP_MARKER_OFFSET = 8;
    const WEBP_MARKER = 'WEBP';

    return !!dataView && getStringFromDataView(dataView, RIFF_ID_OFFSET, RIFF_ID.length) === RIFF_ID
        && getStringFromDataView(dataView, WEBP_MARKER_OFFSET, WEBP_MARKER.length) === WEBP_MARKER;
}

/**
 * Finds the metadata blocks of a WebP file. The last chunk of each id wins.
 *
 * @param {DataView} dataView The data view to find blocks in.
 * @param {Array<Object>=} ranges Optional out-array. When provided, receives
 *     one `{block, start, end}` span per recognized chunk (EXIF/XMP/ICCP/VP8X)
 *     with `start` and `end` covering the full RIFF chunk header and content.
 * @returns {Array<Object>} The blocks, in the order their first chunk was met.
 */
function findOffsets(dataView, ranges) {
    const SUB_CHUNK_START_OFFSET = 12;
    const CHUNK_SIZE_OFFSET = 4;
    const EXIF_IDENTIFIER = 'Exif\x00\x00';
    const CHUNK_HEADER_SIZE = 8;

    const blocks = [];
    let offset = SUB_CHUNK_START_OFFSET;
    let exifBlock;
    let xmpBlock;
    let iccBlock;
    let riffBlock;

    while (offset + CHUNK_HEADER_SIZE < dataView.byteLength) {
        const chunkId = getStringFromDataView(dataView, offset, 4);
        const chunkSize = dataView.getUint32(offset + CHUNK_SIZE_OFFSET, true);
        let block;

        if (chunkId === 'EXIF') {
            exifBlock = exifBlock || addBlock(blocks, {kind: 'exif'});
            if (getStringFromDataView(dataView, offset + CHUNK_HEADER_SIZE, EXIF_IDENTIFIER.length) === EXIF_IDENTIFIER) {
                exifBlock.tiffHeaderOffset = offset + CHUNK_HEADER_SIZE + EXIF_IDENTIFIER.length;
            } else {
                exifBlock.tiffHeaderOffset = offset + CHUNK_HEADER_SIZE;
            }
            block = exifBlock;
        } else if (chunkId === 'XMP ') {
            xmpBlock = xmpBlock || addBlock(blocks, {kind: 'xmp'});
            xmpBlock.chunks = [{
                dataOffset: offset + CHUNK_HEADER_SIZE,
                length: chunkSize
            }];
            block = xmpBlock;
        } else if (chunkId === 'ICCP') {
            iccBlock = iccBlock || addBlock(blocks, {kind: 'icc'});
            iccBlock.chunks = [{
                offset: offset + CHUNK_HEADER_SIZE,
                length: chunkSize,
                chunkNumber: 1,
                chunksTotal: 1
            }];
            block = iccBlock;
        } else if (chunkId === 'VP8X') {
            riffBlock = riffBlock || addBlock(blocks, {kind: 'riff'});
            riffBlock.dataOffset = offset + CHUNK_HEADER_SIZE;
            block = riffBlock;
        }

        const chunkTotalSize = CHUNK_HEADER_SIZE + (chunkSize % 2 === 0 ? chunkSize : chunkSize + 1);

        pushRange(ranges, block, offset, offset + chunkTotalSize);

        offset += chunkTotalSize;
    }

    return blocks;
}
