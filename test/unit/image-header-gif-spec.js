/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import ImageHeaderGif from '../../src/image-header-gif';

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

    it('should find screen descriptor offset', () => {
        expect(ImageHeaderGif.findOffsets('GIF87a<screen descriptor>')).to.deep.equal({
            gifHeaderOffset: 0
        });
    });
});
