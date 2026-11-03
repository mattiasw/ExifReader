/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {decompress, isThenable, objectAssign} from './utils.js';
import {getValueBudget} from './tags-helpers.js';

// A finder block, a block it emits and a block emitted by that one.
export const MAX_BLOCK_DEPTH = 3;
export const MAX_DECOMPRESSIONS_IN_FLIGHT = 4;

// Brob XMP is bounded by the file size, as brob Exif is, plus room for one JPEG
// standard XMP segment so that a small file can still carry a typical packet.
const BROB_XMP_SIZE_PER_INPUT_SIZE = 4;
const BROB_XMP_SIZE_ALLOWANCE = 64 * 1024;
// An embedded thumbnail is sliced from a decoded or decompressed view that can be
// far larger than the file. A real JPEG thumbnail shrinks only a little when
// compressed, so bound the embedded thumbnails of a file by twice its size in
// total, plus room for a typical thumbnail.
const EMBEDDED_THUMBNAIL_SIZE_PER_INPUT_SIZE = 2;
const EMBEDDED_THUMBNAIL_SIZE_ALLOWANCE = 64 * 1024;

/**
 * Runs the composition's groups over the finder's blocks and the blocks the
 * groups emit, and collects their merge blocks in dispatch order.
 *
 * @param {{groups: Array<object>, dispatchKind: function, rank: function, suppressions: Array<object>}} composition
 *     `groups` in dispatch order of the kinds they consume, each
 *     `{key, consumes, emits, read(block, context), merge(block)}`;
 *     `dispatchKind(block)` the kind a block dispatches under; `rank(block)` an
 *     integer, of which only the top one per `block.kind` dispatches among the
 *     finder blocks; `suppressions` rules `{kind, isSuppressed(block,
 *     finderBlocks, context)}` that drop an emitted block.
 * @param {Array<object>} blocks The finder's blocks.
 * @param {object} context From createContext.
 * @returns {{mergeBlocks: Array<object>}|Promise<{mergeBlocks: Array<object>}>}
 *     A promise when `context.options.async` is set.
 */
export function run(composition, blocks, context) {
    const plan = createDispatchPlan(composition, blocks, context);
    const roots = [];
    const deferred = [];

    for (let i = 0; i < plan.finderBlocks.length; i++) {
        dispatchBlock(plan.finderBlocks[i], 1, roots, deferred, plan);
    }

    if (!context.options.async) {
        return {mergeBlocks: getMergeBlocks(roots)};
    }

    return runDeferredRounds(deferred, plan).then(() => ({mergeBlocks: getMergeBlocks(roots)}));
}

function createDispatchPlan(composition, blocks, context) {
    const consumedKinds = Object.create(null);
    const groups = composition.groups;
    for (let i = 0; i < groups.length; i++) {
        for (let j = 0; j < groups[i].consumes.length; j++) {
            consumedKinds[groups[i].consumes[j]] = true;
        }
    }

    const plan = {
        composition,
        context,
        consumedKinds,
        consumersOf,
        shouldDispatch: createShouldDispatch(groups, consumersOf, context.tagFilter),
        finderBlocks: undefined,
    };
    plan.finderBlocks = getFinderBlocksToDispatch(composition.rank, getFinderCandidates(composition, blocks, plan));

    return plan;

    function consumersOf(kind) {
        return groups.filter((group) => group.consumes.indexOf(kind) !== -1);
    }
}

// A group dispatches when the filter parses its key, or a group that consumes
// a kind it emits does. A cycle counts as false; validateComposition rejects
// one anyway.
function createShouldDispatch(groups, consumersOf, tagFilter) {
    const verdicts = [];

    return shouldDispatch;

    function shouldDispatch(group) {
        const index = groups.indexOf(group);
        if (verdicts[index] === undefined) {
            verdicts[index] = 'visiting';
            verdicts[index] = tagFilter.shouldParseGroup(group.key)
                || group.emits.some((kind) => consumersOf(kind).some(shouldDispatch));
        }
        return verdicts[index] === true;
    }
}

function getFinderCandidates(composition, blocks, plan) {
    const candidates = [];
    for (let i = 0; i < blocks.length; i++) {
        const position = getDispatchPosition(composition.groups, composition.dispatchKind(blocks[i]));
        if (position === -1 || isCompressedInSyncMode(blocks[i], plan.context)) {
            continue;
        }
        candidates.push({block: blocks[i], index: i, position});
    }
    return candidates;
}

