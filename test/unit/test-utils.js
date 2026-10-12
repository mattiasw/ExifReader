/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';

export {
    getArrayBuffer,
    getDataView,
    concatDataViews,
    getByteStringFromNumber,
    getConsoleWarnSpy,
    swapProperties,
    LINEAR_TIME_TIMEOUT_MS,
    expectTimeRatioBelow,
    expectAsyncTimeRatioBelow
};

// Per-test timeout of a linear-time guard: only a regression far slower at full size reaches it.
const LINEAR_TIME_TIMEOUT_MS = 20000;
const MIN_TIMED_RUN_MS = 50;

function getArrayBuffer(data) {
    return Buffer.from(Array.from(data).map((character) => character.charCodeAt(0)));
}

/**
 * Converts a string of data into a DataView.
 *
 * @param {string} data - The string of data to convert.
 * @returns {DataView} The resulting DataView.
 */
function getDataView(data) {
    // Bytes in data are not always ASCII characters so TextEncoder sometimes encodes them as two bytes which we don't want.
    const dataView = new DataView(new ArrayBuffer(data.length));
    for (let i = 0; i < data.length; i++) {
        dataView.setUint8(i, data.charCodeAt(i));
    }
    return dataView;
}

function concatDataViews(dataView0, dataView1) {
    const data = new Uint8Array(dataView0.byteLength + dataView1.byteLength);
    data.set(new Uint8Array(dataView0.buffer), 0);
    data.set(new Uint8Array(dataView1.buffer), dataView0.byteLength);
    return new DataView(data.buffer);
}

/**
 * Converts a number into a byte string of a specified length.
 *
 * @param {number} number - The number to convert.
 * @param {number} numBytes - The desired length of the byte string.
 * @returns {string} The resulting byte string.
 */
function getByteStringFromNumber(number, numBytes) {
    const bytes = [];
    for (let i = 0; i < numBytes; i++) {
        const rest = number % 256;
        bytes.push(String.fromCharCode(rest));
        number = (number - rest) / 256;
    }
    return bytes.reverse().join('');
}

function getConsoleWarnSpy() {
    /* eslint-disable no-console */
    const originalConsoleWarn = console.warn;

    const warnSpy = function () {
        warnSpy.hasWarned = true;
        warnSpy.callCount++;
    };
    warnSpy.hasWarned = false;
    warnSpy.callCount = 0;
    warnSpy.reset = function () {
        console.warn = originalConsoleWarn;
    };

    console.warn = warnSpy;

    return warnSpy;
    /* eslint-enable no-console */
}

/**
 * Temporarily overwrites properties on a shared (module-cached) object, e.g.
 * Constants or TagNames. Every module that imported the object sees the
 * swapped values because they share the same instance.
 *
 * @param {Object} target - The object to modify in place.
 * @param {Object} replacement - The properties to set on the target.
 * @returns {Function} A restore function that undoes the swap.
 */
function swapProperties(target, replacement) {
    const saved = new Map();
    const added = [];
    for (const key of Object.keys(replacement)) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
            saved.set(key, target[key]);
        } else {
            added.push(key);
        }
        target[key] = replacement[key];
    }
    return function restore() {
        for (const [key, value] of saved) {
            target[key] = value;
        }
        for (const key of added) {
            delete target[key];
        }
    };
}

/**
 * Asserts that run() takes less than maxRatio times as long as baseline(),
 * timed in the same process so that machine load and coverage slow both
 * alike. The baseline runs twice and the faster run counts, so the first run
 * warms the JIT. A run under 50 ms is not checked, because timer and GC noise
 * dominate there. The convention is a baseline at 1/8 of the run's input size
 * with maxRatio 24, three times linear growth.
 *
 * @param {Function} baseline - The work under test on a smaller input.
 * @param {Function} run - The work under test on the full-size input.
 * @param {number} maxRatio - The bound on run time over baseline time.
 * @returns {*} The result of run().
 */
function expectTimeRatioBelow(baseline, run, maxRatio) {
    const baselineMs = Math.min(getRunTime(baseline), getRunTime(baseline));
    const start = performance.now();
    const result = run();
    expectRatioBelow(performance.now() - start, baselineMs, maxRatio);
    return result;
}

function getRunTime(work) {
    const start = performance.now();
    work();
    return performance.now() - start;
}

/**
 * The same check as expectTimeRatioBelow for closures that return promises.
 *
 * @param {Function} baseline - Returns a promise for the work on a smaller input.
 * @param {Function} run - Returns a promise for the work on the full-size input.
 * @param {number} maxRatio - The bound on run time over baseline time.
 * @returns {Promise<*>} The result run() resolves to.
 */
async function expectAsyncTimeRatioBelow(baseline, run, maxRatio) {
    const baselineMs = Math.min(await getAsyncRunTime(baseline), await getAsyncRunTime(baseline));
    const start = performance.now();
    const result = await run();
    expectRatioBelow(performance.now() - start, baselineMs, maxRatio);
    return result;
}

async function getAsyncRunTime(work) {
    const start = performance.now();
    await work();
    return performance.now() - start;
}

function expectRatioBelow(runMs, baselineMs, maxRatio) {
    if (runMs < MIN_TIMED_RUN_MS) {
        return;
    }
    expect(runMs, `run ${runMs.toFixed(1)} ms, baseline ${baselineMs.toFixed(1)} ms`).to.be.below(maxRatio * baselineMs);
}
