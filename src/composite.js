/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export default {
    get,
};

function get(tags, expanded) {
    const compositeTags = {};
    let hasCompositeTags = false;

    const focalLength = getTagValue(tags, 'FocalLength', expanded);
    const focalLengthIn35mmFilm = getTagValue(tags, 'FocalLengthIn35mmFilm', expanded);

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

function getTagValue(tags, tagName, expanded) {
    if (expanded && tags.exif && tags.exif[tagName]) {
        return tags.exif[tagName].value;
    }
    if (!expanded && tags[tagName]) {
        return tags[tagName].value;
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
