/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Heic from '../../image-header-heic.js';
import {isoBmffFile} from './iso-bmff-file-reader.js';

export const heicHeader = {
    fileType: {value: 'heic', description: 'HEIC'},
    detect: (dataView) => Heic.isHeicFile(dataView),
    find: (dataView, ranges) => Heic.findHeicOffsets(dataView, ranges),
};

export const heic = {
    header: heicHeader,
    readers: [isoBmffFile],
};
