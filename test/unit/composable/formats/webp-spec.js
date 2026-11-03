/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import Webp from '../../../../src/image-header-webp.js';
import Vp8xTags from '../../../../src/vp8x-tags.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {webpHeader, riff} from '../../../../src/composable/formats/webp.js';
import {getContext, recordCalls} from '../test-context.js';

describe('composable/formats/webp', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should give the WebP file type', () => {
        expect(webpHeader.fileType).to.deep.equal({value: 'webp', description: 'WebP'});
    });

    it('should detect and find through Webp.isWebpFile and Webp.findOffsets at call time', () => {
        const dataView = {};
        const ranges = [];
        const detects = recordCalls(Webp, 'isWebpFile', 'detected');
        const finds = recordCalls(Webp, 'findOffsets', 'blocks');
        restores.push(detects.restore, finds.restore);

        expect(webpHeader.detect(dataView)).to.equal('detected');
        expect(webpHeader.find(dataView, ranges)).to.equal('blocks');

        expect(detects.calls).to.have.lengthOf(1);
        expect(detects.calls[0][0]).to.equal(dataView);
        expect(finds.calls).to.have.lengthOf(1);
        expect(finds.calls[0]).to.have.lengthOf(2);
        expect(finds.calls[0][0]).to.equal(dataView);
        expect(finds.calls[0][1]).to.equal(ranges);
    });

    it('should merge its tags into the riff slot', () => {
        expect(riff.merge({})).to.deep.equal({slot: 'riff', mode: 'merge'});
    });

    it('should read the VP8X chunk and filter its tags', () => {
        const {calls, restore} = recordCalls(Vp8xTags, 'read', {Alpha: {value: 1}, Animation: {value: 0}});
        restores.push(restore);
        const ctx = getContext({tagFilter: createTagFilter({includeTags: {riff: ['Alpha']}})});

        const result = riff.read({dataOffset: 20}, ctx);

        expect(result).to.deep.equal({tags: {Alpha: {value: 1}}});
        expect(calls).to.deep.equal([[ctx.dataView, 20]]);
    });
});
