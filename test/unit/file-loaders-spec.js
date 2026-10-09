/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {expect} from 'chai';
import {
    fetchRange,
    loadFile,
    loadFileObject,
    nodeGetRange,
    HTTP_STATUS_RANGE_NOT_SATISFIABLE
} from '../../src/file-loaders.js';
import {swapProperties} from './test-utils.js';

describe('file-loaders', () => {
    describe('nodeGetRange', () => {
        let originalRequire;

        beforeEach(() => {
            originalRequire = global.__non_webpack_require__;
        });

        afterEach(() => {
            global.__non_webpack_require__ = originalRequire;
        });

        function stubHttp(response) {
            let delivered;
            const delivery = new Promise((resolve) => {
                delivered = resolve;
            });
            global.__non_webpack_require__ = (moduleName) => {
                if (/^https?$/.test(moduleName)) {
                    return {
                        get(url, options, callback) {
                            setTimeout(() => {
                                callback(response);
                                delivered();
                            }, 0);
                            return {on: () => undefined};
                        }
                    };
                }
                return undefined;
            };
            return delivery;
        }

        function createStreamingResponse() {
            const response = new EventEmitter();
            response.statusCode = 200;
            response.headers = {};
            response.destroyCalls = 0;
            response.destroy = () => {
                response.destroyCalls++;
            };
            return response;
        }

        it('should resolve with every chunk of the body without maxBytes', async () => {
            const response = createStreamingResponse();
            const delivery = stubHttp(response);
            const pending = nodeGetRange('https://domain.com/image.jpg');
            await delivery;

            response.emit('data', Buffer.from([1, 2, 3]));
            response.emit('data', Buffer.from([4, 5]));
            response.emit('end');
            const result = await pending;

            expect(Array.from(result.buffer)).to.deep.equal([1, 2, 3, 4, 5]);
            expect(result.status).to.equal(200);
            expect(response.destroyCalls).to.equal(0);
        });

        it('should reject when the response errors without maxBytes', async () => {
            const response = createStreamingResponse();
            const delivery = stubHttp(response);
            const pending = nodeGetRange('https://domain.com/image.jpg');
            await delivery;
            const responseError = new Error('connection reset');

            response.emit('error', responseError);
            let error;
            try {
                await pending;
            } catch (e) {
                error = e;
            }

            expect(error).to.equal(responseError);
        });

        it('should ignore events that arrive after maxBytes was reached', async () => {
            const response = createStreamingResponse();
            const delivery = stubHttp(response);
            const pending = nodeGetRange('https://domain.com/image.jpg', {maxBytes: 4});
            await delivery;

            response.emit('data', Buffer.from([1, 2, 3, 4, 5, 6]));
            response.emit('data', Buffer.from([7, 8]));
            response.emit('end');
            response.emit('error', new Error('late error'));
            const result = await pending;

            expect(Array.from(result.buffer)).to.deep.equal([1, 2, 3, 4]);
            expect(response.destroyCalls).to.equal(1);
        });

        it('should reject when a capped response errors before maxBytes is reached', async () => {
            const response = createStreamingResponse();
            const delivery = stubHttp(response);
            const pending = nodeGetRange('https://domain.com/image.jpg', {maxBytes: 4});
            await delivery;
            const responseError = new Error('aborted');

            response.emit('data', Buffer.from([1, 2]));
            response.emit('error', responseError);
            let error;
            try {
                await pending;
            } catch (e) {
                error = e;
            }

            expect(error).to.equal(responseError);
        });

        it('should resolve with status 416 and destroy the response without reading its body', async () => {
            let destroyCalls = 0;
            stubHttp({
                statusCode: HTTP_STATUS_RANGE_NOT_SATISFIABLE,
                statusMessage: 'Range Not Satisfiable',
                headers: {'content-range': 'bytes */5000'},
                on: () => undefined,
                destroy: () => {
                    destroyCalls++;
                },
            });

            const result = await nodeGetRange('https://domain.com/image.jpg', {start: 100, end: 200});

            expect(result.status).to.equal(HTTP_STATUS_RANGE_NOT_SATISFIABLE);
            expect(Buffer.isBuffer(result.buffer)).to.equal(true);
            expect(result.buffer.length).to.equal(0);
            expect(result.totalSize).to.equal(5000);
            expect(destroyCalls).to.equal(1);
        });

        it('should reject with an Error containing the status on other non-2xx responses and destroy the response', async () => {
            let destroyCalls = 0;
            stubHttp({
                statusCode: 500,
                statusMessage: 'Server Error',
                headers: {},
                on: () => undefined,
                destroy: () => {
                    destroyCalls++;
                },
            });

            let error;
            try {
                await nodeGetRange('https://domain.com/image.jpg', {start: 100, end: 200});
            } catch (e) {
                error = e;
            }

            expect(error).to.be.an('error');
            expect(error.message).to.equal('Could not fetch file: 500 Server Error');
            expect(destroyCalls).to.equal(1);
        });

        it('should make no request and resolve with an empty buffer for an empty range', async () => {
            const requests = stubRecordingHttp([]);

            const result = await nodeGetRange('https://domain.com/image.jpg', {start: 0, end: 0, maxBytes: 0});

            expect(requests).to.have.length(0);
            expect(Buffer.isBuffer(result.buffer)).to.equal(true);
            expect(result.buffer.length).to.equal(0);
            expect(result.totalSize).to.equal(undefined);
            expect(result.status).to.equal(undefined);
        });

        it('should make no request for a range that ends before it starts', async () => {
            const requests = stubRecordingHttp([]);

            const result = await nodeGetRange('https://domain.com/image.jpg', {start: 10, end: 5});

            expect(requests).to.have.length(0);
            expect(result.buffer.length).to.equal(0);
        });

        it('should send the range header for a one-byte range', async () => {
            const requests = stubRecordingHttp([Buffer.from([7])]);

            const result = await nodeGetRange('https://domain.com/image.jpg', {start: 0, end: 1});

            expect(requests).to.have.length(1);
            expect(requests[0].headers.range).to.equal('bytes=0-0');
            expect(Array.from(result.buffer)).to.deep.equal([7]);
        });

        function stubRecordingHttp(chunks) {
            const requests = [];
            global.__non_webpack_require__ = (moduleName) => {
                if (/^https?$/.test(moduleName)) {
                    return {
                        get(url, options, callback) {
                            requests.push(options);
                            const response = createStreamingResponse();
                            setTimeout(() => {
                                callback(response);
                                chunks.forEach((chunk) => response.emit('data', chunk));
                                response.emit('end');
                            }, 0);
                            return {on: () => undefined};
                        }
                    };
                }
                return undefined;
            };
            return requests;
        }
    });

    describe('fetchRange', () => {
        let originalFetch;

        beforeEach(() => {
            originalFetch = global.fetch;
        });

        afterEach(() => {
            global.fetch = originalFetch;
        });

        function stubFetch(response) {
            global.fetch = () => Promise.resolve(response);
        }

        function stubRecordingFetch(response) {
            const requests = [];
            global.fetch = (url, options) => {
                requests.push(options);
                return Promise.resolve(response);
            };
            return requests;
        }

        it('should make no request and resolve with an empty buffer for an empty range', async () => {
            const requests = stubRecordingFetch({status: 200, headers: {get: () => null}, arrayBuffer: () => new ArrayBuffer(8)});

            const result = await fetchRange('https://domain.com/image.jpg', {start: 0, end: 0, maxBytes: 0});

            expect(requests).to.have.length(0);
            expect(result.buffer).to.be.an.instanceOf(ArrayBuffer);
            expect(result.buffer.byteLength).to.equal(0);
            expect(result.totalSize).to.equal(undefined);
            expect(result.status).to.equal(undefined);
        });

        it('should make no request for a range that ends before it starts', async () => {
            const requests = stubRecordingFetch({status: 200, headers: {get: () => null}, arrayBuffer: () => new ArrayBuffer(8)});

            const result = await fetchRange('https://domain.com/image.jpg', {start: 10, end: 5});

            expect(requests).to.have.length(0);
            expect(result.buffer.byteLength).to.equal(0);
        });

        it('should send the range header for a one-byte range', async () => {
            const requests = stubRecordingFetch({status: 206, headers: {get: () => null}, arrayBuffer: () => new Uint8Array([7]).buffer});

            const result = await fetchRange('https://domain.com/image.jpg', {start: 0, end: 1});

            expect(requests).to.have.length(1);
            expect(requests[0].headers.range).to.equal('bytes=0-0');
            expect(Array.from(new Uint8Array(result.buffer))).to.deep.equal([7]);
        });

        it('should reject with an Error containing the status on a 404 response and cancel the body', async () => {
            const stream = stubStreamBody([bytesFrom(0, 8)]);
            stubFetch({
                status: 404,
                statusText: 'Not Found',
                headers: {get: () => null},
                body: stream.body,
            });

            const error = await rejectionOf(fetchRange('https://domain.com/missing.jpg'));
            await new Promise(setImmediate);

            expect(error).to.be.an('error');
            expect(error.message).to.equal('Could not fetch file: 404 Not Found');
            expect(stream.state.cancelled).to.equal(true);
            expect(stream.state.reads).to.equal(0);
        });

        it('should reject on a 500 response, trimming an empty statusText, and cancel the body', async () => {
            const stream = stubStreamBody([bytesFrom(0, 8)]);
            stubFetch({
                status: 500,
                statusText: '',
                headers: {get: () => null},
                body: stream.body,
            });

            const error = await rejectionOf(fetchRange('https://domain.com/image.jpg'));
            await new Promise(setImmediate);

            expect(error).to.be.an('error');
            expect(error.message).to.equal('Could not fetch file: 500');
            expect(stream.state.cancelled).to.equal(true);
            expect(stream.state.reads).to.equal(0);
        });

        it('should reject with the status error when a rejected response has no body', async () => {
            stubFetch({
                status: 503,
                statusText: 'Service Unavailable',
                headers: {get: () => null},
            });

            const error = await rejectionOf(fetchRange('https://domain.com/image.jpg'));

            expect(error.message).to.equal('Could not fetch file: 503 Service Unavailable');
        });

        it('should reject with the status error when cancelling the body throws', async () => {
            const stream = stubStreamBody([bytesFrom(0, 8)], {
                cancel: () => {
                    throw new Error('cancel failed');
                },
            });
            stubFetch({status: 500, statusText: 'Internal Server Error', headers: {get: () => null}, body: stream.body});

            const error = await rejectionOf(fetchRange('https://domain.com/image.jpg'));
            await new Promise(setImmediate);

            expect(error.message).to.equal('Could not fetch file: 500 Internal Server Error');
            expect(stream.state.cancelled).to.equal(true);
        });

        it('should reject with the status error when cancelling the body rejects', async () => {
            const stream = stubStreamBody([bytesFrom(0, 8)], {cancel: () => Promise.reject(new Error('cancel failed'))});
            stubFetch({status: 500, statusText: 'Internal Server Error', headers: {get: () => null}, body: stream.body});
            let unhandled;
            const onUnhandled = (reason) => {
                unhandled = reason;
            };
            process.once('unhandledRejection', onUnhandled);

            try {
                const error = await rejectionOf(fetchRange('https://domain.com/image.jpg'));
                await new Promise(setImmediate);

                expect(error.message).to.equal('Could not fetch file: 500 Internal Server Error');
                expect(stream.state.cancelled).to.equal(true);
                expect(unhandled).to.equal(undefined);
            } finally {
                process.removeListener('unhandledRejection', onUnhandled);
            }
        });

        it('should resolve with status 416 so the adaptive loop can fall back', async () => {
            stubFetch({
                status: HTTP_STATUS_RANGE_NOT_SATISFIABLE,
                statusText: 'Range Not Satisfiable',
                headers: {get: () => null},
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
            });

            const result = await fetchRange('https://domain.com/image.jpg', {start: 100, end: 200});

            // 416 must resolve (not reject) and surface the status so the
            // adaptive loop can fall back to a full read. The body is not read.
            expect(result.status).to.equal(HTTP_STATUS_RANGE_NOT_SATISFIABLE);
            expect(result.buffer).to.be.an.instanceOf(ArrayBuffer);
            expect(result.buffer.byteLength).to.equal(0);
        });

        it('should resolve with the body on a 2xx response', async () => {
            stubFetch({
                status: 206,
                statusText: 'Partial Content',
                headers: {get: () => null},
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
            });

            const result = await fetchRange('https://domain.com/image.jpg', {start: 0, end: 16});

            expect(result.status).to.equal(206);
            expect(result.buffer.byteLength).to.equal(16);
        });

        it('should resolve when the response has no numeric status', async () => {
            stubFetch({
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
            });

            const result = await fetchRange('https://domain.com/image.jpg');

            expect(result.status).to.equal(undefined);
            expect(result.buffer.byteLength).to.equal(8);
        });

        it('should cap a 206 body longer than maxBytes and cancel the stream', async () => {
            const stream = stubStreamBody([bytesFrom(0, 6), bytesFrom(6, 6)]);
            stubFetch({status: 206, headers: {get: () => null}, body: stream.body});

            const result = await fetchRange('https://domain.com/image.jpg', {start: 0, end: 8, maxBytes: 8});

            expect(result.status).to.equal(206);
            expect(Array.from(new Uint8Array(result.buffer))).to.deep.equal(Array.from(bytesFrom(0, 8)));
            expect(stream.state.cancelled).to.equal(true);
        });

        it('should cap a body that has no stream to the first maxBytes bytes', async () => {
            stubFetch({status: 200, headers: {get: () => null}, arrayBuffer: () => Promise.resolve(bytesFrom(0, 64).buffer)});

            const result = await fetchRange('https://domain.com/image.jpg', {maxBytes: 10});

            expect(result.buffer).to.be.an.instanceOf(ArrayBuffer);
            expect(Array.from(new Uint8Array(result.buffer))).to.deep.equal(Array.from(bytesFrom(0, 10)));
        });

        it('should resolve with the whole stream body when it is shorter than maxBytes', async () => {
            const stream = stubStreamBody([bytesFrom(0, 5)]);
            stubFetch({status: 200, headers: {get: () => null}, body: stream.body});

            const result = await fetchRange('https://domain.com/image.jpg', {maxBytes: 10});

            expect(Array.from(new Uint8Array(result.buffer))).to.deep.equal(Array.from(bytesFrom(0, 5)));
            expect(result.buffer.byteLength).to.equal(5);
            expect(stream.state.cancelled).to.equal(false);
        });

        it('should reassemble many small chunks in order up to maxBytes', async () => {
            const sizes = [1, 2, 3, 5000, 7, 4000, 2000];
            const chunks = [];
            let offset = 0;
            for (const size of sizes) {
                chunks.push(bytesFrom(offset, size));
                offset += size;
            }
            const stream = stubStreamBody(chunks);
            stubFetch({status: 200, headers: {get: () => null}, body: stream.body});

            const partial = await fetchRange('https://domain.com/image.jpg', {maxBytes: 10000});

            expect(partial.buffer.byteLength).to.equal(10000);
            expect(Array.from(new Uint8Array(partial.buffer))).to.deep.equal(Array.from(bytesFrom(0, 10000)));

            const shorter = stubStreamBody(chunks.slice(0, 5));
            stubFetch({status: 200, headers: {get: () => null}, body: shorter.body});

            const whole = await fetchRange('https://domain.com/image.jpg', {maxBytes: 10000});

            expect(whole.buffer.byteLength).to.equal(5013);
            expect(Array.from(new Uint8Array(whole.buffer))).to.deep.equal(Array.from(bytesFrom(0, 5013)));
        });

        it('should resolve with the capped bytes when cancelling the stream rejects', async () => {
            const stream = stubStreamBody([bytesFrom(0, 16)], {cancel: () => Promise.reject(new Error('cancel failed'))});
            stubFetch({status: 200, headers: {get: () => null}, body: stream.body});
            let unhandled;
            const onUnhandled = (reason) => {
                unhandled = reason;
            };
            process.once('unhandledRejection', onUnhandled);

            try {
                const result = await fetchRange('https://domain.com/image.jpg', {maxBytes: 4});
                await new Promise(setImmediate);

                expect(Array.from(new Uint8Array(result.buffer))).to.deep.equal(Array.from(bytesFrom(0, 4)));
                expect(stream.state.cancelled).to.equal(true);
                expect(unhandled).to.equal(undefined);
            } finally {
                process.removeListener('unhandledRejection', onUnhandled);
            }
        });

        it('should resolve with the capped bytes when cancelling the stream throws', async () => {
            const stream = stubStreamBody([bytesFrom(0, 16)], {
                cancel: () => {
                    throw new Error('cancel failed');
                },
            });
            stubFetch({status: 200, headers: {get: () => null}, body: stream.body});

            const result = await fetchRange('https://domain.com/image.jpg', {maxBytes: 4});

            expect(Array.from(new Uint8Array(result.buffer))).to.deep.equal(Array.from(bytesFrom(0, 4)));
            expect(stream.state.cancelled).to.equal(true);
        });

        it('should reject and cancel the stream when a read fails', async () => {
            const readError = new Error('read failed');
            const stream = stubStreamBody([bytesFrom(0, 2), readError]);
            stubFetch({status: 200, headers: {get: () => null}, body: stream.body});

            let error;
            try {
                await fetchRange('https://domain.com/image.jpg', {maxBytes: 10});
            } catch (e) {
                error = e;
            }

            expect(error).to.equal(readError);
            expect(stream.state.cancelled).to.equal(true);
        });

        it('should cancel the stream without reading when maxBytes is 0', async () => {
            const stream = stubStreamBody([bytesFrom(0, 16)]);
            stubFetch({status: 200, headers: {get: () => null}, body: stream.body});

            const result = await fetchRange('https://domain.com/image.jpg', {maxBytes: 0});

            expect(result.buffer).to.be.an.instanceOf(ArrayBuffer);
            expect(result.buffer.byteLength).to.equal(0);
            expect(stream.state.cancelled).to.equal(true);
            expect(stream.state.reads).to.equal(0);
        });

        it('should resolve a 416 empty and cancel its body without reading it when maxBytes is set', async () => {
            const stream = stubStreamBody([bytesFrom(0, 32)]);
            let arrayBufferCalls = 0;
            stubFetch({
                status: HTTP_STATUS_RANGE_NOT_SATISFIABLE,
                headers: {get: (name) => (name.toLowerCase() === 'content-range' ? 'bytes */5000' : null)},
                body: stream.body,
                arrayBuffer: () => {
                    arrayBufferCalls++;
                    return Promise.resolve(bytesFrom(0, 32).buffer);
                },
            });

            const result = await fetchRange('https://domain.com/image.jpg', {start: 0, end: 4, maxBytes: 4});
            await new Promise(setImmediate);

            expect(result.status).to.equal(HTTP_STATUS_RANGE_NOT_SATISFIABLE);
            expect(result.buffer).to.be.an.instanceOf(ArrayBuffer);
            expect(result.buffer.byteLength).to.equal(0);
            expect(result.totalSize).to.equal(5000);
            expect(stream.state.cancelled).to.equal(true);
            expect(stream.state.reads).to.equal(0);
            expect(arrayBufferCalls).to.equal(0);
        });

        it('should resolve a 416 empty and cancel its body without reading it when maxBytes is not set', async () => {
            const stream = stubStreamBody([bytesFrom(0, 32)]);
            let arrayBufferCalls = 0;
            stubFetch({
                status: HTTP_STATUS_RANGE_NOT_SATISFIABLE,
                headers: {get: () => null},
                body: stream.body,
                arrayBuffer: () => {
                    arrayBufferCalls++;
                    return Promise.resolve(bytesFrom(0, 32).buffer);
                },
            });

            const result = await fetchRange('https://domain.com/image.jpg', {start: 0, end: 4});
            await new Promise(setImmediate);

            expect(result.status).to.equal(HTTP_STATUS_RANGE_NOT_SATISFIABLE);
            expect(result.buffer).to.be.an.instanceOf(ArrayBuffer);
            expect(result.buffer.byteLength).to.equal(0);
            expect(result.totalSize).to.equal(undefined);
            expect(stream.state.cancelled).to.equal(true);
            expect(stream.state.reads).to.equal(0);
            expect(arrayBufferCalls).to.equal(0);
        });

        it('should read the whole body without maxBytes even when a stream is present', async () => {
            const stream = stubStreamBody([bytesFrom(0, 8)]);
            stubFetch({
                status: 200,
                headers: {get: () => null},
                body: stream.body,
                arrayBuffer: () => Promise.resolve(bytesFrom(0, 64).buffer),
            });

            const result = await fetchRange('https://domain.com/image.jpg', {start: 0});

            expect(Array.from(new Uint8Array(result.buffer))).to.deep.equal(Array.from(bytesFrom(0, 64)));
            expect(stream.state.reads).to.equal(0);
        });

        it('should read the whole body when maxBytes is Infinity', async () => {
            const stream = stubStreamBody([bytesFrom(0, 8)]);
            stubFetch({
                status: 200,
                headers: {get: () => null},
                body: stream.body,
                arrayBuffer: () => Promise.resolve(bytesFrom(0, 64).buffer),
            });

            const result = await fetchRange('https://domain.com/image.jpg', {maxBytes: Infinity});

            expect(result.buffer.byteLength).to.equal(64);
            expect(stream.state.reads).to.equal(0);
        });

        function stubStreamBody(chunks, {cancel} = {}) {
            const pending = chunks.slice();
            const state = {reads: 0, cancelled: false};
            const reader = {
                read() {
                    state.reads++;
                    if (pending.length === 0) {
                        return Promise.resolve({done: true, value: undefined});
                    }
                    const next = pending.shift();
                    if (next instanceof Error) {
                        return Promise.reject(next);
                    }
                    return Promise.resolve({done: false, value: next});
                },
                cancel() {
                    state.cancelled = true;
                    return cancel ? cancel() : Promise.resolve();
                },
            };
            return {state, body: {getReader: () => reader, cancel: () => reader.cancel()}};
        }

        async function rejectionOf(promise) {
            try {
                await promise;
            } catch (error) {
                return error;
            }
            throw new Error('Expected the promise to reject');
        }

        function bytesFrom(offset, length) {
            const bytes = new Uint8Array(length);
            for (let i = 0; i < length; i++) {
                bytes[i] = (offset + i) % 251;
            }
            return bytes;
        }
    });

    describe('against a local HTTP server', function () {
        const PATTERN_PERIOD = 251;
        const CHUNK_SIZE = 64 * 1024;
        const SAFETY_CAP = 64 * 1024 * 1024;
        const LENGTH = 1024;

        let originalFetch;
        let originalRequire;
        let server;

        this.timeout(10000);

        beforeEach(() => {
            originalFetch = global.fetch;
            originalRequire = global.__non_webpack_require__;
        });

        afterEach(async () => {
            global.fetch = originalFetch;
            global.__non_webpack_require__ = originalRequire;
            if (server) {
                server.closeAllConnections();
                await new Promise((resolve) => server.close(resolve));
                server = undefined;
            }
        });

        describe('a numeric length against a server that ignores Range', () => {
            it('should stop the fetch transfer after length bytes', async () => {
                const transfer = await startServer(SAFETY_CAP);

                const buffer = await loadFile(transfer.url, {length: LENGTH});

                expect(buffer.byteLength).to.equal(LENGTH);
                expect(Buffer.from(buffer).equals(patternBytes(0, LENGTH))).to.equal(true);
                expect(transfer.rangeHeader).to.equal('bytes=0-1023');
                await expectTransferStopped(transfer);
            });

            it('should stop the Node http transfer after length bytes', async () => {
                delete global.fetch;
                global.__non_webpack_require__ = createRequire(import.meta.url);
                const transfer = await startServer(SAFETY_CAP);

                const buffer = await loadFile(transfer.url, {length: LENGTH});

                expect(Buffer.isBuffer(buffer)).to.equal(true);
                expect(buffer.equals(patternBytes(0, LENGTH))).to.equal(true);
                await expectTransferStopped(transfer);
            });

            it('should resolve with the whole body over Node http when it is shorter than maxBytes', async () => {
                global.__non_webpack_require__ = createRequire(import.meta.url);
                const bodySize = 100;
                const transfer = await startServer(bodySize);

                const result = await nodeGetRange(transfer.url, {maxBytes: LENGTH});

                expect(result.status).to.equal(200);
                expect(result.buffer.equals(patternBytes(0, bodySize))).to.equal(true);
            });

            it('should stop the Node http transfer without reading when maxBytes is 0', async () => {
                global.__non_webpack_require__ = createRequire(import.meta.url);
                const transfer = await startServer(SAFETY_CAP);

                const result = await nodeGetRange(transfer.url, {maxBytes: 0});

                expect(Buffer.isBuffer(result.buffer)).to.equal(true);
                expect(result.buffer.length).to.equal(0);
                await expectTransferStopped(transfer);
            });
        });

        describe('a 416 or other non-2xx response with an endless body', () => {
            it('should resolve a Node http 416 empty and stop the transfer', async () => {
                delete global.fetch;
                global.__non_webpack_require__ = createRequire(import.meta.url);
                const transfer = await startServer(SAFETY_CAP, HTTP_STATUS_RANGE_NOT_SATISFIABLE);

                const result = await nodeGetRange(transfer.url, {start: 0, end: LENGTH, maxBytes: LENGTH});

                expect(result.status).to.equal(HTTP_STATUS_RANGE_NOT_SATISFIABLE);
                expect(Buffer.isBuffer(result.buffer)).to.equal(true);
                expect(result.buffer.length).to.equal(0);
                await expectTransferStopped(transfer);
            });

            it('should reject a Node http 500 and stop the transfer', async () => {
                delete global.fetch;
                global.__non_webpack_require__ = createRequire(import.meta.url);
                const transfer = await startServer(SAFETY_CAP, 500);

                let error;
                try {
                    await nodeGetRange(transfer.url, {start: 0, end: LENGTH, maxBytes: LENGTH});
                } catch (e) {
                    error = e;
                }

                expect(error.message).to.equal('Could not fetch file: 500 Internal Server Error');
                await expectTransferStopped(transfer);
            });

            it('should resolve a fetch 416 empty without maxBytes and stop the transfer', async () => {
                const transfer = await startServer(SAFETY_CAP, HTTP_STATUS_RANGE_NOT_SATISFIABLE);

                const result = await fetchRange(transfer.url, {start: 0, end: LENGTH});

                expect(result.status).to.equal(HTTP_STATUS_RANGE_NOT_SATISFIABLE);
                expect(result.buffer).to.be.an.instanceOf(ArrayBuffer);
                expect(result.buffer.byteLength).to.equal(0);
                await expectTransferStopped(transfer);
            });

            it('should reject a fetch 500 and stop the transfer', async () => {
                const transfer = await startServer(SAFETY_CAP, 500);

                let error;
                try {
                    await fetchRange(transfer.url, {start: 0, end: LENGTH});
                } catch (e) {
                    error = e;
                }

                expect(error.message).to.equal('Could not fetch file: 500 Internal Server Error');
                await expectTransferStopped(transfer);
            });
        });

        describe('a numeric length that selects an empty range', () => {
            it('should make no fetch request for length 0', async () => {
                const transfer = await startServer(SAFETY_CAP);

                const buffer = await loadFile(transfer.url, {length: 0});

                expect(buffer).to.be.an.instanceOf(ArrayBuffer);
                expect(buffer.byteLength).to.equal(0);
                expect(transfer.requestCount).to.equal(0);
            });

            it('should make no Node http request for length 0', async () => {
                delete global.fetch;
                global.__non_webpack_require__ = createRequire(import.meta.url);
                const transfer = await startServer(SAFETY_CAP);

                const buffer = await loadFile(transfer.url, {length: 0});

                expect(Buffer.isBuffer(buffer)).to.equal(true);
                expect(buffer.length).to.equal(0);
                expect(transfer.requestCount).to.equal(0);
            });

            it('should still send a one-byte range header for length 1', async () => {
                const transfer = await startServer(SAFETY_CAP);

                const buffer = await loadFile(transfer.url, {length: 1});

                expect(buffer.byteLength).to.equal(1);
                expect(transfer.requestCount).to.equal(1);
                expect(transfer.rangeHeader).to.equal('bytes=0-0');
                await expectTransferStopped(transfer);
            });
        });

        async function startServer(bodySize, status = 200) {
            const source = patternBytes(0, CHUNK_SIZE + PATTERN_PERIOD);
            const transfer = {bytesWritten: 0, reachedEnd: false, requestCount: 0};
            let resolveClosed;
            transfer.closed = new Promise((resolve) => {
                resolveClosed = resolve;
            });

            server = http.createServer((request, response) => {
                transfer.requestCount++;
                transfer.rangeHeader = request.headers.range;
                response.on('close', resolveClosed);
                response.writeHead(status, {'content-type': 'application/octet-stream'});
                writeChunks();

                function writeChunks() {
                    while (transfer.bytesWritten < bodySize) {
                        if (response.destroyed) {
                            return;
                        }
                        const size = Math.min(CHUNK_SIZE, bodySize - transfer.bytesWritten);
                        const offset = transfer.bytesWritten % PATTERN_PERIOD;
                        const drained = response.write(source.subarray(offset, offset + size));
                        transfer.bytesWritten += size;
                        if (!drained) {
                            response.once('drain', writeChunks);
                            return;
                        }
                    }
                    transfer.reachedEnd = true;
                    response.end();
                }
            });
            await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
            transfer.url = `http://127.0.0.1:${server.address().port}/image.jpg`;
            return transfer;
        }

        function patternBytes(offset, length) {
            const bytes = Buffer.alloc(length);
            for (let i = 0; i < length; i++) {
                bytes[i] = (offset + i) % PATTERN_PERIOD;
            }
            return bytes;
        }

        async function expectTransferStopped(transfer) {
            await transfer.closed;
            expect(transfer.reachedEnd).to.equal(false);
            expect(transfer.bytesWritten).to.be.below(SAFETY_CAP);
        }
    });

    describe('loadFile with a local file', () => {
        const FILE_SIZE = 32;

        let originalRequire;
        let directory;
        let filename;
        let fileBytes;

        beforeEach(() => {
            originalRequire = global.__non_webpack_require__;
            global.__non_webpack_require__ = createRequire(import.meta.url);
            directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-'));
            filename = path.join(directory, 'image.jpg');
            fileBytes = Buffer.from(Array.from({length: FILE_SIZE}, (_, index) => index));
            fs.writeFileSync(filename, fileBytes);
        });

        afterEach(() => {
            global.__non_webpack_require__ = originalRequire;
            fs.rmSync(directory, {recursive: true, force: true});
        });

        it('should read the first bytes up to a fractional length rounded down', async () => {
            const buffer = await loadFile(filename, {length: 10.7});

            expect(buffer.equals(fileBytes.subarray(0, 10))).to.equal(true);
        });

        it('should read nothing for a length of 0', async () => {
            const buffer = await loadFile(filename, {length: 0});

            expect(buffer.length).to.equal(0);
        });

        for (const [description, options] of [
            ['an undefined length', {length: undefined}],
            ['a null length', {length: null}],
            ['no options', undefined]
        ]) {
            it(`should read the whole file for ${description}`, async () => {
                const buffer = await loadFile(filename, options);

                expect(buffer.equals(fileBytes)).to.equal(true);
            });
        }
    });

    describe('loadFile with a data URI', () => {
        it('should resolve with the decoded bytes', async () => {
            const buffer = await loadFile('data:,abc');

            expect(Array.from(new Uint8Array(buffer))).to.deep.equal([0x61, 0x62, 0x63]);
        });

        it('should reject instead of throwing when the data URI cannot be decoded', async () => {
            let promise;
            expect(() => {
                promise = loadFile('data:image/jpeg;base64,!!!!');
            }).to.not.throw();

            let error;
            try {
                await promise;
            } catch (rejection) {
                error = rejection;
            }
            expect(error).to.have.property('name', 'InvalidCharacterError');
        });

        it('should resolve a URL-encoded payload that is not valid UTF-8 with its raw bytes', async () => {
            const buffer = await loadFile('data:image/jpeg,%FF%D8%FF%E1');

            expect(Array.from(new Uint8Array(buffer))).to.deep.equal([0xff, 0xd8, 0xff, 0xe1]);
        });

        it('should resolve a percent-encoded base64 payload with its decoded bytes', async () => {
            const buffer = await loadFile('data:image/png;base64,iVBORw0KGgo%3D');

            expect(Array.from(new Uint8Array(buffer))).to.deep.equal([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        });
    });

    describe('loadFileObject', () => {
        let restoreGlobals;
        let readerCalls;
        let sliceCalls;
        let file;

        beforeEach(() => {
            ({readerCalls, restoreGlobals} = stubFileReader());
            ({file, sliceCalls} = createStubFile());
        });

        afterEach(() => {
            restoreGlobals();
        });

        it('should read a slice up to a fractional length rounded down', async () => {
            const buffer = await loadFileObject(file, {length: 10.7});

            expect(sliceCalls).to.deep.equal([[0, 10]]);
            expect(readerCalls).to.deep.equal([file.sliceResult]);
            expect(buffer.byteLength).to.equal(10);
        });
    });

    describe('an invalid length', () => {
        const INVALID_LENGTH_MESSAGE = 'The length option must be a finite non-negative number or "auto".';

        let originalFetch;
        let originalRequire;

        beforeEach(() => {
            originalFetch = global.fetch;
            originalRequire = global.__non_webpack_require__;
        });

        afterEach(() => {
            global.fetch = originalFetch;
            global.__non_webpack_require__ = originalRequire;
        });

        for (const [description, length] of [
            ['a numeric string', '1024'],
            ['-1', -1],
            ['-0.5', -0.5],
            ['NaN', NaN],
            ['Infinity', Infinity],
            ['-Infinity', -Infinity],
            ['a boolean', true],
            ['an object', {}]
        ]) {
            it(`should reject a local file read for ${description} without opening the file`, async () => {
                const openCalls = [];
                global.__non_webpack_require__ = (moduleName) => {
                    if (moduleName === 'fs') {
                        return {
                            open(filename, callback) {
                                openCalls.push(filename);
                                callback(new Error('open called'));
                            }
                        };
                    }
                    return undefined;
                };

                const promise = loadFile('/some/local/path.jpg', {length});

                await expectInvalidLengthRejection(promise);
                expect(openCalls).to.deep.equal([]);
            });
        }

        it('should reject a fetch URL without fetching', async () => {
            const fetchCalls = [];
            global.fetch = (url) => {
                fetchCalls.push(url);
                return Promise.reject(new Error('fetch called'));
            };

            const promise = loadFile('http://example.invalid/image.jpg', {length: 'abc'});

            await expectInvalidLengthRejection(promise);
            expect(fetchCalls).to.deep.equal([]);
        });

        it('should reject a Node http URL without requesting it', async () => {
            const getCalls = [];
            delete global.fetch;
            global.__non_webpack_require__ = (moduleName) => {
                if (/^https?$/.test(moduleName)) {
                    return {
                        get(url) {
                            getCalls.push(url);
                            throw new Error('http.get called');
                        }
                    };
                }
                return undefined;
            };

            const promise = loadFile('http://example.invalid/image.jpg', {length: -1});

            await expectInvalidLengthRejection(promise);
            expect(getCalls).to.deep.equal([]);
        });

        it('should reject a data URI', async () => {
            const promise = loadFile('data:image/jpeg;base64,/9j/', {length: -1});

            await expectInvalidLengthRejection(promise);
        });

        it('should reject a File object without reading it', async () => {
            const {readerCalls, restoreGlobals} = stubFileReader();
            const {file, sliceCalls} = createStubFile();
            try {
                const promise = loadFileObject(file, {length: NaN});

                await expectInvalidLengthRejection(promise);
                expect(readerCalls).to.deep.equal([]);
                expect(sliceCalls).to.deep.equal([]);
            } finally {
                restoreGlobals();
            }
        });

        async function expectInvalidLengthRejection(promise) {
            let error;
            try {
                await promise;
            } catch (e) {
                error = e;
            }

            expect(error).to.be.an.instanceOf(Error);
            expect(error.message).to.equal(INVALID_LENGTH_MESSAGE);
        }
    });

    function stubFileReader() {
        const readerCalls = [];
        class StubFileReader {
            readAsArrayBuffer(blob) {
                readerCalls.push(blob);
                setTimeout(() => this.onload({target: {result: blob.buffer || new ArrayBuffer(0)}}), 0);
            }
        }
        const restoreGlobals = swapProperties(globalThis, {FileReader: StubFileReader});
        return {readerCalls, restoreGlobals};
    }

    function createStubFile() {
        const sliceCalls = [];
        const file = {
            size: 32,
            sliceResult: undefined,
            slice(start, end) {
                sliceCalls.push([start, end]);
                file.sliceResult = {buffer: new ArrayBuffer(end - start)};
                return file.sliceResult;
            }
        };
        return {file, sliceCalls};
    }
});
