/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getCalculatedGpsValue} from '../../tag-names-utils.js';
import {GROUP_BRAND} from '../brand.js';

// Derived from the Exif tags, so it reads no block.
export const gps = {
    key: 'gps',
    consumes: [],
    emits: [],
    merge: () => ({slot: 'gps', mode: 'gps'}),
    mergeModes: {gps: addGpsGroup},
    brand: GROUP_BRAND,
};

// Expanded output only, derived from the parsed Exif group.
function addGpsGroup(tags, block, context) {
    if (
        context.expanded
        && context.tagFilter.shouldReturnGroup('gps')
        && context.parsedGroups.exif
    ) {
        const gpsGroup = getGpsGroupFromExifTags(context.parsedGroups.exif);
        if (gpsGroup) {
            tags.gps = context.deps.filterTagsForReturn('gps', gpsGroup, context.tagFilter);
        }
    }

    return tags;
}

function getGpsGroupFromExifTags(exifTags) {
    let gpsGroup = undefined;

    if (exifTags.GPSLatitude && exifTags.GPSLatitudeRef) {
        gpsGroup = gpsGroup || {};
        try {
            gpsGroup.Latitude = getCalculatedGpsValue(exifTags.GPSLatitude.value);
            if (exifTags.GPSLatitudeRef.value.join('') === 'S') {
                gpsGroup.Latitude = -gpsGroup.Latitude;
            }
        } catch (error) {
            // Ignore.
        }
    }

    if (exifTags.GPSLongitude && exifTags.GPSLongitudeRef) {
        gpsGroup = gpsGroup || {};
        try {
            gpsGroup.Longitude = getCalculatedGpsValue(exifTags.GPSLongitude.value);
            if (exifTags.GPSLongitudeRef.value.join('') === 'W') {
                gpsGroup.Longitude = -gpsGroup.Longitude;
            }
        } catch (error) {
            // Ignore.
        }
    }

    if (exifTags.GPSAltitude && exifTags.GPSAltitudeRef) {
        gpsGroup = gpsGroup || {};
        try {
            gpsGroup.Altitude =
                exifTags.GPSAltitude.value[0] / exifTags.GPSAltitude.value[1];
            if (exifTags.GPSAltitudeRef.value === 1) {
                gpsGroup.Altitude = -gpsGroup.Altitude;
            }
        } catch (error) {
            // Ignore.
        }
    }

    return gpsGroup;
}
