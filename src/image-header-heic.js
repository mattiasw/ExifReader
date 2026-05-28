/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {parseBox, findOffsets} from './image-header-iso-bmff.js';

export default {
    isHeicFile,
    findHeicOffsets
};

/**
 * Checks if the provided data view represents a HEIC/HEIF file.
 *
 * @param {DataView} dataView - The data view to check.
 * @returns {boolean} True if the data view represents a HEIC/HEIF file, false otherwise.
 */
function isHeicFile(dataView) {
    if (!dataView) {
        return false;
    }

    const HEIC_MAJOR_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1'];

    try {
        const headerBox = parseBox(dataView, 0);
        return headerBox && HEIC_MAJOR_BRANDS.indexOf(headerBox.majorBrand) !== -1;
    } catch (error) {
        return false;
    }
}

/**
 * Finds the offsets of a HEIC file in the provided data view.
 *
 * @param {DataView} dataView The data view to find offsets in.
 * @param {Array<Object>=} metadataBlocks Optional out-array. Forwarded to
 *     the shared ISO-BMFF findOffsets.
 * @returns {Object} TIFF header offset, XMP chunks, ICC chunks, and whether
 *     any were found.
 */
function findHeicOffsets(dataView, metadataBlocks) {
    return findOffsets(dataView, metadataBlocks);
}
