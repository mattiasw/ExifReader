/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
    getApertureValueDescription,
    getColorSpaceDescription,
    getComponentsConfigurationDescription,
    getContrastDescription,
    getCustomRenderedDescription,
    getExposureModeDescription,
    getExposureProgramDescription,
    getExposureTimeDescription,
    getFNumberDescription,
    getFocalLengthDescription,
    getFocalPlaneResolutionUnitDescription,
    getMeteringModeDescription,
    getResolutionUnitDescription,
    getSaturationDescription,
    getSceneCaptureTypeDescription,
    getSharpnessDescription,
    getShutterSpeedValueDescription,
    getWhiteBalanceDescription,
    getXResolutionDescription,
    getYResolutionDescription
} from './tag-names-common.js';

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
    'tiff:ResolutionUnit': (value) => getResolutionUnitDescription(parseInt(value, 10)),
    'tiff:XResolution': (value) => fraction(getXResolutionDescription, value),
    'tiff:YResolution': (value) => fraction(getYResolutionDescription, value),
    'exif:ApertureValue': (value) => fraction(getApertureValueDescription, value),
    'exif:GPSLatitude': calculateGPSValue,
    'exif:GPSLongitude': calculateGPSValue,
    'exif:FNumber': (value) => fraction(getFNumberDescription, value),
    'exif:FocalLength': (value) => fraction(getFocalLengthDescription, value),
    'exif:FocalPlaneResolutionUnit': (value) => getFocalPlaneResolutionUnitDescription(parseInt(value, 10)),
    'exif:ColorSpace': (value) => getColorSpaceDescription(parseNumber(value)),
    'exif:ComponentsConfiguration'(value, description) {
        if (/^\d, \d, \d, \d$/.test(description)) {
            const numbers = description.split(', ').map((number) => parseInt(number, 10));
            return getComponentsConfigurationDescription(numbers);
        }
        return description;
    },
    'exif:Contrast': (value) => getContrastDescription(parseInt(value, 10)),
    'exif:CustomRendered': (value) => getCustomRenderedDescription(parseInt(value, 10)),
    'exif:ExposureMode': (value) => getExposureModeDescription(parseInt(value, 10)),
    'exif:ExposureProgram': (value) => getExposureProgramDescription(parseInt(value, 10)),
    'exif:ExposureTime'(value) {
        if (isFraction(value)) {
            return getExposureTimeDescription(value.split('/').map((number) => parseInt(number, 10)));
        }
        return value;
    },
    'exif:MeteringMode': (value) => getMeteringModeDescription(parseInt(value, 10)),
    'exif:Saturation': (value) => getSaturationDescription(parseInt(value, 10)),
    'exif:SceneCaptureType': (value) => getSceneCaptureTypeDescription(parseInt(value, 10)),
    'exif:Sharpness': (value) => getSharpnessDescription(parseInt(value, 10)),
    'exif:ShutterSpeedValue': (value) => fraction(getShutterSpeedValueDescription, value),
    'exif:WhiteBalance': (value) => getWhiteBalanceDescription(parseInt(value, 10))
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
    const [degreesString, minutesString, secondsString] = value.split(',');
    if ((degreesString !== undefined) && (minutesString !== undefined)) {
        const degrees = parseFloat(degreesString);
        const minutes = parseFloat(minutesString);
        const seconds = secondsString === undefined ? 0 : parseFloat(secondsString);
        const lastPart = secondsString === undefined ? minutesString : secondsString;
        const ref = lastPart.charAt(lastPart.length - 1);
        if ((!Number.isNaN(degrees)) && (!Number.isNaN(minutes)) && (!Number.isNaN(seconds))) {
            return '' + (degrees + minutes / 60 + seconds / 3600) + ref;
        }
    }
    return value;
}
