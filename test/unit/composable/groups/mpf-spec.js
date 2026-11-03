/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import MpfTags from '../../../../src/mpf-tags.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {mpf} from '../../../../src/composable/groups/mpf.js';
import {getContext, recordCalls} from '../test-context.js';

describe('composable/groups/mpf', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should consume the mpf kind and inject no tags', () => {
        expect(mpf.key).to.equal('mpf');
        expect(mpf.consumes).to.deep.equal(['mpf']);
        expect(mpf.emits).to.deep.equal([]);
        expect(mpf.descriptors).to.deep.equal([]);
        expect(mpf.merge({})).to.deep.equal({slot: 'mpf', mode: 'assign'});
    });

    it('should read the segment with the options, the value budget and the base64 helper and filter the tags', () => {
        const {calls, restore} = recordCalls(MpfTags, 'read', {MPFVersion: {value: 1}, NumberOfImages: {value: 2}});
        restores.push(restore);
        const tagFilter = createTagFilter({includeTags: {mpf: ['MPFVersion']}});
        const getBase64Image = () => 'b64';
        const ctx = getContext({options: {includeUnknown: 'unknown', computed: 'computed'}, tagFilter, getBase64Image});

        const result = mpf.read({kind: 'mpf', dataOffset: 40}, ctx);

        expect(result).to.deep.equal({tags: {MPFVersion: {value: 1}}});
        expect(calls).to.deep.equal([[ctx.dataView, 40, 'unknown', 'computed', tagFilter, ctx.valueBudget, getBase64Image]]);
        expect(ctx.valueBudget).to.not.equal(undefined);
    });
});
