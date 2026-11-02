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
    6: 1, // SBYTE
    7: 1, // UNDEFINED
    8: 2, // SSHORT
    9: 4, // SLONG
    10: 8, // SRATIONAL
    11: 4, // FLOAT
    12: 8, // DOUBLE
    13: 4, // IFD
    129: 1 // UTF8
};

const tagTypes = {
    'BYTE': 1,
    'ASCII': 2,
    'SHORT': 3,
    'LONG': 4,
    'RATIONAL': 5,
    'SBYTE': 6,
    'UNDEFINED': 7,
    'SSHORT': 8,
    'SLONG': 9,
    'SRATIONAL': 10,
    'FLOAT': 11,
    'DOUBLE': 12,
    'IFD': 13,
    'UTF8': 129
};

export default {
    getByteAt,
    getAsciiAt,
    getShortAt,
    getLongAt,
    getRationalAt,
    getSbyteAt,
    getUndefinedAt,
    getSshortAt,
    getSlongAt,
    getSrationalAt,
    getFloatAt,
    getDoubleAt,
    getIfdPointerAt,
    typeSizes,
    tagTypes,
    getTypeSize
};

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

function getSbyteAt(dataView, offset) {
    return dataView.getInt8(offset);
}

function getUndefinedAt(dataView, offset) {
    return getByteAt(dataView, offset);
}

function getSshortAt(dataView, offset, byteOrder) {
    return dataView.getInt16(offset, byteOrder === ByteOrder.LITTLE_ENDIAN);
}

function getSlongAt(dataView, offset, byteOrder) {
    return dataView.getInt32(offset, byteOrder === ByteOrder.LITTLE_ENDIAN);
}

function getSrationalAt(dataView, offset, byteOrder) {
    return [getSlongAt(dataView, offset, byteOrder), getSlongAt(dataView, offset + 4, byteOrder)];
}

function getFloatAt(dataView, offset, byteOrder) {
    return dataView.getFloat32(offset, byteOrder === ByteOrder.LITTLE_ENDIAN);
}

function getDoubleAt(dataView, offset, byteOrder) {
    return dataView.getFloat64(offset, byteOrder === ByteOrder.LITTLE_ENDIAN);
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
