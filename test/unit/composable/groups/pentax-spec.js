/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import PentaxTags from '../../../../src/pentax-tags.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {pentax, pentaxDecoder} from '../../../../src/composable/groups/pentax.js';
import {getMakerNoteBlockFromExif} from '../../../../src/composable/group-helpers.js';
import {getContext, recordCalls} from '../test-context.js';
import {getDataView} from '../../test-utils.js';
import {getMakerNoteBlock, getPentaxType1Bytes} from './maker-note-test-data.js';

describe('composable/groups/pentax', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should build its block from the Exif tags with the shared maker note extractor', () => {
        expect(pentax.fromExif).to.equal(getMakerNoteBlockFromExif);
    });

    it('should bring the Pentax decoder alone', () => {
        expect(pentax.decoders).to.have.lengthOf(1);
        expect(pentax.decoders[0]).to.equal(pentaxDecoder);
        expect(pentaxDecoder.name).to.equal('pentax');
    });

    it('should match a maker note by its type-1 prefix, whatever the Make', () => {
        expect(pentaxDecoder.matches({make: undefined, model: undefined, bytes: getPentaxType1Bytes()})).to.equal(true);
        expect(pentaxDecoder.matches({make: 'Canon', model: undefined, bytes: getPentaxType1Bytes()})).to.equal(true);
    });

    it('should not match a maker note without the prefix', () => {
        const prefix = Array.from('PENTAX ').map((character) => character.charCodeAt(0));

        expect(pentaxDecoder.matches({make: 'PENTAX', model: undefined, bytes: [0, 1, 2, 3, 4, 5, 6, 7, 8]})).to.equal(false);
        expect(pentaxDecoder.matches({make: 'PENTAX', model: undefined, bytes: prefix}), 'the prefix alone').to.equal(false);
        expect(pentaxDecoder.matches({make: 'PENTAX', model: undefined, bytes: prefix.concat([0])}), 'the prefix and one byte').to.equal(true);
        expect(pentaxDecoder.matches({make: 'PENTAX', model: undefined, bytes: []}), 'no bytes').to.equal(false);
        expect(pentaxDecoder.matches({make: 'PENTAX', model: undefined, bytes: 'PENTAX \x00\x01'}), 'not an array').to.equal(false);
    });

    it('should read a Pentax maker note with the options, the filter and the value budget', () => {
        const reads = swapPentaxRead();
        const tagFilter = createTagFilter();
        const ctx = getContext({options: {includeUnknown: 'unknown', computed: 'computed'}, tagFilter});
        const block = getMakerNoteBlock({make: 'PENTAX', bytes: getPentaxType1Bytes()});

        expect(pentax.read(block, ctx)).to.deep.equal({tags: {PentaxVersion: {value: 1}}});
        expect(reads).to.deep.equal([[block.tiffView, 6, 100, 'unknown', 'computed', tagFilter, ctx.valueBudget]]);
        expect(ctx.valueBudget).to.not.equal(undefined);
    });

    it('should read from the fields of the contract argument and the engine context it carries', () => {
        const reads = swapPentaxRead();
        const tagFilter = createTagFilter();
        const ctx = getContext({tagFilter});
        const tiffView = getDataView('\x00');

        const tags = pentaxDecoder.read({tiffView, tiffHeaderOffset: 2, makerNoteOffset: 30, byteOrder: 'order', context: {includeUnknown: 'u', computed: 'c', engineContext: ctx}});

        expect(tags).to.deep.equal({PentaxVersion: {value: 1}});
        expect(reads).to.deep.equal([[tiffView, 2, 30, 'u', 'c', tagFilter, ctx.valueBudget]]);
    });

    it('should merge as an embeddable group', () => {
        expect(pentax.merge({})).to.deep.equal({slot: 'makerNotes', mode: 'assign'});
        expect(pentax.merge({carried: 'main'})).to.deep.equal({slot: 'carriedMakerNotes', mode: 'assign'});
        expect(pentax.merge({carried: 'rawProfile'})).to.deep.equal({slot: 'carriedMakerNotes', mode: 'merge'});
    });

    function swapPentaxRead() {
        const {calls, restore} = recordCalls(PentaxTags, 'read', {PentaxVersion: {value: 1}});
        restores.push(restore);
        return calls;
    }
});
