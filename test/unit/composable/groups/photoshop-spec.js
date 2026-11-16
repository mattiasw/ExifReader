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

    describe('building its block from the Exif tags', () => {
        it('should build the block from the settings when both tags are there', () => {
            const parsed = {ImageSourceData: {value: [1]}, PhotoshopSettings: {value: [2]}};

            expect(photoshop.fromExif(parsed, {carried: 'main'})).to.deep.equal({kind: 'photoshop', value: [2], carried: 'main'});
            expect(photoshop.fromExif(parsed, {carried: 'rawProfile'})).to.deep.equal({kind: 'photoshop', value: [2], carried: 'rawProfile'});
        });

        it('should build no block without both tags or with non-array settings', () => {
            for (const parsed of [
                {ImageSourceData: {value: [1]}},
                {PhotoshopSettings: {value: [2]}},
                {ImageSourceData: {value: [1]}, PhotoshopSettings: {value: 'settings'}},
            ]) {
                expect(photoshop.fromExif(parsed, {carried: 'main'}), JSON.stringify(parsed)).to.not.be.ok;
            }
        });
    });
});
