/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import ByteOrder from './byte-order.js';

const typeSizes = {
    1: 1, // BYTE
    2: 1, // ASCII
    3: 2, // SHORT
    4: 4, // LONG
    5: 8, // RATIONAL
    7: 1, // UNDEFINED
    9: 4, // SLONG
    10: 8, // SRATIONAL
    13: 4 // IFD
};

const tagTypes = {
    'BYTE': 1,
    'ASCII': 2,
    'SHORT': 3,
    'LONG': 4,
    'RATIONAL': 5,
    'UNDEFINED': 7,
    'SLONG': 9,
    'SRATIONAL': 10,
    'IFD': 13
};

export default {
    getAsciiValue,
    getByteAt,
    getAsciiAt,
    getShortAt,
    getLongAt,
    getRationalAt,
    getUndefinedAt,
    getSlongAt,
    getSrationalAt,
    getIfdPointerAt,
    typeSizes,
    tagTypes,
    getTypeSize
};

function getAsciiValue(charArray) {
    return charArray.map((charCode) => String.fromCharCode(charCode));
}

function getByteAt(dataView, offset) {
    return dataView.getUint8(offset);
}

function getAsciiAt(dataView, offset) {
    return dataView.getUint8(offset);
}

function getShortAt(dataView, offset, byteOrder) {
    return dataView.getUint16(offset, byteOrder === ByteOrder.LITTLE_ENDIAN);
}

function getLongAt(dataView, offset, byteOrder) {
    return dataView.getUint32(offset, byteOrder === ByteOrder.LITTLE_ENDIAN);
}

function getRationalAt(dataView, offset, byteOrder) {
    return [getLongAt(dataView, offset, byteOrder), getLongAt(dataView, offset + 4, byteOrder)];
}

function getUndefinedAt(dataView, offset) {
    return getByteAt(dataView, offset);
}

function getSlongAt(dataView, offset, byteOrder) {
    return dataView.getInt32(offset, byteOrder === ByteOrder.LITTLE_ENDIAN);
}

function getSrationalAt(dataView, offset, byteOrder) {
    return [getSlongAt(dataView, offset, byteOrder), getSlongAt(dataView, offset + 4, byteOrder)];
}

function getIfdPointerAt(dataView, offset, byteOrder) {
    return getLongAt(dataView, offset, byteOrder);
}

function getTypeSize(typeName) {
    if (tagTypes[typeName] === undefined) {
        throw new Error('No such type found.');
    }

    return typeSizes[tagTypes[typeName]];
}
