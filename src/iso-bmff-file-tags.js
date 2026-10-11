/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign} from './utils.js';
import {hasBytes} from './image-header-iso-bmff-utils.js';

export default {
    read
};

const DIMENSIONS_SIZE = 8;
const HEIGHT_OFFSET = 4;
const CHANNEL_COUNT_SIZE = 1;

/**
 * Reads the image width and height of an ispe property and the color
 * components and bits per sample of a pixi property.
 *
 * @param {DataView} dataView
 * @param {number=} dimensionsOffset Offset of the ispe width field; the
 *     height follows it.
 * @param {number=} pixelInformationOffset Offset of the pixi num_channels
 *     field; the per-channel bit depths follow it.
 * @returns {Object} Image Width and Image Height, then Color Components and
 *     Bits Per Sample, each part left out when its offset is not given or
 *     its bytes are not there.
 */
function read(dataView, dimensionsOffset, pixelInformationOffset) {
    const tags = {};
    if (dimensionsOffset !== undefined) {
        objectAssign(tags, readImageDimensions(dataView, dimensionsOffset));
    }
    if (pixelInformationOffset !== undefined) {
        objectAssign(tags, readPixelInformation(dataView, pixelInformationOffset));
    }
    return tags;
}

function readImageDimensions(dataView, offset) {
    if (!hasBytes(dataView, offset, DIMENSIONS_SIZE)) {
        return {};
    }

    const width = dataView.getUint32(offset);
    const height = dataView.getUint32(offset + HEIGHT_OFFSET);

    return {
        'Image Width': {value: width, description: `${width}px`},
        'Image Height': {value: height, description: `${height}px`},
    };
}

function readPixelInformation(dataView, offset) {
    if (!hasBytes(dataView, offset, CHANNEL_COUNT_SIZE)) {
        return {};
    }
    const channelCount = dataView.getUint8(offset);
    const depthsOffset = offset + CHANNEL_COUNT_SIZE;
    if (!hasBytes(dataView, depthsOffset, channelCount)) {
        return {};
    }

    const tags = {
        'Color Components': {value: channelCount, description: `${channelCount}`},
    };
    const bitsPerSample = getSharedBitDepth(dataView, depthsOffset, channelCount);
    // One number, as for JPEG; HDR files can mix depths, so mixed depths get no tag.
    if (bitsPerSample !== undefined) {
        tags['Bits Per Sample'] = {value: bitsPerSample, description: `${bitsPerSample}`};
    }
    return tags;
}

function getSharedBitDepth(dataView, offset, channelCount) {
    if (channelCount === 0) {
        return undefined;
    }
    const firstDepth = dataView.getUint8(offset);
    for (let i = 1; i < channelCount; i++) {
        if (dataView.getUint8(offset + i) !== firstDepth) {
            return undefined;
        }
    }
    return firstDepth;
}
