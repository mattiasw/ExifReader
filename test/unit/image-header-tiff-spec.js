/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, swapProperties} from './test-utils.js';
import Constants from '../../src/constants.js';
import ImageHeaderTiff from '../../src/image-header-tiff.js';

describe('image-header-tiff', () => {
    it('should recognize a TIFF file with little-endian encoding', () => {
        expect(ImageHeaderTiff.isTiffFile(getDataView('\x49\x49\x2a\x00'))).to.be.true;
    });

    it('should recognize a TIFF file with big-endian encoding', () => {
        expect(ImageHeaderTiff.isTiffFile(getDataView('\x4d\x4d\x00\x2a'))).to.be.true;
    });

    it('should not recognize something else as a TIFF file', () => {
        expect(ImageHeaderTiff.isTiffFile(getDataView('RIFFxxxxWEBP'))).to.be.false;
    });

    it('should not recognize a too-short buffer as TIFF', () => {
        expect(ImageHeaderTiff.isTiffFile(getDataView('\x49\x49'))).to.be.false;
    });

    it('should not recognize undefined input as TIFF', () => {
        expect(ImageHeaderTiff.isTiffFile(undefined)).to.be.false;
    });

    it('should return one exif block with the TIFF header at offset 0', () => {
        expect(ImageHeaderTiff.findTiffOffsets()).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 0}]);
    });

    it('should return the exif block even if Exif is excluded from custom build', () => {
        const restoreConstants = swapProperties(Constants, {USE_EXIF: false});
        try {
            expect(ImageHeaderTiff.findTiffOffsets()).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 0}]);
        } finally {
            restoreConstants();
        }
    });
});
