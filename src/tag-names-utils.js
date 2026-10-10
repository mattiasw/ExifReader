/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringValueFromArray as getStringValue, getByteString} from './utils.js';

export {getStringValue};

export function getEncodedString(value) {
    if (value.length >= 8) {
        const encoding = getStringValue(value.slice(0, 8));

        if (encoding === 'ASCII\x00\x00\x00') {
            return getByteString(value, 8);
        } else if (encoding === 'JIS\x00\x00\x00\x00\x00') {
            return '[JIS encoded text]';
        } else if (encoding === 'UNICODE\x00') {
            return '[Unicode encoded text]';
        } else if (encoding === '\x00\x00\x00\x00\x00\x00\x00\x00') {
            const text = getByteString(value, 8);
            if (/[\x20-\x7e]/.test(text)) {
                return text;
            }
            return '[Undefined encoding]';
        }
    }

    return 'Undefined';
}

/**
 * Converts the bytes of a version tag, such as ExifVersion, to a string. A
 * value that is not an array (a single byte, or '<faulty value>') is returned
 * as it is.
 * @param {number[]|number|string} value
 * @returns {string|number}
 */
export function getVersionString(value) {
    if (Array.isArray(value)) {
        return getByteString(value);
    }
    return value;
}

export function getCalculatedGpsValue(value) {
    return (value[0][0] / value[0][1]) + (value[1][0] / value[1][1]) / 60 + (value[2][0] / value[2][1]) / 3600;
}
