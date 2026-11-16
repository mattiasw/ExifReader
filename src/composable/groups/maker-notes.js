/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getEmbeddableMergeDescriptor, mergeMakerNoteGroups, readMakerNoteWithDecoders} from '../group-helpers.js';
import {canonDecoder} from './canon.js';
import {pentaxDecoder} from './pentax.js';
import {GROUP_BRAND} from '../brand.js';

// Canon is recognized by Make before Pentax by its type-1 prefix.
export const makerNotes = {
    key: 'makerNotes',
    consumes: ['makerNote'],
    emits: [],
    decoders: [canonDecoder, pentaxDecoder],
    read: (block, ctx) => readMakerNoteWithDecoders(block, ctx, makerNotes.decoders),
    merge: (block) => getEmbeddableMergeDescriptor(block, 'makerNotes', 'carriedMakerNotes'),
    combine: mergeMakerNoteGroups,
    brand: GROUP_BRAND,
};
