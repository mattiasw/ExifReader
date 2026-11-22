/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {UnsupportedFormatError} from './unsupported-format-error.js';

/**
 * Thrown when no Exif metadata was found for the given image.
 *
 * @param {string} message The error message.
 */
function MetadataMissingError(message) {
    this.name = 'MetadataMissingError';
    this.message = message || 'No Exif data';
    // Defined, not assigned, to keep stack out of the enumerable keys.
    Object.defineProperty(this, 'stack', {value: (new Error()).stack, writable: true, configurable: true});
}

MetadataMissingError.prototype = Object.create(Error.prototype, {
    constructor: {value: MetadataMissingError, writable: true, configurable: true}
});

export default {
    MetadataMissingError,
    UnsupportedFormatError,
};
