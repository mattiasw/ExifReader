/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Reverse-engineered docs:
// https://exiftool.org/makernote_types.html
// https://exiv2.org/makernote.html
// https://exiftool.org/TagNames/Pentax.html

import ByteOrder from './byte-order.js';
import {objectAssign} from './utils.js';
import {readIfd} from './tags-helpers.js';
import {IFD_TYPE_PENTAX} from './tag-names.js';

const BYTE_ORDER_OFFSET = 8; // Pentax5: https://exiftool.org/makernote_types.html
const PENTAX_IFD_OFFSET = BYTE_ORDER_OFFSET + 2; // https://exiftool.org/makernote_types.html

const MODEL_ID = {
    K3_III: 0x13254,
};
const LIK3III = {
    CAMERA_ORIENTATION: 1,
    ROLL_ANGLE: 3,
    PITCH_ANGLE: 5
};

export default {
    read,
    PENTAX_IFD_OFFSET,
    MODEL_ID,
    LIK3III
};

function read(dataView, tiffHeaderOffset, offset, includeUnknown) {
    // Pentax does not use the standard TIFF header offset as base for tag
    // offsets but instead uses the start of the IFD, i.e. directly after the
    // two byte order bytes. originOffset below is this offset.
    const byteOrder = ByteOrder.getByteOrder(dataView, tiffHeaderOffset + offset + BYTE_ORDER_OFFSET);
    const originOffset = tiffHeaderOffset + offset;
    let tags = readIfd(dataView, IFD_TYPE_PENTAX, originOffset, originOffset + PENTAX_IFD_OFFSET, byteOrder, includeUnknown, true);

    if (hasLevelInfoK3III(tags)) {
        tags = objectAssign({}, tags, parseLevelInfoK3III(dataView, originOffset + tags['LevelInfo'].__offset, byteOrder));
        delete tags['LevelInfo'];
    }

    return tags;
}

function hasLevelInfoK3III(tags) {
    return tags['PentaxModelID'] && tags['PentaxModelID'].value === MODEL_ID.K3_III && tags['LevelInfo'];
}

function parseLevelInfoK3III(dataView, levelInfoOffset, byteOrder) {
    const tags = {};

    if (levelInfoOffset + 7 > dataView.byteLength) {
        return tags;
    }

    const cameraOrientation = dataView.getInt8(levelInfoOffset + LIK3III.CAMERA_ORIENTATION);
    tags['CameraOrientation'] = {
        value: cameraOrientation,
        description: getOrientationDescription(cameraOrientation)
    };

    const rollAngle = dataView.getInt16(levelInfoOffset + LIK3III.ROLL_ANGLE, byteOrder === ByteOrder.LITTLE_ENDIAN);
    tags['RollAngle'] = {
        value: rollAngle,
        description: getRollAngleDescription(rollAngle)
    };

    const pitchAngle = dataView.getInt16(levelInfoOffset + LIK3III.PITCH_ANGLE, byteOrder === ByteOrder.LITTLE_ENDIAN);
    tags['PitchAngle'] = {
        value: pitchAngle,
        description: getPitchAngleDescription(pitchAngle)
    };

    return tags;
}

function getOrientationDescription(orientation) {
    if (orientation === 0) {
        return 'Horizontal (normal)';
    }
    if (orientation === 1) {
        return 'Rotate 270 CW';
    }
    if (orientation === 2) {
        return 'Rotate 180';
    }
    if (orientation === 3) {
        return 'Rotate 90 CW';
    }
    if (orientation === 4) {
        return 'Upwards';
    }
    if (orientation === 5) {
        return 'Downwards';
    }
    return 'Unknown';
}

function getRollAngleDescription(rollAngle) {
    return '' + (rollAngle * -0.5);
}

function getPitchAngleDescription(pitchAngle) {
    return '' + (pitchAngle * -0.5);
}
