/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import TagNamesCommon from './tag-names-common.js';

export default {
    'tiff:Orientation'(value) {
        if (value === '1') {
            return 'Horizontal (normal)';
        }
        if (value === '2') {
            return 'Mirror horizontal';
        }
        if (value === '3') {
            return 'Rotate 180';
        }
        if (value === '4') {
            return 'Mirror vertical';
        }
        if (value === '5') {
            return 'Mirror horizontal and rotate 270 CW';
        }
        if (value === '6') {
            return 'Rotate 90 CW';
        }
        if (value === '7') {
            return 'Mirror horizontal and rotate 90 CW';
        }
        if (value === '8') {
            return 'Rotate 270 CW';
        }
        return value;
    },
    'tiff:ResolutionUnit': (value) => TagNamesCommon.ResolutionUnit(parseInt(value, 10)),
    'tiff:XResolution': (value) => fraction(TagNamesCommon.XResolution, value),
    'tiff:YResolution': (value) => fraction(TagNamesCommon.YResolution, value),
    'exif:ApertureValue': (value) => fraction(TagNamesCommon.ApertureValue, value),
    'exif:GPSLatitude': calculateGPSValue,
    'exif:GPSLongitude': calculateGPSValue,
    'exif:FNumber': (value) => fraction(TagNamesCommon.FNumber, value),
    'exif:FocalLength': (value) => fraction(TagNamesCommon.FocalLength, value),
    'exif:FocalPlaneResolutionUnit': (value) => TagNamesCommon.FocalPlaneResolutionUnit(parseInt(value, 10)),
    'exif:ColorSpace': (value) => TagNamesCommon.ColorSpace(parseNumber(value)),
    'exif:ComponentsConfiguration'(value, description) {
        if (/^\d, \d, \d, \d$/.test(description)) {
            const numbers = description.split(', ').map((number) => number.charCodeAt(0));
            return TagNamesCommon.ComponentsConfiguration(numbers);
        }
        return description;
    },
    'exif:Contrast': (value) => TagNamesCommon.Contrast(parseInt(value, 10)),
    'exif:CustomRendered': (value) => TagNamesCommon.CustomRendered(parseInt(value, 10)),
    'exif:ExposureMode': (value) => TagNamesCommon.ExposureMode(parseInt(value, 10)),
    'exif:ExposureProgram': (value) => TagNamesCommon.ExposureProgram(parseInt(value, 10)),
    'exif:ExposureTime'(value) {
        if (isFraction(value)) {
            return TagNamesCommon.ExposureTime(value.split('/').map((number) => parseInt(number, 10)));
        }
        return value;
    },
    'exif:MeteringMode': (value) => TagNamesCommon.MeteringMode(parseInt(value, 10)),
    'exif:Saturation': (value) => TagNamesCommon.Saturation(parseInt(value, 10)),
    'exif:SceneCaptureType': (value) => TagNamesCommon.SceneCaptureType(parseInt(value, 10)),
    'exif:Sharpness': (value) => TagNamesCommon.Sharpness(parseInt(value, 10)),
    'exif:ShutterSpeedValue': (value) => fraction(TagNamesCommon.ShutterSpeedValue, value),
    'exif:WhiteBalance': (value) => TagNamesCommon.WhiteBalance(parseInt(value, 10))
};

function fraction(func, value) {
    if (isFraction(value)) {
        return func(value.split('/'));
    }
    return value;
}

function parseNumber(value) {
    if (value.substring(0, 2) === '0x') {
        return parseInt(value.substring(2), 16);
    }
    return parseInt(value, 10);
}

function isFraction(value) {
    return /^-?\d+\/-?\d+$/.test(value);
}

function calculateGPSValue(value) {
    const [degreesString, minutesString] = value.split(',');
    if ((degreesString !== undefined) && (minutesString !== undefined)) {
        const degrees = parseFloat(degreesString);
        const minutes = parseFloat(minutesString);
        const ref = minutesString.charAt(minutesString.length - 1);
        if ((!Number.isNaN(degrees)) && (!Number.isNaN(minutes))) {
            return '' + (degrees + minutes / 60) + ref;
        }
    }
    return value;
}
