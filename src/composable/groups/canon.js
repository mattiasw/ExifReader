/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import CanonTags from '../../canon-tags.js';
import {getEmbeddableMergeDescriptor, readMakerNoteWithDecoders, MAKER_NOTE_DESCRIPTORS} from '../group-helpers.js';

export const canonDecoder = {
    name: 'canon',
    matches: (block) => Array.isArray(block.make) && block.make[0] === 'Canon',
    read: (block, ctx) => CanonTags.read(block.tiffView, block.tiffHeaderOffset, block.makerNoteOffset, block.byteOrder, ctx.options.includeUnknown, ctx.options.computed, ctx.tagFilter, ctx.getValueBudget()),
};

export const canon = {
    key: 'makerNotes',
    consumes: ['makerNote'],
    emits: [],
    descriptors: MAKER_NOTE_DESCRIPTORS,
    decoders: [canonDecoder],
    read: (block, ctx) => readMakerNoteWithDecoders(block, ctx, canon.decoders),
    merge: (block) => getEmbeddableMergeDescriptor(block, 'makerNotes', 'carriedMakerNotes'),
};
