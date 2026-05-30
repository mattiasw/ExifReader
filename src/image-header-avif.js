/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Specification:
// https://aomediacodec.github.io/av1-avif

import {parseBox, findOffsets} from './image-header-iso-bmff.js';

export default {
    isAvifFile,
    findAvifOffsets
};

/**
 * Checks if the provided data view represents an AVIF file.
 *
 * @param {DataView} dataView - The data view to check.
 * @returns {boolean} True if the data view represents an AVIF file, false otherwise.
 */
function isAvifFile(dataView) {
    if (!dataView) {
        return false;
    }

    try {
        const headerBox = parseBox(dataView, 0);
        return headerBox !== undefined && headerBox.majorBrand === 'avif';
    } catch (error) {
        return false;
    }
}

/**
 * Finds the offsets of an AVIF file in the provided data view.
 *
 * @param {DataView} dataView The data view to find offsets in.
 * @param {Array<Object>=} metadataBlocks Optional out-array. Forwarded to
 *     the shared ISO-BMFF findOffsets.
 * @returns {Object} TIFF header offset, XMP chunks, ICC chunks, and whether
 *     any were found.
 */
function findAvifOffsets(dataView, metadataBlocks) {
    return findOffsets(dataView, metadataBlocks);
}
