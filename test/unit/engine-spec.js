/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDataView} from './test-utils.js';
import {run, createContext, validateComposition, MAX_BLOCK_DEPTH, MAX_DECOMPRESSIONS_IN_FLIGHT} from '../../src/engine.js';
import {createTagFilter} from '../../src/tag-filter.js';
import {COMPRESSION_METHOD_DEFLATE} from '../../src/utils.js';

const SRC_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const ENTRY_ONLY_MODULES = ['file-loaders.js', 'load-auto.js', 'dom-parser.js', 'exif-reader.js', 'constants.js', 'node-require.js'];

describe('engine', () => {
    describe('dispatch order', () => {
        it('should dispatch finder blocks in the composition\'s group order, not in block-list order', () => {
            const log = [];
            const composition = getComposition([group('a', log), group('b', log)]);

            run(composition, [{kind: 'b'}, {kind: 'a'}], getContext());

            expect(log).to.deep.equal(['a', 'b']);
        });

        it('should dispatch a group\'s emitted blocks depth-first in emission order before the next finder block', () => {
            const log = [];
            const composition = getComposition([
                group('a', log, {emits: ['x', 'y'], blocks: [{kind: 'x'}, {kind: 'y'}]}),
                group('b', log),
                group('x', log, {emits: ['z'], blocks: [{kind: 'z'}]}),
                group('y', log),
                group('z', log),
            ]);

            run(composition, [{kind: 'a'}, {kind: 'b'}], getContext());

            expect(log).to.deep.equal(['a', 'x', 'z', 'y', 'b']);
        });

        it('should keep twelve finder blocks of one kind in block-list order among another kind', () => {
            const log = [];
            const composition = getComposition([group('a', log, {tag: (block) => block.n}), group('b', log, {tag: (block) => block.n})]);
            const blocks = [];
            for (let i = 0; i < 12; i++) {
                blocks.push({kind: 'b', n: i}, {kind: 'a', n: i});
            }

            const {mergeBlocks} = run(composition, blocks, getContext());

            const expected = [];
            for (let i = 0; i < 12; i++) {
                expected.push('a' + i);
            }
            for (let i = 0; i < 12; i++) {
                expected.push('b' + i);
            }
            expect(log).to.deep.equal(expected);
            expect(mergeBlocks.map((block) => block.group + block.tags.n)).to.deep.equal(expected);
        });

        it('should drop a block emitted beyond the depth limit unparsed', () => {
            const log = [];
            const composition = getComposition([
                group('a', log, {emits: ['b'], blocks: [{kind: 'b'}]}),
                group('b', log, {emits: ['c'], blocks: [{kind: 'c'}]}),
                group('c', log, {emits: ['d'], blocks: [{kind: 'd'}]}),
                group('d', log),
            ]);

            run(composition, [{kind: 'a'}], getContext());

            expect(MAX_BLOCK_DEPTH).to.equal(3);
            expect(log).to.deep.equal(['a', 'b', 'c']);
        });

        it('should give every group consuming a kind its own result, in table order', () => {
            const log = [];
            const composition = getComposition([group('first', log, {consumes: ['a']}), group('second', log, {consumes: ['a']})]);

            const {mergeBlocks} = run(composition, [{kind: 'a'}], getContext());

            expect(log).to.deep.equal(['first', 'second']);
            expect(mergeBlocks.map((block) => block.group)).to.deep.equal(['first', 'second']);
        });
    });

    describe('rank', () => {
        it('should dispatch every finder block at the top rank of its kind and drop the others', () => {
            const log = [];
            const composition = getComposition([group('a', log, {tag: (block) => block.rank})], {rank: (block) => block.rank});

            run(composition, [{kind: 'a', rank: 1}, {kind: 'a', rank: 2}, {kind: 'a', rank: 2}], getContext());

            expect(log).to.deep.equal(['a2', 'a2']);
        });

        it('should rank each kind on its own', () => {
            const log = [];
            const composition = getComposition(
                [group('a', log, {tag: (block) => block.rank}), group('b', log, {tag: (block) => block.rank})],
                {rank: (block) => block.rank}
            );

            run(composition, [{kind: 'a', rank: 1}, {kind: 'b', rank: 0}], getContext());

            expect(log).to.deep.equal(['a1', 'b0']);
        });
    });

    describe('sync mode drops and suppression', () => {
        it('should drop a compressed finder block before the suppression rules see it, and drop a suppressed emitted block', () => {
            const log = [];
            const seenByRule = [];
            const composition = getComposition([
                group('a', log, {emits: ['x'], blocks: [{kind: 'x'}]}),
                group('x', log),
            ], {
                suppressions: [{
                    kind: 'x',
                    isSuppressed(block, finderBlocks) {
                        seenByRule.push(finderBlocks.map((finderBlock) => finderBlock.kind + (finderBlock.compression || '')));
                        return finderBlocks.some((finderBlock) => finderBlock.kind === 'x');
                    },
                }],
            });
            const blocks = [{kind: 'a'}, {kind: 'x', compression: 'deflate'}];

            run(composition, blocks, getContext({async: false}));

            expect(log).to.deep.equal(['a', 'x']);
            expect(seenByRule).to.deep.equal([['a']]);
        });

        it('should keep the compressed finder block in async mode, where it then suppresses the emitted one', async () => {
            const log = [];
            const composition = getComposition([
                group('a', log, {emits: ['x'], blocks: [{kind: 'x'}]}),
                group('x', log, {tag: (block) => block.compression || ''}),
            ], {
                suppressions: [{kind: 'x', isSuppressed: (block, finderBlocks) => finderBlocks.some((finderBlock) => finderBlock.kind === 'x')}],
            });
            const blocks = [{kind: 'a'}, {kind: 'x', compression: 'deflate'}];

            await run(composition, blocks, getContext({async: true}));

            expect(log).to.deep.equal(['a', 'xdeflate']);
        });

        it('should drop a compressed emitted block in sync mode', () => {
            const log = [];
            const composition = getComposition([
                group('a', log, {emits: ['x'], blocks: [{kind: 'x', compression: 'deflate'}]}),
                group('x', log),
            ]);

            run(composition, [{kind: 'a'}], getContext({async: false}));

            expect(log).to.deep.equal(['a']);
        });

        it('should apply a suppression rule to emitted blocks of its kind only', () => {
            const log = [];
            const composition = getComposition([
                group('a', log, {emits: ['x', 'y'], blocks: [{kind: 'x'}, {kind: 'y'}]}),
                group('x', log),
                group('y', log),
            ], {
                suppressions: [{kind: 'x', isSuppressed: () => true}],
            });

            run(composition, [{kind: 'a'}, {kind: 'x'}], getContext());

            expect(log).to.deep.equal(['a', 'y', 'x']);
        });
    });

    describe('the filter gate and D11', () => {
        it('should skip a group the tag filter does not parse', () => {
            const log = [];
            const composition = getComposition([group('png', log), group('iptc', log)]);

            run(composition, [{kind: 'png'}, {kind: 'iptc'}], getContext({includeTags: {iptc: true}}));

            expect(log).to.deep.equal(['iptc']);
        });

        it('should not loop on a cyclic composition when no consumer passes the filter', () => {
            const log = [];
            const composition = getComposition([
                group('png', log, {emits: ['iptc'], blocks: [{kind: 'iptc'}]}),
                group('iptc', log, {emits: ['png'], blocks: [{kind: 'png'}]}),
            ]);

            const {mergeBlocks} = run(composition, [{kind: 'png'}], getContext({includeTags: {exif: true}}));

            expect(log).to.deep.equal([]);
            expect(mergeBlocks).to.deep.equal([]);
        });

        it('should still dispatch a group the filter skips when it emits a kind whose consumer the filter parses', () => {
            const log = [];
            const composition = getComposition([group('png', log, {emits: ['iptc'], blocks: [{kind: 'iptc'}]}), group('iptc', log)]);

            run(composition, [{kind: 'png'}], getContext({includeTags: {iptc: true}}));

            expect(log).to.deep.equal(['png', 'iptc']);
        });

        it('should never decompress a compressed block of a kind no group consumes', async () => {
            const log = [];
            const deflateCalls = [];
            const composition = getComposition([group('a', log, {consumes: ['a']})]);
            const context = getContext({async: true, deflate: (data) => {
                deflateCalls.push(data);
                return Promise.resolve('');
            }});
            const blocks = [{kind: 'a'}, {kind: 'z', compression: 'deflate'}];

            await run(composition, blocks, context);

            expect(log).to.deep.equal(['a']);
            expect(deflateCalls).to.have.lengthOf(0);
        });

        it('should decompress a compressed block when a consumed kind is reached only through what it emits', async () => {
            const log = [];
            const composition = getComposition([
                decompressingGroup('png', log, {emits: ['iptc'], blocks: [{kind: 'iptc'}]}),
                group('iptc', log),
            ]);
            const context = getContext({async: true, includeTags: {iptc: true}, deflate: (bytes) => Promise.resolve(bytes)});

            const {mergeBlocks} = await run(composition, [{kind: 'png', compression: 'deflate'}], context);

            expect(log).to.deep.equal(['png', 'iptc']);
            expect(mergeBlocks).to.deep.equal([{slot: 'png', mode: 'nested', blocks: [
                {group: 'png', tags: {png: 'decompressed'}, slot: 'png', mode: 'assign'},
                {group: 'iptc', tags: {iptc: 'read'}, slot: 'iptc', mode: 'assign'},
            ]}]);
        });

        it('should not dispatch an emitted block of a kind no group consumes', () => {
            const log = [];
            const composition = getComposition([group('a', log, {emits: ['x'], blocks: [{kind: 'x'}]})]);

            const {mergeBlocks} = run(composition, [{kind: 'a'}], getContext());

            expect(log).to.deep.equal(['a']);
            expect(mergeBlocks).to.deep.equal([{group: 'a', tags: {a: 'read'}, slot: 'a', mode: 'assign'}]);
        });
    });

    describe('async', () => {
        it('should return a promise in async mode with nothing deferred', async () => {
            const composition = getComposition([group('a', [])]);

            const result = run(composition, [{kind: 'a'}], getContext({async: true}));

            expect(result).to.be.instanceOf(Promise);
            expect((await result).mergeBlocks).to.have.lengthOf(1);
        });

        it('should throw when a group returns a thenable in sync mode', () => {
            const composition = getComposition([{key: 'a', consumes: ['a'], emits: [], read: () => Promise.resolve({tags: {}}), merge: () => ({slot: 'a', mode: 'assign'})}]);

            expect(() => run(composition, [{kind: 'a'}], getContext({async: false}))).to.throw('Promise is required when async mode is enabled.');
        });

        it('should defer a block whose group returns a promise without any compression property', async () => {
            const log = [];
            const composition = getComposition([
                {key: 'a', consumes: ['a'], emits: [], read: () => Promise.resolve({tags: {a: 'later'}}), merge: () => ({slot: 'a', mode: 'assign'})},
                group('b', log),
            ]);

            const {mergeBlocks} = await run(composition, [{kind: 'a'}, {kind: 'b'}], getContext({async: true}));

            expect(mergeBlocks.map((block) => block.group)).to.deep.equal(['a', 'b']);
            expect(mergeBlocks[0].tags).to.deep.equal({a: 'later'});
        });

        it('should run a third round for a deferred block emitted by a deferred block', async () => {
            const log = [];
            const composition = getComposition([
                decompressingGroup('a', log, {emits: ['b'], blocks: [{kind: 'b'}]}),
                decompressingGroup('b', log, {emits: ['c'], blocks: [{kind: 'c'}]}),
                group('c', log),
            ]);
            const context = getContext({async: true, deflate: (bytes) => Promise.resolve(bytes)});

            const {mergeBlocks} = await run(composition, [{kind: 'a'}], context);

            expect(log).to.deep.equal(['a', 'b', 'c']);
            expect(mergeBlocks).to.deep.equal([{slot: 'a', mode: 'nested', blocks: [
                {group: 'a', tags: {a: 'decompressed'}, slot: 'a', mode: 'assign'},
                {slot: 'b', mode: 'nested', blocks: [
                    {group: 'b', tags: {b: 'decompressed'}, slot: 'b', mode: 'assign'},
                    {group: 'c', tags: {c: 'read'}, slot: 'c', mode: 'assign'},
                ]},
            ]}]);
        });

        it('should keep at most 4 decompressions in flight across kinds, merge in block-list order and run a second round for what they emit', async () => {
            const log = [];
            const pending = [];
            let maxPending = 0;
            const composition = getComposition([
                decompressingGroup('a', log, {emits: ['x'], blocks: [{kind: 'x'}]}),
                decompressingGroup('b', log),
                group('x', log),
            ]);
            const context = getContext({async: true, deflate: (bytes) => new Promise((resolve) => {
                pending.push(() => resolve(bytes));
                maxPending = Math.max(maxPending, pending.length);
            })});
            const blocks = [];
            for (let i = 0; i < 5; i++) {
                blocks.push({kind: 'b', n: i}, {kind: 'a', n: i});
            }

            const resultPromise = run(composition, blocks, context);
            const pendingPerRound = [];
            await flushPromises();
            while (pending.length > 0) {
                pendingPerRound.push(pending.length);
                // Finishing in reverse order shows the merge order does not depend on it.
                pending.splice(0).reverse().forEach((finish) => finish());
                await flushPromises();
            }
            const {mergeBlocks} = await resultPromise;

            expect(MAX_DECOMPRESSIONS_IN_FLIGHT).to.equal(4);
            expect(maxPending).to.equal(4);
            expect(pendingPerRound).to.deep.equal([4, 4, 2]);
            expect(mergeBlocks.map((block) => (block.blocks ? block.blocks[0] : block).tags.n)).to.deep.equal([0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
            expect(mergeBlocks.slice(0, 5).map((block) => block.mode)).to.deep.equal(['nested', 'nested', 'nested', 'nested', 'nested']);
            expect(log.slice(10)).to.deep.equal(['x', 'x', 'x', 'x', 'x']);
        });
    });

    describe('error granularity', () => {
        it('should drop only the block whose group throws, keeping the parent\'s tags and the sibling emitted blocks', () => {
            const log = [];
            const composition = getComposition([
                group('a', log, {emits: ['x', 'y', 'z'], blocks: [{kind: 'x'}, {kind: 'y'}, {kind: 'z'}]}),
                group('x', log),
                {key: 'y', consumes: ['y'], emits: [], read: () => {
                    throw new Error('y failed');
                }, merge: () => ({slot: 'y', mode: 'assign'})},
                group('z', log),
            ]);

            const {mergeBlocks} = run(composition, [{kind: 'a'}], getContext());

            expect(mergeBlocks).to.deep.equal([{slot: 'a', mode: 'nested', blocks: [
                {group: 'a', tags: {a: 'read'}, slot: 'a', mode: 'assign'},
                {group: 'x', tags: {x: 'read'}, slot: 'x', mode: 'assign'},
                {group: 'z', tags: {z: 'read'}, slot: 'z', mode: 'assign'},
            ]}]);
        });

        it('should drop a rejected deferred block alone', async () => {
            const log = [];
            const composition = getComposition([
                {key: 'a', consumes: ['a'], emits: [], read: () => Promise.reject(new Error('a failed')), merge: () => ({slot: 'a', mode: 'assign'})},
                group('b', log),
            ]);

            const {mergeBlocks} = await run(composition, [{kind: 'a'}, {kind: 'b'}], getContext({async: true}));

            expect(mergeBlocks.map((block) => block.group)).to.deep.equal(['b']);
        });

        it('should drop a deferred block that resolves to nothing', async () => {
            const composition = getComposition([
                {key: 'a', consumes: ['a'], emits: [], read: () => Promise.resolve(undefined), merge: () => ({slot: 'a', mode: 'assign'})},
            ]);

            const {mergeBlocks} = await run(composition, [{kind: 'a'}], getContext({async: true}));

            expect(mergeBlocks).to.deep.equal([]);
        });
    });

    describe('merge blocks', () => {
        it('should give a result without children one block with the group, the tags and the merge descriptor', () => {
            const composition = getComposition([{key: 'a', consumes: ['a'], emits: [], read: () => ({tags: {t: 1}}), merge: (block) => ({slot: 'a', mode: 'merge', rank: block.rank})}]);

            const {mergeBlocks} = run(composition, [{kind: 'a', rank: 'main'}], getContext());

            expect(mergeBlocks).to.deep.equal([{group: 'a', tags: {t: 1}, slot: 'a', mode: 'merge', rank: 'main'}]);
        });

        it('should give a result with children a nested container at the outer slot holding the parent first', () => {
            const log = [];
            const composition = getComposition([
                {key: 'a', consumes: ['a'], emits: ['x'], read: () => ({tags: {t: 1}, blocks: [{kind: 'x'}]}), merge: () => ({slot: 'a', mode: 'merge', outerSlot: 'outer'})},
                group('x', log),
            ]);

            const {mergeBlocks} = run(composition, [{kind: 'a'}], getContext());

            expect(mergeBlocks).to.deep.equal([{slot: 'outer', mode: 'nested', blocks: [
                {group: 'a', tags: {t: 1}, slot: 'a', mode: 'merge', outerSlot: 'outer'},
                {group: 'x', tags: {x: 'read'}, slot: 'x', mode: 'assign'},
            ]}]);
        });

        it('should give a container holding only the children for a result without tags', () => {
            const log = [];
            const composition = getComposition([
                {key: 'a', consumes: ['a'], emits: ['x'], read: () => ({tags: undefined, blocks: [{kind: 'x'}]}), merge: () => ({slot: 'a', mode: 'merge'})},
                group('x', log),
            ]);

            const {mergeBlocks} = run(composition, [{kind: 'a'}], getContext());

            expect(mergeBlocks).to.deep.equal([{slot: 'a', mode: 'nested', blocks: [
                {group: 'x', tags: {x: 'read'}, slot: 'x', mode: 'assign'},
            ]}]);
        });

        it('should give nothing for a result without tags or children, and for a group returning undefined', () => {
            const composition = getComposition([
                {key: 'a', consumes: ['a'], emits: [], read: () => ({tags: undefined}), merge: () => ({slot: 'a', mode: 'merge'})},
                {key: 'b', consumes: ['b'], emits: [], read: () => undefined, merge: () => ({slot: 'b', mode: 'merge'})},
            ]);

            const {mergeBlocks} = run(composition, [{kind: 'a'}, {kind: 'b'}], getContext());

            expect(mergeBlocks).to.deep.equal([]);
        });
    });

    describe('validateComposition', () => {
        it('should throw on a cycle', () => {
            const composition = getComposition([group('a', [], {emits: ['b']}), group('b', [], {emits: ['a']})]);

            expect(() => validateComposition(composition)).to.throw('The group emission graph has a cycle through a');
        });

        it('should throw on a kind that emits itself', () => {
            expect(() => validateComposition(getComposition([group('a', [], {emits: ['a']})]))).to.throw('cycle through a');
        });

        it('should pass a chain and a kind emitted by two groups', () => {
            const composition = getComposition([
                group('a', [], {emits: ['b', 'c']}),
                group('b', [], {emits: ['c']}),
                group('c', []),
                group('d', [], {emits: ['c']}),
            ]);

            expect(() => validateComposition(composition)).to.not.throw();
        });
    });

    describe('context', () => {
        it('should create the value budget once, from the first view given, and ignore later views', () => {
            const context = getContext();
            const first = getDataView('\x00'.repeat(100));

            const budget = context.getValueBudget(first);

            expect(budget.ifdEntriesRemaining).to.equal(Math.floor(100 / 12) * 4);
            expect(context.getValueBudget(getDataView('\x00'.repeat(2000)))).to.equal(budget);
            expect(context.getValueBudget()).to.equal(budget);
            expect(context.valueBudget).to.equal(budget);
        });

        it('should create the value budget from the file view when no view is given', () => {
            const context = getContext({dataView: getDataView('\x00'.repeat(120))});

            expect(context.getValueBudget().ifdEntriesRemaining).to.equal(10 * 4);
        });

        it('should give no value budget without any view', () => {
            const context = createContext({dataView: undefined, options: {}, tagFilter: createTagFilter()});

            expect(context.getValueBudget()).to.be.undefined;
        });

        it('should bound the decompressed ApplicationNotes by 4 times the file size plus 64 KiB cumulatively', () => {
            const context = getContext({dataView: getDataView('\x00'.repeat(1000))});
            const bound = 4 * 1000 + 64 * 1024;

            expect(context.exceedsBrobXmpSizeBound(bound)).to.equal(false);
            expect(context.exceedsBrobXmpSizeBound(bound + 1)).to.equal(true);
            expect(context.takeDecompressedApplicationNotesAllowance(bound - 10)).to.equal(true);
            expect(context.takeDecompressedApplicationNotesAllowance(11)).to.equal(false);
            expect(context.takeDecompressedApplicationNotesAllowance(10)).to.equal(true);
            expect(context.decompressedApplicationNotesSize).to.equal(bound);
        });

        it('should bound the embedded thumbnails by 2 times the file size plus 64 KiB', () => {
            const context = getContext({dataView: getDataView('\x00'.repeat(1000))});

            expect(context.embeddedThumbnailSizeBound).to.equal(2 * 1000 + 64 * 1024);
            expect(context.copiedThumbnailSize).to.equal(0);
            expect(context.hasEmbeddedThumbnailImage).to.equal(false);
        });

        it('should carry the options, the tag filter and the entry\'s helpers', () => {
            const getBase64Image = () => 'b64';
            const getDomParser = () => 'parser';
            const tagFilter = createTagFilter();
            const options = {async: true};
            const dataView = getDataView('');

            const context = createContext({dataView, options, tagFilter, decompressConfig: {}, getBase64Image, getDomParser});

            expect(context.dataView).to.equal(dataView);
            expect(context.options).to.equal(options);
            expect(context.tagFilter).to.equal(tagFilter);
            expect(context.getBase64Image).to.equal(getBase64Image);
            expect(context.getDomParser).to.equal(getDomParser);
        });

        it('should run decompress with the decompression config and reject when it fails', async () => {
            const context = getContext({async: true, deflate: () => Promise.reject(new Error('deflate failed'))});

            let error;
            try {
                await context.decompress(getDataView('x'), COMPRESSION_METHOD_DEFLATE, 'latin1', 'string');
            } catch (caught) {
                error = caught;
            }
            expect(error.message).to.equal('deflate failed');
        });
    });

    describe('module boundary', () => {
        it('should import none of the entry-only modules, directly or transitively', () => {
            const reached = getImportClosure('engine.js');

            expect(reached).to.include('utils.js');
            for (const module of ENTRY_ONLY_MODULES) {
                expect(reached, module).to.not.include(module);
            }
        });
    });
});

function group(key, log, {consumes = [key], emits = [], blocks = undefined, tag = () => ''} = {}) {
    return {
        key,
        consumes,
        emits,
        read(block) {
            log.push(key + tag(block));
            const tags = {};
            tags[key] = 'read';
            if (block.n !== undefined) {
                tags.n = block.n;
            }
            return {tags, blocks};
        },
        merge: () => ({slot: key, mode: 'assign'}),
    };
}

function decompressingGroup(key, log, {emits = [], blocks = undefined} = {}) {
    return {
        key,
        consumes: [key],
        emits,
        read(block, context) {
            return context.decompress(getDataView('x'), COMPRESSION_METHOD_DEFLATE, 'latin1', 'string').then(() => {
                log.push(key);
                const tags = {};
                tags[key] = 'decompressed';
                if (block.n !== undefined) {
                    tags.n = block.n;
                }
                return {tags, blocks};
            });
        },
        merge: () => ({slot: key, mode: 'assign'}),
    };
}

function getComposition(groups, {rank = () => 1, suppressions = [], dispatchKind = (block) => block.kind} = {}) {
    return {groups, dispatchKind, rank, suppressions};
}

function getContext({async = false, includeTags = undefined, deflate = undefined, dataView = getDataView('\x00'.repeat(16))} = {}) {
    return createContext({
        dataView,
        options: {async},
        tagFilter: createTagFilter({includeTags}),
        decompressConfig: deflate ? {deflate} : undefined,
        getBase64Image: undefined,
        getDomParser: undefined,
    });
}

function getImportClosure(entry) {
    const reached = [];
    const queue = [entry];
    while (queue.length > 0) {
        const fileName = queue.shift();
        if (reached.includes(fileName)) {
            continue;
        }
        reached.push(fileName);
        const source = fs.readFileSync(path.join(SRC_PATH, fileName), 'utf8');
        const importPattern = /^import .* from '\.\/([^']+)';$/gm;
        let match;
        while ((match = importPattern.exec(source)) !== null) {
            queue.push(match[1]);
        }
    }
    return reached;
}

function flushPromises() {
    return new Promise(setImmediate);
}
