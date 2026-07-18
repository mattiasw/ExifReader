/**
 * ExifReader
 * http://github.com/mattiasw/exifreader
 * Copyright (C) 2011-2026  Mattias Wallander <mattias@wallander.eu>
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/* global Buffer, __non_webpack_require__ */

import {dataUriToBuffer} from './utils.js';

export const HTTP_STATUS_OK = 200;
export const HTTP_STATUS_SUCCESS_MAX = 299;
export const HTTP_STATUS_RANGE_NOT_SATISFIABLE = 416;

export function isFilePathOrURL(data) {
    return typeof data === 'string';
}

export function isBrowserFileObject(data) {
    return (typeof File !== 'undefined') && (data instanceof File);
}

export function isDataUri(filename) {
    return /^data:[^;,]*(;base64)?,/.test(filename);
}

/**
 * Routes URL / data-URI / file path to the right range-aware primitive and
 * resolves with a plain buffer. Used by the numeric-`length` code path
 * in `load()`.
 *
 * @param {string} filename URL, data URI, or local file path.
 * @param {{length?: number}} [options]
 * @returns {Promise<ArrayBuffer|Buffer>} The whole file, or its first `length` bytes if specified.
 */
export function loadFile(filename, options) {
    if (/^\w+:\/\//.test(filename)) {
        if (typeof fetch !== 'undefined') {
            return fetchRange(filename, legacyRange(options)).then((r) => r.buffer);
        }

        return nodeGetRange(filename, legacyRange(options)).then((r) => r.buffer);
    }

    if (isDataUri(filename)) {
        return Promise.resolve(dataUriToBuffer(filename));
    }

    return readLocalFileRange(filename, legacyRange(options)).then((r) => r.buffer);
}

/**
 * Browser `File` equivalent of `loadFile`. Used by the numeric-`length`
 * code path in `load()`.
 *
 * @param {File} file
 * @param {{length?: number}} [options]
 * @returns {Promise<ArrayBuffer>}
 */
export function loadFileObject(file, options) {
    return readFileObjectRange(file, legacyRange(options)).then((r) => r.buffer);
}

function legacyRange(options) {
    if (options && Number.isInteger(options.length) && options.length >= 0) {
        return {start: 0, end: options.length};
    }
    return {start: 0};
}

/**
 * Range-aware browser `fetch`. Sets an HTTP `Range` header when the
 * requested range is not the whole file.
 *
 * @param {string} url
 * @param {{start?: number, end?: number}} [range] `end` is exclusive. Omit (or pass `Infinity`) to read to EOF.
 * @returns {Promise<{buffer: ArrayBuffer, totalSize: number|undefined, status: number|undefined}>}
 *          `totalSize` is taken from the `Content-Range` or `Content-Length` response header when present.
 *          Rejects with `Could not fetch file: <status>` on non-2xx responses, except 416 which the
 *          `length: 'auto'` loop consumes as a fall-back signal. Mirrors `nodeGetRange`.
 */
export function fetchRange(url, {start = 0, end} = {}) {
    const options = {method: 'GET'};
    if (start > 0 || (end !== undefined && end !== Infinity)) {
        options.headers = {range: buildRangeHeader(start, end)};
    }
    return fetch(url, options).then((response) => {
        const status = response && typeof response.status === 'number' ? response.status : undefined;
        if (status !== undefined && !isAcceptableFetchStatus(status)) {
            const statusText = response.statusText || '';
            return Promise.reject(new Error(`Could not fetch file: ${status} ${statusText}`.trim()));
        }
        const totalSize = totalSizeFromFetchResponse(response);
        return Promise.resolve(response.arrayBuffer()).then((buffer) => ({buffer, totalSize, status}));
    });
}

function buildRangeHeader(start, end) {
    if (end === undefined || end === Infinity) {
        return `bytes=${start}-`;
    }
    return `bytes=${start}-${end - 1}`;
}

function totalSizeFromFetchResponse(response) {
    if (!response || !response.headers || typeof response.headers.get !== 'function') {
        return undefined;
    }
    return totalSizeFromRangeHeaders(response.headers.get('Content-Range'), response.headers.get('Content-Length'));
}

function isAcceptableFetchStatus(status) {
    if ((status >= HTTP_STATUS_OK) && (status <= HTTP_STATUS_SUCCESS_MAX)) {
        return true;
    }
    // 416 is consumed by the `length: 'auto'` adaptive loop (it falls back
    // to a full read), so it must not be surfaced as a fetch error.
    return status === HTTP_STATUS_RANGE_NOT_SATISFIABLE;
}

/**
 * Range-aware Node `http(s).get`. Same contract as `fetchRange`. Rejects
 * on non-2xx responses with the status line in the error message.
 *
 * @param {string} url
 * @param {{start?: number, end?: number}} [range] `end` is exclusive. Omit (or pass `Infinity`) to read to EOF.
 * @returns {Promise<{buffer: Buffer, totalSize: number|undefined, status: number|undefined}>}
 */
export function nodeGetRange(url, {start = 0, end} = {}) {
    return new Promise((resolve, reject) => {
        const options = {};
        if (start > 0 || (end !== undefined && end !== Infinity)) {
            options.headers = {range: buildRangeHeader(start, end)};
        }

        const get = requireNodeGet(url);
        get(url, options, (response) => {
            if ((response.statusCode >= HTTP_STATUS_OK) && (response.statusCode <= HTTP_STATUS_SUCCESS_MAX)) {
                const totalSize = totalSizeFromNodeResponse(response);
                const data = [];
                response.on('data', (chunk) => data.push(Buffer.from(chunk)));
                response.on('error', (error) => reject(error));
                response.on('end', () => resolve({
                    buffer: Buffer.concat(data),
                    totalSize,
                    status: response.statusCode,
                }));
            } else if (response.statusCode === HTTP_STATUS_RANGE_NOT_SATISFIABLE) {
                // Resolve (rather than reject) so the adaptive `length: 'auto'`
                // loop can fall back to a full read, mirroring the fetch path.
                response.resume();
                resolve({buffer: Buffer.alloc(0), totalSize: totalSizeFromNodeResponse(response), status: response.statusCode});
            } else {
                reject(new Error(`Could not fetch file: ${response.statusCode} ${response.statusMessage}`));
                response.resume();
            }
        }).on('error', (error) => reject(error));
    });
}

