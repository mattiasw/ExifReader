/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export function getGPSVersionIDDescription(value) {
    if (value[0] === 2 && value[1] === 2 && value[2] === 0 && value[3] === 0) {
        return 'Version 2.2';
    }
    return 'Unknown';
}

export function getGPSLatitudeRefDescription(value) {
    const ref = value.join('');
    if (ref === 'N') {
        return 'North latitude';
    } else if (ref === 'S') {
        return 'South latitude';
    }
    return 'Unknown';
}

export function getGPSLongitudeRefDescription(value) {
    const ref = value.join('');
    if (ref === 'E') {
        return 'East longitude';
    } else if (ref === 'W') {
        return 'West longitude';
    }
    return 'Unknown';
}

export function getGPSAltitudeRefDescription(value) {
    if (value === 0) {
        return 'Sea level';
    } else if (value === 1) {
        return 'Sea level reference (negative value)';
    }
    return 'Unknown';
}

export function getGPSAltitudeDescription(value) {
    return (value[0] / value[1]) + ' m';
}

export function getGPSTimeStampDescription(values) {
    return values.map(([numerator, denominator]) => {
        const num = numerator / denominator;
        if (/^\d(\.|$)/.test(`${num}`)) {
            return `0${num}`;
        }
        return num;
    }).join(':');
}

export function getGPSStatusDescription(value) {
    const status = value.join('');
    if (status === 'A') {
        return 'Measurement in progress';
    } else if (status === 'V') {
        return 'Measurement Interoperability';
    }
    return 'Unknown';
}

export function getGPSMeasureModeDescription(value) {
    const mode = value.join('');
    if (mode === '2') {
        return '2-dimensional measurement';
    } else if (mode === '3') {
        return '3-dimensional measurement';
    }
    return 'Unknown';
}

export function getGPSSpeedRefDescription(value) {
    const ref = value.join('');
    if (ref === 'K') {
        return 'Kilometers per hour';
    } else if (ref === 'M') {
        return 'Miles per hour';
    } else if (ref === 'N') {
        return 'Knots';
    }
    return 'Unknown';
}

export function getGPSTrackRefDescription(value) {
    const ref = value.join('');
    if (ref === 'T') {
        return 'True direction';
    } else if (ref === 'M') {
        return 'Magnetic direction';
    }
    return 'Unknown';
}

export function getGPSImgDirectionRefDescription(value) {
    const ref = value.join('');
    if (ref === 'T') {
        return 'True direction';
    } else if (ref === 'M') {
        return 'Magnetic direction';
    }
    return 'Unknown';
}

export function getGPSDestLatitudeRefDescription(value) {
    const ref = value.join('');
    if (ref === 'N') {
        return 'North latitude';
    } else if (ref === 'S') {
        return 'South latitude';
    }
    return 'Unknown';
}

export function getGPSDestLongitudeRefDescription(value) {
    const ref = value.join('');
    if (ref === 'E') {
        return 'East longitude';
    } else if (ref === 'W') {
        return 'West longitude';
    }
    return 'Unknown';
}

export function getGPSDestBearingRefDescription(value) {
    const ref = value.join('');
    if (ref === 'T') {
        return 'True direction';
    } else if (ref === 'M') {
        return 'Magnetic direction';
    }
    return 'Unknown';
}

export function getGPSDestDistanceRefDescription(value) {
    const ref = value.join('');
    if (ref === 'K') {
        return 'Kilometers';
    } else if (ref === 'M') {
        return 'Miles';
    } else if (ref === 'N') {
        return 'Knots';
    }
    return 'Unknown';
}

export function getGPSDifferentialDescription(value) {
    if (value === 0) {
        return 'Measurement without differential correction';
    } else if (value === 1) {
        return 'Differential correction applied';
    }
    return 'Unknown';
}
