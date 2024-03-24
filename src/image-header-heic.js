/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringFromDataView} from './utils.js';
import Constants from './constants.js';

export default {
    isHeicFile,
    findHeicOffsets
};

function isHeicFile(dataView) {
    if (!dataView) {
        return false;
    }

    const HEIC_ID = 'ftyp';
    const HEIC_ID_OFFSET = 4;
    const HEIC_MAJOR_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1'];
    const HEIC_MAJOR_BRAND_LENGTH = 4;

    const heicMajorBrand = getStringFromDataView(dataView, HEIC_ID_OFFSET + HEIC_ID.length, HEIC_MAJOR_BRAND_LENGTH);

    return (getStringFromDataView(dataView, HEIC_ID_OFFSET, HEIC_ID.length) === HEIC_ID)
        && (HEIC_MAJOR_BRANDS.indexOf(heicMajorBrand) !== -1);
}

function findHeicOffsets(dataView) {
    if (Constants.USE_EXIF || Constants.USE_ICC) {
        const {offset: metaOffset, length: metaLength} = findMetaBox(dataView);
        if (metaOffset === undefined) {
            return {hasAppMarkers: false};
        }

        const metaEndOffset = Math.min(metaOffset + metaLength, dataView.byteLength);
        const {exifItemOffset, ilocOffset, colrOffset} = findMetaItems(dataView, metaOffset, metaEndOffset);

        const exifOffset = findExifOffset(dataView, exifItemOffset, ilocOffset, metaEndOffset);
        const iccChunks = findIccChunks(dataView, colrOffset, metaEndOffset);
        return {
            hasAppMarkers: (exifOffset !== undefined) || (iccChunks !== undefined),
            tiffHeaderOffset: exifOffset,
            iccChunks
        };
    }

    return {hasAppMarkers: false};
}

function findMetaBox(dataView) {
    const BOX_LENGTH_SIZE = 4;
    const BOX_TYPE_SIZE = 4;
    const BOX_MIN_LENGTH = 8;
    const BOX_TYPE_OFFSET = 4;

    let offset = 0;

    while (offset + BOX_LENGTH_SIZE + BOX_TYPE_SIZE <= dataView.byteLength) {
        const boxLength = getBoxLength(dataView, offset);
        if (boxLength >= BOX_MIN_LENGTH) {
            const boxType = getStringFromDataView(dataView, offset + BOX_TYPE_OFFSET, BOX_TYPE_SIZE);
            if (boxType === 'meta') {
                return {
                    offset,
                    length: boxLength
                };
            }
        }

        offset += boxLength;
    }

    return {
        offset: undefined,
        length: 0
    };
}

function getBoxLength(dataView, offset) {
    const BOX_EXTENDED_SIZE_LOW_OFFSET = 12;

    const boxLength = dataView.getUint32(offset);
    if (extendsToEndOfFile(boxLength)) {
        return dataView.byteLength - offset;
    }
    if (hasExtendedSize(boxLength)) {
        if (hasEmptyHighBits(dataView, offset)) {
            // It's a bit tricky to handle 64 bit numbers in JavaScript. Let's
            // wait until there are real-world examples where it is necessary.
            return dataView.getUint32(offset + BOX_EXTENDED_SIZE_LOW_OFFSET);
        }
    }

    return boxLength;
}

function extendsToEndOfFile(boxLength) {
    return boxLength === 0;
}

function hasExtendedSize(boxLength) {
    return boxLength === 1;
}

function hasEmptyHighBits(dataView, offset) {
    const BOX_EXTENDED_SIZE_OFFSET = 8;
    return dataView.getUint32(offset + BOX_EXTENDED_SIZE_OFFSET) === 0;
}

function findMetaItems(dataView, offset, metaEndOffset) {
    const STRING_SIZE = 4;
    const ITEM_INDEX_REL_OFFSET = -4;
    const offsets = {
        ilocOffset: undefined,
        exifItemOffset: undefined,
        colrOffset: undefined
    };

    while ((offset + STRING_SIZE <= metaEndOffset)
        && (!offsets.ilocOffset || !offsets.exifItemOffset || !offsets.colrOffset)) {
        const itemName = getStringFromDataView(dataView, offset, STRING_SIZE);
        if (Constants.USE_EXIF && (itemName === 'iloc')) {
            offsets.ilocOffset = offset;
        } else if (Constants.USE_EXIF && (itemName === 'Exif')) {
            offsets.exifItemOffset = offset + ITEM_INDEX_REL_OFFSET;
        } else if (Constants.USE_ICC && (itemName === 'colr')) {
            offsets.colrOffset = offset + ITEM_INDEX_REL_OFFSET;
        }

        offset++;
    }

    return offsets;
}

function findExifOffset(dataView, exifItemOffset, offset, metaEndOffset) {
    const EXIF_ITEM_OFFSET_SIZE = 2;
    const ILOC_DATA_OFFSET = 12;
    const EXIF_POINTER_OFFSET = 8;
    const EXIF_POINTER_SIZE = 4;
    const EXIF_PREFIX_LENGTH_OFFSET = 4;
    const ILOC_ITEM_SIZE = 16;

    if (!offset || !exifItemOffset || (exifItemOffset + EXIF_ITEM_OFFSET_SIZE > metaEndOffset)) {
        return undefined;
    }

    const exifItemIndex = dataView.getUint16(exifItemOffset);
    offset += ILOC_DATA_OFFSET;

    while (offset + ILOC_ITEM_SIZE <= metaEndOffset) {
        const itemIndex = dataView.getUint16(offset);
        if (itemIndex === exifItemIndex) {
            const exifPointer = dataView.getUint32(offset + EXIF_POINTER_OFFSET);
            if (exifPointer + EXIF_POINTER_SIZE <= dataView.byteLength) {
                const exifOffset = dataView.getUint32(exifPointer);
                const prefixLength = exifOffset + EXIF_PREFIX_LENGTH_OFFSET;
                return exifPointer + prefixLength;
            }
        }
        offset += ILOC_ITEM_SIZE;
    }

    return undefined;
}

function findIccChunks(dataView, offset, metaEndOffset) {
    const ITEM_TYPE_OFFSET = 8;
    const ITEM_TYPE_SIZE = 4;
    const ITEM_CONTENT_OFFSET = 12;

    if (!offset || (offset + ITEM_CONTENT_OFFSET > metaEndOffset)) {
        return undefined;
    }

    const colorType = getStringFromDataView(dataView, offset + ITEM_TYPE_OFFSET, ITEM_TYPE_SIZE);
    if ((colorType !== 'prof') && (colorType !== 'rICC')) {
        return undefined;
    }

    return [{
        offset: offset + ITEM_CONTENT_OFFSET,
        length: getBoxLength(dataView, offset) - ITEM_CONTENT_OFFSET,
        chunkNumber: 1,
        chunksTotal: 1
    }];
}
