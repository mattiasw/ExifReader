/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import DataViewWrapper from './dataview.js';

export function getDataView(data, byteOffset, byteLength) {
    try {
        return new DataView(data, byteOffset, byteLength);
    } catch (error) {
        return new DataViewWrapper(data, byteOffset, byteLength);
    }
}

export function getStringFromDataView(dataView, offset, length) {
    const chars = [];
    for (let i = 0; i < length && offset + i < dataView.byteLength; i++) {
        chars.push(dataView.getUint8(offset + i));
    }
    return getStringValueFromArray(chars);
}

/**
 * Reads a one-byte-per-character string up to its NUL terminator.
 * @param {DataView} dataView
 * @param {number} offset - Where the string starts.
 * @param {number} [end] - Exclusive end of the read, clamped to the buffer
 *     end. Defaults to the buffer end.
 * @returns {string} The bytes before the first NUL or before the end,
 *     whichever comes first.
 */
export function getNullTerminatedStringFromDataView(dataView, offset, end = dataView.byteLength) {
    const readEnd = Math.min(end, dataView.byteLength);
    const chars = [];
    let i = 0;
    while (offset + i < readEnd) {
        const char = dataView.getUint8(offset + i);
        if (char === 0) {
            break;
        }
        chars.push(char);
        i++;
    }
    return getStringValueFromArray(chars);
}

export function getUnicodeStringFromDataView(dataView, offset, length) {
    const chars = [];
    // Each iteration reads a 2-byte code unit, so both bytes must fit within
    // the requested length and the buffer.
    for (let i = 0; i + 2 <= length && offset + i + 2 <= dataView.byteLength; i += 2) {
        chars.push(dataView.getUint16(offset + i));
    }
    if (chars[chars.length - 1] === 0) {
        chars.pop();
    }
    return getStringValueFromArray(chars);
}

export function getPascalStringFromDataView(dataView, offset) {
    const size = dataView.getUint8(offset);
    const string = getStringFromDataView(dataView, offset + 1, size);
    return [size, string];
}

export function getStringValueFromArray(charArray) {
    return charArray.map((charCode) => String.fromCharCode(charCode)).join('');
}

// Engines cap the number of arguments Function.prototype.apply can pass, and
// some older ones reject a typed array there, so bytes go in as plain chunks.
const MAX_CHARS_PER_CALL = 8192;

/**
 * Converts bytes to a string with one character per byte.
 * @param {Uint8Array|number[]} bytes
 * @param {number} [start=0]
 * @param {number} [end=bytes.length] Exclusive.
 * @param {number[]} [charCodes=[]] Scratch array. A caller that converts many
 *     short strings passes the same one so that each string does not allocate
 *     its own.
 * @returns {string}
 */
export function getByteString(bytes, start = 0, end = bytes.length, charCodes = []) {
    if (end - start <= MAX_CHARS_PER_CALL) {
        return getChunkString(bytes, start, end, charCodes);
    }

    const chunks = [];
    for (let chunkStart = start; chunkStart < end; chunkStart += MAX_CHARS_PER_CALL) {
        chunks.push(getChunkString(bytes, chunkStart, Math.min(chunkStart + MAX_CHARS_PER_CALL, end), charCodes));
    }
    return chunks.join('');
}

function getChunkString(bytes, start, end, charCodes) {
    for (let i = start; i < end; i++) {
        charCodes[i - start] = bytes[i];
    }
    charCodes.length = end - start;
    return String.fromCharCode.apply(null, charCodes);
}

/**
 * Decodes a byte string (one byte per character) as UTF-8. A string that is
 * not valid UTF-8 is returned as it is, so single-byte encoded text stays
 * readable.
 * @param {string} byteString
 * @returns {string}
 */
export function decodeUtf8ByteString(byteString) {
    const decoded = tryDecodeUtf8ByteString(byteString);
    if (decoded === undefined) {
        return byteString;
    }
    return decoded;
}

