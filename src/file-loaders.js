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
 * @param {{length?: number}} [options] A fractional `length` is rounded down.
 * @returns {Promise<ArrayBuffer|Buffer>} The whole file, or its first `length` bytes if specified. Rejects when
 *          `length` is not `undefined`, `null` or a finite non-negative number.
 */
export function loadFile(filename, options) {
    const range = legacyRange(options);
    if (!range) {
        return rejectInvalidLength();
    }

    if (/^\w+:\/\//.test(filename)) {
        if (typeof fetch !== 'undefined') {
            return fetchRange(filename, range).then((r) => r.buffer);
        }

        return nodeGetRange(filename, range).then((r) => r.buffer);
    }

    if (isDataUri(filename)) {
        return Promise.resolve(dataUriToBuffer(filename));
    }

    return readLocalFileRange(filename, range).then((r) => r.buffer);
}

/**
 * Browser `File` equivalent of `loadFile`. Used by the numeric-`length`
 * code path in `load()`.
 *
 * @param {File} file
 * @param {{length?: number}} [options] A fractional `length` is rounded down.
 * @returns {Promise<ArrayBuffer>} Rejects when `length` is not `undefined`, `null` or a finite non-negative number.
 */
export function loadFileObject(file, options) {
    const range = legacyRange(options);
    if (!range) {
        return rejectInvalidLength();
    }

    return readFileObjectRange(file, range).then((r) => r.buffer);
}

function legacyRange(options) {
    const length = options ? options.length : undefined;
    if (length === undefined || length === null) {
        return {start: 0};
    }
    if (Number.isFinite(length) && length >= 0) {
        const end = Math.floor(length);
        return {start: 0, end, maxBytes: end};
    }
    return undefined;
}

function rejectInvalidLength() {
    return Promise.reject(new Error('The length option must be a finite non-negative number or "auto".'));
}

/**
 * Range-aware browser `fetch`. Sets an HTTP `Range` header when the
 * requested range is not the whole file.
 *
 * @param {string} url
 * @param {{start?: number, end?: number, maxBytes?: number}} [range] `end` is exclusive. Omit (or pass `Infinity`)
 *        to read to EOF. With `maxBytes` (a non-negative integer) at most that many body bytes are kept on a 2xx
 *        response; where the response body is a `ReadableStream` the transfer is stopped once they have arrived,
 *        otherwise the whole body is read and cut.
 * @returns {Promise<{buffer: ArrayBuffer, totalSize: number|undefined, status: number|undefined}>}
 *          `totalSize` is taken from the `Content-Range` or `Content-Length` response header when present.
 *          Rejects with `Could not fetch file: <status>` on non-2xx responses, except 416 which the
 *          `length: 'auto'` loop consumes as a fall-back signal and which resolves with an empty buffer.
 *          The body of a 416 or a rejected status is never read; a `ReadableStream` body is cancelled.
 *          An empty range (`end <= start`) resolves with an empty buffer without a request.
 *          Mirrors `nodeGetRange`.
 */
export function fetchRange(url, {start = 0, end, maxBytes} = {}) {
    if (isEmptyRange(start, end)) {
        return Promise.resolve({buffer: new ArrayBuffer(0), totalSize: undefined, status: undefined});
    }
    const options = {method: 'GET'};
    if (start > 0 || (end !== undefined && end !== Infinity)) {
        options.headers = {range: buildRangeHeader(start, end)};
    }
    return fetch(url, options).then((response) => {
        const status = response && typeof response.status === 'number' ? response.status : undefined;
        if (status !== undefined && !isAcceptableFetchStatus(status)) {
            cancelQuietly(response.body);
            const statusText = response.statusText || '';
            return Promise.reject(new Error(`Could not fetch file: ${status} ${statusText}`.trim()));
        }
        const totalSize = totalSizeFromFetchResponse(response);
        if (status === HTTP_STATUS_RANGE_NOT_SATISFIABLE) {
            cancelQuietly(response.body);
            return {buffer: new ArrayBuffer(0), totalSize, status};
        }
        return readFetchBody(response, maxBytes).then((buffer) => ({buffer, totalSize, status}));
    });
}

function readFetchBody(response, maxBytes) {
    if (!isByteLimit(maxBytes)) {
        return Promise.resolve(response.arrayBuffer());
    }
    if (response.body && typeof response.body.getReader === 'function') {
        return readStreamUpTo(response.body.getReader(), maxBytes);
    }
    return Promise.resolve(response.arrayBuffer()).then((buffer) => buffer.slice(0, maxBytes));
}

function isByteLimit(maxBytes) {
    return Number.isInteger(maxBytes) && maxBytes >= 0;
}

