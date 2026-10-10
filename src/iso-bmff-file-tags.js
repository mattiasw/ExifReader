/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {hasBytes} from './image-header-iso-bmff-utils.js';

export default {
    read
};

const DIMENSIONS_SIZE = 8;
const HEIGHT_OFFSET = 4;

/**
 * Reads the image width and height of an ispe property.
 *
 * @param {DataView} dataView
 * @param {number} offset Offset of the ispe width field; the height follows it.
 * @returns {Object} The Image Width and Image Height tags, or no tags when
 *     the bytes are not there.
 */
function read(dataView, offset) {
    if (!hasBytes(dataView, offset, DIMENSIONS_SIZE)) {
        return {};
    }

    const width = dataView.getUint32(offset);
    const height = dataView.getUint32(offset + HEIGHT_OFFSET);

    return {
        'Image Width': {value: width, description: `${width}px`},
        'Image Height': {value: height, description: `${height}px`},
    };
}
