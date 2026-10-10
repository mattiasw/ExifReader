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
 * value of strings (an ASCII-typed tag) is returned as its strings joined
 * with ', ', as for other ASCII tags. A value that is not an array (a single
 * byte, or '<faulty value>') is returned as it is.
 * @param {number[]|string[]|number|string} value
 * @returns {string|number}
 */
export function getVersionString(value) {
    if (Array.isArray(value)) {
        if (value.some(isString)) {
            return value.filter(isString).join(', ');
        }
        return getByteString(value);
    }
    return value;
}

function isString(item) {
    return typeof item === 'string';
}

/**
 * Looks a tag value up in a table of descriptions, own properties only, so a
 * value such as 'constructor' or ['__proto__'] does not find a member of
 * Object.prototype.
 * @param {Object} table Descriptions keyed by tag value.
 * @param {*} value The tag value, used as a property key.
 * @returns {string} The description, or 'Unknown' when the value is not a key.
 */
export function getTableDescription(table, value) {
    const key = String(value);
    return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : 'Unknown';
}

export function getCalculatedGpsValue(value) {
    return (value[0][0] / value[0][1]) + (value[1][0] / value[1][1]) / 60 + (value[2][0] / value[2][1]) / 3600;
}