/**
 * Decodes a byte string (one byte per character) as UTF-8.
 * @param {string} byteString
 * @returns {string | undefined} The decoded text, or undefined when the string
 * is not valid UTF-8.
 */
export function tryDecodeUtf8ByteString(byteString) {
    let isAscii = true;
    for (let index = 0; index < byteString.length;) {
        const sequenceLength = getWellFormedUtf8SequenceLength(byteString, index);
        if (sequenceLength === 0) {
            return undefined;
        }
        if (sequenceLength > 1) {
            isAscii = false;
        }
        index += sequenceLength;
    }
    if (isAscii) {
        return byteString;
    }
    return decodeURIComponent(escape(byteString));
}

// Well-formed byte sequences per Unicode Table 3-7, which ECMAScript's Decode
// (decodeURIComponent) enforces. Returns 0 for an ill-formed or cut-off one.
function getWellFormedUtf8SequenceLength(byteString, index) {
    const lead = byteString.charCodeAt(index);
    if (lead < 0x80) {
        return 1;
    }

    let length;
    let secondMin = 0x80;
    let secondMax = 0xbf;
    if (lead >= 0xc2 && lead <= 0xdf) {
        length = 2;
    } else if (lead >= 0xe0 && lead <= 0xef) {
        length = 3;
        if (lead === 0xe0) {
            secondMin = 0xa0;
        } else if (lead === 0xed) {
            secondMax = 0x9f;
        }
    } else if (lead >= 0xf0 && lead <= 0xf4) {
        length = 4;
        if (lead === 0xf0) {
            secondMin = 0x90;
        } else if (lead === 0xf4) {
            secondMax = 0x8f;
        }
    } else {
        return 0;
    }

    if (index + length > byteString.length) {
        return 0;
    }
    const second = byteString.charCodeAt(index + 1);
    if (!(second >= secondMin && second <= secondMax)) {
        return 0;
    }
    for (let offset = 2; offset < length; offset++) {
        const continuation = byteString.charCodeAt(index + offset);
        if (!(continuation >= 0x80 && continuation <= 0xbf)) {
            return 0;
        }
    }
    return length;
}

export function getCharacterArray(string) {
    return string.split('').map((character) => character.charCodeAt(0));
}

// Guards against memory exhaustion from a crafted file. A real JPEG has at most 255 ICC
// segments, ExifReader reads at most 1024 XMP ones, and other containers are few.
export const MAX_METADATA_BLOCKS = 4096;

/**
 * Records one metadata block. The list holds at most MAX_METADATA_BLOCKS
 * entries; past that, the last entry is widened to cover each further block
 * and keeps its own type. Does nothing without a list or a type.
 * @param {Array<{type: string, start: number, end: number}>|undefined} metadataBlocks
 * @param {string|undefined} type
 * @param {number} start
 * @param {number} end Exclusive.
 */
export function pushMetadataBlock(metadataBlocks, type, start, end) {
    if (!metadataBlocks || !type) {
        return;
    }
    if (metadataBlocks.length < MAX_METADATA_BLOCKS) {
        metadataBlocks.push({type, start, end});
    } else {
        const lastBlock = metadataBlocks[metadataBlocks.length - 1];
        lastBlock.start = Math.min(lastBlock.start, start);
        lastBlock.end = Math.max(lastBlock.end, end);
    }
}

export function assertPromiseSupport() {
    if (typeof Promise === 'undefined') {
        throw new Error('Promise is required when async mode is enabled.');
    }
}

export function objectAssign() {
    for (let i = 1; i < arguments.length; i++) {
        for (const property in arguments[i]) {
            setProperty(arguments[0], property, arguments[i][property]);
        }
    }

    return arguments[0];
}

/**
 * Sets a property whose name may come from an image. A plain assignment to
 * `__proto__` replaces the object's prototype instead of storing the value,
 * which loses the entry and makes the prototype's properties look like content.
 *
 * @param {object} object The object to set the property on.
 * @param {string} key The property name.
 * @param {*} value The property value.
 */
