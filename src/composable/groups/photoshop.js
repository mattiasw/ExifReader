/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import PhotoshopTags from '../../photoshop-tags.js';
import {IFD_TYPE_0TH, IFD_TYPE_EXIF} from '../../ifd-types.js';
import {parsedTags, getEmbeddableMergeDescriptor} from '../group-helpers.js';
import {GROUP_BRAND} from '../brand.js';

export const photoshop = {
    key: 'photoshop',
    consumes: ['photoshop'],
    emits: [],
    // ImageSourceData and PhotoshopSettings.
    descriptors: [{ifd: IFD_TYPE_EXIF, id: 0x935c}, {ifd: IFD_TYPE_0TH, id: 0x8649}],
    read: (block, ctx) => parsedTags('photoshop', PhotoshopTags.read(block.value, ctx.options.includeUnknown, ctx.tagFilter), ctx),
    merge: (block) => getEmbeddableMergeDescriptor(block, 'photoshop', 'carriedPhotoshop'),
    brand: GROUP_BRAND,
};
