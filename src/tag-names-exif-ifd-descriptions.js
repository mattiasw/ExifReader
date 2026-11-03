/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getTableDescription} from './tag-names-utils.js';

export function getOECFDescription() {
    return '[Raw OECF table data]';
}

export function getSensitivityTypeDescription(value) {
    return getTableDescription({
        1: 'Standard Output Sensitivity',
        2: 'Recommended Exposure Index',
        3: 'ISO Speed',
        4: 'Standard Output Sensitivity and Recommended Exposure Index',
        5: 'Standard Output Sensitivity and ISO Speed',
        6: 'Recommended Exposure Index and ISO Speed',
        7: 'Standard Output Sensitivity, Recommended Exposure Index and ISO Speed'
    }, value);
}

export function getMaxApertureValueDescription(value) {
    return Math.pow(Math.sqrt(2), value[0] / value[1]).toFixed(2);
}

export function getSubjectDistanceDescription(value) {
    return (value[0] / value[1]) + ' m';
}

export function getFlashDescription(value) {
    if (value === 0x00) {
        return 'Flash did not fire';
    } else if (value === 0x01) {
        return 'Flash fired';
    } else if (value === 0x05) {
        return 'Strobe return light not detected';
    } else if (value === 0x07) {
        return 'Strobe return light detected';
    } else if (value === 0x09) {
        return 'Flash fired, compulsory flash mode';
    } else if (value === 0x0d) {
        return 'Flash fired, compulsory flash mode, return light not detected';
    } else if (value === 0x0f) {
        return 'Flash fired, compulsory flash mode, return light detected';
    } else if (value === 0x10) {
        return 'Flash did not fire, compulsory flash mode';
    } else if (value === 0x18) {
        return 'Flash did not fire, auto mode';
    } else if (value === 0x19) {
        return 'Flash fired, auto mode';
    } else if (value === 0x1d) {
        return 'Flash fired, auto mode, return light not detected';
    } else if (value === 0x1f) {
        return 'Flash fired, auto mode, return light detected';
    } else if (value === 0x20) {
        return 'No flash function';
    } else if (value === 0x41) {
        return 'Flash fired, red-eye reduction mode';
    } else if (value === 0x45) {
        return 'Flash fired, red-eye reduction mode, return light not detected';
    } else if (value === 0x47) {
        return 'Flash fired, red-eye reduction mode, return light detected';
    } else if (value === 0x49) {
        return 'Flash fired, compulsory flash mode, red-eye reduction mode';
    } else if (value === 0x4d) {
        return 'Flash fired, compulsory flash mode, red-eye reduction mode, return light not detected';
    } else if (value === 0x4f) {
        return 'Flash fired, compulsory flash mode, red-eye reduction mode, return light detected';
    } else if (value === 0x59) {
        return 'Flash fired, auto mode, red-eye reduction mode';
    } else if (value === 0x5d) {
        return 'Flash fired, auto mode, return light not detected, red-eye reduction mode';
    } else if (value === 0x5f) {
        return 'Flash fired, auto mode, return light detected, red-eye reduction mode';
    }
    return 'Unknown';
}

export function getSecurityClassificationDescription(value) {
    return getTableDescription({
        'C': 'Confidential',
        'R': 'Restricted',
        'S': 'Secret',
        'T': 'Top Secret',
        'U': 'Unclassified'
    }, value);
}

export function getSubjectAreaDescription(value) {
    if (value.length === 2) {
        return `Location; X: ${value[0]}, Y: ${value[1]}`;
    } else if (value.length === 3) {
        return `Circle; X: ${value[0]}, Y: ${value[1]}, diameter: ${value[2]}`;
    } else if (value.length === 4) {
        return `Rectangle; X: ${value[0]}, Y: ${value[1]}, width: ${value[2]}, height: ${value[3]}`;
    }
    return 'Unknown';
}

export function getMakerNoteDescription() {
    return '[Raw maker note data]';
}