function readStreamUpTo(reader, maxBytes) {
    return new Promise((resolve, reject) => {
        const collector = createByteCollector(maxBytes);
        readNextChunk();

        // Not returning the inner promise keeps memory constant per chunk;
        // a returned chain would retain every link until the stream ends.
        function readNextChunk() {
            if (collector.isFull()) {
                resolve(collector.toArrayBuffer());
                cancelQuietly(reader);
                return;
            }
            reader.read().then(onChunk).then(undefined, onFailure);
        }

        function onChunk(result) {
            if (result.done) {
                resolve(collector.toArrayBuffer());
                return;
            }
            collector.add(result.value);
            readNextChunk();
        }

        function onFailure(error) {
            reject(error);
            cancelQuietly(reader);
        }
    });
}

function cancelQuietly(cancellable) {
    Promise.resolve().then(() => cancellable.cancel()).then(undefined, () => undefined);
}

/**
 * Collects the first `maxBytes` bytes of a sequence of chunks into one
 * growable array, so memory stays O(maxBytes) however the body is chunked.
 * Capacity grows with the data rather than being preallocated, since a
 * caller may pass a large `length` for a small file.
 */
function createByteCollector(maxBytes) {
    let bytes = new Uint8Array(0);
    let count = 0;

    return {
        add(chunk) {
            const size = Math.min(chunk.byteLength, maxBytes - count);
            if (count + size > bytes.length) {
                grow(count + size);
            }
            bytes.set(chunk.subarray(0, size), count);
            count += size;
        },
        isFull() {
            return count >= maxBytes;
        },
        toArrayBuffer() {
            if (bytes.length === count) {
                return bytes.buffer;
            }
            const exact = new Uint8Array(count);
            exact.set(bytes.subarray(0, count));
            return exact.buffer;
        },
    };

    function grow(needed) {
        const larger = new Uint8Array(Math.min(maxBytes, Math.max(needed, 2 * bytes.length)));
        larger.set(bytes.subarray(0, count));
        bytes = larger;
    }
}

function isEmptyRange(start, end) {
    return end !== undefined && end !== Infinity && end <= start;
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
 * on non-2xx responses with the status line in the error message, except
 * 416 which resolves with an empty buffer. The body of a 416 or a rejected
 * status is not read: the response is destroyed.
 *
 * @param {string} url
 * @param {{start?: number, end?: number, maxBytes?: number}} [range] `end` is exclusive. Omit (or pass `Infinity`)
 *        to read to EOF. With `maxBytes` (a non-negative integer) at most that many body bytes are read on a 2xx
 *        response, 200 or 206, and the transfer is stopped once they have arrived.
 * @returns {Promise<{buffer: Buffer, totalSize: number|undefined, status: number|undefined}>}
 */
export function nodeGetRange(url, {start = 0, end, maxBytes} = {}) {
    if (isEmptyRange(start, end)) {
        return Promise.resolve({buffer: Buffer.alloc(0), totalSize: undefined, status: undefined});
    }
    return new Promise((resolve, reject) => {
        const options = {};
        if (start > 0 || (end !== undefined && end !== Infinity)) {
            options.headers = {range: buildRangeHeader(start, end)};
        }

        const get = requireNodeGet(url);
        get(url, options, (response) => {
            if ((response.statusCode >= HTTP_STATUS_OK) && (response.statusCode <= HTTP_STATUS_SUCCESS_MAX)) {
                const totalSize = totalSizeFromNodeResponse(response);
                if (isByteLimit(maxBytes)) {
                    readNodeResponseUpTo(response, maxBytes, (buffer) => resolve({
                        buffer,
                        totalSize,
                        status: response.statusCode,
                    }), reject);
                } else {
                    const data = [];
                    response.on('data', (chunk) => data.push(Buffer.from(chunk)));
                    response.on('error', (error) => reject(error));
                    response.on('end', () => resolve({
                        buffer: Buffer.concat(data),
                        totalSize,
                        status: response.statusCode,
                    }));
                }
            } else if (response.statusCode === HTTP_STATUS_RANGE_NOT_SATISFIABLE) {
                // Resolve (rather than reject) so the adaptive `length: 'auto'`
                // loop can fall back to a full read, mirroring the fetch path.
                const totalSize = totalSizeFromNodeResponse(response);
                response.destroy();
                resolve({buffer: Buffer.alloc(0), totalSize, status: response.statusCode});
            } else {
                reject(new Error(`Could not fetch file: ${response.statusCode} ${response.statusMessage}`));
                response.destroy();
            }
        }).on('error', (error) => reject(error));
    });
}

function readNodeResponseUpTo(response, maxBytes, onBuffer, onError) {
    const collector = createByteCollector(maxBytes);
    let finished = false;

    response.on('error', onError);
    if (collector.isFull()) {
        finish();
        response.destroy();
    } else {
        response.on('data', onData);
        response.on('end', finish);
    }

    function onData(chunk) {
        if (finished) {
            return;
        }
        collector.add(chunk);
        if (collector.isFull()) {
            finish();
            response.destroy();
        }
    }

    function finish() {
        finished = true;
        onBuffer(Buffer.from(collector.toArrayBuffer()));
    }
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
