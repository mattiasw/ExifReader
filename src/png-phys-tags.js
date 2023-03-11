/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Types from './types.js';
import {PNG_CHUNK_LENGTH_OFFSET, PNG_CHUNK_DATA_OFFSET} from './image-header-png.js';

export default {
    read
};

function read(dataView, pngPhysOffset) {
    const chunkLength = Types.getLongAt(dataView, pngPhysOffset + PNG_CHUNK_LENGTH_OFFSET);

    return {
        'Pixels Per Unit X': getPixelsPerUnitX(dataView, pngPhysOffset, chunkLength),
        'Pixels Per Unit Y': getPixelsPerUnitY(dataView, pngPhysOffset, chunkLength),
        'Pixel Units': getPixelUnits(dataView, pngPhysOffset, chunkLength)
    };
}

function getPixelsPerUnitX(dataView, pngPhysOffset, chunkLength) {
    const TAG_OFFSET = 0;
    const TAG_SIZE = 4;

    if (!tagFitsInBuffer(dataView, pngPhysOffset, chunkLength, TAG_OFFSET, TAG_SIZE)) {
        return undefined;
    }

    const value = Types.getLongAt(dataView, pngPhysOffset + PNG_CHUNK_DATA_OFFSET + TAG_OFFSET);

    return {
        value,
        description: '' + value
    };
}

function getPixelsPerUnitY(dataView, pngPhysOffset, chunkLength) {
    const TAG_OFFSET = 4;
    const TAG_SIZE = 4;

    if (!tagFitsInBuffer(dataView, pngPhysOffset, chunkLength, TAG_OFFSET, TAG_SIZE)) {
        return undefined;
    }

    const value = Types.getLongAt(dataView, pngPhysOffset + PNG_CHUNK_DATA_OFFSET + TAG_OFFSET);

    return {
        value,
        description: '' + value
    };
}

function getPixelUnits(dataView, pngPhysOffset, chunkLength) {
    const TAG_OFFSET = 8;
    const TAG_SIZE = 1;

    if (!tagFitsInBuffer(dataView, pngPhysOffset, chunkLength, TAG_OFFSET, TAG_SIZE)) {
        return undefined;
    }

    const value = Types.getByteAt(dataView, pngPhysOffset + PNG_CHUNK_DATA_OFFSET + TAG_OFFSET);

    return {
        value,
        description: value === 1 ? 'meters' : 'Unknown'
    };
}

function tagFitsInBuffer(dataView, pngPhysOffset, chunkLength, tagOffset, tagSize) {
    return tagOffset + tagSize <= chunkLength && pngPhysOffset + PNG_CHUNK_DATA_OFFSET + tagOffset + tagSize <= dataView.byteLength;
}
