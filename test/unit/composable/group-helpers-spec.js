/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from '../test-utils.js';
import CanonTags from '../../../src/canon-tags.js';
import PentaxTags from '../../../src/pentax-tags.js';
import {createTagFilter} from '../../../src/tag-filter.js';
import {
    parsedTags,
    getBlockDataView,
    getBrobDataView,
    getEmbeddableMergeDescriptor,
    isPngTextChunkBlock,
    mergeMakerNoteGroups,
    readMakerNoteWithDecoders,
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

        it('should read with the merged decoders, Canon by Make before Pentax by prefix', () => {
            const [merged] = mergeMakerNoteGroups([pentax, canon]);
            const canonReads = recordCalls(CanonTags, 'read', {Canon: {value: 1}});
            const pentaxReads = recordCalls(PentaxTags, 'read', {Pentax: {value: 1}});
            restores.push(canonReads.restore, pentaxReads.restore);

            expect(merged.read(getMakerNoteBlock({make: ['Canon'], bytes: getPentaxType1Bytes()}), getContext())).to.deep.equal({tags: {Canon: {value: 1}}});
            expect(merged.read(getMakerNoteBlock({make: ['PENTAX'], bytes: getPentaxType1Bytes()}), getContext())).to.deep.equal({tags: {Pentax: {value: 1}}});
            expect(merged.read(getMakerNoteBlock({make: ['Nikon']}), getContext())).to.equal(undefined);
            expect(canonReads.calls).to.have.lengthOf(1);
            expect(pentaxReads.calls).to.have.lengthOf(1);
        });

        function getOtherGroup(key) {
            return {key, consumes: ['exif'], emits: [], read: () => undefined, merge: () => ({})};
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
            const block = {};
            const ctx = getContext();

            expect(readMakerNoteWithDecoders(block, ctx, decoders)).to.deep.equal({tags: {b: true}});
            expect(log).to.deep.equal(['matches a', 'matches b', 'read b']);
        });

        it('should read nothing when no decoder matches', () => {
            expect(readMakerNoteWithDecoders({}, getContext(), [getDecoder('a', false, [])])).to.equal(undefined);
            expect(readMakerNoteWithDecoders({}, getContext(), [])).to.equal(undefined);
        });

        function getDecoder(name, isMatch, log) {
            return {
                name,
                matches: () => {
                    log.push('matches ' + name);
                    return isMatch;
                },
                read: () => {
                    log.push('read ' + name);
                    return {[name]: true};
                },
            };
        }
    });
});
