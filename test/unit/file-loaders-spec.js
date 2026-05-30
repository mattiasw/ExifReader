/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {nodeGetRange, HTTP_STATUS_RANGE_NOT_SATISFIABLE} from '../../src/file-loaders';

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

        it('should reject on other non-2xx responses', (done) => {
            stubHttp({
                statusCode: 500,
                statusMessage: 'Server Error',
                headers: {},
                on: () => undefined,
                resume: () => undefined,
            });

            nodeGetRange('https://domain.com/image.jpg', {start: 100, end: 200}).catch(() => done());
        });
    });
});