export function getAmbientTemperatureDescription(value) {
    return (value[0] / value[1]) + ' °C';
}

export function getHumidityDescription(value) {
    return (value[0] / value[1]) + ' %';
}

export function getPressureDescription(value) {
    return (value[0] / value[1]) + ' hPa';
}

export function getWaterDepthDescription(value) {
    return (value[0] / value[1]) + ' m';
}

export function getAccelerationDescription(value) {
    return (value[0] / value[1]) + ' mGal';
}

export function getCameraElevationAngleDescription(value) {
    return (value[0] / value[1]) + ' °';
}

export function getSpatialFrequencyResponseDescription() {
    return '[Raw SFR table data]';
}

export function getSubjectLocationDescription([x, y]) {
    return `X: ${x}, Y: ${y}`;
}

export function getSensingMethodDescription(value) {
    if (value === 1) {
        return 'Undefined';
    } else if (value === 2) {
        return 'One-chip color area sensor';
    } else if (value === 3) {
        return 'Two-chip color area sensor';
    } else if (value === 4) {
        return 'Three-chip color area sensor';
    } else if (value === 5) {
        return 'Color sequential area sensor';
    } else if (value === 7) {
        return 'Trilinear sensor';
    } else if (value === 8) {
        return 'Color sequential linear sensor';
    }
    return 'Unknown';
}

export function getFileSourceDescription(value) {
    if (value === 3) {
        return 'DSC';
    }
    return 'Unknown';
}

export function getSceneTypeDescription(value) {
    if (value === 1) {
        return 'A directly photographed image';
    }
    return 'Unknown';
}

export function getCFAPatternDescription() {
    return '[Raw CFA pattern table data]';
}

export function getDigitalZoomRatioDescription(value) {
    if (value[0] === 0) {
        return 'Digital zoom was not used';
    }
    return '' + (value[0] / value[1]);
}

export function getGainControlDescription(value) {
    if (value === 0) {
        return 'None';
    } else if (value === 1) {
        return 'Low gain up';
    } else if (value === 2) {
        return 'High gain up';
    } else if (value === 3) {
        return 'Low gain down';
    } else if (value === 4) {
        return 'High gain down';
    }
    return 'Unknown';
}

export function getDeviceSettingDescriptionDescription() {
    return '[Raw device settings table data]';
}

export function getSubjectDistanceRangeDescription(value) {
    if (value === 1) {
        return 'Macro';
    } else if (value === 2) {
        return 'Close view';
    } else if (value === 3) {
        return 'Distant view';
    }
    return 'Unknown';
}

export function getLensSpecificationDescription(value) {
    return `${getLensFocalLengths(value[0], value[1])} mm f/${getLensApertures(value[2], value[3])}`;
}

export function getCompositeImageDescription(value) {
    return getTableDescription({
        1: 'Not a Composite Image',
        2: 'General Composite Image',
        3: 'Composite Image Captured While Shooting',
    }, value);
}

function getLensFocalLengths(from, to) {
    const focalLengthFrom = getRoundedRational(from);
    const focalLengthTo = getRoundedRational(to);
    if (focalLengthTo === 0 || focalLengthTo === focalLengthFrom) {
        return `${focalLengthFrom}`;
    }
    return `${focalLengthFrom}-${focalLengthTo}`;
}

function getLensApertures(wide, long) {
    const apertures = [wide, long].filter(isKnownRational).map(getRoundedRational);
    if (apertures.length === 0) {
        return '?';
    }
    if (apertures.length === 1 || apertures[1] === 0 || apertures[1] === apertures[0]) {
        return `${apertures[0]}`;
    }
    return `${apertures[0]}-${apertures[1]}`;
}

function getRoundedRational(rational) {
    return parseFloat((rational[0] / rational[1]).toFixed(5));
}

function isKnownRational(rational) {
    return rational[1] !== 0;
}
