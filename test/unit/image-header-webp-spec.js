/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, swapProperties} from './test-utils.js';
import Constants from '../../src/constants.js';
import ImageHeaderWebp from '../../src/image-header-webp.js';

describe('image-header-webp', () => {
    let restoreConstants;

    afterEach(() => {
        if (restoreConstants) {
            restoreConstants();
            restoreConstants = undefined;
        }
    });

    it('should recognize a WebP file', () => {
        expect(ImageHeaderWebp.isWebpFile(getDataView('RIFFxxxxWEBP'))).to.be.true;
    });

    it('should not recognize something else as a WebP file', () => {
        expect(ImageHeaderWebp.isWebpFile(getDataView('RIFFxxxxOTHER'))).to.be.false;
    });

    it('should find the Exif chunk as an exif block', () => {
        expect(getBlock(findBlocks(), 'exif')).to.deep.equal({kind: 'exif', tiffHeaderOffset: 32});
    });

    it('should find correct Exif chunk offset when the Exif identifier has wrongly been left in', () => {
        expect(getBlock(findBlocks({withExifIdentifier: true}), 'exif')).to.deep.equal({kind: 'exif', tiffHeaderOffset: 38});
    });

    it('should find the VP8X chunk as a riff block', () => {
        expect(getBlock(findBlocks(), 'riff')).to.deep.equal({kind: 'riff', dataOffset: 44});
    });

    it('should find the XMP chunk as an xmp block', () => {
        expect(getBlock(findBlocks(), 'xmp')).to.deep.equal({kind: 'xmp', chunks: [{dataOffset: 62, length: 4}]});
    });

    it('should find the ICCP chunk as an icc block', () => {
        expect(getBlock(findBlocks(), 'icc')).to.deep.equal({
            kind: 'icc',
            chunks: [{offset: 74, length: 4, chunkNumber: 1, chunksTotal: 1}],
        });
    });

    it('should report every block in chunk order', () => {
        expect(findBlocks().map((block) => block.kind)).to.deep.equal(['exif', 'riff', 'xmp', 'icc']);
    });

    it('should keep the last chunk of each id, listing every chunk', () => {
        const ranges = [];

        const blocks = ImageHeaderWebp.findOffsets(getDataView(
            'RIFF\x10\x00\x00\x00WEBP'
            + 'EXIF\x04\x00\x00\x00abcd'
            + 'XMP \x04\x00\x00\x00abcd'
            + 'EXIF\x04\x00\x00\x00efgh'
            + 'XMP \x06\x00\x00\x00abcdef'
        ), ranges);

        expect(blocks).to.deep.equal([
            {kind: 'exif', tiffHeaderOffset: 44},
            {kind: 'xmp', chunks: [{dataOffset: 56, length: 6}]},
        ]);
        expect(ranges.map((range) => range.block)).to.deep.equal([blocks[0], blocks[1], blocks[0], blocks[1]]);
        expect(ranges[2].block).to.equal(blocks[0]);
    });

    it('should report every metadata kind whatever the custom-build flags say', () => {
        restoreConstants = swapProperties(Constants, {USE_EXIF: false, USE_XMP: false, USE_ICC: false});
        const ranges = [];

        const blocks = findBlocks({}, ranges);

        expect(getBlock(blocks, 'exif').tiffHeaderOffset).to.equal(32);
        expect(getBlock(blocks, 'xmp').chunks).to.have.lengthOf(1);
        expect(getBlock(blocks, 'icc').chunks).to.have.lengthOf(1);
        expect(ranges.map((range) => range.block.kind)).to.include.members(['exif', 'xmp', 'icc']);
    });

    it('should handle when a chunk has odd size and padded data at the end', () => {
        // WebP chunks can not have an odd number of bytes in the data and have to be padded.
        expect(getBlock(findBlocks({oddSizedChunk: true}), 'xmp')).to.deep.equal({kind: 'xmp', chunks: [{dataOffset: 76, length: 4}]});
    });

    it('should not find nonexistent meta data', () => {
        expect(findBlocks({missingMetaData: true})).to.deep.equal([]);
    });

    describe('ranges', () => {
        it('should not push anything when no out-array is given', () => {
            expect(findBlocks()).to.not.have.property('truncated');
        });

        it('should list exif, riff, xmp and icc spans for a full file, linked to their blocks', () => {
            const ranges = [];
            const blocks = findBlocks({}, ranges);
            expect(ranges).to.deep.equal([
                {block: blocks[0], start: 24, end: 36},
                {block: blocks[1], start: 36, end: 54},
                {block: blocks[2], start: 54, end: 66},
                {block: blocks[3], start: 66, end: 78},
            ]);
            for (let i = 0; i < ranges.length; i++) {
                expect(ranges[i].block).to.equal(blocks[i]);
            }
        });

        it('should leave the array empty when there is no metadata', () => {
            const ranges = [];
            findBlocks({missingMetaData: true}, ranges);
            expect(ranges).to.deep.equal([]);
        });
    });

    function findBlocks(options, ranges) {
        return ImageHeaderWebp.findOffsets(getWebpDataView(options), ranges);
    }

    function getBlock(blocks, kind) {
        return blocks.find((block) => block.kind === kind);
    }

    function getWebpDataView({missingMetaData, oddSizedChunk, withExifIdentifier} = {}) {
        return getDataView(
            'RIFF\x10\x00\x00\x00WEBP'
            + 'aaaa\x04\x00\x00\x00abcd'
            + (missingMetaData || withExifIdentifier ? '' : 'EXIF\x04\x00\x00\x00abcd')
            + (withExifIdentifier ? 'EXIF\x04\x00\x00\x00Exif\x00\x00abcd' : '')
            + (oddSizedChunk ? 'VP8 \x05\x00\x00\x00abcde\x00' : '')
            // https://developers.google.com/speed/webp/docs/riff_container#extended_file_format
            + (missingMetaData ? '' : 'VP8X\x0a\x00\x00\x00\x3e\x00\x00\x00\x03\x02\x01\x04\x03\x02')
            + (missingMetaData ? '' : 'XMP \x04\x00\x00\x00abcd')
            + (missingMetaData ? '' : 'ICCP\x04\x00\x00\x00abcd')
        );
    }
});
