/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {isThenable} from '../../utils.js';
import IccTags from '../../icc-tags.js';
import {parsedTags, getEmbeddableMergeDescriptor} from '../group-helpers.js';
import {GROUP_BRAND} from '../brand.js';

export const icc = {
    key: 'icc',
    consumes: ['icc'],
    emits: [],
    read: readIccBlock,
    merge: (block) => getEmbeddableMergeDescriptor(block, 'icc', 'carriedIcc'),
    suppressions: [{kind: 'icc', isSuppressed: isCarriedIccSuppressed}],
    brand: GROUP_BRAND,
};

// A compressed iCCP gives a thenable in async mode, which defers the block.
function readIccBlock(block, ctx) {
    if (!hasIccData(block)) {
        return undefined;
    }
    const readTags = IccTags.read(block.dataView || ctx.dataView, block.chunks, ctx.options.async, ctx.decompressConfig);
    if (isThenable(readTags)) {
        return readTags.then((resolvedTags) => parsedTags('icc', resolvedTags, ctx));
    }
    return parsedTags('icc', readTags, ctx);
}

function isCarriedIccSuppressed(block, finderBlocks) {
    return block.carried !== undefined && finderBlocks.some((finderBlock) => finderBlock.kind === 'icc' && hasIccData(finderBlock));
}

function hasIccData(iccBlock) {
    return iccBlock !== undefined && iccBlock.chunks.length > 0;
}
