/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringValueFromArray} from '../../utils.js';
import PentaxTags from '../../pentax-tags.js';
import {getEmbeddableMergeDescriptor, readMakerNoteWithDecoders, MAKER_NOTE_DESCRIPTORS} from '../group-helpers.js';

export const pentaxDecoder = {
    name: 'pentax',
    matches: (block) => hasPentaxType1Prefix(block.bytes),
    read: (block, ctx) => PentaxTags.read(block.tiffView, block.tiffHeaderOffset, block.makerNoteOffset, ctx.options.includeUnknown, ctx.options.computed, ctx.tagFilter, ctx.getValueBudget()),
};

export const pentax = {
    key: 'makerNotes',
    consumes: ['makerNote'],
    emits: [],
    descriptors: MAKER_NOTE_DESCRIPTORS,
    decoders: [pentaxDecoder],
    read: (block, ctx) => readMakerNoteWithDecoders(block, ctx, pentax.decoders),
    merge: (block) => getEmbeddableMergeDescriptor(block, 'makerNotes', 'carriedMakerNotes'),
};

function hasPentaxType1Prefix(makerNoteBytes) {
    const PENTAX_ID_STRING = 'PENTAX ';
    return Array.isArray(makerNoteBytes)
        && makerNoteBytes.length > PENTAX_ID_STRING.length
        && getStringValueFromArray(makerNoteBytes.slice(0, PENTAX_ID_STRING.length)) === PENTAX_ID_STRING;
}
