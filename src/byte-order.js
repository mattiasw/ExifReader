/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const LITTLE_ENDIAN = 0x4949;
const BIG_ENDIAN = 0x4d4d;

export default {
    BIG_ENDIAN,
    LITTLE_ENDIAN,
    getByteOrder
};

function getByteOrder(dataView, tiffHeaderOffset) {
    if (dataView.getUint16(tiffHeaderOffset) === LITTLE_ENDIAN) {
        return LITTLE_ENDIAN;
    } else if (dataView.getUint16(tiffHeaderOffset) === BIG_ENDIAN) {
        return BIG_ENDIAN;
    }
    throw new Error('Illegal byte order value. Faulty image.');
}
