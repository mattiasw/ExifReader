/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign} from '../utils.js';
import {isPngTextChunkBlock} from './group-helpers.js';

const DETECTION_ORDER = ['tiff', 'jpeg', 'png', 'heic', 'avif', 'jxl', 'webp', 'gif', 'xml'];
// By the first kind a group consumes. The engine dispatches finder blocks in
// group order, so this order is part of the output.
const DISPATCH_ORDER = [
    'file', 'jfif', 'exif', 'iptc', 'xmp', 'icc', 'mpf', 'pngFile', 'pngText', 'pngChunk',
    'riff', 'gif', 'jxlFile', 'isoBmffFile', 'photoshop', 'makerNote', 'thumbnail',
];
const DERIVED_ORDER = ['gps', 'composite'];

export default {
    createComposition,
};

/**
 * Turns a formats table and a groups table into what the engine runs, in a
 * fixed detection and dispatch order whatever order they are listed in. A
 * format or reader listed twice, or brought by two formats, is used once, and
 * a group carrying `combine` combines the engine groups, which makes the
 * maker note groups one.
 *
 * @param {{formats: Array<object>, groups: Array<object>}} tables The formats,
 *     each `{header, readers}`, and the groups, block-reading ones as engine
 *     groups and derived ones without `read`.
 * @returns {object} The engine composition (`groups`, `dispatchKind`, `rank`,
 *     `suppressions`) plus `formats` in detection order, the `derived` groups,
 *     the `composed` facts (`formats`, `groups` and `kinds` maps),
 *     `isHiddenInSyncMode(block)`, `decompression` (the pooled decompression
 *     the png and jxl formats bring, or undefined when neither is composed),
 *     `mergeModes` (the merge modes the engine and derived groups bring) and
 *     the engine groups' `prepareMergeBlocks` and `finishTags` steps in
 *     dispatch order.
 */
function createComposition({formats, groups}) {
    const engineGroups = getEngineGroups(formats, groups);
    const derived = sortByOrder(unique(groups.filter(isDerivedGroup)), DERIVED_ORDER, (group) => group.key);
    return {
        groups: engineGroups,
        dispatchKind,
        rank,
        suppressions: getSuppressions(engineGroups),
        formats: sortByOrder(unique(formats), DETECTION_ORDER, (format) => format.header.fileType.value),
        derived,
        composed: {
            formats: getFlags(formats, (format) => [format.header.fileType.value]),
            groups: getFlags(groups, (group) => [group.key]),
            kinds: getFlags(engineGroups, (group) => group.consumes),
        },
        isHiddenInSyncMode: createIsHiddenInSyncMode(formats),
        decompression: getDecompression(formats),
        mergeModes: getMergeModes(engineGroups.concat(derived)),
        prepareMergeBlocks: getSteps(engineGroups, 'prepareMergeBlocks'),
        finishTags: getSteps(engineGroups, 'finishTags'),
    };
}

function getEngineGroups(formats, groups) {
    let candidates = [];
    for (let i = 0; i < formats.length; i++) {
        candidates = candidates.concat(formats[i].readers);
    }
    candidates = candidates.concat(groups.filter((group) => !isDerivedGroup(group)));

    const readers = unique(candidates.filter((group) => group !== undefined));
    return sortByOrder(combineGroups(readers), DISPATCH_ORDER, (group) => group.consumes[0]);
}

// A derived group reads no block.
function isDerivedGroup(group) {
    return group.read === undefined;
}

function combineGroups(groups) {
    for (let i = 0; i < groups.length; i++) {
        if (groups[i].combine !== undefined) {
            return groups[i].combine(groups);
        }
    }
    return groups;
}

function unique(items) {
    return items.filter((item, index) => items.indexOf(item) === index);
}

// The explicit index tie-break keeps list order, since sort is not stable on
// every target.
function sortByOrder(items, order, getName) {
    return items
        .map((item, index) => ({item, index, position: order.indexOf(getName(item))}))
        .sort((a, b) => (a.position - b.position) || (a.index - b.index))
        .map((entry) => entry.item);
}

// A raw-profile text chunk keeps its exif or iptc kind, which the suppression
// rules key on, but dispatches with the other text chunks.
function dispatchKind(block) {
    return isPngTextChunkBlock(block) ? 'pngText' : block.kind;
}

// A brob Exif box ranks below an Exif box; a compressed raw-profile text chunk
// is not a brob, so it ranks with the eXIf chunk and the uncompressed profiles.
function rank(block) {
    return block.kind === 'exif' && block.compression !== undefined && !isPngTextChunkBlock(block) ? 0 : 1;
}

function getSuppressions(groups) {
    let suppressions = [];
    for (let i = 0; i < groups.length; i++) {
        if (groups[i].suppressions !== undefined) {
            suppressions = suppressions.concat(groups[i].suppressions);
        }
    }
    return suppressions;
}

function getFlags(items, getNames) {
    const flags = Object.create(null);
    for (let i = 0; i < items.length; i++) {
        const names = getNames(items[i]);
        for (let j = 0; j < names.length; j++) {
            flags[names[j]] = true;
        }
    }
    return flags;
}

// Sync mode leaves the PNG compressed-text chunks, whatever their header says,
// and the iCCP chunk (always compressed) out of metadataRange, the
// potential-metadata check and the readers, as the PNG finder did when it took
// the async flag. A compressed iTXt and a brob box stay listed, and unread.
function createIsHiddenInSyncMode(formats) {
    const formatRules = [];
    for (let i = 0; i < formats.length; i++) {
        if (formats[i].header.isHiddenInSyncMode !== undefined) {
            formatRules.push(formats[i].header.isHiddenInSyncMode);
        }
    }

    return function isHiddenInSyncMode(block) {
        return (block.kind === 'icc' && block.compression !== undefined)
            || formatRules.some((isHidden) => isHidden(block));
    };
}

function getDecompression(formats) {
    for (let i = 0; i < formats.length; i++) {
        if (formats[i].header.decompression !== undefined) {
            return formats[i].header.decompression;
        }
    }
    return undefined;
}

function getMergeModes(groups) {
    const modes = Object.create(null);
    for (let i = 0; i < groups.length; i++) {
        objectAssign(modes, groups[i].mergeModes);
    }
    return modes;
}

function getSteps(groups, name) {
    const steps = [];
    for (let i = 0; i < groups.length; i++) {
        if (groups[i][name] !== undefined) {
            steps.push(groups[i][name]);
        }
    }
    return steps;
}
