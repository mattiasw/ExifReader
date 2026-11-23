/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {UnsupportedFormatError} from './unsupported-format-error.js';

export default {
    parseAppMarkers
};

/**
 * Detects the image format and delegates to the matching finder.
 *
 * @param {DataView} dataView The data view to inspect.
 * @param {boolean=} includeRanges When true, the finder also records where
 *     each block's bytes sit in the file. The result then gains `ranges`, a
 *     list of `{block, start, end}` in file order, `truncated`, true when
 *     the finder never reached the end of the file's metadata, and, only from
 *     a finder that reports one, `resumeEnd`, how far the buffer must reach
 *     for the finder to read on.
 * @param {Array<{header: {fileType: {value: string, description: string}, detect: function, find: function}}>} formats
 *     The composed formats in detection order; the first whose `detect`
 *     matches runs its `find`.
 * @returns {{fileType: {value: string, description: string}, blocks: Array<Object>, ranges: (Array<Object>|undefined), truncated: (boolean|undefined), resumeEnd: (number|undefined)}}
 *     The blocks the finder found, each `{kind, ...payload}`.
 * @throws {UnsupportedFormatError} When the data view is not a recognized
 *     image format.
 */
function parseAppMarkers(dataView, includeRanges, formats) {
    const ranges = includeRanges ? [] : undefined;

    for (let i = 0; i < formats.length; i++) {
        const header = formats[i].header;
        if (header.detect(dataView)) {
            return finalize(header.find(dataView, ranges), header.fileType.value, header.fileType.description, ranges);
        }
    }

    throw new UnsupportedFormatError('Invalid image format');
}

function finalize(blocks, fileType, fileTypeDescription, ranges) {
    const result = {fileType: {value: fileType, description: fileTypeDescription}, blocks};
    if (ranges !== undefined) {
        result.ranges = ranges;
        // Surface the finder's .truncated array convention as a sibling
        // field so consumers don't depend on properties on the array.
        result.truncated = !!ranges.truncated;
        if (ranges.resumeEnd) {
            result.resumeEnd = ranges.resumeEnd;
        }
    }
    return result;
}
