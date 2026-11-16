/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import CanonTags from '../../../../src/canon-tags.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {canon, canonDecoder} from '../../../../src/composable/groups/canon.js';
import {getMakerNoteBlockFromExif} from '../../../../src/composable/group-helpers.js';
import {getContext, recordCalls} from '../test-context.js';
import {getMakerNoteBlock} from './maker-note-test-data.js';

describe('composable/groups/canon', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should build its block from the Exif tags with the shared maker note extractor', () => {
        expect(canon.fromExif).to.equal(getMakerNoteBlockFromExif);
    });

    it('should bring the Canon decoder alone', () => {
        expect(canon.decoders).to.have.lengthOf(1);
        expect(canon.decoders[0]).to.equal(canonDecoder);
        expect(canonDecoder.name).to.equal('canon');
    });

    it('should match a maker note by a Make of Canon', () => {
        expect(canonDecoder.matches(getMakerNoteBlock({make: ['Canon']}))).to.equal(true);
        expect(canonDecoder.matches(getMakerNoteBlock({make: ['Nikon']}))).to.equal(false);
        expect(canonDecoder.matches(getMakerNoteBlock({make: 'Canon'}))).to.equal(false);
        expect(canonDecoder.matches(getMakerNoteBlock({make: undefined}))).to.equal(false);
    });

    it('should read a Canon maker note with the options, the filter and the value budget', () => {
        const reads = swapCanonRead();
        const tagFilter = createTagFilter();
        const ctx = getContext({options: {includeUnknown: 'unknown', computed: 'computed'}, tagFilter});
        const block = getMakerNoteBlock({make: ['Canon']});

        expect(canon.read(block, ctx)).to.deep.equal({tags: {LensModel: {value: 'l'}}});
        expect(reads).to.deep.equal([[block.tiffView, 6, 100, 'byte order', 'unknown', 'computed', tagFilter, ctx.valueBudget]]);
        expect(ctx.valueBudget).to.not.equal(undefined);
    });

    it('should merge as an embeddable group', () => {
        expect(canon.merge({})).to.deep.equal({slot: 'makerNotes', mode: 'assign'});
        expect(canon.merge({carried: 'main'})).to.deep.equal({slot: 'carriedMakerNotes', mode: 'assign'});
        expect(canon.merge({carried: 'rawProfile'})).to.deep.equal({slot: 'carriedMakerNotes', mode: 'merge'});
    });

    function swapCanonRead() {
        const {calls, restore} = recordCalls(CanonTags, 'read', {LensModel: {value: 'l'}});
        restores.push(restore);
        return calls;
    }
});
