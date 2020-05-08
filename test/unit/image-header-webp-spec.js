/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import {__RewireAPI__ as ImageHeaderWebpRewireAPI} from '../../src/image-header-webp';
import ImageHeaderWebp from '../../src/image-header-webp';

describe('image-header-webp', () => {
    afterEach(() => {
        ImageHeaderWebpRewireAPI.__ResetDependency__('Constants');
    });

    it('should recognize a WebP file', () => {
        expect(ImageHeaderWebp.isWebpFile(getDataView('RIFFxxxxWEBP'))).to.be.true;
    });

    it('should not recognize something else as a WebP file', () => {
        expect(ImageHeaderWebp.isWebpFile(getDataView('RIFFxxxxOTHER'))).to.be.false;
    });

    it('should find Exif chunk', () => {
        const offsets = ImageHeaderWebp.findOffsets(getWebpDataView());

        expect(offsets.hasAppMarkers).to.be.true;
        expect(offsets.tiffHeaderOffset).to.equal(32);
    });

    it('should find correct Exif chunk offset when the Exif identifier has wrongly been left in', () => {
        const offsets = ImageHeaderWebp.findOffsets(getWebpDataView({withExifIdentifier: true}));

        expect(offsets.hasAppMarkers).to.be.true;
        expect(offsets.tiffHeaderOffset).to.equal(38);
    });

    it('should ignore Exif data if it is excluded from custom build', () => {
        ImageHeaderWebpRewireAPI.__Rewire__('Constants', {USE_EXIF: false});

        expect(ImageHeaderWebp.findOffsets(getWebpDataView()).tiffHeaderOffset).to.be.undefined;
    });

    it('should find XMP chunk', () => {
        const offsets = ImageHeaderWebp.findOffsets(getWebpDataView());

        expect(offsets.hasAppMarkers).to.be.true;
        expect(offsets.xmpChunks).to.deep.equal([{
            dataOffset: 44,
            length: 4
        }]);
    });

    it('should ignore XMP data if it is excluded from custom build', () => {
        ImageHeaderWebpRewireAPI.__Rewire__('Constants', {USE_XMP: false});

        expect(ImageHeaderWebp.findOffsets(getWebpDataView()).xmpChunks).to.be.undefined;
    });

    it('should find ICC chunk', () => {
        const offsets = ImageHeaderWebp.findOffsets(getWebpDataView());

        expect(offsets.hasAppMarkers).to.be.true;
        expect(offsets.iccChunks).to.deep.equal([{
            offset: 56,
            length: 4,
            chunkNumber: 1,
            chunksTotal: 1
        }]);
    });

    it('should ignore ICC data if it is excluded from custom build', () => {
        ImageHeaderWebpRewireAPI.__Rewire__('Constants', {USE_ICC: false});

        expect(ImageHeaderWebp.findOffsets(getWebpDataView()).iccChunks).to.be.undefined;
    });

    it('should handle when a chunk has odd size and padded data at the end', () => {
        // WebP chunks can not have an odd number of bytes in the data and have to be padded.
        const offsets = ImageHeaderWebp.findOffsets(getWebpDataView({oddSizedChunk: true}));

        expect(offsets.hasAppMarkers).to.be.true;
        expect(offsets.xmpChunks).to.deep.equal([{
            dataOffset: 58,
            length: 4
        }]);
    });

    it('should not find nonexistent meta data', () => {
        const offsets = ImageHeaderWebp.findOffsets(getWebpDataView({missingMetaData: true}));

        expect(offsets.hasAppMarkers).to.be.false;
        expect(offsets.tiffHeaderOffset).to.be.undefined;
        expect(offsets.xmpChunks).to.be.undefined;
    });

    function getWebpDataView({missingMetaData, oddSizedChunk, withExifIdentifier} = {}) {
        return getDataView(
            'RIFF\x10\x00\x00\x00WEBP'
            + 'aaaa\x04\x00\x00\x00abcd'
            + (missingMetaData || withExifIdentifier ? '' : 'EXIF\x04\x00\x00\x00abcd')
            + (withExifIdentifier ? 'EXIF\x04\x00\x00\x00Exif\x00\x00abcd' : '')
            + (oddSizedChunk ? 'VP8 \x05\x00\x00\x00abcde\x00' : '')
            + (missingMetaData ? '' : 'XMP \x04\x00\x00\x00abcd')
            + (missingMetaData ? '' : 'ICCP\x04\x00\x00\x00abcd')
        );
    }
});
