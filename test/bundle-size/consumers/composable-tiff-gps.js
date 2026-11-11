/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Six GPS tags from TIFF.
import {createReader} from 'exifreader/core';
import {tiff} from 'exifreader/formats';
import {
    GPSLatitude,
    GPSLatitudeRef,
    GPSLongitude,
    GPSLongitudeRef,
    GPSAltitude,
    GPSAltitudeRef
} from 'exifreader/tags/exif';

export const reader = createReader({
    formats: [tiff],
    tags: [GPSLatitude, GPSLatitudeRef, GPSLongitude, GPSLongitudeRef, GPSAltitude, GPSAltitudeRef]
});
