/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export function get64BitValue(dataView, offset) {
    // It's a bit tricky to handle 64 bit numbers in JavaScript. Let's
    // wait until there are real-world examples where it is necessary.
    return dataView.getUint32(offset + 4);
}

/**
 * @param {DataView} dataView
 * @param {number} offset
 * @param {number} length
 * @returns {boolean} Whether [offset, offset + length) is within the DataView,
 *     i.e. those bytes can be read without a RangeError.
 */
export function hasBytes(dataView, offset, length) {
    return offset + length <= dataView.byteLength;
}
