/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import TextDecoder from './text-decoder.js';

const TAG_HEADER_SIZE = 5;

export default {
    decode,
    TAG_HEADER_SIZE
};

function decode(encoding, tagValue) {
    const Decoder = TextDecoder.get();
    if ((typeof Decoder !== 'undefined') && (encoding !== undefined)) {
        try {
            return new Decoder(encoding).decode(Uint8Array.from(tagValue));
        } catch (error) {
            // Pass through and fall back to ASCII decoding.
        }
    }

    const stringValue = tagValue.map((charCode) => String.fromCharCode(charCode)).join('');
    return decodeAsciiValue(stringValue);
}

function decodeAsciiValue(asciiValue) {
    try {
        return decodeURIComponent(escape(asciiValue));
    } catch (error) {
        return asciiValue;
    }
}
