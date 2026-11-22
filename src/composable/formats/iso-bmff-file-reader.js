/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import IsoBmffFileTags from '../../iso-bmff-file-tags.js';
import {parsedTags} from '../group-helpers.js';

export const isoBmffFile = {
    key: 'file',
    consumes: ['isoBmffFile'],
    emits: [],
    read: (block, ctx) => parsedTags('file', IsoBmffFileTags.read(ctx.dataView, block.imageDimensionsOffset, block.pixelInformationOffset), ctx),
    merge: () => ({slot: 'isoBmffFile', mode: 'assign'}),
};
