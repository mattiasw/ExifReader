/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringValueFromArray} from '../../utils.js';
import PentaxTags from '../../pentax-tags.js';
import {getEmbeddableMergeDescriptor, readMakerNoteWithDecoders} from '../group-helpers.js';
import {getSharedValueBudget} from '../value-budget.js';
import {GROUP_BRAND} from '../brand.js';

export const pentaxDecoder = {
    name: 'pentax',
    matches: (block) => hasPentaxType1Prefix(block.bytes),
    read: (block, ctx) => PentaxTags.read(block.tiffView, block.tiffHeaderOffset, block.makerNoteOffset, ctx.options.includeUnknown, ctx.options.computed, ctx.tagFilter, getSharedValueBudget(ctx)),
};

export const pentax = {
    key: 'makerNotes',
    consumes: ['makerNote'],
    emits: [],
    decoders: [pentaxDecoder],
    read: (block, ctx) => readMakerNoteWithDecoders(block, ctx, pentax.decoders),
    merge: (block) => getEmbeddableMergeDescriptor(block, 'makerNotes', 'carriedMakerNotes'),
    brand: GROUP_BRAND,
};

function hasPentaxType1Prefix(makerNoteBytes) {
    const PENTAX_ID_STRING = 'PENTAX ';
    return Array.isArray(makerNoteBytes)
        && makerNoteBytes.length > PENTAX_ID_STRING.length
        && getStringValueFromArray(makerNoteBytes.slice(0, PENTAX_ID_STRING.length)) === PENTAX_ID_STRING;
}
