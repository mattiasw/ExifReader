/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import IsoBmffFileTags from '../../../../src/iso-bmff-file-tags.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {isoBmffFile} from '../../../../src/composable/formats/iso-bmff-file-reader.js';
import {getContext, recordCalls} from '../test-context.js';

describe('composable/formats/iso-bmff-file-reader', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should assign its tags to the isoBmffFile slot', () => {
        expect(isoBmffFile.merge({})).to.deep.equal({slot: 'isoBmffFile', mode: 'assign'});
    });

    it('should read the tags at the offsets of the block and filter them', () => {
        const {calls, restore} = recordCalls(IsoBmffFileTags, 'read', {ImageWidth: {value: 1}, BitsPerSample: {value: 8}});
        restores.push(restore);
        const ctx = getContext({tagFilter: createTagFilter({includeTags: {file: ['ImageWidth']}})});

        const block = {kind: 'isoBmffFile', imageDimensionsOffset: 10, pixelInformationOffset: 20, rotationOffset: 30, mirrorOffset: 40};

        const result = isoBmffFile.read(block, ctx);

        expect(result).to.deep.equal({tags: {ImageWidth: {value: 1}}});
        expect(calls).to.deep.equal([[ctx.dataView, block]]);
    });
});
