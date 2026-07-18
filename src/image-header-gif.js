/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringFromDataView, pushMetadataBlock} from './utils.js';

export default {
    isGifFile,
    findOffsets
};

const GIF_SIGNATURE_SIZE = 6;
const GIF_SIGNATURES = ['GIF87a', 'GIF89a'];

// 6-byte signature plus 7-byte logical screen descriptor.
const GIF_HEADER_SIZE = 13;

/**
 * Checks if the provided data view represents a GIF file.
 *
 * @param {DataView} dataView The data view to check.
 * @returns {boolean} True if the data view starts with a GIF signature.
 */
function isGifFile(dataView) {
    return !!dataView && GIF_SIGNATURES.includes(getStringFromDataView(dataView, 0, GIF_SIGNATURE_SIZE));
}

/**
 * Finds the GIF logical screen descriptor offset.
 *
 * @param {DataView} _dataView The data view (unused).
 * @param {Array<Object>=} metadataBlocks Optional out-array. When provided,
 *     receives one `gif` block covering the GIF header bytes.
 * @returns {{gifHeaderOffset: number}}
 */
function findOffsets(_dataView, metadataBlocks) {
    pushMetadataBlock(metadataBlocks, 'gif', 0, GIF_HEADER_SIZE);
    return {
        gifHeaderOffset: 0
    };
}
