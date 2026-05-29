/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global Buffer, SharedArrayBuffer */

import {
    fetchRange, nodeGetRange, readLocalFileRange, readFileObjectRange,
    concatBuffers, isFilePathOrURL, isBrowserFileObject, isDataUri,
    HTTP_STATUS_OK, HTTP_STATUS_RANGE_NOT_SATISFIABLE,
} from './file-loaders.js';
import {objectAssign, dataUriToBuffer} from './utils.js';

const AUTO_INITIAL_LENGTH = 128 * 1024;
const AUTO_MAX_ITERATIONS = 4;
const AUTO_UNSUPPORTED_ERROR =
    'length: "auto" could not locate metadata in this file '
    + '(no metadata blocks found after reading the file — e.g. plain TIFF, '
    + 'bare JPEG XL codestream, or a file with no recognizable metadata).';
const AUTO_MEMORY_UNSUPPORTED_ERROR =
    'length: "auto" is not supported for this file type '
    + '(no leading metadata container — e.g. plain TIFF or bare JPEG XL codestream).';

/**
 * Throws synchronously if `length: 'auto'` is missing `expanded: true`
 * and/or `includeOffsets: true`.
 *
 * @param {object} options
 */
export function validateAutoOptions(options) {
    if (options.expanded !== true || options.includeOffsets !== true) {
        throw new Error('length: "auto" requires both expanded: true and includeOffsets: true.');
    }
}

/**
 * Builds a `loadAuto(data, options)` bound to `loadFromData`. Factory
 * to avoid a circular import with `exif-reader.js`.
 *
 * @param {(data: any, options: object) => any} loadFromData
 * @returns {(data: any, options: object) => Promise<object>}
 */
export function makeLoadAuto(loadFromData) {
    return function loadAuto(data, options) {
        if (typeof Promise === 'undefined') {
            throw new Error('Promise is required when async mode is enabled.');
        }
        const asyncOptions = objectAssign({}, options, {async: true});
        if (isFilePathOrURL(data)) {
            return loadAdaptiveFromFilenameOrUrl(data, asyncOptions);
        }
        if (isBrowserFileObject(data)) {
            return loadAdaptiveFromFileObject(data, asyncOptions);
        }
        return loadAdaptiveFromMemory(data, asyncOptions);
    };

    function loadAdaptiveFromFilenameOrUrl(filename, options) {
        if (/^\w+:\/\//.test(filename)) {
            if (typeof fetch !== 'undefined') {
                return adaptiveLoop({
                    readRange: (start, end) => fetchRange(filename, {start, end}),
                    options,
                });
            }
            return adaptiveLoop({
                readRange: (start, end) => nodeGetRange(filename, {start, end}),
                options,
            });
        }
        if (isDataUri(filename)) {
            return loadAdaptiveFromMemory(dataUriToBuffer(filename), options);
        }
        return adaptiveLoop({
            readRange: (start, end, ctx) => readLocalFileRange(filename, {
                start, end, totalSize: ctx ? ctx.totalSize : undefined
            }),
            options,
        });
    }

    function loadAdaptiveFromFileObject(file, options) {
        return adaptiveLoop({
            readRange: (start, end) => readFileObjectRange(file, {start, end}),
            options,
        });
    }

    function loadAdaptiveFromMemory(data, options) {
        return Promise.resolve()
            .then(() => loadFromData(data, options))
            .then((tags) => {
                if (!tags || !tags.metadataRange) {
                    throw new Error(AUTO_MEMORY_UNSUPPORTED_ERROR);
                }
                const end = tags.metadataRange.end;
                tags.metadataRange.buffer = sliceInputBuffer(data, end);
                tags.metadataRange.fetched = bufferByteLength(tags.metadataRange.buffer);
                tags.metadataRange.requests = 0;
                return tags;
            });
    }

    function adaptiveLoop({readRange, options}) {
        return runAdaptiveIteration({
            readRange,
            options,
            buffer: null,
            fetched: 0,
            requests: 0,
            totalSize: undefined,
            need: AUTO_INITIAL_LENGTH,
            iter: 0,
        });
    }

    function runAdaptiveIteration(state) {
        if (state.iter >= AUTO_MAX_ITERATIONS) {
            return runAdaptiveFallback(state);
        }
        if (state.totalSize !== undefined) {
            state.need = Math.min(state.need, state.totalSize);
        }
        if (state.need <= state.fetched) {
            return runAdaptiveFallback(state);
        }
        return state.readRange(state.fetched, state.need, {totalSize: state.totalSize})
            .then((chunk) => {
                state.requests++;
                // Fall back to a full GET when the server cannot satisfy
                // the requested range.
                if (chunk.status === HTTP_STATUS_RANGE_NOT_SATISFIABLE) {
                    return handleAdaptive416(state);
                }
                mergeAdaptiveChunk(state, chunk);
                return Promise.resolve(loadFromData(state.buffer, state.options))
                    .then((tags) => decideAdaptiveNext(state, tags));
            });
    }

    function decideAdaptiveNext(state, tags) {
        const range = tags && tags.metadataRange;
        if (range && range.complete) {
            return attachAdaptiveFields(tags, state.buffer, state.fetched, state.requests);
        }

        // No metadataRange yet does not mean unsupported. The `meta` box
        // may be past the current buffer in ISO-BMFF. Only reject after
        // a full-file read.
        const reachedEnd = state.totalSize !== undefined && state.fetched >= state.totalSize;
        if (!range && reachedEnd) {
            throw new Error(AUTO_UNSUPPORTED_ERROR);
        }

        const nextNeed = pickNextNeed({range, totalSize: state.totalSize, fetched: state.fetched});
        if (nextNeed <= state.fetched) {
            if (range) {
                return attachAdaptiveFields(tags, state.buffer, state.fetched, state.requests);
            }
            throw new Error(AUTO_UNSUPPORTED_ERROR);
        }
        state.need = nextNeed;
        state.iter++;
        return runAdaptiveIteration(state);
    }

    function handleAdaptive416(state) {
        return state.readRange(0, Infinity, {totalSize: undefined})
            .then((full) => {
                state.requests++;
                state.buffer = full.buffer;
                state.fetched = bufferByteLength(state.buffer);
                if (full.totalSize !== undefined) {
                    state.totalSize = full.totalSize;
                }
                return Promise.resolve(loadFromData(state.buffer, state.options));
            })
            .then((tags) => {
                if (!tags || !tags.metadataRange) {
                    throw new Error(AUTO_UNSUPPORTED_ERROR);
                }
                return attachAdaptiveFields(tags, state.buffer, state.fetched, state.requests);
            });
    }

    function runAdaptiveFallback(state) {
        // Iteration cap reached. Fall back to full read for correctness.
        console.warn( // eslint-disable-line no-console
            `ExifReader: length:"auto" did not converge in ${AUTO_MAX_ITERATIONS} iterations; falling back to full read.`
        );
        let chunkPromise;
        if (state.totalSize !== undefined && state.fetched < state.totalSize) {
            chunkPromise = state.readRange(state.fetched, state.totalSize, {totalSize: state.totalSize})
                .then((chunk) => {
                    state.requests++;
                    state.buffer = concatBuffers(state.buffer, chunk.buffer);
                    state.fetched = bufferByteLength(state.buffer);
                });
        } else if (state.totalSize === undefined) {
            chunkPromise = state.readRange(state.fetched, Infinity, {totalSize: state.totalSize})
                .then((chunk) => {
                    state.requests++;
                    if (chunk.totalSize !== undefined) {
                        state.totalSize = chunk.totalSize;
                    }
                    state.buffer = concatBuffers(state.buffer, chunk.buffer);
                    state.fetched = bufferByteLength(state.buffer);
                });
        } else {
            chunkPromise = Promise.resolve();
        }
        return chunkPromise
            .then(() => Promise.resolve(loadFromData(state.buffer, state.options)))
            .then((tags) => {
                if (!tags || !tags.metadataRange) {
                    throw new Error(AUTO_UNSUPPORTED_ERROR);
                }
                return attachAdaptiveFields(tags, state.buffer, state.fetched, state.requests);
            });
    }
}

