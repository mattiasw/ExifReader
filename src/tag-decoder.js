/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import TextDecoder from './text-decoder.js';

const TAG_HEADER_SIZE = 5;

// Windows-1252 (CP1252) mapping for the 0x80–0x9F range, which is where it
// differs from ISO-8859-1. Bytes outside this range map identically in the
// two encodings. Five positions (0x81, 0x8D, 0x8F, 0x90, 0x9D) are unassigned
// in CP1252; we keep their raw byte value so the data is still
// representable. We do not delegate to TextDecoder('windows-1252') because
// Node.js's built-in implementation regressed in 20.18.3 / 22.13.0 / 23.4.0
// and returns the raw bytes for 0x80–0x9F instead of the WHATWG-specified
// codepoints (nodejs/node#60888, still tracked under nodejs/node#61041).
const WINDOWS_1252_C1_MAP = {
    0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
    0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
    0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d,
    0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
    0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161,
    0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

export default {
    decode,
    TAG_HEADER_SIZE
};

function decode(encoding, tagValue) {
    if (typeof tagValue === 'string') {
        return decodeAsciiValue(tagValue);
    }
    const Decoder = TextDecoder.get();
    if ((typeof Decoder !== 'undefined') && (encoding !== undefined)) {
        try {
            return new Decoder(encoding).decode(tagValue instanceof DataView ? tagValue.buffer : Uint8Array.from(tagValue));
        } catch (error) {
            // Pass through and fall back to ASCII decoding.
        }
    }

    const stringValue = tagValue.map((charCode) => String.fromCharCode(charCode)).join('');
    try {
        return decodeURIComponent(escape(stringValue));
    } catch (error) {
        // The bytes are not valid UTF-8. Many real-world IPTC blocks have no
        // Coded Character Set tag but use Windows-1252 (en/em dashes,
        // ellipsis, smart quotes, etc.). Remap the bytes through CP1252 so
        // those characters render correctly instead of staying as C1 control
        // characters.
        return decodeWindows1252(tagValue);
    }
}

function decodeWindows1252(tagValue) {
    const isDataView = tagValue instanceof DataView;
    const length = isDataView ? tagValue.byteLength : tagValue.length;
    const getByte = isDataView ? (i) => tagValue.getUint8(i) : (i) => tagValue[i];
    const codePoints = new Array(length);
    for (let i = 0; i < length; i++) {
        const byte = getByte(i);
        const mapped = WINDOWS_1252_C1_MAP[byte];
        codePoints[i] = mapped !== undefined ? mapped : byte;
    }
    return String.fromCharCode.apply(null, codePoints);
}

function decodeAsciiValue(asciiValue) {
    try {
        return decodeURIComponent(escape(asciiValue));
    } catch (error) {
        return asciiValue;
    }
}
