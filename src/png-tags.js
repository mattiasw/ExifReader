/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Types from './types.js';
import {PNG_CHUNK_LENGTH_OFFSET, PNG_CHUNK_TYPE_OFFSET, PNG_CHUNK_DATA_OFFSET, PNG_CHUNK_TYPE_SIZE, TYPE_PHYS, TYPE_TIME} from './image-header-png.js';
import {getStringFromDataView} from './utils.js';

export default {
    read
};

function read(dataView, chunkOffsets) {
    const tags = {};

    for (let i = 0; i < chunkOffsets.length; i++) {
        const chunkLength = Types.getLongAt(dataView, chunkOffsets[i] + PNG_CHUNK_LENGTH_OFFSET);
        const chunkType = getStringFromDataView(dataView, chunkOffsets[i] + PNG_CHUNK_TYPE_OFFSET, PNG_CHUNK_TYPE_SIZE);

        if (chunkType === TYPE_PHYS) {
            tags['Pixels Per Unit X'] = getPixelsPerUnitX(dataView, chunkOffsets[i], chunkLength);
            tags['Pixels Per Unit Y'] = getPixelsPerUnitY(dataView, chunkOffsets[i], chunkLength);
            tags['Pixel Units'] = getPixelUnits(dataView, chunkOffsets[i], chunkLength);
        } else if (chunkType === TYPE_TIME) {
            tags['Modify Date'] = getModifyDate(dataView, chunkOffsets[i], chunkLength);
        }
    }

    return tags;
}

function getPixelsPerUnitX(dataView, chunkOffset, chunkLength) {
    const TAG_OFFSET = 0;
    const TAG_SIZE = 4;

    if (!tagFitsInBuffer(dataView, chunkOffset, chunkLength, TAG_OFFSET, TAG_SIZE)) {
        return undefined;
    }

    const value = Types.getLongAt(dataView, chunkOffset + PNG_CHUNK_DATA_OFFSET + TAG_OFFSET);

    return {
        value,
        description: '' + value
    };
}

function getPixelsPerUnitY(dataView, chunkOffset, chunkLength) {
    const TAG_OFFSET = 4;
    const TAG_SIZE = 4;

    if (!tagFitsInBuffer(dataView, chunkOffset, chunkLength, TAG_OFFSET, TAG_SIZE)) {
        return undefined;
    }

    const value = Types.getLongAt(dataView, chunkOffset + PNG_CHUNK_DATA_OFFSET + TAG_OFFSET);

    return {
        value,
        description: '' + value
    };
}

function getPixelUnits(dataView, chunkOffset, chunkLength) {
    const TAG_OFFSET = 8;
    const TAG_SIZE = 1;

    if (!tagFitsInBuffer(dataView, chunkOffset, chunkLength, TAG_OFFSET, TAG_SIZE)) {
        return undefined;
    }

    const value = Types.getByteAt(dataView, chunkOffset + PNG_CHUNK_DATA_OFFSET + TAG_OFFSET);

    return {
        value,
        description: value === 1 ? 'meters' : 'Unknown'
    };
}

function getModifyDate(dataView, chunkOffset, chunkLength) {
    const TIME_TAG_SIZE = 7;

    if (!tagFitsInBuffer(dataView, chunkOffset, chunkLength, 0, TIME_TAG_SIZE)) {
        return undefined;
    }

    const year = Types.getShortAt(dataView, chunkOffset + PNG_CHUNK_DATA_OFFSET);
    const month = Types.getByteAt(dataView, chunkOffset + PNG_CHUNK_DATA_OFFSET + 2);
    const day = Types.getByteAt(dataView, chunkOffset + PNG_CHUNK_DATA_OFFSET + 3);
    const hours = Types.getByteAt(dataView, chunkOffset + PNG_CHUNK_DATA_OFFSET + 4);
    const minutes = Types.getByteAt(dataView, chunkOffset + PNG_CHUNK_DATA_OFFSET + 5);
    const seconds = Types.getByteAt(dataView, chunkOffset + PNG_CHUNK_DATA_OFFSET + 6);

    return {
        value: [year, month, day, hours, minutes, seconds],
        description: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)} ${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}`
    };
}

function tagFitsInBuffer(dataView, chunkOffset, chunkLength, tagOffset, tagSize) {
    return tagOffset + tagSize <= chunkLength && chunkOffset + PNG_CHUNK_DATA_OFFSET + tagOffset + tagSize <= dataView.byteLength;
}

function pad(number, size) {
    return `${'0'.repeat(size - ('' + number).length)}${number}`;
}
