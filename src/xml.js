/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringFromDataView} from './utils.js';

export default {
    isXMLFile,
    findOffsets
};

const XML_MARKER_OFFSET = 0;
const XML_MARKER = '<?xpacket begin';

function isXMLFile(dataView) {
    return !!dataView && getStringFromDataView(dataView, XML_MARKER_OFFSET, XML_MARKER.length) === XML_MARKER;
}

function findOffsets(dataView) {
    const xmpChunks = [];
    xmpChunks.push({dataOffset: XML_MARKER_OFFSET, length: dataView.byteLength});
    return {
        xmpChunks,
    };
}
