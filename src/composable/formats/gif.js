/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Gif from '../../image-header-gif.js';
import GifFileTags from '../../gif-file-tags.js';
import {parsedTags} from '../group-helpers.js';
import {FORMAT_BRAND} from '../brand.js';

export const gifHeader = {
    fileType: {value: 'gif', description: 'GIF'},
    detect: (dataView) => Gif.isGifFile(dataView),
    find: (dataView, ranges) => Gif.findOffsets(dataView, ranges),
};

export const gifReader = {
    key: 'gif',
    consumes: ['gif'],
    emits: [],
    read: (block, ctx) => parsedTags('gif', GifFileTags.read(ctx.dataView, block.dataOffset), ctx),
    merge: () => ({slot: 'gif', mode: 'merge'}),
};

export const gif = {
    header: gifHeader,
    readers: [gifReader],
    brand: FORMAT_BRAND,
};