function getDispatchPosition(groups, kind) {
    for (let i = 0; i < groups.length; i++) {
        if (groups[i].consumes.indexOf(kind) !== -1) {
            return i;
        }
    }
    return -1;
}

// Of each block.kind only the top rank dispatches. The explicit comparator keeps
// block-list order within a kind, since sort is not stable on every target.
function getFinderBlocksToDispatch(rank, candidates) {
    const topRanks = Object.create(null);
    for (let i = 0; i < candidates.length; i++) {
        const kind = candidates[i].block.kind;
        candidates[i].rank = rank(candidates[i].block);
        if (topRanks[kind] === undefined || candidates[i].rank > topRanks[kind]) {
            topRanks[kind] = candidates[i].rank;
        }
    }

    return candidates
        .filter((candidate) => candidate.rank === topRanks[candidate.block.kind])
        .sort((a, b) => (a.position - b.position) || (a.index - b.index))
        .map((candidate) => candidate.block);
}

function isCompressedInSyncMode(block, context) {
    return !context.options.async && block.compression !== undefined;
}

// Every group consuming the block's kind reads it, in table order. A read that
// throws drops the block for that group alone.
function dispatchBlock(block, depth, siblings, deferred, plan) {
    const groups = plan.consumersOf(plan.composition.dispatchKind(block));

    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        if (!plan.shouldDispatch(group)) {
            continue;
        }
        const node = {group, block, tags: undefined, children: []};
        let result;
        try {
            result = group.read(block, plan.context);
        } catch (error) {
            continue;
        }
        if (isThenable(result)) {
            if (!plan.context.options.async) {
                throw new Error('Promise is required when async mode is enabled.');
            }
            siblings.push(node);
            deferred.push({node, depth, promise: Promise.resolve(result).then(keepResult, dropResult)});
            continue;
        }
        if (result === undefined) {
            continue;
        }
        siblings.push(node);
        node.tags = result.tags;
        dispatchEmittedBlocks(result.blocks, depth + 1, node.children, deferred, plan);
    }
}

function keepResult(result) {
    return result;
}

// A rejected read (a decompression failure, a bad header) drops its block alone.
function dropResult() {
    return undefined;
}

function dispatchEmittedBlocks(blocks, depth, children, deferred, plan) {
    if (!blocks) {
        return;
    }
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (
            depth > MAX_BLOCK_DEPTH
            || !plan.consumedKinds[plan.composition.dispatchKind(block)]
            || isCompressedInSyncMode(block, plan.context)
            || isSuppressed(block, plan)
        ) {
            continue;
        }
        dispatchBlock(block, depth, children, deferred, plan);
    }
}

function isSuppressed(block, plan) {
    const rules = plan.composition.suppressions;
    for (let i = 0; i < rules.length; i++) {
        if (rules[i].kind === block.kind && rules[i].isSuppressed(block, plan.finderBlocks, plan.context)) {
            return true;
        }
    }
    return false;
}

// The deferred blocks of a round settle together, then their emitted blocks
// dispatch in block-list order, whatever order the decompressions finished in.
// A dropped block's node keeps undefined tags and no children, so it merges
// nothing.
function runDeferredRounds(deferred, plan) {
    if (deferred.length === 0) {
        return Promise.resolve();
    }
    return Promise.all(deferred.map((entry) => entry.promise)).then((results) => {
        const nextRound = [];
        for (let i = 0; i < deferred.length; i++) {
            const {node, depth} = deferred[i];
            if (results[i] === undefined) {
                continue;
            }
            node.tags = results[i].tags;
            dispatchEmittedBlocks(results[i].blocks, depth + 1, node.children, nextRound, plan);
        }
        return runDeferredRounds(nextRound, plan);
    });
}

// A node with children, or one whose merge descriptor names an outer slot,
// gives a nested container at that slot holding its own block first; a node
// whose tags are undefined contributes no block of its own.
function getMergeBlocks(nodes) {
    const mergeBlocks = [];
    for (let i = 0; i < nodes.length; i++) {
        mergeBlocks.push.apply(mergeBlocks, getNodeMergeBlocks(nodes[i]));
    }
    return mergeBlocks;
}

function getNodeMergeBlocks(node) {
    const merge = node.group.merge(node.block);
    const own = node.tags === undefined ? [] : [objectAssign({group: node.group.key, tags: node.tags}, merge)];
    const children = getMergeBlocks(node.children);
    if (children.length === 0 && merge.outerSlot === undefined) {
        return own;
    }
    return [{slot: merge.outerSlot || merge.slot, mode: 'nested', blocks: own.concat(children)}];
}

