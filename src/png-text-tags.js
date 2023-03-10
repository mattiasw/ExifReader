/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringValueFromArray} from './utils.js';

export default {
    read
};

function read(dataView, pngTextChunks) {
    return pngTextChunks.reduce((tags, {length, offset}) => {
        const {name, value} = getNameAndValue(dataView, offset, length);
        tags[name] = {
            value,
            description: value
        };
        return tags;
    }, {});
}

function getNameAndValue(dataView, offset, length) {
    const nameChars = [];
    const valueChars = [];
    let foundNullDivider = false;
    for (let i = 0; i < length && offset + i < dataView.byteLength; i++) {
        const byte = dataView.getUint8(offset + i);
        if (byte === 0) {
            foundNullDivider = true;
        } else {
            if (!foundNullDivider) {
                nameChars.push(byte);
            } else {
                valueChars.push(byte);
            }
        }
    }

    return {
        name: getStringValueFromArray(nameChars),
        value: getStringValueFromArray(valueChars)
    };
}
