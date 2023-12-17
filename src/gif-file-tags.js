/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// https://www.w3.org/Graphics/GIF/spec-gif87.txt
// https://www.w3.org/Graphics/GIF/spec-gif89a.txt

import {getStringFromDataView} from './utils.js';

export default {
    read
};

function read(dataView) {
    return {
        'GIF Version': getGifVersion(dataView),
        'Image Width': getImageWidth(dataView),
        'Image Height': getImageHeight(dataView),
        'Global Color Map': getGlobalColorMap(dataView),
        'Bits Per Pixel': getBitDepth(dataView),
        'Color Resolution Depth': getColorResolution(dataView)
    };
}

function getGifVersion(dataView) {
    const OFFSET = 3;
    const SIZE = 3;

    if (OFFSET + SIZE > dataView.byteLength) {
        return undefined;
    }

    const value = getStringFromDataView(dataView, OFFSET, SIZE);
    return {
        value,
        description: value
    };
}

function getImageWidth(dataView) {
    const OFFSET = 6;
    const SIZE = 2;

    if (OFFSET + SIZE > dataView.byteLength) {
        return undefined;
    }

    const value = dataView.getUint16(OFFSET, true);
    return {
        value,
        description: `${value}px`
    };
}

function getImageHeight(dataView) {
    const OFFSET = 8;
    const SIZE = 2;

    if (OFFSET + SIZE > dataView.byteLength) {
        return undefined;
    }

    const value = dataView.getUint16(OFFSET, true);
    return {
        value,
        description: `${value}px`
    };
}

function getGlobalColorMap(dataView) {
    const OFFSET = 10;
    const SIZE = 1;

    if (OFFSET + SIZE > dataView.byteLength) {
        return undefined;
    }

    const byteValue = dataView.getUint8(OFFSET);
    const value = (byteValue & 0b10000000) >>> 7;
    return {
        value,
        description: value === 1 ? 'Yes' : 'No'
    };
}

function getColorResolution(dataView) {
    const OFFSET = 10;
    const SIZE = 1;

    if (OFFSET + SIZE > dataView.byteLength) {
        return undefined;
    }

    const byteValue = dataView.getUint8(OFFSET);
    const value = ((byteValue & 0b01110000) >>> 4) + 1; // Zero-based.
    return {
        value,
        description: `${value} ${value === 1 ? 'bit' : 'bits'}`
    };
}

function getBitDepth(dataView) {
    const OFFSET = 10;
    const SIZE = 1;

    if (OFFSET + SIZE > dataView.byteLength) {
        return undefined;
    }

    const byteValue = dataView.getUint8(OFFSET);
    const value = (byteValue & 0b00000111) + 1; // Zero-based.
    return {
        value,
        description: `${value} ${value === 1 ? 'bit' : 'bits'}`
    };
}
