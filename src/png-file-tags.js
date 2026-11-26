/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Types from './types.js';

export default {
    read
};

const COLOR_TYPES = {
    0: 'Grayscale',
    2: 'RGB',
    3: 'Palette',
    4: 'Grayscale with Alpha',
    6: 'RGB with Alpha'
};

const INTERLACE_TYPES = {
    0: 'Noninterlaced',
    1: 'Adam7 Interlace'
};

const FIELDS = [
    {name: 'Image Width', offset: 0, size: 4, read: Types.getLongAt, description: (value) => `${value}px`},
    {name: 'Image Height', offset: 4, size: 4, read: Types.getLongAt, description: (value) => `${value}px`},
    {name: 'Bit Depth', offset: 8, size: 1, read: Types.getByteAt, description: (value) => `${value}`},
    {name: 'Color Type', offset: 9, size: 1, read: Types.getByteAt, description: (value) => COLOR_TYPES[value] || 'Unknown'},
    {name: 'Compression', offset: 10, size: 1, read: Types.getByteAt, description: (value) => value === 0 ? 'Deflate/Inflate' : 'Unknown'},
    {name: 'Filter', offset: 11, size: 1, read: Types.getByteAt, description: (value) => value === 0 ? 'Adaptive' : 'Unknown'},
    {name: 'Interlace', offset: 12, size: 1, read: Types.getByteAt, description: (value) => INTERLACE_TYPES[value] || 'Unknown'}
];

function read(dataView, fileDataOffset, chunkDataLength) {
    const tags = {};
    const dataEnd = Math.min(fileDataOffset + chunkDataLength, dataView.byteLength);
    for (let i = 0; i < FIELDS.length; i++) {
        const tag = getFieldTag(dataView, fileDataOffset, dataEnd, FIELDS[i]);
        if (tag !== undefined) {
            tags[FIELDS[i].name] = tag;
        }
    }
    return tags;
}

function getFieldTag(dataView, fileDataOffset, dataEnd, field) {
    const fieldOffset = fileDataOffset + field.offset;
    // Negated so that a missing chunk length (a NaN dataEnd) reads no field.
    if (!(fieldOffset + field.size <= dataEnd)) {
        return undefined;
    }

    const value = field.read(dataView, fieldOffset);
    return {
        value,
        description: field.description(value)
    };
}
