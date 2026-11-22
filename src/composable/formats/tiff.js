/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Tiff from '../../image-header-tiff.js';
import {FORMAT_BRAND} from '../brand.js';

export const tiffHeader = {
    fileType: {value: 'tiff', description: 'TIFF'},
    detect: (dataView) => Tiff.isTiffFile(dataView),
    find: () => Tiff.findTiffOffsets(),
};

export const tiff = {
    header: tiffHeader,
    readers: [],
    brand: FORMAT_BRAND,
};
