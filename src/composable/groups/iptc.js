/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign} from '../../utils.js';
import IptcTags from '../../iptc-tags.js';
import IptcTagNames from '../../iptc-tag-names.js';
import {addDecompressedIptcAllowance} from '../../tags-helpers.js';
import {parsedTags, getBlockDataView, getEmbeddableMergeDescriptor, isPngTextChunkBlock} from '../group-helpers.js';
import {GROUP_BRAND} from '../brand.js';

export const iptc = {
    key: 'iptc',
    consumes: ['iptc'],
    emits: [],
    read: readIptcBlock,
    merge: (block) => getEmbeddableMergeDescriptor(block, 'iptc', 'carriedIptc'),
    suppressions: [{kind: 'iptc', isSuppressed: isMainIptcSuppressed}],
    brand: GROUP_BRAND,
};
// A composed reader gets a repeatable dataset as an array; the default entry keeps iptc.
export const composedIptc = /* #__PURE__ */ objectAssign({}, iptc, {read: readIptcBlockAsArrays});

// A carried IPTC-NAA draws no allowance; a decompressed raw profile does.
function readIptcBlock(block, ctx) {
    const view = getBlockDataView(block, ctx);
    const valueBudget = ctx.getValueBudget();
    if (block.origin === 'rawProfile' && block.decompressed) {
        addDecompressedIptcAllowance(valueBudget, view.byteLength);
    }
    return parsedTags('iptc', IptcTags.read(view, block.dataOffset, ctx.options.includeUnknown, ctx.tagFilter, valueBudget), ctx);
}

function readIptcBlockAsArrays(block, ctx) {
    const parsed = readIptcBlock(block, ctx);
    withRepeatableAsArrays(parsed.tags, IptcTagNames['iptc']);
    return parsed;
}

/**
 * Turns each repeatable dataset that was read once into an array of its one
 * tag, in place.
 *
 * @param {Object} tags The read tags, keyed by tag name.
 * @param {Object<number, (string|object)>} tagNames The dictionary they were
 *     read with, keyed by dataset id.
 * @returns {Object} The same tags.
 */
export function withRepeatableAsArrays(tags, tagNames) {
    Object.keys(tags).forEach((name) => {
        const tag = tags[name];
        if (!Array.isArray(tag) && tagNames[tag.id] && tagNames[tag.id].repeatable) {
            tags[name] = [tag];
        }
    });
    return tags;
}

// The main block's IPTC-NAA gives way to an IPTC segment; a brob's never does.
// The raw-profile rule belongs to the PNG text reader.
function isMainIptcSuppressed(block, finderBlocks) {
    return block.carried === 'main'
        && finderBlocks.some((finderBlock) => finderBlock.kind === 'iptc' && !isPngTextChunkBlock(finderBlock));
}
