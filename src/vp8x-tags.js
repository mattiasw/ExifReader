/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Types from './types.js';

export default {
    read
};

const IMAGE_WIDTH_OFFSET = 4;
const IMAGE_HEIGHT_OFFSET = 7;

// https://developers.google.com/speed/webp/docs/riff_container#extended_file_format
function read(dataView, chunkOffset) {
    const tags = {};

    const flags = Types.getByteAt(dataView, chunkOffset);

    tags['Alpha'] = getAlpha(flags);
    tags['Animation'] = getAnimation(flags);
    tags['ImageWidth'] = getThreeByteValue(dataView, chunkOffset + IMAGE_WIDTH_OFFSET);
    tags['ImageHeight'] = getThreeByteValue(dataView, chunkOffset + IMAGE_HEIGHT_OFFSET);

    return tags;
}

function getAlpha(flags) {
    const value = flags & 0x10;
    return {
        value: value ? 1 : 0,
        description: value ? 'Yes' : 'No'
    };
}

function getAnimation(flags) {
    const value = flags & 0x02;
    return {
        value: value ? 1 : 0,
        description: value ? 'Yes' : 'No'
    };
}

function getThreeByteValue(dataView, offset) {
    // Values are stored little-endian.
    const value = Types.getByteAt(dataView, offset)
        + 256 * Types.getByteAt(dataView, offset + 1)
        + 256 * 256 * Types.getByteAt(dataView, offset + 2)
        + 1; // Value is 1-based, i.e. a value of 7 means 8px.

    return {
        value,
        description: value + 'px'
    };
}
