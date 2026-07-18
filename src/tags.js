/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign} from './utils.js';
import ByteOrder from './byte-order.js';
import {IFD_TYPE_0TH, IFD_TYPE_EXIF, IFD_TYPE_GPS, IFD_TYPE_INTEROPERABILITY} from './tag-names.js';
import {readIfd, get0thIfdOffset} from './tags-helpers.js';

const SUB_IFDS = [
    {pointerKey: 'Exif IFD Pointer', ifdType: IFD_TYPE_EXIF},
    {pointerKey: 'GPS Info IFD Pointer', ifdType: IFD_TYPE_GPS},
    {pointerKey: 'Interoperability IFD Pointer', ifdType: IFD_TYPE_INTEROPERABILITY}
];

export default {
    read,
};

function read(dataView, tiffHeaderOffset, includeUnknown, computed = false, tagFilter = undefined) {
    const byteOrder = ByteOrder.getByteOrder(dataView, tiffHeaderOffset);
    let tags = read0thIfd(dataView, tiffHeaderOffset, byteOrder, includeUnknown, computed, tagFilter);
    for (let i = 0; i < SUB_IFDS.length; i++) {
        tags = readSubIfd(SUB_IFDS[i], tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown, computed, tagFilter);
    }

    return {tags, byteOrder};
}

function read0thIfd(dataView, tiffHeaderOffset, byteOrder, includeUnknown, computed, tagFilter) {
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
        'exif'
    );
}

function readSubIfd(subIfd, tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown, computed, tagFilter) {
    const pointerTag = tags[subIfd.pointerKey];
    if (pointerTag === undefined) {
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
            'exif'
        )
    );
}
