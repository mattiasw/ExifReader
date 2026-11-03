/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import IptcTags from '../../iptc-tags.js';
import {IFD_TYPE_0TH} from '../../ifd-types.js';
import {addDecompressedIptcAllowance} from '../../tags-helpers.js';
import {parsedTags, getBlockDataView, getEmbeddableMergeDescriptor, isPngTextChunkBlock} from '../group-helpers.js';

export const iptc = {
    key: 'iptc',
    consumes: ['iptc'],
    emits: [],
    // IPTC-NAA.
    descriptors: [{ifd: IFD_TYPE_0TH, id: 0x83bb}],
    read: readIptcBlock,
    merge: (block) => getEmbeddableMergeDescriptor(block, 'iptc', 'carriedIptc'),
    suppressions: [{kind: 'iptc', isSuppressed: isMainIptcSuppressed}],
};

// A carried IPTC-NAA draws no allowance; a decompressed raw profile does.
function readIptcBlock(block, ctx) {
    const view = getBlockDataView(block, ctx);
    const valueBudget = ctx.getValueBudget();
    if (block.origin === 'rawProfile' && block.decompressed) {
        addDecompressedIptcAllowance(valueBudget, view.byteLength);
    }
    return parsedTags('iptc', IptcTags.read(view, block.dataOffset, ctx.options.includeUnknown, ctx.tagFilter, valueBudget), ctx);
}

// The main block's IPTC-NAA gives way to an IPTC segment; a brob's never does.
// The raw-profile rule belongs to the PNG text reader.
function isMainIptcSuppressed(block, finderBlocks) {
    return block.carried === 'main'
        && finderBlocks.some((finderBlock) => finderBlock.kind === 'iptc' && !isPngTextChunkBlock(finderBlock));
}
