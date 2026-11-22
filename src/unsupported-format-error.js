/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Thrown when no supported image format recognizes the input.
 *
 * @param {string} message The error message.
 */
function UnsupportedFormatError(message) {
    this.name = 'UnsupportedFormatError';
    this.message = message;
    // Defined, not assigned, to keep stack out of the enumerable keys.
    Object.defineProperty(this, 'stack', {value: (new Error(message)).stack, writable: true, configurable: true});
}

UnsupportedFormatError.prototype = Object.create(Error.prototype, {
    constructor: {value: UnsupportedFormatError, writable: true, configurable: true}
});

export {UnsupportedFormatError};
