/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {fetchRange, nodeGetRange, HTTP_STATUS_RANGE_NOT_SATISFIABLE} from '../../src/file-loaders.js';

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
            global.__non_webpack_require__ = (moduleName) => {
                if (/^https?$/.test(moduleName)) {
                    return {
                        get(url, options, callback) {
                            setTimeout(() => callback(response), 0);
                            return {on: () => undefined};
                        }
                    };
                }
                return undefined;
            };
        }

        it('should resolve with status 416 so the adaptive loop can fall back instead of failing', async () => {
            let resumed = false;
            stubHttp({
                statusCode: HTTP_STATUS_RANGE_NOT_SATISFIABLE,
                statusMessage: 'Range Not Satisfiable',
                headers: {},
                on: () => undefined,
                resume: () => {
                    resumed = true;
                },
            });

            const result = await nodeGetRange('https://domain.com/image.jpg', {start: 100, end: 200});

            expect(result.status).to.equal(HTTP_STATUS_RANGE_NOT_SATISFIABLE);
            expect(result.buffer.length).to.equal(0);
            expect(resumed).to.equal(true);
        });

        it('should reject with an Error containing the status on other non-2xx responses', async () => {
            stubHttp({
                statusCode: 500,
                statusMessage: 'Server Error',
                headers: {},
                on: () => undefined,
                resume: () => undefined,
            });

            let error;
            try {
                await nodeGetRange('https://domain.com/image.jpg', {start: 100, end: 200});
            } catch (e) {
                error = e;
            }

            expect(error).to.be.an('error');
            expect(error.message).to.equal('Could not fetch file: 500 Server Error');
        });
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

        it('should reject with an Error containing the status on a 404 response', async () => {
            stubFetch({
                status: 404,
                statusText: 'Not Found',
                headers: {get: () => null},
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
            });

            let error;
            try {
                await fetchRange('https://domain.com/missing.jpg');
            } catch (e) {
                error = e;
            }

            expect(error).to.be.an('error');
            expect(error.message).to.contain('404');
            expect(error.message).to.contain('Not Found');
        });

        it('should reject on a 500 response, trimming an empty statusText', async () => {
            stubFetch({
                status: 500,
                statusText: '',
                headers: {get: () => null},
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
            });

            let error;
            try {
                await fetchRange('https://domain.com/image.jpg');
            } catch (e) {
                error = e;
            }

            expect(error).to.be.an('error');
            expect(error.message).to.equal('Could not fetch file: 500');
        });

        it('should resolve with status 416 so the adaptive loop can fall back', async () => {
            stubFetch({
                status: HTTP_STATUS_RANGE_NOT_SATISFIABLE,
                statusText: 'Range Not Satisfiable',
                headers: {get: () => null},
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
            });

            const result = await fetchRange('https://domain.com/image.jpg', {start: 100, end: 200});

            // 416 must resolve (not reject) and surface the status so the
            // adaptive loop's 416 handler can fall back to a full read. The
            // body is passed through as-is; the loop discards it.
            expect(result.status).to.equal(HTTP_STATUS_RANGE_NOT_SATISFIABLE);
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
    });
});
