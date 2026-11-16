/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {decompress, withDecompressBudget} from './utils.js';

const MAX_DECOMPRESSIONS_IN_FLIGHT = 4;

export const decompression = {
    withDecompressBudget,
    createPooledDecompress,
};

/**
 * Makes a decompress function for one load whose calls share a pool of at
 * most MAX_DECOMPRESSIONS_IN_FLIGHT tasks.
 *
 * @param {object|undefined} decompressConfig Given to every call of decompress
 *     in utils.js, normally the load's config from withDecompressBudget.
 * @returns {function(DataView, (number|string), string, string): Promise}
 *     `(view, compressionMethod, encoding, returnType)`.
 */
function createPooledDecompress(decompressConfig) {
    const pool = createPool(MAX_DECOMPRESSIONS_IN_FLIGHT);
    return (view, compressionMethod, encoding, returnType) => pool.run(() => decompress(view, compressionMethod, encoding, returnType, decompressConfig));
}

// Starts a task when fewer than `limit` are running, else queues it until one
// settles. Promise is only referenced once a task is given, in async mode.
function createPool(limit) {
    const queue = [];
    let running = 0;

    return {
        run(task) {
            return new Promise((resolve, reject) => {
                queue.push({task, resolve, reject});
                startNext();
            });
        },
    };

    function startNext() {
        if (running >= limit || queue.length === 0) {
            return;
        }
        const {task, resolve, reject} = queue.shift();
        running++;
        // The wrapper turns a synchronous throw from a task into a rejection.
        new Promise((start) => start(task())).then((result) => {
            running--;
            startNext();
            resolve(result);
        }, (error) => {
            running--;
            startNext();
            reject(error);
        });
    }
}