export function setProperty(object, key, value) {
    if (key === '__proto__') {
        Object.defineProperty(object, key, {value, enumerable: true, writable: true, configurable: true});
        return;
    }
    object[key] = value;
}

/**
 * Returns the key to store a tag under whose name comes from an image. A name
 * that is an `Object.prototype` property, such as `hasOwnProperty`, would hide
 * that method on the object holding it, so it gets `_` appended. `__proto__`
 * is kept, since `setProperty` stores it as an own property.
 *
 * @param {string} name The tag name from the image.
 * @returns {string} The name, with `_` appended if it would hide an inherited property.
 */
export function getTagKey(name) {
    if (name !== '__proto__' && Object.prototype.hasOwnProperty.call(Object.prototype, name)) {
        return name + '_';
    }
    return name;
}

export function deferInit(object, key, initializer) {
    let initialized = false;
    Object.defineProperty(object, key, {
        get() {
            if (!initialized) {
                initialized = true;
                Object.defineProperty(object, key, {
                    configurable: true,
                    enumerable: true,
                    value: initializer.apply(object),
                    writable: true
                });
            }
            return object[key];
        },
        configurable: true,
        enumerable: true
    });
}

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

export function dataUriToBuffer(dataUri) {
    const commaIndex = dataUri.indexOf(',');
    const header = dataUri.substring(0, commaIndex);
    const data = dataUri.substring(commaIndex + 1);

    if (header.indexOf(';base64') !== -1) {
        const base64 = percentDecodeBase64Payload(data);
        if (typeof atob !== 'undefined') {
            return binaryStringToArrayBuffer(atob(base64));
        }
        if (typeof Buffer === 'undefined') {
            return undefined;
        }
        if (typeof Buffer.from !== 'undefined') { // eslint-disable-line no-undef
            return Buffer.from(base64, 'base64'); // eslint-disable-line no-undef
        }
        return new Buffer(base64, 'base64'); // eslint-disable-line no-undef
    }

    return percentDecodeToBytes(data).buffer;
}

// WHATWG data: URL processing percent-decodes the body before the forgiving-base64 decode.
// A non-ASCII payload can never be valid base64, so it goes to the decoder unchanged.
function percentDecodeBase64Payload(data) {
    if (data.indexOf('%') === -1 || /[\u0080-\uffff]/.test(data)) {
        return data;
    }
    return getByteString(percentDecodeToBytes(data));
}

function binaryStringToArrayBuffer(string) {
    const bytes = new Uint8Array(string.length);
    for (let i = 0; i < string.length; i++) {
        bytes[i] = string.charCodeAt(i);
    }
    return bytes.buffer;
}

// WHATWG URL "string percent-decode" (used for data: URLs, RFC 2397): UTF-8 encode, then each %XX is one byte.
function percentDecodeToBytes(string) {
    const byteString = /[\u0080-\uffff]/.test(string) ? unescape(encodeURIComponent(string)) : string;
    const bytes = new Uint8Array(byteString.length - 2 * countPercentEscapes(byteString));
    let byteIndex = 0;
    for (let i = 0; i < byteString.length; i++) {
        if (isPercentEscape(byteString, i)) {
            bytes[byteIndex++] = getHexDigitValue(byteString.charCodeAt(i + 1)) * 16 + getHexDigitValue(byteString.charCodeAt(i + 2));
            i += 2;
        } else {
            bytes[byteIndex++] = byteString.charCodeAt(i);
        }
    }
    return bytes;
}

function countPercentEscapes(byteString) {
    let count = 0;
    for (let i = 0; i < byteString.length; i++) {
        if (isPercentEscape(byteString, i)) {
            count++;
            i += 2;
        }
    }
    return count;
}

function isPercentEscape(byteString, index) {
    return byteString.charCodeAt(index) === 0x25
        && index + 2 < byteString.length
        && getHexDigitValue(byteString.charCodeAt(index + 1)) !== -1
        && getHexDigitValue(byteString.charCodeAt(index + 2)) !== -1;
}

