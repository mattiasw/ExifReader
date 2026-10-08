/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import TagNamesCommon from './tag-names-common.js';

const FOCAL_PLANE_RESOLUTION_UNIT = {
    INCHES: 2,
    CENTIMETERS: 3,
    MILLIMETERS: 4
};

const UNIT_FACTORS = {
    INCHES_TO_MM: 25.4, // 1 inch = 25.4 mm
    CM_TO_MM: 10, // 1 cm = 10 mm
    MM_TO_MM: 1 // Already in mm
};

export default {
    get,
};

export {FOCAL_PLANE_RESOLUTION_UNIT};

function get(tags, expanded) {
    const compositeTags = {};
    let hasCompositeTags = false;

    const focalLength = getPositiveRational(getTagValue(tags, 'exif', 'FocalLength', expanded));
    const focalPlaneXResolution = getPositiveRational(getTagValue(tags, 'exif', 'FocalPlaneXResolution', expanded));
    const focalPlaneYResolution = getPositiveRational(getTagValue(tags, 'exif', 'FocalPlaneYResolution', expanded));
    const focalPlaneResolutionUnit = getPositiveNumber(getTagValue(tags, 'exif', 'FocalPlaneResolutionUnit', expanded));
    const pixelDimensions = getPixelDimensions(tags, expanded);
    const focalLengthIn35mmFilm = getPositiveNumber(getTagValue(tags, 'exif', 'FocalLengthIn35mmFilm', expanded))
        || getFocalLengthIn35mmFilmValue(focalPlaneXResolution, focalPlaneYResolution, focalPlaneResolutionUnit, pixelDimensions.width, pixelDimensions.height, focalLength);

    if (focalLengthIn35mmFilm) {
        compositeTags.FocalLength35efl = {
            value: focalLengthIn35mmFilm,
            description: TagNamesCommon.FocalLengthIn35mmFilm(focalLengthIn35mmFilm)
        };
        hasCompositeTags = true;
    }

    const scaleFactorTo35mmEquivalent = getScaleFactorTo35mmEquivalent(focalLength, focalLengthIn35mmFilm);
    if (scaleFactorTo35mmEquivalent) {
        compositeTags.ScaleFactorTo35mmEquivalent = scaleFactorTo35mmEquivalent;
        hasCompositeTags = true;
    }

    const fieldOfView = getFieldOfView(focalLengthIn35mmFilm);
    if (fieldOfView) {
        compositeTags.FieldOfView = fieldOfView;
        hasCompositeTags = true;
    }

    if (hasCompositeTags) {
        return compositeTags;
    }

    return undefined;
}

function getTagValue(tags, group, tagName, expanded) {
    if (expanded && tags[group] && tags[group][tagName]) {
        return tags[group][tagName].value;
    }
    if (!expanded && tags[tagName]) {
        return tags[tagName].value;
    }
    return undefined;
}

/**
 * Converts an Exif `[numerator, denominator]` array, an XMP `'n/d'` string,
 * or a plain number or numeric string to a number.
 *
 * @returns {number|undefined} The number, or undefined when it, or either part
 * of a rational, is not finite and positive.
 */
function getPositiveRational(value) {
    if (typeof value === 'string') {
        // The limit keeps a long run of slashes from allocating one part per slash.
        const parts = value.split('/', 3);
        if (parts.length === 1) {
            return getPositiveNumber(value);
        }
        return getPositiveQuotient(parts);
    }
    if (Array.isArray(value)) {
        return getPositiveQuotient(value);
    }
    return getPositiveNumber(value);
}

/**
 * @returns {number|undefined} The value as a number when it is a number or a
 * numeric string that is finite and positive, otherwise undefined.
 */
function getPositiveNumber(value) {
    let number;
    if (typeof value === 'number') {
        number = value;
    } else if (typeof value === 'string') {
        number = Number(value);
    }
    return number > 0 && number < Infinity ? number : undefined;
}

function getPositiveQuotient(parts) {
    if (parts.length !== 2) {
        return undefined;
    }
    return getPositiveNumber(getPositiveNumber(parts[0]) / getPositiveNumber(parts[1]));
}

