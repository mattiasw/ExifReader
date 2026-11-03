/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from '../test-utils.js';
import {createTagFilter} from '../../../src/tag-filter.js';
import TagNames0thIfd from '../../../src/tag-names-0th-ifd.js';
import TagNamesExifIfd from '../../../src/tag-names-exif-ifd.js';
import {
    MAKER_NOTE_DESCRIPTORS,
    parsedTags,
    getBlockDataView,
    getBrobDataView,
    getEmbeddableMergeDescriptor,
    isPngTextChunkBlock,
    readMakerNoteWithDecoders,
} from '../../../src/composable/group-helpers.js';
import {getContext} from './test-context.js';

describe('composable/group-helpers', () => {
    it('should describe MakerNote and Make', () => {
        expect(MAKER_NOTE_DESCRIPTORS).to.deep.equal([{ifd: 'exif', id: 0x927c}, {ifd: '0th', id: 0x010f}]);
        expect(TagNamesExifIfd[0x927c].name).to.equal('MakerNote');
        expect(TagNames0thIfd[0x010f]).to.equal('Make');
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
