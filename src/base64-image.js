/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getByteString} from './utils.js';

export function getBase64Image(image) {
    if (typeof image === 'string' && typeof btoa !== 'undefined') {
        // Only tests pass a string. btoa reads it as Latin-1, Buffer.from would use UTF-8.
        return btoa(image);
    }
    if (hasBufferFrom()) {
        return Buffer.from(image).toString('base64'); // eslint-disable-line no-undef
    }
    if (typeof btoa !== 'undefined') {
        return btoa(getByteString(new Uint8Array(image)));
    }
    if (typeof Buffer === 'undefined') {
        return undefined;
    }
    return (new Buffer(image)).toString('base64'); // eslint-disable-line no-undef
}

function hasBufferFrom() {
    // Buffer polyfills before buffer@4.6.0 inherit Uint8Array.from, which returns an empty array for an ArrayBuffer.
    return typeof Buffer !== 'undefined' && typeof Buffer.from !== 'undefined' && Buffer.from !== Uint8Array.from; // eslint-disable-line no-undef
}