function getPixelDimensions(tags, expanded) {
    const pixelXDimension = getPositiveNumber(getTagValue(tags, 'exif', 'PixelXDimension', expanded));
    const pixelYDimension = getPositiveNumber(getTagValue(tags, 'exif', 'PixelYDimension', expanded));
    if (pixelXDimension && pixelYDimension) {
        return {width: pixelXDimension, height: pixelYDimension};
    }
    return {
        width: getPositiveNumber(getTagValue(tags, 'file', 'Image Width', expanded)),
        height: getPositiveNumber(getTagValue(tags, 'file', 'Image Height', expanded))
    };
}

/**
 * Calculates the 35mm equivalent focal length from camera sensor data.
 *
 * This function determines how the field of view of a camera's sensor compares to a
 * standard 35mm film frame (36mm × 24mm). The conversion involves:
 *
 * 1. **Sensor dimensions**: The original image size in pixels (PixelXDimension and
 *    PixelYDimension, or the file's size when absent) divided by the focal plane
 *    resolution (pixels per unit length)
 * 2. **Crop factor**: The ratio between the sensor diagonal and the standard
 *    35mm diagonal (43.27mm)
 * 3. **Equivalent focal length**: Actual focal length multiplied by the crop factor
 *
 * For example, a 50mm lens on a camera with a 1.5x crop factor gives an equivalent
 * field of view of a 75mm lens on a 35mm camera. This doesn't change the actual
 * focal length or depth of field characteristics, only the angle of view.
 */
function getFocalLengthIn35mmFilmValue(focalPlaneXResolution, focalPlaneYResolution, focalPlaneResolutionUnit, pixelWidth, pixelHeight, focalLength) {
    // Standard 35mm film diagonal is 43.27mm (calculated from 36mm x 24mm frame)
    const DIAGONAL_35mm = 43.27;

    if (focalPlaneXResolution && focalPlaneYResolution && focalPlaneResolutionUnit && pixelWidth && pixelHeight && focalLength) {
        let resolutionUnitFactor;
        switch (focalPlaneResolutionUnit) {
            case FOCAL_PLANE_RESOLUTION_UNIT.INCHES:
                resolutionUnitFactor = UNIT_FACTORS.INCHES_TO_MM;
                break;
            case FOCAL_PLANE_RESOLUTION_UNIT.CENTIMETERS:
                resolutionUnitFactor = UNIT_FACTORS.CM_TO_MM;
                break;
            case FOCAL_PLANE_RESOLUTION_UNIT.MILLIMETERS:
                resolutionUnitFactor = UNIT_FACTORS.MM_TO_MM;
                break;
            default:
                return undefined;
        }

        const focalPlaneXResolutionMm = focalPlaneXResolution / resolutionUnitFactor;
        const focalPlaneYResolutionMm = focalPlaneYResolution / resolutionUnitFactor;

        const sensorWidthMm = pixelWidth / focalPlaneXResolutionMm;
        const sensorHeightMm = pixelHeight / focalPlaneYResolutionMm;

        const sensorDiagonal = Math.sqrt(sensorWidthMm ** 2 + sensorHeightMm ** 2);
        const focalLength35mm = focalLength * (DIAGONAL_35mm / sensorDiagonal);
        return getPositiveNumber(focalLength35mm);
    }
    return undefined;
}

function getScaleFactorTo35mmEquivalent(focalLength, focalLengthIn35mmFilm) {
    if (focalLength && focalLengthIn35mmFilm) {
        const value = getPositiveNumber(focalLengthIn35mmFilm / focalLength);
        if (value) {
            return {
                value,
                description: value.toFixed(1),
            };
        }
    }
    return undefined;
}

function getFieldOfView(focalLengthIn35mmFilm) {
    const FULL_FRAME_SENSOR_WIDTH_MM = 36;

    if (focalLengthIn35mmFilm) {
        const value = getPositiveNumber(2 * Math.atan(FULL_FRAME_SENSOR_WIDTH_MM / (2 * focalLengthIn35mmFilm)) * (180 / Math.PI));
        if (value) {
            return {
                value,
                description: value.toFixed(1) + ' deg',
            };
        }
    }
    return undefined;
}
