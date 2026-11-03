/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Avif from '../../image-header-avif.js';
import {isoBmffFile} from './iso-bmff-file-reader.js';

export const avifHeader = {
    fileType: {value: 'avif', description: 'AVIF'},
    detect: (dataView) => Avif.isAvifFile(dataView),
    find: (dataView, ranges) => Avif.findAvifOffsets(dataView, ranges),
};

export const avif = {
    header: avifHeader,
    readers: [isoBmffFile],
};
