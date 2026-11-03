/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringFromDataView, pushRange} from './utils.js';

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
 * Reports the GIF header, whose logical screen descriptor sits at offset 0.
 *
 * @param {DataView} _dataView The data view (unused).
 * @param {Array<Object>=} ranges Optional out-array. When provided, receives
 *     one span covering the GIF header bytes, linked to the gif block.
 * @returns {Array<Object>} One gif block.
 */
function findOffsets(_dataView, ranges) {
    const block = {kind: 'gif', dataOffset: 0};
    pushRange(ranges, block, 0, GIF_HEADER_SIZE);
    return [block];
}