/**
 * @param {number} charCode
 * @returns {number} The value of the hex digit, or -1 for any other character.
 */
export function getHexDigitValue(charCode) {
    if (charCode >= 0x30 && charCode <= 0x39) {
        return charCode - 0x30;
    }
    if (charCode >= 0x41 && charCode <= 0x46) {
        return charCode - 0x41 + 10;
    }
    if (charCode >= 0x61 && charCode <= 0x66) {
        return charCode - 0x61 + 10;
    }
    return -1;
}

export function padStart(string, length, character) {
    const padding = strRepeat(character, Math.max(0, length - string.length));
    return padding + string;
}

export function parseFloatRadix(string, radix) {
    return parseInt(string.replace('.', ''), radix)
        / Math.pow(radix, (string.split('.')[1] || '').length);
}

export function strRepeat(string, num) {
    return new Array(num + 1).join(string);
}

export const COMPRESSION_METHOD_NONE = undefined;
export const COMPRESSION_METHOD_DEFLATE = 0;
export const COMPRESSION_METHOD_BROTLI = 'brotli';
export const DEFAULT_MAX_DECOMPRESSED_SIZE = 128 * 1024 * 1024;

/**
 * Returns a copy of the decompress config whose compressed blocks share one
 * total budget of maxDecompressedSize bytes. The input is never mutated.
 *
 * @param {Object|undefined} decompressConfig - The caller's decompress option.
 * @returns {Object} {brotli, deflate, maxDecompressedSize, budget: {remaining, warned}}
 */
export function withDecompressBudget(decompressConfig) {
    return {
        brotli: decompressConfig ? decompressConfig.brotli : undefined,
        deflate: decompressConfig ? decompressConfig.deflate : undefined,
        maxDecompressedSize: decompressConfig ? decompressConfig.maxDecompressedSize : undefined,
        budget: {remaining: getMaxDecompressedSize(decompressConfig), warned: false}
    };
}

export function decompress(dataView, compressionMethod, encoding, returnType = 'string', decompressConfig) {
    const maxDecompressedSize = getMaxDecompressedSize(decompressConfig);
    const budget = getDecompressBudget(decompressConfig, maxDecompressedSize);

    if (compressionMethod !== COMPRESSION_METHOD_NONE && budget.remaining < 0) {
        return rejectExceedsMax(budget, maxDecompressedSize);
    }

    const decompressType = getDecompressType(compressionMethod);
    if (decompressConfig && decompressType) {
        const customFn = decompressConfig[decompressType];
        if (typeof customFn === 'function') {
            // Called now, not deferred: the input can view the caller's buffer, which may be reused once load() returns.
            return new Promise((resolve) => resolve(customFn(getUint8View(dataView)))).then((result) => {
                budget.remaining -= getResultByteLength(result);
                if (budget.remaining < 0) {
                    return rejectExceedsMax(budget, maxDecompressedSize);
                }
                if (returnType === 'dataview') {
                    if (result instanceof ArrayBuffer) {
                        return new DataView(result);
                    }
                    // A DataView or a pooled Buffer can be a window into a
                    // larger buffer, and parsers slice dataView.buffer, so
                    // copy a window out but keep a whole buffer as it is.
                    if ((result.byteOffset === 0) && (result.byteLength === result.buffer.byteLength)) {
                        return new DataView(result.buffer);
                    }
                    return new DataView(result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength));
                }
                return new TextDecoder(encoding).decode(result);
            });
        }
    }

    if (compressionMethod === COMPRESSION_METHOD_DEFLATE) {
        if (typeof DecompressionStream === 'function') {
            return readBoundedDecompressedStream(dataView, 'deflate', budget, maxDecompressedSize)
                .then((arrayBuffer) => decodeBuffer(arrayBuffer, returnType, encoding));
        }
    }

    if (compressionMethod === COMPRESSION_METHOD_BROTLI) {
        if (typeof DecompressionStream === 'function') {
            try {
                return readBoundedDecompressedStream(dataView, 'brotli', budget, maxDecompressedSize)
                    .then((arrayBuffer) => decodeBuffer(arrayBuffer, returnType, encoding));
            } catch (_error) {
                // brotli not supported by this DecompressionStream implementation
            }
        }
        return Promise.reject('Brotli decompression is not supported in this environment. Pass in a brotli decompression function via the decompress option.');
    }

    if (compressionMethod !== undefined) {
        return Promise.reject(`Unknown compression method ${compressionMethod}.`);
    }

    // handle uncompressed iTXT with proper encoding awareness
    if (returnType === 'string') {
        try {
            return new TextDecoder(encoding).decode(dataView);
        } catch (error) {
            // Like TextDecoder's decode(), read a missing view as no bytes.
            return dataView ? getByteString(getUint8View(dataView)) : '';
        }
    }
    return dataView;
}

