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
const TRANSFORM_SIZE = 1;

/**
 * Reads the primary image's properties: the width and height of an ispe,
 * the color components and bits per sample of a pixi, the rotation of an
 * irot and the mirroring of an imir.
 *
 * @param {DataView} dataView
 * @param {Object} offsets
 * @param {number=} offsets.imageDimensionsOffset The ispe width field; the
 *     height follows it.
 * @param {number=} offsets.pixelInformationOffset The pixi num_channels
 *     field; the per-channel bit depths follow it.
 * @param {number=} offsets.rotationOffset The irot byte holding the angle.
 * @param {number=} offsets.mirrorOffset The imir byte holding the mode.
 * @returns {Object} Image Width, Image Height, Color Components, Bits Per
 *     Sample, Rotation and Mirror, in that order, each part left out when
 *     its offset is not given or its bytes are not there.
 */
function read(dataView, offsets) {
    const tags = {};
    if (offsets.imageDimensionsOffset !== undefined) {
        objectAssign(tags, readImageDimensions(dataView, offsets.imageDimensionsOffset));
    }
    if (offsets.pixelInformationOffset !== undefined) {
        objectAssign(tags, readPixelInformation(dataView, offsets.pixelInformationOffset));
    }
    if (offsets.rotationOffset !== undefined) {
        objectAssign(tags, readRotation(dataView, offsets.rotationOffset));
    }
    if (offsets.mirrorOffset !== undefined) {
        objectAssign(tags, readMirror(dataView, offsets.mirrorOffset));
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

function readRotation(dataView, offset) {
    if (!hasBytes(dataView, offset, TRANSFORM_SIZE)) {
        return {};
    }
    const angle = dataView.getUint8(offset) & 0x03;
    return {
        'Rotation': {value: angle * 90, description: getRotationDescription(angle)},
    };
}

// irot's angle turns anticlockwise; the descriptions name the same turn
// clockwise, as Exif Orientation does.
function getRotationDescription(angle) {
    return ['None', 'Rotate 270 CW', 'Rotate 180', 'Rotate 90 CW'][angle];
}

function readMirror(dataView, offset) {
    if (!hasBytes(dataView, offset, TRANSFORM_SIZE)) {
        return {};
    }
    // 0 exchanges top and bottom, 1 left and right. The first edition of
    // ISO/IEC 23008-12 words it as an axis, which reads the other way.
    const mode = dataView.getUint8(offset) & 0x01;
    return {
        'Mirror': {value: mode, description: mode === 0 ? 'Mirror vertical' : 'Mirror horizontal'},
    };
}
