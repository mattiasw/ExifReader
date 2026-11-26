/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from '../test-utils.js';
import CanonTags from '../../../src/canon-tags.js';
import PentaxTags from '../../../src/pentax-tags.js';
import {createTagFilter} from '../../../src/tag-filter.js';
import ByteOrder from '../../../src/byte-order.js';
import {
    parsedTags,
    getBlockDataView,
    getBrobDataView,
    getInputSizeBound,
    getEmbeddableMergeDescriptor,
    isPngTextChunkBlock,
    mergeMakerNoteGroups,
    readMakerNoteWithDecoders,
    getMakerNoteBlockFromExif,
} from '../../../src/composable/group-helpers.js';
import {canon, canonDecoder} from '../../../src/composable/groups/canon.js';
import {pentax, pentaxDecoder} from '../../../src/composable/groups/pentax.js';
import {makerNotes} from '../../../src/composable/groups/maker-notes.js';
import {getContext, recordCalls} from './test-context.js';
import {getMakerNoteBlock, getPentaxType1Bytes} from './groups/maker-note-test-data.js';

describe('composable/group-helpers', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should filter parsed tags by the context\'s filter for the group', () => {
        const ctx = getContext({tagFilter: createTagFilter({includeTags: {exif: ['Make']}})});

        expect(parsedTags('exif', {Make: 1, Model: 2}, ctx)).to.deep.equal({tags: {Make: 1}});
        expect(parsedTags('iptc', {Make: 1, Model: 2}, ctx)).to.deep.equal({tags: {}});
    });

    describe('getBlockDataView', () => {
        it('should prefer the block\'s view getter, then its view, then the file', () => {
            const ctx = getContext();
            const view = getDataView('a');

            expect(getBlockDataView({getDataView: () => 'got', dataView: view}, ctx)).to.equal('got');
            expect(getBlockDataView({dataView: view}, ctx)).to.equal(view);
            expect(getBlockDataView({}, ctx)).to.equal(ctx.dataView);
        });
    });

    describe('getBrobDataView', () => {
        it('should view the box\'s bytes', () => {
            const dataView = new DataView(new ArrayBuffer(20), 4, 16);

            const view = getBrobDataView(dataView, {dataOffset: 2, length: 5});

            expect(view.buffer).to.equal(dataView.buffer);
            expect(view.byteOffset).to.equal(6);
            expect(view.byteLength).to.equal(5);
        });

        it('should bound the view by the bytes present', () => {
            const dataView = getDataView('\x00'.repeat(10));

            expect(getBrobDataView(dataView, {dataOffset: 4, length: 100}).byteLength).to.equal(6);
            expect(getBrobDataView(dataView, {dataOffset: 10, length: 100}).byteLength).to.equal(0);
        });
    });

    describe('getInputSizeBound', () => {
        it('should give the factor times the input size plus the allowance', () => {
            expect(getInputSizeBound(getDataView('\x00'.repeat(1000)), 4, 64 * 1024)).to.equal(4 * 1000 + 64 * 1024);
        });

        it('should give the allowance alone without a view or a numeric byte length', () => {
            expect(getInputSizeBound(undefined, 2, 10)).to.equal(10);
            expect(getInputSizeBound({byteLength: '5'}, 2, 10)).to.equal(10);
        });

        it('should give NaN for a NaN byte length so that every bound check refuses', () => {
            expect(getInputSizeBound({byteLength: NaN}, 2, 10)).to.be.NaN;
        });
    });

    describe('getEmbeddableMergeDescriptor', () => {
        it('should put a carried block in the carried slot, assigned for the main block and merged otherwise', () => {
            expect(getEmbeddableMergeDescriptor({carried: 'main'}, 'iptc', 'carriedIptc')).to.deep.equal({slot: 'carriedIptc', mode: 'assign'});
            expect(getEmbeddableMergeDescriptor({carried: 'brob'}, 'iptc', 'carriedIptc')).to.deep.equal({slot: 'carriedIptc', mode: 'merge'});
        });

        it('should put a finder block in its own slot, merged when it has an origin', () => {
            expect(getEmbeddableMergeDescriptor({}, 'iptc', 'carriedIptc')).to.deep.equal({slot: 'iptc', mode: 'assign'});
            expect(getEmbeddableMergeDescriptor({origin: 'rawProfile'}, 'iptc', 'carriedIptc')).to.deep.equal({slot: 'iptc', mode: 'merge'});
        });
    });

    it('should tell a PNG text chunk block by its text', () => {
        expect(isPngTextChunkBlock({kind: 'exif', text: {}})).to.equal(true);
        expect(isPngTextChunkBlock({kind: 'exif'})).to.equal(false);
    });

    describe('mergeMakerNoteGroups', () => {
        it('should return the very same groups when none consumes a maker note', () => {
            const groups = [getOtherGroup('a'), getOtherGroup('b')];

            expect(mergeMakerNoteGroups(groups)).to.equal(groups);
            expect(mergeMakerNoteGroups([])).to.deep.equal([]);
        });

        it('should return the very same groups when only one consumes a maker note', () => {
            const groups = [getOtherGroup('a'), canon, getOtherGroup('b')];

            expect(mergeMakerNoteGroups(groups)).to.equal(groups);
        });

        it('should merge the maker note groups into one with both decoders, Canon first, whatever the order', () => {
            const lists = [
                [canon, pentax],
                [pentax, canon],
                [makerNotes, canon],
                [pentax, makerNotes],
                [makerNotes, canon, pentax],
            ];
            for (const groups of lists) {
                const label = groups.map((group) => group.decoders.map((decoder) => decoder.name).join('+')).join();

                const merged = mergeMakerNoteGroups(groups);

                expect(merged, label).to.have.lengthOf(1);
                expect(merged[0].key, label).to.equal('makerNotes');
                expect(merged[0].consumes, label).to.deep.equal(['makerNote']);
                expect(merged[0].emits, label).to.deep.equal([]);
                expect(merged[0].decoders, label).to.deep.equal([canonDecoder, pentaxDecoder]);
                expect(merged[0].merge, label).to.equal(groups[0].merge);
            }
        });

        it('should keep the other groups in their order, with the merged group last', () => {
            const first = getOtherGroup('a');
            const second = getOtherGroup('b');

            const merged = mergeMakerNoteGroups([first, pentax, second, canon]);

            expect(merged).to.have.lengthOf(3);
            expect(merged[0]).to.equal(first);
            expect(merged[1]).to.equal(second);
            expect(merged[2].decoders).to.deep.equal([canonDecoder, pentaxDecoder]);
        });

        it('should give the merged group the shared maker note extractor', () => {
            const [merged] = mergeMakerNoteGroups([pentax, canon]);

            expect(merged.fromExif).to.equal(getMakerNoteBlockFromExif);
        });

        it('should read with the merged decoders, Canon by Make before Pentax by prefix', () => {
            const [merged] = mergeMakerNoteGroups([pentax, canon]);
            const canonReads = recordCalls(CanonTags, 'read', {Canon: {value: 1}});
            const pentaxReads = recordCalls(PentaxTags, 'read', {Pentax: {value: 1}});
            restores.push(canonReads.restore, pentaxReads.restore);

            expect(merged.read(getMakerNoteBlock({make: 'Canon', bytes: getPentaxType1Bytes()}), getContext())).to.deep.equal({tags: {Canon: {value: 1}}});
            expect(merged.read(getMakerNoteBlock({make: 'PENTAX', bytes: getPentaxType1Bytes()}), getContext())).to.deep.equal({tags: {Pentax: {value: 1}}});
            expect(merged.read(getMakerNoteBlock({make: 'Nikon'}), getContext())).to.equal(undefined);
            expect(canonReads.calls).to.have.lengthOf(1);
            expect(pentaxReads.calls).to.have.lengthOf(1);
        });

        it('should put the decoders without a built-in name first, in the order of the groups, then the built-in ones in their order', () => {
            const first = getCallerGroup();
            const second = getCallerGroup();
            const third = getCallerGroup();

            const [merged] = mergeMakerNoteGroups([pentax, first, makerNotes, second, canon, third]);

            expect(merged.decoders).to.deep.equal([first.decoders[0], second.decoders[0], third.decoders[0], canonDecoder, pentaxDecoder]);
            expect(merged.decoders[0]).to.equal(first.decoders[0]);
            expect(merged.decoders[1]).to.equal(second.decoders[0]);
            expect(merged.decoders[2]).to.equal(third.decoders[0]);
        });

        it('should try a decoder without a built-in name before the built-in ones also when it is listed last', () => {
            const caller = getCallerGroup();

            const [merged] = mergeMakerNoteGroups([canon, pentax, caller]);

            expect(merged.decoders).to.have.ordered.members([caller.decoders[0], canonDecoder, pentaxDecoder]);
        });

        it('should keep a decoder listed by two groups once, at its first place', () => {
            const caller = getCallerGroup();
            const other = getCallerGroup();
            const twin = {key: 'makerNotes', consumes: ['makerNote'], decoders: [other.decoders[0], caller.decoders[0]]};

            const [merged] = mergeMakerNoteGroups([caller, canon, twin]);

            expect(merged.decoders).to.have.ordered.members([caller.decoders[0], other.decoders[0], canonDecoder]);
        });

        function getOtherGroup(key) {
            return {key, consumes: ['exif'], emits: [], read: () => undefined, merge: () => ({})};
        }

        function getCallerGroup() {
            return {key: 'makerNotes', consumes: ['makerNote'], emits: [], decoders: [{matches: () => false, read: () => ({})}], merge: () => ({})};
        }
    });

    describe('getMakerNoteBlockFromExif', () => {
        const VIEW = getDataView('\x00'.repeat(16));
        const MAKER_NOTE_BYTES = [1, 2, 3];

        it('should build the maker note block from MakerNote, Make, Model and the Exif facts', () => {
            const parsed = {MakerNote: {value: MAKER_NOTE_BYTES}, Make: {value: ['Canon']}, Model: {value: ['EOS']}};

            expect(getMakerNoteBlockFromExif(parsed, getExif({carried: 'rawProfile'}))).to.deep.equal({
                kind: 'makerNote',
                tiffView: VIEW,
                tiffHeaderOffset: 6,
                makerNoteOffset: 100,
                byteOrder: ByteOrder.LITTLE_ENDIAN,
                make: 'Canon',
                model: 'EOS',
                bytes: MAKER_NOTE_BYTES,
                carried: 'rawProfile',
            });
        });

        it('should leave make and model undefined without Make and Model', () => {
            const block = getMakerNoteBlockFromExif({MakerNote: {value: MAKER_NOTE_BYTES}}, getExif());

            expect(block).to.have.property('make', undefined);
            expect(block).to.have.property('model', undefined);
            expect(block.bytes).to.equal(MAKER_NOTE_BYTES);
        });

        it('should take the first string of Make and Model, and undefined when the value does not start with one', () => {
            const cases = [
                [['Canon', 'Other'], 'Canon'],
                ['Canon', undefined],
                [[5, 'Canon'], undefined],
                [[], undefined],
                [undefined, undefined],
            ];
            for (const [value, expected] of cases) {
                const block = getMakerNoteBlockFromExif({MakerNote: {value: MAKER_NOTE_BYTES}, Make: {value}, Model: {value}}, getExif());

                expect(block.make, JSON.stringify(value)).to.equal(expected);
                expect(block.model, JSON.stringify(value)).to.equal(expected);
            }
        });

        it('should give the MakerNote value as it is, whatever it holds', () => {
            const values = [[0, 128, 255], [], [80, -1], [1, 256], 7, 'PENTAX '];
            for (const value of values) {
                expect(getMakerNoteBlockFromExif({MakerNote: {value}}, getExif()).bytes, JSON.stringify(value)).to.equal(value);
            }
        });

        it('should build a block for a maker note offset of 0', () => {
            expect(getMakerNoteBlockFromExif({MakerNote: {value: MAKER_NOTE_BYTES}}, getExif({makerNoteOffset: 0}))).to.include({kind: 'makerNote', makerNoteOffset: 0});
        });

        it('should build no block without a maker note offset or without MakerNote', () => {
            expect(getMakerNoteBlockFromExif({MakerNote: {value: MAKER_NOTE_BYTES}}, getExif({makerNoteOffset: undefined}))).to.not.be.ok;
            expect(getMakerNoteBlockFromExif({Make: {value: ['Canon']}}, getExif())).to.not.be.ok;
        });

        function getExif(overrides = {}) {
            return Object.assign({view: VIEW, tiffHeaderOffset: 6, byteOrder: ByteOrder.LITTLE_ENDIAN, makerNoteOffset: 100, thumbnailIfdTags: undefined, carried: 'main', decompressed: false}, overrides);
        }
    });

    describe('readMakerNoteWithDecoders', () => {
        it('should read with the first decoder that matches, in list order', () => {
            const log = [];
            const decoders = [
                getDecoder('a', false, log),
                getDecoder('b', true, log),
                getDecoder('c', true, log),
            ];
            const ctx = getContext();

            expect(readMakerNoteWithDecoders(getMakerNoteBlock({}), ctx, decoders)).to.deep.equal({tags: {b: true}});
            expect(log).to.deep.equal(['matches a', 'matches b', 'read b']);
        });

        it('should read nothing when no decoder matches', () => {
            expect(readMakerNoteWithDecoders(getMakerNoteBlock({}), getContext(), [getDecoder('a', false, [])])).to.equal(undefined);
            expect(readMakerNoteWithDecoders(getMakerNoteBlock({}), getContext(), [])).to.equal(undefined);
        });

        it('should take only true from matches as a match', () => {
            const log = [];
            const decoders = [1, 'yes', {}, Promise.resolve(true)]
                .map((matchResult, index) => getDecoder(String(index), matchResult, log))
                .concat([getDecoder('true', true, log)]);

            expect(readMakerNoteWithDecoders(getMakerNoteBlock({}), getContext(), decoders)).to.deep.equal({tags: {true: true}});
            expect(log).to.deep.equal(['matches 0', 'matches 1', 'matches 2', 'matches 3', 'matches true', 'read true']);
        });

        it('should give matches the make, model and bytes of the block in a new object for each decoder', () => {
            const inputs = [];
            const recording = {matches: (input) => {
                inputs.push(input);
                return false;
            }, read: () => ({})};
            const block = getMakerNoteBlock({make: 'Make', model: 'Model', bytes: [1, 2]});

            readMakerNoteWithDecoders(block, getContext(), [recording, recording]);

            expect(inputs).to.deep.equal([{make: 'Make', model: 'Model', bytes: [1, 2]}, {make: 'Make', model: 'Model', bytes: [1, 2]}]);
            expect(inputs[0]).to.not.equal(inputs[1]);
            expect(inputs[0].bytes).to.equal(block.bytes);
        });

        it('should give read the view fields of the block and a context with the options and the engine context', () => {
            const inputs = [];
            const recording = {matches: () => true, read: (input) => {
                inputs.push(input);
                return {};
            }};
            const block = getMakerNoteBlock({});
            const ctx = getContext({options: {includeUnknown: 'unknown', computed: 'computed'}});

            readMakerNoteWithDecoders(block, ctx, [recording]);

            expect(inputs).to.deep.equal([{
                tiffView: block.tiffView,
                tiffHeaderOffset: 6,
                makerNoteOffset: 100,
                byteOrder: 'byte order',
                context: {includeUnknown: 'unknown', computed: 'computed', engineContext: ctx},
            }]);
            expect(inputs[0].tiffView).to.equal(block.tiffView);
            expect(inputs[0].context.engineContext).to.equal(ctx);
        });

        it('should give the tags a read returns as they are, undefined included', () => {
            const tags = {Tag: {value: 1}};

            expect(readMakerNoteWithDecoders(getMakerNoteBlock({}), getContext(), [{matches: () => true, read: () => tags}]).tags).to.equal(tags);
            expect(readMakerNoteWithDecoders(getMakerNoteBlock({}), getContext(), [{matches: () => true, read: () => undefined}])).to.deep.equal({tags: undefined});
        });

        it('should give a Promise of the tags when read gives a thenable', async () => {
            const tags = {Tag: {value: 1}};
            const thenable = {then: (resolve) => resolve(tags)};

            const result = readMakerNoteWithDecoders(getMakerNoteBlock({}), getContext(), [{matches: () => true, read: () => thenable}]);

            expect(result).to.be.an.instanceOf(Promise);
            expect((await result).tags).to.equal(tags);
        });

        function getDecoder(name, matchResult, log) {
            return {
                name,
                matches: () => {
                    log.push('matches ' + name);
                    return matchResult;
                },
                read: () => {
                    log.push('read ' + name);
                    return {[name]: true};
                },
            };
        }
    });
});
