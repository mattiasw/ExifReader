/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Thrown when no Exif metadata was found for the given image.
 *
 * @param {string} message The error message.
 */
function MetadataMissingError(message) {
    this.name = 'MetadataMissingError';
    this.message = message || 'No Exif data';
    this.stack = (new Error()).stack;
}

MetadataMissingError.prototype = new Error;

/**
 * Thrown when no supported image format recognizes the input.
 *
 * @param {string} message The error message.
 */
function UnsupportedFormatError(message) {
    this.name = 'UnsupportedFormatError';
    this.message = message;
    this.stack = (new Error(message)).stack;
}

UnsupportedFormatError.prototype = new Error;

export default {
    MetadataMissingError,
    UnsupportedFormatError,
};
