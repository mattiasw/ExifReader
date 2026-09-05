/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {deferInit, getBase64Image} from './utils.js';

// https://exiftool.org/TagNames/EXIF.html#Compression
const COMPRESSION_JPEG = [6, 7, 99];

export default {
    get,
};

function get(dataView, thumbnailTags, tiffHeaderOffset) {
    if (hasJpegThumbnail(thumbnailTags)) {
        const offset = tiffHeaderOffset + thumbnailTags.JPEGInterchangeFormat.value;
        const length = thumbnailTags.JPEGInterchangeFormatLength.value;

        if (fitsInDataView(dataView, offset, length)) {
            thumbnailTags.type = 'image/jpeg';
            const byteOffset = dataView.byteOffset || 0;
            thumbnailTags.image = dataView.buffer.slice(byteOffset + offset, byteOffset + offset + length);
            deferInit(thumbnailTags, 'base64', function () {
                return getBase64Image(this.image);
            });
        }
    }

    // There is a small possibility of thumbnails in TIFF format but they are
    // not stored as a self-contained image file and would be much more
    // difficult to extract.
    // https://exiftool.org/forum/index.php?topic=3273.msg14778#msg14778

    return thumbnailTags;
}

function hasJpegThumbnail(tags) {
    return tags && ((tags.Compression === undefined) || (COMPRESSION_JPEG.includes(tags.Compression.value)))
        && tags.JPEGInterchangeFormat && tags.JPEGInterchangeFormat.value
        && tags.JPEGInterchangeFormatLength && tags.JPEGInterchangeFormatLength.value;
}

// The file declares the offset and the length, and slicing clamps a bad range
// instead of throwing, reading a negative start from the end of the buffer. The
// bound is the view's own extent, not the buffer's, since the slice starts at
// the view's byteOffset.
function fitsInDataView(dataView, offset, length) {
    return isNonNegativeInteger(offset)
        && isNonNegativeInteger(length)
        && (offset + length <= dataView.byteLength);
}

function isNonNegativeInteger(value) {
    return (typeof value === 'number') && (value >= 0) && (value % 1 === 0);
}
