/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import ByteOrder from './byte-order.js';
import Types from './types.js';
import {IFD_TYPE_MPF} from './tag-names.js';
import {deferInit, getBase64Image} from './utils.js';
import {readIfd, get0thIfdOffset} from './tags-helpers.js';

export default {
    read
};

const ENTRY_SIZE = 16;

function read(dataView, dataOffset, includeUnknown) {
    const byteOrder = ByteOrder.getByteOrder(dataView, dataOffset);
    const tags = readIfd(dataView, IFD_TYPE_MPF, dataOffset, get0thIfdOffset(dataView, dataOffset, byteOrder), byteOrder, includeUnknown);
    return addMpfImages(dataView, dataOffset, tags, byteOrder);
}

function addMpfImages(dataView, dataOffset, tags, byteOrder) {
    if (!tags['MPEntry']) {
        return tags;
    }

    const images = [];
    for (let i = 0; i < Math.ceil(tags['MPEntry'].value.length / ENTRY_SIZE); i++) {
        images[i] = {};

        const attributes = getImageNumberValue(tags['MPEntry'].value, i * ENTRY_SIZE, Types.getTypeSize('LONG'), byteOrder);
        images[i]['ImageFlags'] = getImageFlags(attributes);
        images[i]['ImageFormat'] = getImageFormat(attributes);
        images[i]['ImageType'] = getImageType(attributes);

        const imageSize = getImageNumberValue(tags['MPEntry'].value, i * ENTRY_SIZE + 4, Types.getTypeSize('LONG'), byteOrder);
        images[i]['ImageSize'] = {
            value: imageSize,
            description: '' + imageSize
        };

        const imageOffset = getImageOffset(i, tags['MPEntry'], byteOrder, dataOffset);
        images[i]['ImageOffset'] = {
            value: imageOffset,
            description: '' + imageOffset
        };

        const dependentImage1EntryNumber =
            getImageNumberValue(tags['MPEntry'].value, i * ENTRY_SIZE + 12, Types.getTypeSize('SHORT'), byteOrder);
        images[i]['DependentImage1EntryNumber'] = {
            value: dependentImage1EntryNumber,
            description: '' + dependentImage1EntryNumber
        };

        const dependentImage2EntryNumber =
            getImageNumberValue(tags['MPEntry'].value, i * ENTRY_SIZE + 14, Types.getTypeSize('SHORT'), byteOrder);
        images[i]['DependentImage2EntryNumber'] = {
            value: dependentImage2EntryNumber,
            description: '' + dependentImage2EntryNumber
        };

        images[i].image = dataView.buffer.slice(imageOffset, imageOffset + imageSize);
        deferInit(images[i], 'base64', function () {
            return getBase64Image(this.image);
        });
    }

    tags['Images'] = images;

    return tags;
}

function getImageNumberValue(entries, offset, size, byteOrder) {
    if (byteOrder === ByteOrder.LITTLE_ENDIAN) {
        let value = 0;
        for (let i = 0; i < size; i++) {
            value += entries[offset + i] << (8 * i);
        }
        return value;
    }

    let value = 0;
    for (let i = 0; i < size; i++) {
        value += entries[offset + i] << (8 * (size - 1 - i));
    }
    return value;
}

function getImageFlags(attributes) {
    const flags = [
        (attributes >> 31) & 0x1,
        (attributes >> 30) & 0x1,
        (attributes >> 29) & 0x1
    ];

    const flagsDescription = [];

    if (flags[0]) {
        flagsDescription.push('Dependent Parent Image');
    }
    if (flags[1]) {
        flagsDescription.push('Dependent Child Image');
    }
    if (flags[2]) {
        flagsDescription.push('Representative Image');
    }

    return {
        value: flags,
        description: flagsDescription.join(', ') || 'None'
    };
}

function getImageFormat(attributes) {
    const imageFormat = attributes >> 24 & 0x7;
    return {
        value: imageFormat,
        description: imageFormat === 0 ? 'JPEG' : 'Unknown'
    };
}

function getImageType(attributes) {
    const type = attributes & 0xffffff;
    const descriptions = {
        0x30000: 'Baseline MP Primary Image',
        0x10001: 'Large Thumbnail (VGA equivalent)',
        0x10002: 'Large Thumbnail (Full HD equivalent)',
        0x20001: 'Multi-Frame Image (Panorama)',
        0x20002: 'Multi-Frame Image (Disparity)',
        0x20003: 'Multi-Frame Image (Multi-Angle)',
        0x0: 'Undefined',
    };

    return {
        value: type,
        description: descriptions[type] || 'Unknown'
    };
}

function getImageOffset(imageIndex, mpEntry, byteOrder, dataOffset) {
    if (isFirstIndividualImage(imageIndex)) {
        return 0;
    }
    return getImageNumberValue(mpEntry.value, imageIndex * ENTRY_SIZE + 8, Types.getTypeSize('LONG'), byteOrder) + dataOffset;
}

function isFirstIndividualImage(imageIndex) {
    return imageIndex === 0;
}