function totalSizeFromNodeResponse(response) {
    if (!response || !response.headers) {
        return undefined;
    }
    return totalSizeFromRangeHeaders(response.headers['content-range'], response.headers['content-length']);
}

function totalSizeFromRangeHeaders(contentRange, contentLength) {
    if (contentRange) {
        const match = /\/(\d+|\*)$/.exec(contentRange);
        if (match && match[1] !== '*') {
            return parseInt(match[1], 10);
        }
    }
    if (contentLength) {
        const n = parseInt(contentLength, 10);
        if (Number.isFinite(n)) {
            return n;
        }
    }
    return undefined;
}

function requireNodeGet(url) {
    if (/^https:\/\//.test(url)) {
        return __non_webpack_require__('https').get;
    }
    return __non_webpack_require__('http').get;
}

/**
 * Range-aware local file reader (Node `fs`). Opens, reads `[start, end)`,
 * closes.
 *
 * @param {string} filename
 * @param {{start?: number, end?: number, totalSize?: number}} [options]
 *        Pass `totalSize` (a previously-`stat`-ed size) to skip the
 *        `fs.stat` call on subsequent reads of the same file.
 * @returns {Promise<{buffer: Buffer, totalSize: number}>}
 */
export function readLocalFileRange(filename, {start = 0, end, totalSize} = {}) {
    return new Promise((resolve, reject) => {
        const fs = requireNodeFs();
        fs.open(filename, (openErr, fd) => {
            if (openErr) {
                return reject(openErr);
            }
            resolveTotalSize(fs, filename, totalSize, (statErr, total) => {
                if (statErr) {
                    return fs.close(fd, () => reject(statErr));
                }
                const effectiveEnd = (end === undefined || end === Infinity || end > total) ? total : end;
                const effectiveStart = Math.min(Math.max(0, start), effectiveEnd);
                const size = effectiveEnd - effectiveStart;
                const buffer = Buffer.alloc(size);
                if (size === 0) {
                    return fs.close(fd, (closeErr) => finishLocalRead(filename, closeErr, buffer, total, resolve));
                }
                fs.read(fd, {buffer, length: size, position: effectiveStart}, (readErr) => {
                    if (readErr) {
                        return fs.close(fd, () => reject(readErr));
                    }
                    fs.close(fd, (closeErr) => finishLocalRead(filename, closeErr, buffer, total, resolve));
                });
            });
        });
    });
}

function resolveTotalSize(fs, filename, totalSize, cb) {
    if (totalSize !== undefined) {
        return cb(null, totalSize);
    }
    fs.stat(filename, (err, stat) => cb(err, err ? undefined : stat.size));
}

function finishLocalRead(filename, closeErr, buffer, total, resolve) {
    if (closeErr) {
        console.warn(`Could not close file ${filename}:`, closeErr); // eslint-disable-line no-console
    }
    resolve({buffer, totalSize: total});
}

function requireNodeFs() {
    try {
        return __non_webpack_require__('fs');
    } catch (error) {
        return undefined;
    }
}

/**
 * Range-aware browser `File` reader. Uses `file.slice(start, end)` plus
 * `FileReader.readAsArrayBuffer`.
 *
 * @param {File} file
 * @param {{start?: number, end?: number}} [range]
 * @returns {Promise<{buffer: ArrayBuffer, totalSize: number|undefined}>}
 */
export function readFileObjectRange(file, {start = 0, end} = {}) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const totalSize = typeof file.size === 'number' ? file.size : undefined;
        reader.onload = (readerEvent) => resolve({buffer: readerEvent.target.result, totalSize});
        reader.onerror = () => reject(reader.error);
        const hasSlice = file && typeof file.slice === 'function';
        if (hasSlice && (start > 0 || (end !== undefined && end !== Infinity))) {
            const sliceEnd = (end === undefined || end === Infinity) ? totalSize : end;
            reader.readAsArrayBuffer(file.slice(start, sliceEnd));
        } else {
            reader.readAsArrayBuffer(file);
        }
    });
}

/**
 * Concatenate two buffers. Returns a Node `Buffer` when both arguments
 * are Buffers, otherwise an `ArrayBuffer`. Either argument may be
 * nullish, in which case the other is returned as-is.
 *
 * @param {ArrayBuffer|Buffer|null|undefined} a
 * @param {ArrayBuffer|Buffer|null|undefined} b
 * @returns {ArrayBuffer|Buffer}
 */
export function concatBuffers(a, b) {
    if (!a) {
        return b;
    }
    if (!b) {
        return a;
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(a) && Buffer.isBuffer(b)) {
        return Buffer.concat([a, b]);
    }
    const aBytes = bufferToBytes(a);
    const bBytes = bufferToBytes(b);
    const out = new Uint8Array(aBytes.byteLength + bBytes.byteLength);
    out.set(aBytes, 0);
    out.set(bBytes, aBytes.byteLength);
    return out.buffer;
}

function bufferToBytes(b) {
    if (b instanceof ArrayBuffer) {
        return new Uint8Array(b);
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(b)) {
        return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    }
    if (ArrayBuffer.isView(b)) {
        return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    }
    return new Uint8Array(b);
}
