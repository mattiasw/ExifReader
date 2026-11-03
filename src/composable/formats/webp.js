/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Webp from '../../image-header-webp.js';
import Vp8xTags from '../../vp8x-tags.js';
import {parsedTags} from '../group-helpers.js';
import {FORMAT_BRAND} from '../brand.js';

export const webpHeader = {
    fileType: {value: 'webp', description: 'WebP'},
    detect: (dataView) => Webp.isWebpFile(dataView),
    find: (dataView, ranges) => Webp.findOffsets(dataView, ranges),
};

export const riff = {
    key: 'riff',
    consumes: ['riff'],
    emits: [],
    read: (block, ctx) => parsedTags('riff', Vp8xTags.read(ctx.dataView, block.dataOffset), ctx),
    merge: () => ({slot: 'riff', mode: 'merge'}),
};

export const webp = {
    header: webpHeader,
    readers: [riff],
    brand: FORMAT_BRAND,
};
