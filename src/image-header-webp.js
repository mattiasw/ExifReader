/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringFromDataView} from './utils.js';
import Constants from './constants.js';

export default {
    isWebpFile,
    findOffsets
};

function isWebpFile(dataView) {
    const RIFF_ID_OFFSET = 0;
    const RIFF_ID = 'RIFF';
    const WEBP_MARKER_OFFSET = 8;
    const WEBP_MARKER = 'WEBP';

    return !!dataView && getStringFromDataView(dataView, RIFF_ID_OFFSET, RIFF_ID.length) === RIFF_ID
        && getStringFromDataView(dataView, WEBP_MARKER_OFFSET, WEBP_MARKER.length) === WEBP_MARKER;
}

function findOffsets(dataView) {
    const SUB_CHUNK_START_OFFSET = 12;
    const CHUNK_SIZE_OFFSET = 4;
    const EXIF_IDENTIFIER = 'Exif\x00\x00';
    const CHUNK_HEADER_SIZE = 8;

    let offset = SUB_CHUNK_START_OFFSET;
    let hasAppMarkers = false;
    let tiffHeaderOffset;
    let xmpChunks;
    let iccChunks;

    while (offset + CHUNK_HEADER_SIZE < dataView.byteLength) {
        const chunkId = getStringFromDataView(dataView, offset, 4);
        const chunkSize = dataView.getUint32(offset + CHUNK_SIZE_OFFSET, true);

        if (Constants.USE_EXIF && (chunkId === 'EXIF')) {
            hasAppMarkers = true;
            if (getStringFromDataView(dataView, offset + CHUNK_HEADER_SIZE, EXIF_IDENTIFIER.length) === EXIF_IDENTIFIER) {
                tiffHeaderOffset = offset + CHUNK_HEADER_SIZE + EXIF_IDENTIFIER.length;
            } else {
                tiffHeaderOffset = offset + CHUNK_HEADER_SIZE;
            }
        } else if (Constants.USE_XMP && (chunkId === 'XMP ')) {
            hasAppMarkers = true;
            xmpChunks = [{
                dataOffset: offset + CHUNK_HEADER_SIZE,
                length: chunkSize
            }];
        } else if (Constants.USE_ICC && (chunkId === 'ICCP')) {
            hasAppMarkers = true;
            iccChunks = [{
                offset: offset + CHUNK_HEADER_SIZE,
                length: chunkSize,
                chunkNumber: 1,
                chunksTotal: 1
            }];
        }

        offset += CHUNK_HEADER_SIZE + (chunkSize % 2 === 0 ? chunkSize : chunkSize + 1);
    }

    return {
        hasAppMarkers,
        tiffHeaderOffset,
        xmpChunks,
        iccChunks
    };
}
