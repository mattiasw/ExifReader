/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import Gif from '../../../../src/image-header-gif.js';
import GifFileTags from '../../../../src/gif-file-tags.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {gifHeader, gifReader} from '../../../../src/composable/formats/gif.js';
import {getContext, recordCalls} from '../test-context.js';

describe('composable/formats/gif', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should give the GIF file type', () => {
        expect(gifHeader.fileType).to.deep.equal({value: 'gif', description: 'GIF'});
    });

    it('should detect and find through Gif.isGifFile and Gif.findOffsets at call time', () => {
        const dataView = {};
        const ranges = [];
        const detects = recordCalls(Gif, 'isGifFile', 'detected');
        const finds = recordCalls(Gif, 'findOffsets', 'blocks');
        restores.push(detects.restore, finds.restore);

        expect(gifHeader.detect(dataView)).to.equal('detected');
        expect(gifHeader.find(dataView, ranges)).to.equal('blocks');

        expect(detects.calls).to.have.lengthOf(1);
        expect(detects.calls[0][0]).to.equal(dataView);
        expect(finds.calls).to.have.lengthOf(1);
        expect(finds.calls[0]).to.have.lengthOf(2);
        expect(finds.calls[0][0]).to.equal(dataView);
        expect(finds.calls[0][1]).to.equal(ranges);
    });

    it('should consume the gif kind into the gif group', () => {
        expect(gifReader.key).to.equal('gif');
        expect(gifReader.consumes).to.deep.equal(['gif']);
        expect(gifReader.emits).to.deep.equal([]);
        expect(gifReader.merge({})).to.deep.equal({slot: 'gif', mode: 'merge'});
    });

    it('should read the logical screen descriptor and filter its tags', () => {
        const {calls, restore} = recordCalls(GifFileTags, 'read', {GifVersion: {value: '89a'}, ImageWidth: {value: 1}});
        restores.push(restore);
        const ctx = getContext({tagFilter: createTagFilter({includeTags: {gif: ['GifVersion']}})});

        const result = gifReader.read({dataOffset: 6}, ctx);

        expect(result).to.deep.equal({tags: {GifVersion: {value: '89a'}}});
        expect(calls).to.deep.equal([[ctx.dataView, 6]]);
    });
});
