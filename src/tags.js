/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign} from './utils.js';
import ByteOrder from './byte-order.js';
import {IFD_TYPE_0TH, IFD_TYPE_EXIF, IFD_TYPE_GPS, IFD_TYPE_INTEROPERABILITY} from './ifd-types.js';
import {readIfd, get0thIfdOffset, getValueBudget} from './tags-helpers.js';
import {TIFF_HEADER_LENGTH} from './tiff-constants.js';

const SUB_IFDS = [
    {pointerKey: 'Exif IFD Pointer', ifdType: IFD_TYPE_EXIF},
    {pointerKey: 'GPS Info IFD Pointer', ifdType: IFD_TYPE_GPS},
    {pointerKey: 'Interoperability IFD Pointer', ifdType: IFD_TYPE_INTEROPERABILITY}
];

export default {
    read,
};

// One decoded-value budget is shared by the 0th, sub-, and thumbnail IFD reads
// so their combined decoded values stay proportional to the input. A caller
// passes its own to share it with later reads (loadView: maker note, MPF
// and decompressed Exif).
function read(
    dataView,
    tiffHeaderOffset,
    includeUnknown,
    computed = false,
    tagFilter = undefined,
    valueBudget = getValueBudget(dataView),
    tagNames = undefined,
    readThumbnailIfd = undefined
) {
    const byteOrder = ByteOrder.getByteOrder(dataView, tiffHeaderOffset);
    let tags = read0thIfd(dataView, tiffHeaderOffset, byteOrder, includeUnknown, computed, tagFilter, valueBudget, tagNames, readThumbnailIfd);
    for (let i = 0; i < SUB_IFDS.length; i++) {
        tags = readSubIfd(SUB_IFDS[i], tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown, computed, tagFilter, valueBudget, tagNames);
    }

    return {tags, byteOrder};
}

function read0thIfd(dataView, tiffHeaderOffset, byteOrder, includeUnknown, computed, tagFilter, valueBudget, tagNames, readThumbnailIfd) {
    const ifdOffset = get0thIfdOffset(dataView, tiffHeaderOffset, byteOrder);
    if (ifdOffset === undefined) {
        return {};
    }
    return readIfd(
        dataView,
        IFD_TYPE_0TH,
        tiffHeaderOffset,
        ifdOffset,
        byteOrder,
        includeUnknown,
        computed,
        tagFilter,
        'exif',
        valueBudget,
        tagNames,
        readThumbnailIfd
    );
}

function readSubIfd(subIfd, tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown, computed, tagFilter, valueBudget, tagNames) {
    const pointerTag = tags[subIfd.pointerKey];
    if (pointerTag === undefined) {
        return tags;
    }
    // An IFD starts past the TIFF header. An SLONG pointer can be negative, and
    // an array or a faulty value is not an offset.
    if (!isOffsetPastTiffHeader(pointerTag.value)) {
        return tags;
    }

    return objectAssign(
        tags,
        readIfd(
            dataView,
            subIfd.ifdType,
            tiffHeaderOffset,
            tiffHeaderOffset + pointerTag.value,
            byteOrder,
            includeUnknown,
            computed,
            tagFilter,
            'exif',
            valueBudget,
            tagNames
        )
    );
}

function isOffsetPastTiffHeader(value) {
    return (typeof value === 'number') && (value >= TIFF_HEADER_LENGTH) && (value % 1 === 0);
}
