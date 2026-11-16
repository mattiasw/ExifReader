/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Jxl from '../../image-header-jxl.js';
import JxlFileTags from '../../jxl-file-tags.js';
import {parsedTags} from '../group-helpers.js';
import {FORMAT_BRAND} from '../brand.js';
import {decompression} from '../../decompression.js';

export const jxlHeader = {
    fileType: {value: 'jxl', description: 'JPEG XL'},
    detect: (dataView) => Jxl.isJxlFile(dataView),
    find: (dataView, ranges) => Jxl.findJxlOffsets(dataView, ranges),
    decompression,
};

export const jxlFile = {
    key: 'file',
    consumes: ['jxlFile'],
    emits: [],
    read: (block, ctx) => parsedTags('file', JxlFileTags.read(ctx.dataView, block.codestreamOffset), ctx),
    merge: () => ({slot: 'jxlFile', mode: 'assign'}),
};

export const jxl = {
    header: jxlHeader,
    readers: [jxlFile],
    brand: FORMAT_BRAND,
};