function mergeAdaptiveChunk(state, chunk) {
    // HTTP 200 on a Range request means the server ignored Range and
    // sent the full body. Replace the buffer instead of concatenating to
    // avoid corrupting offsets.
    if (chunk.status === HTTP_STATUS_OK && state.fetched > 0) {
        state.buffer = chunk.buffer;
        state.fetched = bufferByteLength(state.buffer);
        if (chunk.totalSize !== undefined) {
            state.totalSize = chunk.totalSize;
        }
        return;
    }
    if (chunk.totalSize !== undefined && state.totalSize === undefined) {
        state.totalSize = chunk.totalSize;
    }
    state.buffer = concatBuffers(state.buffer, chunk.buffer);
    state.fetched = bufferByteLength(state.buffer);
}

function attachAdaptiveFields(tags, buffer, fetched, requests) {
    const end = tags.metadataRange.end;
    // `buffer` = minimal slice for re-extraction. `fetched` = bytes
    // actually read (may exceed `end` due to fixed-size chunks).
    tags.metadataRange.buffer = sliceBufferToEnd(buffer, end);
    tags.metadataRange.fetched = fetched;
    tags.metadataRange.requests = requests;
    return tags;
}

function pickNextNeed({range, totalSize, fetched}) {
    if (range) {
        return Math.min(
            Math.max(range.end, fetched * 2),
            totalSize !== undefined ? totalSize : Infinity
        );
    }
    // No blocks yet. Jump straight to EOF if known. Avoids burning the
    // iteration cap on ISO-BMFF where `meta` sits near EOF.
    if (totalSize !== undefined) {
        return totalSize;
    }
    return fetched * 2;
}

function sliceBufferToEnd(buffer, end) {
    if (!buffer || typeof end !== 'number' || end < 0) {
        return buffer;
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)) {
        return Buffer.from(buffer.subarray(0, Math.min(end, buffer.length)));
    }
    if (buffer instanceof ArrayBuffer) {
        return buffer.slice(0, Math.min(end, buffer.byteLength));
    }
    if (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer) {
        return buffer.slice(0, Math.min(end, buffer.byteLength));
    }
    return buffer;
}

function sliceInputBuffer(data, end) {
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
        return Buffer.from(data.subarray(0, end));
    }
    if (data instanceof ArrayBuffer) {
        return data.slice(0, end);
    }
    if (typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer) {
        return data.slice(0, end);
    }
    if (ArrayBuffer.isView(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + end);
    }
    return data;
}

function bufferByteLength(buffer) {
    if (!buffer) {
        return 0;
    }
    if (typeof buffer.byteLength === 'number') {
        return buffer.byteLength;
    }
    if (typeof buffer.length === 'number') {
        return buffer.length;
    }
    return 0;
}
