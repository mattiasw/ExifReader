/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const ID_CAPABLE_GROUPS = {
    exif: true,
    iptc: true,
    photoshop: true,
    mpf: true,
    makerNotes: true,
};

export const FILTER_GROUPS = {
    exif: true,
    iptc: true,
    xmp: true,
    icc: true,
    photoshop: true,
    makerNotes: true,
    mpf: true,
    file: true,
    jfif: true,
    png: true,
    riff: true,
    gif: true,
    gps: true,
    composite: true,
    thumbnail: true,
};

export const EXIF_POINTER_TAGS = {
    exifIfdPointer: 'Exif IFD Pointer',
    gpsInfoIfdPointer: 'GPS Info IFD Pointer',
    interoperabilityIfdPointer: 'Interoperability IFD Pointer',
};

export const EXIF_DEPENDENCY_TAGS = {
    thumbnail: [
        'JPEGInterchangeFormat',
        'JPEGInterchangeFormatLength',
    ],
    iptc: ['IPTC-NAA'],
    xmp: ['ApplicationNotes'],
    icc: ['ICC_Profile'],
    photoshop: ['ImageSourceData', 'PhotoshopSettings'],
    makerNotes: ['MakerNote', 'Make'],
    gps: [
        'GPSLatitude',
        'GPSLatitudeRef',
        'GPSLongitude',
        'GPSLongitudeRef',
        'GPSAltitude',
        'GPSAltitudeRef',
    ],
};

export const COMPOSITE_DEPENDENCY_TAGS = {
    file: ['Image Width', 'Image Height'],
    exif: [
        'FocalLength',
        'FocalPlaneXResolution',
        'FocalPlaneYResolution',
        'FocalPlaneResolutionUnit',
        'FocalLengthIn35mmFilm',
    ],
};

export function getExifTagDependenciesForInclude(includeTags) {
    const requiredTags = Object.create(null);

    if (!includeTags) {
        return requiredTags;
    }

    if (Array.isArray(includeTags.exif) && includeTags.exif.length > 0) {
        requiredTags[EXIF_POINTER_TAGS.exifIfdPointer] = true;
        addPointerDependenciesFromExifTagSelectors(requiredTags, includeTags.exif);
    }

    for (const groupKey in EXIF_DEPENDENCY_TAGS) {
        if (isRequestedIncludeValue(includeTags[groupKey])) {
            const dependencyTags = EXIF_DEPENDENCY_TAGS[groupKey];
            for (let i = 0; i < dependencyTags.length; i++) {
                requiredTags[dependencyTags[i]] = true;
            }
            requiredTags[EXIF_POINTER_TAGS.exifIfdPointer] = true;
        }
    }

    if (isRequestedIncludeValue(includeTags.gps)) {
        requiredTags[EXIF_POINTER_TAGS.gpsInfoIfdPointer] = true;
        requiredTags[EXIF_POINTER_TAGS.exifIfdPointer] = true;
    }

    return requiredTags;

    function addPointerDependenciesFromExifTagSelectors(pointerSet, selectors) {
        for (let i = 0; i < selectors.length; i++) {
            const selector = selectors[i];
            if (typeof selector !== 'string') {
                continue;
            }

            const selectorLower = selector.toLowerCase();
            if (selectorLower.indexOf('gps') === 0) {
                pointerSet[EXIF_POINTER_TAGS.gpsInfoIfdPointer] = true;
            }
            if (
                selectorLower.indexOf('interoperability') === 0
                || selectorLower.indexOf('relatedimage') === 0
            ) {
                pointerSet[EXIF_POINTER_TAGS.interoperabilityIfdPointer] = true;
            }
        }
    }
}

function isRequestedIncludeValue(includeValue) {
    if (includeValue === true) {
        return true;
    }

    return Array.isArray(includeValue) && includeValue.length > 0;
}
