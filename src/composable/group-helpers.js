/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {filterTagsForParse} from '../tag-filter.js';
import {isThenable} from '../utils.js';

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
 * twice. The decoders without a built-in name come first, in the order of the
 * groups, then the built-in ones in `DECODER_ORDER`.
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

    let listedDecoders = [];
    for (let i = 0; i < makerNoteGroups.length; i++) {
        listedDecoders = listedDecoders.concat(makerNoteGroups[i].decoders);
    }
    const decoders = getDecodersInPrecedence(
        listedDecoders.filter((decoder, index) => listedDecoders.indexOf(decoder) === index)
    );

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

function getDecodersInPrecedence(decoders) {
    let ordered = decoders.filter((decoder) => DECODER_ORDER.indexOf(decoder.name) === -1);
    for (let i = 0; i < DECODER_ORDER.length; i++) {
        ordered = ordered.concat(decoders.filter((decoder) => decoder.name === DECODER_ORDER[i]));
    }
    return ordered;
}

/**
 * Reads a maker note block with the first decoder whose `matches` returns
 * true. The decoders filter their own tags.
 *
 * @param {object} block A makerNote block.
 * @param {object} ctx The engine context.
 * @param {Array<{matches: function({make, model, bytes}): boolean, read: function({tiffView, tiffHeaderOffset, makerNoteOffset, byteOrder, context}): (object|Promise<object>)}>} decoders
 *     In the order they are tried. `matches` gets the block's `bytes` as
 *     they are. `read` gets `context` with the load's `includeUnknown` and
 *     `computed` and the engine context as `engineContext`.
 * @returns {({tags: object}|Promise<{tags: object}>|undefined)} A Promise when
 *     the decoder's `read` returns one, undefined when no decoder matches.
 */
export function readMakerNoteWithDecoders(block, ctx, decoders) {
    for (let i = 0; i < decoders.length; i++) {
        if (decoders[i].matches({make: block.make, model: block.model, bytes: block.bytes}) === true) {
            return readWithDecoder(decoders[i], block, ctx);
        }
    }
    return undefined;
}

function readWithDecoder(decoder, block, ctx) {
    const tags = decoder.read({
        tiffView: block.tiffView,
        tiffHeaderOffset: block.tiffHeaderOffset,
        makerNoteOffset: block.makerNoteOffset,
        byteOrder: block.byteOrder,
        context: {includeUnknown: ctx.options.includeUnknown, computed: ctx.options.computed, engineContext: ctx},
    });
    if (isThenable(tags)) {
        return Promise.resolve(tags).then((resolvedTags) => ({tags: resolvedTags}));
    }
    return {tags};
}

/**
 * Builds the makerNote block an Exif block carries.
 *
 * @param {Object<string, object>} parsed The Exif block's filtered tags.
 * @param {object} exif The Exif block's facts: `view`, `tiffHeaderOffset`,
 *     `byteOrder`, `makerNoteOffset` and `carried`.
 * @returns {(object|false|undefined)} The makerNote block, or a falsy value
 *     when there is no MakerNote tag or no maker note offset. Its `make` and
 *     `model` are strings or undefined and its `bytes` the MakerNote value as
 *     the Exif reader gives it.
 */
export function getMakerNoteBlockFromExif(parsed, exif) {
    return parsed['MakerNote'] && exif.makerNoteOffset !== undefined && {
        kind: 'makerNote',
        tiffView: exif.view,
        tiffHeaderOffset: exif.tiffHeaderOffset,
        makerNoteOffset: exif.makerNoteOffset,
        byteOrder: exif.byteOrder,
        make: getFirstString(parsed['Make']),
        model: getFirstString(parsed['Model']),
        bytes: parsed['MakerNote'].value,
        carried: exif.carried,
    };
}

function getFirstString(tag) {
    return tag && Array.isArray(tag.value) && typeof tag.value[0] === 'string' ? tag.value[0] : undefined;
}