/**
 * Builds the per-load state the groups share: the input, the options, the
 * budgets and the entry's helpers.
 *
 * @param {{dataView: DataView, options: object, tagFilter: object, decompressConfig: object, getBase64Image: function, getDomParser: function}} parts
 * @returns {object} The context, with `decompress` running through a pool of at
 *     most MAX_DECOMPRESSIONS_IN_FLIGHT tasks and `getValueBudget(view)`
 *     creating one budget on its first call.
 */
export function createContext({dataView, options, tagFilter, decompressConfig, getBase64Image, getDomParser}) {
    const pool = createPool(MAX_DECOMPRESSIONS_IN_FLIGHT);
    const inputByteLength = getInputByteLength(dataView);
    const context = {
        dataView,
        options,
        tagFilter,
        decompressConfig,
        getBase64Image,
        getDomParser,
        valueBudget: undefined,
        decompressedApplicationNotesSize: 0,
        copiedThumbnailSize: 0,
        hasEmbeddedThumbnailImage: false,
        compressedPngTextChunks: 0,
        hasRawIptcProfile: undefined,
        embeddedThumbnailSizeBound: EMBEDDED_THUMBNAIL_SIZE_PER_INPUT_SIZE * inputByteLength + EMBEDDED_THUMBNAIL_SIZE_ALLOWANCE,
        decompress(view, compressionMethod, encoding, returnType) {
            return pool.run(() => decompress(view, compressionMethod, encoding, returnType, decompressConfig));
        },
        // The main Exif block creates the budget from its view; later callers
        // get the same object, whatever view they pass. The view is only
        // missing in unit tests that fake the readers.
        getValueBudget(view) {
            if (context.valueBudget === undefined) {
                const budgetView = view || dataView;
                if (budgetView !== undefined) {
                    context.valueBudget = getValueBudget(budgetView);
                }
            }
            return context.valueBudget;
        },
        // The brob XMP bound covers the decompressed Exif blocks of a file
        // together, so that several cannot each pass it.
        takeDecompressedApplicationNotesAllowance(byteLength) {
            if (context.exceedsBrobXmpSizeBound(context.decompressedApplicationNotesSize + byteLength)) {
                return false;
            }
            context.decompressedApplicationNotesSize += byteLength;
            return true;
        },
        exceedsBrobXmpSizeBound(byteLength) {
            return byteLength > BROB_XMP_SIZE_PER_INPUT_SIZE * inputByteLength + BROB_XMP_SIZE_ALLOWANCE;
        },
    };

    return context;
}

function getInputByteLength(dataView) {
    return dataView !== undefined && typeof dataView.byteLength === 'number' ? dataView.byteLength : 0;
}

// Starts a task when fewer than `limit` are running, else queues it until one
// settles. Promise is only referenced once a task is given, in async mode.
function createPool(limit) {
    const queue = [];
    let running = 0;

    return {
        run(task) {
            return new Promise((resolve, reject) => {
                queue.push({task, resolve, reject});
                startNext();
            });
        },
    };

    function startNext() {
        if (running >= limit || queue.length === 0) {
            return;
        }
        const {task, resolve, reject} = queue.shift();
        running++;
        // The wrapper turns a synchronous throw from a task into a rejection.
        new Promise((start) => start(task())).then((result) => {
            running--;
            startNext();
            resolve(result);
        }, (error) => {
            running--;
            startNext();
            reject(error);
        });
    }
}

/**
 * Throws when the groups' static emission graph has a cycle: a kind that,
 * through the groups consuming it and what they emit, leads back to itself.
 *
 * @param {{groups: Array<object>}} composition
 */
export function validateComposition(composition) {
    const edges = Object.create(null);
    const groups = composition.groups;
    for (let i = 0; i < groups.length; i++) {
        for (let j = 0; j < groups[i].consumes.length; j++) {
            const kind = groups[i].consumes[j];
            edges[kind] = (edges[kind] || []).concat(groups[i].emits);
        }
    }

    const states = Object.create(null);
    for (const kind in edges) {
        visit(kind);
    }

    function visit(kind) {
        if (states[kind] === 'done') {
            return;
        }
        if (states[kind] === 'visiting') {
            throw new Error('The group emission graph has a cycle through ' + kind);
        }
        states[kind] = 'visiting';
        const emitted = edges[kind] || [];
        for (let i = 0; i < emitted.length; i++) {
            visit(emitted[i]);
        }
        states[kind] = 'done';
    }
}
