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

export function getNullTerminatedStringFromDataView(dataView, offset) {
    const chars = [];
    let i = 0;
    while (offset + i < dataView.byteLength) {
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
    for (let i = 0; i < length && offset + i < dataView.byteLength; i += 2) {
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

export function getCharacterArray(string) {
    return string.split('').map((character) => character.charCodeAt(0));
}

export function objectAssign() {
    for (let i = 1; i < arguments.length; i++) {
        for (const property in arguments[i]) {
            arguments[0][property] = arguments[i][property];
        }
    }

    return arguments[0];
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
    if (typeof btoa !== 'undefined') {
        if (typeof image === 'string') {
            // This only happens during the build tests using Node 16+ (npm run test:build).
            return btoa(image);
        }
        // IE11- does not implement reduce on the Uint8Array prototype.
        return btoa(Array.prototype.reduce.call(new Uint8Array(image), (data, byte) => data + String.fromCharCode(byte), ''));
    }
    if (typeof Buffer === 'undefined') {
        return undefined;
    }
    if (typeof Buffer.from !== 'undefined') { // eslint-disable-line no-undef
        return Buffer.from(image).toString('base64'); // eslint-disable-line no-undef
    }
    return (new Buffer(image)).toString('base64'); // eslint-disable-line no-undef
}

export function dataUriToBuffer(dataUri) {
    const data = dataUri.substring(dataUri.indexOf(',') + 1);

    if (dataUri.indexOf(';base64') !== -1) {
        if (typeof atob !== 'undefined') {
            return Uint8Array.from(atob(data), (char) => char.charCodeAt(0)).buffer;
        }
        if (typeof Buffer === 'undefined') {
            return undefined;
        }
        if (typeof Buffer.from !== 'undefined') { // eslint-disable-line no-undef
            return Buffer.from(data, 'base64'); // eslint-disable-line no-undef
        }
        return new Buffer(data, 'base64'); // eslint-disable-line no-undef
    }

    const decodedData = decodeURIComponent(data);
    if (typeof Buffer !== 'undefined') {
        if (typeof Buffer.from !== 'undefined') { // eslint-disable-line no-undef
            return Buffer.from(decodedData); // eslint-disable-line no-undef
        }
        return new Buffer(decodedData); // eslint-disable-line no-undef
    }
    return Uint8Array.from(decodedData, (char) => char.charCodeAt(0)).buffer;
}

export function padStart(string, length, character) {
    const padding = strRepeat(character, length - string.length);
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

export function decompress(dataView, compressionMethod, encoding, returnType = 'string') {
    if (compressionMethod === COMPRESSION_METHOD_DEFLATE) {
        if (typeof DecompressionStream === 'function') {
            const decompressionStream = new DecompressionStream('deflate');
            const decompressedStream = new Blob([dataView]).stream().pipeThrough(decompressionStream);
            if (returnType === 'dataview') {
                return new Response(decompressedStream).arrayBuffer().then((arrayBuffer) => new DataView(arrayBuffer));
            }
            return new Response(decompressedStream).arrayBuffer()
                .then((buffer) => new TextDecoder(encoding).decode(buffer));
        }
    }
    if (compressionMethod !== undefined) {
        return Promise.reject(`Unknown compression method ${compressionMethod}.`);
    }
    return dataView;
}
