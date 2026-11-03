/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getDataView, swapProperties} from '../test-utils.js';
import {createContext} from '../../../src/engine.js';
import {createTagFilter} from '../../../src/tag-filter.js';

/**
 * An engine context for the composable readers, with nothing composed unless
 * the test says so.
 */
export function getContext({dataView = getDataView('\x00'.repeat(16)), options = {}, tagFilter = createTagFilter(), decompressConfig = undefined, composed = {}, getBase64Image = undefined, getDomParser = undefined} = {}) {
    return createContext({
        dataView,
        options,
        tagFilter,
        decompressConfig,
        getBase64Image,
        getDomParser,
        composed: {formats: composed.formats || {}, groups: composed.groups || {}, kinds: composed.kinds || {}},
    });
}

/**
 * Replaces `target[name]` with a function that records its arguments and
 * returns `result`, or what `result` returns when it is a function.
 *
 * @returns {{calls: Array<Array>, restore: function}}
 */
export function recordCalls(target, name, result) {
    const calls = [];
    const restore = swapProperties(target, {
        [name]: (...args) => {
            calls.push(args);
            return typeof result === 'function' ? result(...args) : result;
        },
    });
    return {calls, restore};
}
