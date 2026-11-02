/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils.js';
import ImageHeaderGif from '../../src/image-header-gif.js';

describe('image-header-gif', () => {
    it('should handle empty input', () => {
        expect(ImageHeaderGif.isGifFile(undefined)).to.be.false;
    });

    it('should recognize a GIF87a file', () => {
        expect(ImageHeaderGif.isGifFile(getDataView('GIF87a'))).to.be.true;
    });

    it('should recognize a GIF89a file', () => {
        expect(ImageHeaderGif.isGifFile(getDataView('GIF89a'))).to.be.true;
    });

    it('should not recognize something else as a GIF file', () => {
        expect(ImageHeaderGif.isGifFile(getDataView('RIFF'))).to.be.false;
    });

    it('should report the screen descriptor as a gif block at offset 0', () => {
        expect(ImageHeaderGif.findOffsets('GIF87a<screen descriptor>')).to.deep.equal([{kind: 'gif', dataOffset: 0}]);
    });

    describe('ranges', () => {
        it('should not need the out-array', () => {
            expect(ImageHeaderGif.findOffsets('GIF87a<screen descriptor>')).to.not.have.property('truncated');
        });

        it('should list a span covering the GIF header, linked to the gif block', () => {
            const ranges = [];
            const blocks = ImageHeaderGif.findOffsets('GIF87a<screen descriptor>', ranges);
            expect(ranges).to.deep.equal([
                {block: blocks[0], start: 0, end: 13},
            ]);
            expect(ranges[0].block).to.equal(blocks[0]);
        });
    });
});
