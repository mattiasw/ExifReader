/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign} from './utils.js';
import ByteOrder from './byte-order.js';
import {IFD_TYPE_0TH, IFD_TYPE_EXIF, IFD_TYPE_GPS, IFD_TYPE_INTEROPERABILITY} from './tag-names.js';
import {readIfd, get0thIfdOffset} from './tags-helpers.js';

const EXIF_IFD_POINTER_KEY = 'Exif IFD Pointer';
const GPS_INFO_IFD_POINTER_KEY = 'GPS Info IFD Pointer';
const INTEROPERABILITY_IFD_POINTER_KEY = 'Interoperability IFD Pointer';

export default {
    read,
};

function read(dataView, tiffHeaderOffset, includeUnknown) {
    const byteOrder = ByteOrder.getByteOrder(dataView, tiffHeaderOffset);
    let tags = read0thIfd(dataView, tiffHeaderOffset, byteOrder, includeUnknown);
    tags = readExifIfd(tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown);
    tags = readGpsIfd(tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown);
    tags = readInteroperabilityIfd(tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown);

    return {tags, byteOrder};
}

function read0thIfd(dataView, tiffHeaderOffset, byteOrder, includeUnknown) {
    return readIfd(dataView, IFD_TYPE_0TH, tiffHeaderOffset, get0thIfdOffset(dataView, tiffHeaderOffset, byteOrder), byteOrder, includeUnknown);
}

function readExifIfd(tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown) {
    if (tags[EXIF_IFD_POINTER_KEY] !== undefined) {
        return objectAssign(tags, readIfd(dataView, IFD_TYPE_EXIF, tiffHeaderOffset, tiffHeaderOffset + tags[EXIF_IFD_POINTER_KEY].value, byteOrder, includeUnknown));
    }

    return tags;
}

function readGpsIfd(tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown) {
    if (tags[GPS_INFO_IFD_POINTER_KEY] !== undefined) {
        return objectAssign(tags, readIfd(dataView, IFD_TYPE_GPS, tiffHeaderOffset, tiffHeaderOffset + tags[GPS_INFO_IFD_POINTER_KEY].value, byteOrder, includeUnknown));
    }

    return tags;
}

function readInteroperabilityIfd(tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown) {
    if (tags[INTEROPERABILITY_IFD_POINTER_KEY] !== undefined) {
        return objectAssign(tags, readIfd(dataView, IFD_TYPE_INTEROPERABILITY, tiffHeaderOffset, tiffHeaderOffset + tags[INTEROPERABILITY_IFD_POINTER_KEY].value, byteOrder, includeUnknown));
    }

    return tags;
}
