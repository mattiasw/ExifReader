/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import MpfTags from '../../mpf-tags.js';
import {parsedTags} from '../group-helpers.js';
import {GROUP_BRAND} from '../brand.js';

export const mpf = {
    key: 'mpf',
    consumes: ['mpf'],
    emits: [],
    descriptors: [],
    read: (block, ctx) => parsedTags('mpf', MpfTags.read(
        ctx.dataView,
        block.dataOffset,
        ctx.options.includeUnknown,
        ctx.options.computed,
        ctx.tagFilter,
        ctx.getValueBudget(),
        ctx.getBase64Image
    ), ctx),
    merge: () => ({slot: 'mpf', mode: 'assign'}),
    brand: GROUP_BRAND,
};
