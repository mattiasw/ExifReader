/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {joinMapped} from './utils.js';

export default {
    ApertureValue: getApertureValueDescription,
    ColorSpace: getColorSpaceDescription,
    ComponentsConfiguration: getComponentsConfigurationDescription,
    Contrast: getContrastDescription,
    CustomRendered: getCustomRenderedDescription,
    ExposureMode: getExposureModeDescription,
    ExposureProgram: getExposureProgramDescription,
    ExposureTime: getExposureTimeDescription,
    FNumber: getFNumberDescription,
    FocalLength: getFocalLengthDescription,
    FocalPlaneResolutionUnit: getFocalPlaneResolutionUnitDescription,
    LightSource: getLightSourceDescription,
    MeteringMode: getMeteringModeDescription,
    ResolutionUnit: getResolutionUnitDescription,
    Saturation: getSaturationDescription,
    FocalLengthIn35mmFilm: getFocalLengthIn35mmFilmDescription,
    SceneCaptureType: getSceneCaptureTypeDescription,
    Sharpness: getSharpnessDescription,
    ShutterSpeedValue: getShutterSpeedValueDescription,
    WhiteBalance: getWhiteBalanceDescription,
    XResolution: getXResolutionDescription,
    YResolution: getYResolutionDescription
};

export function getApertureValueDescription(value) {
    return Math.pow(Math.sqrt(2), value[0] / value[1]).toFixed(2);
}

export function getColorSpaceDescription(value) {
    if (value === 1) {
        return 'sRGB';
    } else if (value === 0xffff) {
        return 'Uncalibrated';
    }
    return 'Unknown';
}

export function getComponentsConfigurationDescription(value) {
    return joinMapped(value, getComponentText, '');
}

function getComponentText(component) {
    if (component === 1) {
        return 'Y';
    } else if (component === 2) {
        return 'Cb';
    } else if (component === 3) {
        return 'Cr';
    } else if (component === 4) {
        return 'R';
    } else if (component === 5) {
        return 'G';
    } else if (component === 6) {
        return 'B';
    }
}

export function getContrastDescription(value) {
    if (value === 0) {
        return 'Normal';
    } else if (value === 1) {
        return 'Soft';
    } else if (value === 2) {
        return 'Hard';
    }
    return 'Unknown';
}

export function getCustomRenderedDescription(value) {
    if (value === 0) {
        return 'Normal process';
    } else if (value === 1) {
        return 'Custom process';
    }
    return 'Unknown';
}

export function getExposureModeDescription(value) {
    if (value === 0) {
        return 'Auto exposure';
    } else if (value === 1) {
        return 'Manual exposure';
    } else if (value === 2) {
        return 'Auto bracket';
    }
    return 'Unknown';
}

export function getExposureProgramDescription(value) {
    if (value === 0) {
        return 'Undefined';
    } else if (value === 1) {
        return 'Manual';
    } else if (value === 2) {
        return 'Normal program';
    } else if (value === 3) {
        return 'Aperture priority';
    } else if (value === 4) {
        return 'Shutter priority';
    } else if (value === 5) {
        return 'Creative program';
    } else if (value === 6) {
        return 'Action program';
    } else if (value === 7) {
        return 'Portrait mode';
    } else if (value === 8) {
        return 'Landscape mode';
    } else if (value === 9) {
        return 'Bulb';
    }
    return 'Unknown';
}

export function getExposureTimeDescription(value) {
    if (value[0] / value[1] > 0.25) {
        const decimal = value[0] / value[1];
        if (Number.isInteger(decimal)) {
            return '' + decimal;
        }
        return decimal.toFixed(1);
    }
    if (value[0] !== 0) {
        return `1/${Math.round(value[1] / value[0])}`;
    }
    return `0/${value[1]}`;
}

export function getFNumberDescription(value) {
    return `f/${Number(value[0] / value[1]).toFixed(1)}`;
}

