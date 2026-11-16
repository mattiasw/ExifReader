/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils.js';
import {decompression} from '../../src/decompression.js';
import {COMPRESSION_METHOD_DEFLATE} from '../../src/utils.js';

describe('decompression', () => {
    describe('createPooledDecompress', () => {
        it('should pass the decompression config to every call', async () => {
            const seen = [];
            const decompress = decompression.createPooledDecompress({deflate: (bytes) => {
                seen.push(String.fromCharCode(...bytes));
                return new Uint8Array([0x61 + seen.length - 1]);
            }});

            const results = await Promise.all([
                decompress(getDataView('x'), COMPRESSION_METHOD_DEFLATE, 'latin1', 'string'),
                decompress(getDataView('y'), COMPRESSION_METHOD_DEFLATE, 'latin1', 'string'),
            ]);

            expect(seen).to.deep.equal(['x', 'y']);
            expect(results).to.deep.equal(['a', 'b']);
        });

        it('should keep at most 4 calls in flight and start a queued one when one settles', async () => {
            const pending = [];
            const decompress = decompression.createPooledDecompress({deflate: getPendingDeflate(pending)});

            const results = [];
            for (let i = 0; i < 6; i++) {
                results.push(decompress(getDataView('x'), COMPRESSION_METHOD_DEFLATE, 'latin1', 'string'));
            }
            await flushPromises();
            expect(pending.length).to.equal(4);

            pending.shift()();
            await flushPromises();
            expect(pending.length).to.equal(4);

            pending.splice(0).forEach((finish) => finish());
            await flushPromises();
            expect(pending.length).to.equal(1);

            pending.shift()();
            expect(await Promise.all(results)).to.deep.equal(['x', 'x', 'x', 'x', 'x', 'x']);
        });

        it('should free the slot of a call that throws synchronously and start the next queued call', async () => {
            const pending = [];
            let throwOnRead = false;
            const decompress = decompression.createPooledDecompress({
                deflate: getPendingDeflate(pending),
                get maxDecompressedSize() {
                    if (throwOnRead) {
                        throw new Error('limit read failed');
                    }
                    return undefined;
                },
            });

            const first = [];
            for (let i = 0; i < 3; i++) {
                first.push(decompress(getDataView('x'), COMPRESSION_METHOD_DEFLATE, 'latin1', 'string'));
            }
            await flushPromises();
            throwOnRead = true;
            const throwing = decompress(getDataView('x'), COMPRESSION_METHOD_DEFLATE, 'latin1', 'string');
            const throwingError = getRejection(throwing);
            throwOnRead = false;
            const queued = decompress(getDataView('y'), COMPRESSION_METHOD_DEFLATE, 'latin1', 'string');
            await flushPromises();

            expect((await throwingError).message).to.equal('limit read failed');
            expect(pending.length).to.equal(4);
            pending.splice(0).forEach((finish) => finish());
            expect(await Promise.all(first.concat(queued))).to.deep.equal(['x', 'x', 'x', 'y']);
        });

        it('should give each call its own pool', async () => {
            const pending = [];
            const config = {deflate: getPendingDeflate(pending)};
            const firstDecompress = decompression.createPooledDecompress(config);
            const secondDecompress = decompression.createPooledDecompress(config);

            for (let i = 0; i < 4; i++) {
                firstDecompress(getDataView('x'), COMPRESSION_METHOD_DEFLATE, 'latin1', 'string');
            }
            secondDecompress(getDataView('y'), COMPRESSION_METHOD_DEFLATE, 'latin1', 'string');
            await flushPromises();

            expect(pending.length).to.equal(5);
            pending.splice(0).forEach((finish) => finish());
        });
    });
});

// A custom deflate that returns its input once the test calls the finish
// function it queues.
function getPendingDeflate(pending) {
    return (bytes) => new Promise((resolve) => {
        const copy = bytes.slice();
        pending.push(() => resolve(copy));
    });
}

function getRejection(promise) {
    return promise.then(() => {
        throw new Error('Expected a rejection.');
    }, (error) => error);
}

function flushPromises() {
    return new Promise(setImmediate);
}
