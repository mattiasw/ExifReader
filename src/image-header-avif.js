/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Specification:
// https://aomediacodec.github.io/av1-avif

import {hasMajorBrand, findOffsets} from './image-header-iso-bmff.js';

export default {
    isAvifFile,
    findAvifOffsets
};

const AVIF_MAJOR_BRANDS = ['avif'];

/**
 * Checks if the provided data view represents an AVIF file.
 *
 * @param {DataView} dataView - The data view to check.
 * @returns {boolean} True if the data view represents an AVIF file, false otherwise.
 */
function isAvifFile(dataView) {
    return hasMajorBrand(dataView, AVIF_MAJOR_BRANDS);
}

/**
 * Finds the metadata blocks of an AVIF file in the provided data view.
 *
 * @param {DataView} dataView The data view to find blocks in.
 * @param {Array<Object>=} ranges Optional out-array. Forwarded to the shared
 *     ISO-BMFF findOffsets.
 * @returns {Array<Object>} The blocks the shared ISO-BMFF findOffsets reports.
 */
function findAvifOffsets(dataView, ranges) {
    return findOffsets(dataView, ranges);
}
