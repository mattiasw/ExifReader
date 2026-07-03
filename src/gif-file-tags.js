/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// https://www.w3.org/Graphics/GIF/spec-gif87.txt
// https://www.w3.org/Graphics/GIF/spec-gif89a.txt

import {getStringFromDataView} from './utils.js';

export default {
    read
};

const bitsDescription = (value) => `${value} ${value === 1 ? 'bit' : 'bits'}`;

// The bit-field values in byte 10 are zero-based, hence the + 1.
const FIELDS = [
    {name: 'GIF Version', offset: 3, size: 3, getValue: (dataView, offset) => getStringFromDataView(dataView, offset, 3), description: (value) => value},
    {name: 'Image Width', offset: 6, size: 2, getValue: (dataView, offset) => dataView.getUint16(offset, true), description: (value) => `${value}px`},
    {name: 'Image Height', offset: 8, size: 2, getValue: (dataView, offset) => dataView.getUint16(offset, true), description: (value) => `${value}px`},
    {name: 'Global Color Map', offset: 10, size: 1, getValue: (dataView, offset) => (dataView.getUint8(offset) & 0b10000000) >>> 7, description: (value) => value === 1 ? 'Yes' : 'No'},
    {name: 'Bits Per Pixel', offset: 10, size: 1, getValue: (dataView, offset) => (dataView.getUint8(offset) & 0b00000111) + 1, description: bitsDescription},
    {name: 'Color Resolution Depth', offset: 10, size: 1, getValue: (dataView, offset) => ((dataView.getUint8(offset) & 0b01110000) >>> 4) + 1, description: bitsDescription}
];

function read(dataView) {
    const tags = {};
    for (let i = 0; i < FIELDS.length; i++) {
        tags[FIELDS[i].name] = getFieldTag(dataView, FIELDS[i]);
    }
    return tags;
}

function getFieldTag(dataView, field) {
    if (field.offset + field.size > dataView.byteLength) {
        return undefined;
    }

    const value = field.getValue(dataView, field.offset);
    return {
        value,
        description: field.description(value)
    };
}
