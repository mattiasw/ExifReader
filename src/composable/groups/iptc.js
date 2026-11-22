/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import IptcTags from '../../iptc-tags.js';
import IptcTagNames from '../../iptc-tag-names.js';
import {addDecompressedIptcAllowance} from '../../tags-helpers.js';
import {parsedTags, getBlockDataView, getEmbeddableMergeDescriptor, isPngTextChunkBlock} from '../group-helpers.js';
import {getSharedValueBudget} from '../value-budget.js';
import {GROUP_BRAND} from '../brand.js';

export const iptc = /* #__PURE__ */ createIptcGroup(readWithFullDictionary);
// A composed reader gets a repeatable dataset as an array; the default entry keeps iptc.
export const composedIptc = /* #__PURE__ */ createIptcGroup(readWithFullDictionaryAsArrays);

/**
 * An iptc group that reads its blocks' datasets with the given function.
 *
 * @param {function} readTags Called as IptcTags.read is, and returns the tags.
 * @returns {object} An engine group keyed iptc.
 */
export function createIptcGroup(readTags) {
    return {
        key: 'iptc',
        consumes: ['iptc'],
        emits: [],
        read: (block, ctx) => readIptcBlock(block, ctx, readTags),
        merge: getIptcMergeDescriptor,
        suppressions: [{kind: 'iptc', isSuppressed: isMainIptcSuppressed}],
        fromExif: getIptcBlockFromExif,
        brand: GROUP_BRAND,
    };
}

// Looked up at call time, so the default entry's reader can be swapped in tests.
function readWithFullDictionary(view, dataOffset, includeUnknown, tagFilter, valueBudget) {
    return IptcTags.read(view, dataOffset, includeUnknown, tagFilter, valueBudget);
}

function readWithFullDictionaryAsArrays(view, dataOffset, includeUnknown, tagFilter, valueBudget) {
    return withRepeatableAsArrays(IptcTags.read(view, dataOffset, includeUnknown, tagFilter, valueBudget), IptcTagNames['iptc']);
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

// A carried IPTC-NAA draws no allowance; a decompressed raw profile does.
function readIptcBlock(block, ctx, readTags) {
    const view = getBlockDataView(block, ctx);
    const valueBudget = getSharedValueBudget(ctx);
    if (block.origin === 'rawProfile' && block.decompressed) {
        addDecompressedIptcAllowance(valueBudget, view.byteLength);
    }
    return parsedTags('iptc', readTags(view, block.dataOffset, ctx.options.includeUnknown, ctx.tagFilter, valueBudget), ctx);
}

function getIptcMergeDescriptor(block) {
    return getEmbeddableMergeDescriptor(block, 'iptc', 'carriedIptc');
}

// The main block's IPTC-NAA gives way to an IPTC segment; a brob's never does.
// The raw-profile rule belongs to the PNG text reader.
function isMainIptcSuppressed(block, finderBlocks) {
    return block.carried === 'main'
        && finderBlocks.some((finderBlock) => finderBlock.kind === 'iptc' && !isPngTextChunkBlock(finderBlock));
}

function getIptcBlockFromExif(parsed, exif) {
    return parsed['IPTC-NAA'] && {kind: 'iptc', dataView: parsed['IPTC-NAA'].value, dataOffset: 0, carried: exif.carried};
}
