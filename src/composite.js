/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import TagNamesCommon from './tag-names-common.js';

export default {
    get,
};

function get(tags, expanded) {
    const compositeTags = {};
    let hasCompositeTags = false;

    const focalLength = getTagValue(tags, 'exif', 'FocalLength', expanded);
    const focalPlaneXResolution = getTagValue(tags, 'exif', 'FocalPlaneXResolution', expanded);
    const imageWidth = getTagValue(tags, 'file', 'Image Width', expanded);
    const focalLengthIn35mmFilm = getTagValue(tags, 'exif', 'FocalLengthIn35mmFilm', expanded)
        || getFocalLengthIn35mmFilmValue(focalPlaneXResolution, imageWidth, focalLength);

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

function getFocalLengthIn35mmFilmValue(focalPlaneXResolution, imageWidth, focalLength) {
    if (focalPlaneXResolution && imageWidth && focalLength) {
        try {
            const sensorWidthMm = imageWidth / (focalPlaneXResolution[0] / focalPlaneXResolution[1]);
            const fullFrameWidthMm = 36.0;
            const focalLength35mm = (focalLength[0] / focalLength[1]) * (fullFrameWidthMm / sensorWidthMm);
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
