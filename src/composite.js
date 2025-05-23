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

    const focalLength = getTagValue(tags, 'exif', 'FocalLength', expanded);
    const focalPlaneXResolution = getTagValue(tags, 'exif', 'FocalPlaneXResolution', expanded);
    const focalPlaneYResolution = getTagValue(tags, 'exif', 'FocalPlaneYResolution', expanded);
    const focalPlaneResolutionUnit = getTagValue(tags, 'exif', 'FocalPlaneResolutionUnit', expanded);
    const imageWidth = getTagValue(tags, 'file', 'Image Width', expanded);
    const imageHeight = getTagValue(tags, 'file', 'Image Height', expanded);
    const focalLengthIn35mmFilm = getTagValue(tags, 'exif', 'FocalLengthIn35mmFilm', expanded)
        || getFocalLengthIn35mmFilmValue(focalPlaneXResolution, focalPlaneYResolution, focalPlaneResolutionUnit, imageWidth, imageHeight, focalLength);

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
 * Calculates the 35mm equivalent focal length from camera sensor data.
 *
 * This function determines how the field of view of a camera's sensor compares to a
 * standard 35mm film frame (36mm × 24mm). The conversion involves:
 *
 * 1. **Sensor dimensions**: Calculated from image pixel count and focal plane
 *    resolution (pixels per unit area)
 * 2. **Crop factor**: The ratio between the sensor diagonal and the standard
 *    35mm diagonal (43.27mm)
 * 3. **Equivalent focal length**: Actual focal length multiplied by the crop factor
 *
 * For example, a 50mm lens on a camera with a 1.5x crop factor gives an equivalent
 * field of view of a 75mm lens on a 35mm camera. This doesn't change the actual
 * focal length or depth of field characteristics, only the angle of view.
 */
function getFocalLengthIn35mmFilmValue(focalPlaneXResolution, focalPlaneYResolution, focalPlaneResolutionUnit, imageWidth, imageHeight, focalLength) {
    // Standard 35mm film diagonal is 43.27mm (calculated from 36mm x 24mm frame)
    const DIAGONAL_35mm = 43.27;

    if (focalPlaneXResolution && focalPlaneYResolution && focalPlaneResolutionUnit && imageWidth && imageHeight && focalLength) {
        try {
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

            const focalPlaneXResolutionMm = focalPlaneXResolution[0] / focalPlaneXResolution[1] * resolutionUnitFactor;
            const focalPlaneYResolutionMm = focalPlaneYResolution[0] / focalPlaneYResolution[1] * resolutionUnitFactor;

            const sensorWidthMm = imageWidth / focalPlaneXResolutionMm;
            const sensorHeightMm = imageHeight / focalPlaneYResolutionMm;

            const sensorDiagonal = Math.sqrt(sensorWidthMm ** 2 + sensorHeightMm ** 2);
            const focalLength35mm = (focalLength[0] / focalLength[1]) * (DIAGONAL_35mm / sensorDiagonal);
            return focalLength35mm;
        } catch (error) {
            // Ignore.
        }
    }
    return undefined;
}

function getScaleFactorTo35mmEquivalent(focalLength, focalLengthIn35mmFilm) {
    if (focalLength && focalLengthIn35mmFilm) {
        try {
            const value = focalLengthIn35mmFilm / (focalLength[0] / focalLength[1]);
            return {
                value,
                description: value.toFixed(1),
            };
        } catch (error) {
            // Ignore.
        }
    }
    return undefined;
}

function getFieldOfView(focalLengthIn35mmFilm) {
    const FULL_FRAME_SENSOR_WIDTH_MM = 36;

    if (focalLengthIn35mmFilm) {
        try {
            const value = 2 * Math.atan(FULL_FRAME_SENSOR_WIDTH_MM / (2 * focalLengthIn35mmFilm)) * (180 / Math.PI);
            return {
                value,
                description: value.toFixed(1) + ' deg',
            };
        } catch (error) {
            // Ignore.
        }
    }
    return undefined;
}
