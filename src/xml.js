/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringFromDataView, pushMetadataBlock} from './utils.js';

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
 * Finds the XMP chunk offset for a standalone XMP file.
 *
 * @param {DataView} dataView The data view to find offsets in.
 * @param {Array<Object>=} metadataBlocks Optional out-array. When provided,
 *     receives one `xmp` block covering the whole buffer and gets a
 *     `truncated` property set to true if no XMP closing marker is found.
 * @returns {{xmpChunks: Array<{dataOffset: number, length: number}>}}
 */
function findOffsets(dataView, metadataBlocks) {
    const xmpChunks = [];
    xmpChunks.push({dataOffset: XML_MARKER_OFFSET, length: dataView.byteLength});
    pushMetadataBlock(metadataBlocks, 'xmp', 0, dataView.byteLength);
    if (metadataBlocks) {
        metadataBlocks.truncated = !hasXmpClosingMarker(dataView);
    }
    return {
        xmpChunks,
    };
}

function hasXmpClosingMarker(dataView) {
    // XMP packets can have arbitrary trailing whitespace padding, so scan
    // the entire buffer rather than a fixed tail window.
    const text = getStringFromDataView(dataView, 0, dataView.byteLength);
    for (let i = 0; i < XMP_END_PATTERNS.length; i++) {
        if (text.indexOf(XMP_END_PATTERNS[i]) !== -1) {
            return true;
        }
    }
    return false;
}
