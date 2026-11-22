/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {filterTagsForParse} from '../tag-filter.js';

const DECODER_ORDER = ['canon', 'pentax'];

export function parsedTags(groupKey, readTags, ctx) {
    return {tags: filterTagsForParse(groupKey, readTags, ctx.tagFilter)};
}

export function getBlockDataView(block, ctx) {
    if (block.getDataView) {
        return block.getDataView();
    }
    return block.dataView || ctx.dataView;
}

export function getBrobDataView(dataView, brobBlock) {
    // The box length is untrusted, so bound the view by the bytes present. The
    // JXL header parser never reports a dataOffset past the end of the view.
    const length = Math.max(0, Math.min(brobBlock.length, dataView.byteLength - brobBlock.dataOffset));
    return new DataView(dataView.buffer, dataView.byteOffset + brobBlock.dataOffset, length);
}

/**
 * @param {DataView|undefined} dataView The input.
 * @param {number} perInputSize What each byte of input allows.
 * @param {number} allowance What any input allows.
 * @returns {number} `perInputSize` times the input's byte length plus
 *     `allowance`, where an absent view or a non-number byte length counts as 0.
 */
export function getInputSizeBound(dataView, perInputSize, allowance) {
    const byteLength = dataView !== undefined && typeof dataView.byteLength === 'number' ? dataView.byteLength : 0;
    return perInputSize * byteLength + allowance;
}

export function getEmbeddableMergeDescriptor(block, slot, carriedSlot) {
    if (block.carried !== undefined) {
        return {slot: carriedSlot, mode: block.carried === 'main' ? 'assign' : 'merge'};
    }
    return {slot, mode: block.origin !== undefined ? 'merge' : 'assign'};
}

export function isPngTextChunkBlock(block) {
    return block.text !== undefined;
}

/**
 * Merges the engine groups consuming maker notes into one with the union of
 * their decoders, since two groups reading the same maker note would read it
 * twice.
 *
 * @param {Array<object>} groups The engine groups, each listed once.
 * @returns {Array<object>} The same array when fewer than two groups consume
 *     maker notes, otherwise the other groups in their order followed by the
 *     merged group, which has the first maker note group's key and `merge`.
 */
export function mergeMakerNoteGroups(groups) {
    const makerNoteGroups = groups.filter(consumesMakerNote);
    if (makerNoteGroups.length < 2) {
        return groups;
    }

    let decoders = [];
    for (let i = 0; i < makerNoteGroups.length; i++) {
        decoders = decoders.concat(makerNoteGroups[i].decoders);
    }
    decoders = decoders
        .filter((decoder, index) => decoders.indexOf(decoder) === index)
        .sort((a, b) => DECODER_ORDER.indexOf(a.name) - DECODER_ORDER.indexOf(b.name));

    const merged = {
        key: makerNoteGroups[0].key,
        consumes: ['makerNote'],
        emits: [],
        decoders,
        read: (block, ctx) => readMakerNoteWithDecoders(block, ctx, decoders),
        merge: makerNoteGroups[0].merge,
        fromExif: getMakerNoteBlockFromExif,
    };
    return groups.filter((group) => !consumesMakerNote(group)).concat([merged]);
}

function consumesMakerNote(group) {
    return group.consumes.indexOf('makerNote') !== -1;
}

/**
 * Reads a maker note block with the first decoder that recognizes it. The
 * decoders filter their own tags.
 *
 * @param {object} block A makerNote block.
 * @param {object} ctx The engine context.
 * @param {Array<{name: string, matches: function, read: function}>} decoders
 *     In the order they are tried.
 * @returns {{tags: object}|undefined} Undefined when no decoder matches.
 */
export function readMakerNoteWithDecoders(block, ctx, decoders) {
    for (let i = 0; i < decoders.length; i++) {
        if (decoders[i].matches(block)) {
            return {tags: decoders[i].read(block, ctx)};
        }
    }
    return undefined;
}

/**
 * Builds the makerNote block an Exif block carries.
 *
 * @param {Object<string, object>} parsed The Exif block's filtered tags.
 * @param {object} exif The Exif block's facts: `view`, `tiffHeaderOffset`,
 *     `byteOrder`, `makerNoteOffset` and `carried`.
 * @returns {(object|false|undefined)} The makerNote block, or a falsy value
 *     when there is no MakerNote tag or no maker note offset.
 */
export function getMakerNoteBlockFromExif(parsed, exif) {
    return parsed['MakerNote'] && exif.makerNoteOffset !== undefined && {
        kind: 'makerNote',
        tiffView: exif.view,
        tiffHeaderOffset: exif.tiffHeaderOffset,
        makerNoteOffset: exif.makerNoteOffset,
        byteOrder: exif.byteOrder,
        make: parsed['Make'] && parsed['Make'].value,
        bytes: parsed['MakerNote'].value,
        carried: exif.carried,
    };
}
