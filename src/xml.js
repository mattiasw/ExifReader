/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringFromDataView, pushRange} from './utils.js';

export default {
    isXMLFile,
    findOffsets
};

const XML_MARKER_OFFSET = 0;
const XML_MARKER = '<?xpacket begin';

// Closing markers for an XMP packet. `</x:xmpmeta>` covers XMP without an
// xpacket wrapper.
const XMP_END_PATTERNS = [
    '<?xpacket end=',
    '</x:xmpmeta>',
];

/**
 * Checks if the provided data view represents a standalone XMP file.
 *
 * @param {DataView} dataView The data view to check.
 * @returns {boolean} True if the data view starts with the XMP packet marker.
 */
function isXMLFile(dataView) {
    return !!dataView && getStringFromDataView(dataView, XML_MARKER_OFFSET, XML_MARKER.length) === XML_MARKER;
}

/**
 * Reports a standalone XMP file as one xmp block covering the whole buffer.
 *
 * @param {DataView} dataView The data view to find blocks in.
 * @param {Array<Object>=} ranges Optional out-array. When provided, receives
 *     one span covering the whole buffer, linked to the xmp block, and gets a
 *     `truncated` property set to true if no XMP closing marker is found.
 * @returns {Array<Object>} One xmp block with one chunk.
 */
function findOffsets(dataView, ranges) {
    const block = {kind: 'xmp', chunks: [{dataOffset: XML_MARKER_OFFSET, length: dataView.byteLength}]};
    pushRange(ranges, block, 0, dataView.byteLength);
    if (ranges) {
        ranges.truncated = !hasXmpClosingMarker(dataView);
    }
    return [block];
}

function hasXmpClosingMarker(dataView) {
    // XMP packets can have arbitrary trailing whitespace padding, so scan
    // the entire buffer rather than a fixed tail window.
    for (let i = 0; i < XMP_END_PATTERNS.length; i++) {
        if (containsAsciiString(dataView, XMP_END_PATTERNS[i])) {
            return true;
        }
    }
    return false;
}

function containsAsciiString(dataView, string) {
    for (let offset = 0; offset + string.length <= dataView.byteLength; offset++) {
        if (hasAsciiStringAt(dataView, offset, string)) {
            return true;
        }
    }
    return false;
}

function hasAsciiStringAt(dataView, offset, string) {
    for (let i = 0; i < string.length; i++) {
        if (dataView.getUint8(offset + i) !== string.charCodeAt(i)) {
            return false;
        }
    }
    return true;
}
