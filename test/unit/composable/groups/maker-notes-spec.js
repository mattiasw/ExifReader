/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import CanonTags from '../../../../src/canon-tags.js';
import PentaxTags from '../../../../src/pentax-tags.js';
import {makerNotes} from '../../../../src/composable/groups/maker-notes.js';
import {getMakerNoteBlockFromExif} from '../../../../src/composable/group-helpers.js';
import {getContext, recordCalls} from '../test-context.js';
import {getMakerNoteBlock, getPentaxType1Bytes} from './maker-note-test-data.js';

describe('composable/groups/maker-notes', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should build its block from the Exif tags with the shared maker note extractor', () => {
        expect(makerNotes.fromExif).to.equal(getMakerNoteBlockFromExif);
    });

    it('should read a Pentax type-1 maker note with the Pentax decoder', () => {
        const {canonReads, pentaxReads} = swapReads();

        expect(makerNotes.read(getMakerNoteBlock({make: ['PENTAX'], bytes: getPentaxType1Bytes()}), getContext())).to.deep.equal({tags: {Pentax: {value: 1}}});
        expect(canonReads).to.have.lengthOf(0);
        expect(pentaxReads).to.have.lengthOf(1);
    });

    it('should try Canon by Make before Pentax by prefix', () => {
        const {canonReads, pentaxReads} = swapReads();

        expect(makerNotes.read(getMakerNoteBlock({make: ['Canon'], bytes: getPentaxType1Bytes()}), getContext())).to.deep.equal({tags: {Canon: {value: 1}}});
        expect(canonReads).to.have.lengthOf(1);
        expect(pentaxReads).to.have.lengthOf(0);
    });

    it('should merge as an embeddable group', () => {
        expect(makerNotes.merge({})).to.deep.equal({slot: 'makerNotes', mode: 'assign'});
        expect(makerNotes.merge({carried: 'main'})).to.deep.equal({slot: 'carriedMakerNotes', mode: 'assign'});
        expect(makerNotes.merge({carried: 'rawProfile'})).to.deep.equal({slot: 'carriedMakerNotes', mode: 'merge'});
    });

    function swapReads() {
        const canon = recordCalls(CanonTags, 'read', {Canon: {value: 1}});
        const pentax = recordCalls(PentaxTags, 'read', {Pentax: {value: 1}});
        restores.push(canon.restore, pentax.restore);
        return {canonReads: canon.calls, pentaxReads: pentax.calls};
    }
});
