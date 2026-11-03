/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import PhotoshopTags from '../../../../src/photoshop-tags.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {photoshop} from '../../../../src/composable/groups/photoshop.js';
import {getContext, recordCalls} from '../test-context.js';

describe('composable/groups/photoshop', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should read the settings bytes and filter the tags', () => {
        const {calls, restore} = recordCalls(PhotoshopTags, 'read', {ClippingPathName: {value: 'p'}, Other: {value: 1}});
        restores.push(restore);
        const tagFilter = createTagFilter({includeTags: {photoshop: ['ClippingPathName']}});
        const ctx = getContext({options: {includeUnknown: 'unknown'}, tagFilter});

        const result = photoshop.read({kind: 'photoshop', value: [1, 2]}, ctx);

        expect(result).to.deep.equal({tags: {ClippingPathName: {value: 'p'}}});
        expect(calls).to.deep.equal([[[1, 2], 'unknown', tagFilter]]);
    });

    it('should merge as an embeddable group', () => {
        expect(photoshop.merge({})).to.deep.equal({slot: 'photoshop', mode: 'assign'});
        expect(photoshop.merge({carried: 'main'})).to.deep.equal({slot: 'carriedPhotoshop', mode: 'assign'});
        expect(photoshop.merge({carried: 'rawProfile'})).to.deep.equal({slot: 'carriedPhotoshop', mode: 'merge'});
    });
});
