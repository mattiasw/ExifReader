/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringFromDataView} from './utils.js';

export default {
    isGifFile,
    findOffsets
};

const GIF_SIGNATURE_SIZE = 6;
const GIF_SIGNATURES = ['GIF87a', 'GIF89a'];

function isGifFile(dataView) {
    return !!dataView && GIF_SIGNATURES.includes(getStringFromDataView(dataView, 0, GIF_SIGNATURE_SIZE));
}

function findOffsets() {
    return {
        gifHeaderOffset: 0
    };
}