function getDecompressType(compressionMethod) {
    if (compressionMethod === COMPRESSION_METHOD_DEFLATE) {
        return 'deflate';
    }
    if (compressionMethod === COMPRESSION_METHOD_BROTLI) {
        return 'brotli';
    }
    return undefined;
}

function getMaxDecompressedSize(decompressConfig) {
    if (decompressConfig && typeof decompressConfig.maxDecompressedSize === 'number') {
        return decompressConfig.maxDecompressedSize;
    }
    return DEFAULT_MAX_DECOMPRESSED_SIZE;
}

function getDecompressBudget(decompressConfig, maxDecompressedSize) {
    if (decompressConfig && decompressConfig.budget) {
        return decompressConfig.budget;
    }
    return {remaining: maxDecompressedSize, warned: false};
}

function getUint8View(dataView) {
    return new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
}

function readBoundedDecompressedStream(dataView, format, budget, maxDecompressedSize) {
    const decompressionStream = new DecompressionStream(format);
    const decompressedStream = new Blob([dataView]).stream().pipeThrough(decompressionStream);
    const reader = decompressedStream.getReader();
    const chunks = [];
    let total = 0;

    return pump();

    function pump() {
        return reader.read().then(({done, value}) => {
            if (done) {
                return concatChunks(chunks, total);
            }
            total += value.byteLength;
            // Charge before checking and never give bytes back, so an
            // exceeded budget stays exhausted for every later block.
            budget.remaining -= value.byteLength;
            if (budget.remaining < 0) {
                return reader.cancel().then(() => rejectExceedsMax(budget, maxDecompressedSize));
            }
            chunks.push(value);
            return pump();
        });
    }
}

function concatChunks(chunks, total) {
    const out = new Uint8Array(total);
    let offset = 0;
    for (let i = 0; i < chunks.length; i++) {
        out.set(chunks[i], offset);
        offset += chunks[i].byteLength;
    }
    return out.buffer;
}

function decodeBuffer(arrayBuffer, returnType, encoding) {
    if (returnType === 'dataview') {
        return new DataView(arrayBuffer);
    }
    return new TextDecoder(encoding).decode(arrayBuffer);
}

function getResultByteLength(result) {
    if (result && typeof result.byteLength === 'number') {
        return result.byteLength;
    }
    return 0;
}

function rejectExceedsMax(budget, maxDecompressedSize) {
    if (!budget.warned && typeof console !== 'undefined' && typeof console.warn === 'function') { // eslint-disable-line no-console
        budget.warned = true;
        // eslint-disable-next-line no-console
        console.warn(`ExifReader: the total decompressed metadata size for this call would exceed the maximum of ${maxDecompressedSize} bytes, so this and any later compressed metadata blocks are skipped.`);
    }
    return Promise.reject(`Decompressed metadata exceeded the maximum allowed total size of ${maxDecompressedSize} bytes.`);
}