export function getFocalLengthDescription(value) {
    return (value[0] / value[1]) + ' mm';
}

export function getFocalPlaneResolutionUnitDescription(value) {
    if (value === 2) {
        return 'inches';
    } else if (value === 3) {
        return 'centimeters';
    } else if (value === 4) {
        return 'millimeters';
    }
    return 'Unknown';
}

export function getLightSourceDescription(value) {
    if (value === 1) {
        return 'Daylight';
    } else if (value === 2) {
        return 'Fluorescent';
    } else if (value === 3) {
        return 'Tungsten (incandescent light)';
    } else if (value === 4) {
        return 'Flash';
    } else if (value === 9) {
        return 'Fine weather';
    } else if (value === 10) {
        return 'Cloudy weather';
    } else if (value === 11) {
        return 'Shade';
    } else if (value === 12) {
        return 'Daylight fluorescent (D 5700 – 7100K)';
    } else if (value === 13) {
        return 'Day white fluorescent (N 4600 – 5400K)';
    } else if (value === 14) {
        return 'Cool white fluorescent (W 3900 – 4500K)';
    } else if (value === 15) {
        return 'White fluorescent (WW 3200 – 3700K)';
    } else if (value === 17) {
        return 'Standard light A';
    } else if (value === 18) {
        return 'Standard light B';
    } else if (value === 19) {
        return 'Standard light C';
    } else if (value === 20) {
        return 'D55';
    } else if (value === 21) {
        return 'D65';
    } else if (value === 22) {
        return 'D75';
    } else if (value === 23) {
        return 'D50';
    } else if (value === 24) {
        return 'ISO studio tungsten';
    } else if (value === 255) {
        return 'Other light source';
    }
    return 'Unknown';
}

export function getMeteringModeDescription(value) {
    if (value === 1) {
        return 'Average';
    } else if (value === 2) {
        return 'CenterWeightedAverage';
    } else if (value === 3) {
        return 'Spot';
    } else if (value === 4) {
        return 'MultiSpot';
    } else if (value === 5) {
        return 'Pattern';
    } else if (value === 6) {
        return 'Partial';
    } else if (value === 255) {
        return 'Other';
    }
    return 'Unknown';
}

export function getResolutionUnitDescription(value) {
    if (value === 2) {
        return 'inches';
    }
    if (value === 3) {
        return 'centimeters';
    }
    return 'Unknown';
}

export function getSaturationDescription(value) {
    if (value === 0) {
        return 'Normal';
    } else if (value === 1) {
        return 'Low saturation';
    } else if (value === 2) {
        return 'High saturation';
    }
    return 'Unknown';
}

export function getFocalLengthIn35mmFilmDescription(value) {
    if (value === 0) {
        return 'Unknown';
    }
    return value + ' mm';
}

export function getSceneCaptureTypeDescription(value) {
    if (value === 0) {
        return 'Standard';
    } else if (value === 1) {
        return 'Landscape';
    } else if (value === 2) {
        return 'Portrait';
    } else if (value === 3) {
        return 'Night scene';
    }
    return 'Unknown';
}

export function getSharpnessDescription(value) {
    if (value === 0) {
        return 'Normal';
    } else if (value === 1) {
        return 'Soft';
    } else if (value === 2) {
        return 'Hard';
    }
    return 'Unknown';
}

export function getShutterSpeedValueDescription(value) {
    const denominator = Math.pow(2, value[0] / value[1]);
    if (denominator <= 1) {
        return `${Math.round(1 / denominator)}`;
    }
    return `1/${Math.round(denominator)}`;
}

export function getWhiteBalanceDescription(value) {
    if (value === 0) {
        return 'Auto white balance';
    } else if (value === 1) {
        return 'Manual white balance';
    }
    return 'Unknown';
}

export function getXResolutionDescription(value) {
    return '' + Math.round(value[0] / value[1]);
}

export function getYResolutionDescription(value) {
    return '' + Math.round(value[0] / value[1]);
}
