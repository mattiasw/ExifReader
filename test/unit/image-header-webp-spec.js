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

        it('should not mark a complete file as truncated', () => {
            const ranges = [];
            ImageHeaderWebp.findOffsets(getDataView(
                'RIFF\x22\x00\x00\x00WEBP'
                + 'VP8X\x0a\x00\x00\x00\x3e\x00\x00\x00\x03\x02\x01\x04\x03\x02'
                + 'EXIF\x04\x00\x00\x00abcd'
            ), ranges);
            expect(ranges.truncated).to.equal(false);
            expect(ranges).to.not.have.property('resumeEnd');
        });

        it('should mark the walk truncated and resume at the RIFF end when an image chunk overruns the view and more chunks follow it', () => {
            const ranges = [];
            ImageHeaderWebp.findOffsets(getDataView(
                'RIFF\x28\x00\x00\x00WEBP'
                + 'VP8 \x0f\x00\x00\x00abcd'
            ), ranges);
            expect(ranges.truncated).to.equal(true);
            expect(ranges.resumeEnd).to.equal(8 + 0x28);
        });

        it('should mark the walk truncated when the view ends between chunks before the RIFF end', () => {
            const ranges = [];
            ImageHeaderWebp.findOffsets(getDataView(
                'RIFF\x40\x00\x00\x00WEBP'
                + 'VP8 \x04\x00\x00\x00abcd'
            ), ranges);
            expect(ranges.truncated).to.equal(true);
            expect(ranges.resumeEnd).to.equal(8 + 0x40);
        });

        it('should resume at the RIFF end when the view ends right after a chunk header', () => {
            const head = 'RIFF\x1c\x00\x00\x00WEBP'
                + 'VP8 \x04\x00\x00\x00abcd'
                + 'EXIF\x04\x00\x00\x00';
            const cutRanges = [];
            ImageHeaderWebp.findOffsets(getDataView(head), cutRanges);
            expect(cutRanges.truncated).to.equal(true);
            expect(cutRanges.resumeEnd).to.equal(8 + 0x1c);

            const resumedView = getDataView(head + 'abcd');
            const resumedRanges = [];
            const blocks = ImageHeaderWebp.findOffsets(resumedView, resumedRanges);
            expect(resumedView.byteLength).to.equal(cutRanges.resumeEnd);
            expect(resumedRanges).to.deep.equal([{block: blocks[0], start: 24, end: 36}]);
            expect(resumedRanges.truncated).to.equal(false);
        });

        it('should not mark the walk truncated when the chunk that overruns the view is the last one the RIFF size declares', () => {
            const ranges = [];
            ImageHeaderWebp.findOffsets(getDataView(
                'RIFF\x2e\x00\x00\x00WEBP'
                + 'VP8X\x0a\x00\x00\x00\x3e\x00\x00\x00\x03\x02\x01\x04\x03\x02'
                + 'VP8 \x10\x00\x00\x00abcd'
            ), ranges);
            expect(ranges.truncated).to.equal(false);
            expect(ranges).to.not.have.property('resumeEnd');
        });

        it('should not mark a file that ends in an empty chunk as truncated', () => {
            const ranges = [];
            ImageHeaderWebp.findOffsets(getDataView(
                'RIFF\x18\x00\x00\x00WEBP'
                + 'VP8 \x04\x00\x00\x00abcd'
                + 'EXIF\x00\x00\x00\x00'
            ), ranges);
            expect(ranges.truncated).to.equal(false);
        });

        it('should not mark the walk truncated when the RIFF size is smaller than the data', () => {
            const ranges = [];
            ImageHeaderWebp.findOffsets(getDataView(
                'RIFF\x10\x00\x00\x00WEBP'
                + 'VP8X\x0a\x00\x00\x00\x3e\x00\x00\x00\x03\x02\x01\x04\x03\x02'
                + 'EXIF\x04\x00\x00\x00abcd'
            ), ranges);
            expect(ranges.truncated).to.equal(false);
        });

        it('should mark a cut-off file truncated only when a chunk header fits before the RIFF end', () => {
            const chunks = 'WEBP' + 'VP8 \x04\x00\x00\x00abcd';
            const noRoomRanges = [];
            ImageHeaderWebp.findOffsets(getDataView('RIFF\x18\x00\x00\x00' + chunks), noRoomRanges);
            expect(noRoomRanges.truncated).to.equal(false);

            const roomRanges = [];
            ImageHeaderWebp.findOffsets(getDataView('RIFF\x19\x00\x00\x00' + chunks), roomRanges);
            expect(roomRanges.truncated).to.equal(true);
            expect(roomRanges.resumeEnd).to.equal(8 + 0x19);
        });

        it('should not mark the walk truncated when the VP8X flags declare neither Exif nor XMP', () => {
            const ranges = [];
            ImageHeaderWebp.findOffsets(getDataView(getAnimatedWebpPrefix('\x32')), ranges);
            expect(ranges.truncated).to.equal(false);
            expect(ranges).to.not.have.property('resumeEnd');
        });

        it('should mark the walk truncated when the VP8X flags declare Exif or XMP', () => {
            for (const flags of ['\x08', '\x04']) {
                const ranges = [];
                ImageHeaderWebp.findOffsets(getDataView(getAnimatedWebpPrefix(flags)), ranges);
                expect(ranges.truncated).to.equal(true);
                expect(ranges.resumeEnd).to.equal(8 + 0x46);
            }
        });

        it('should resume at the RIFF end, not past the next chunk header, when the view ends inside one of several chunks', () => {
            const ranges = [];
            ImageHeaderWebp.findOffsets(getDataView(
                'RIFF\x46\x00\x00\x00WEBP'
                + 'VP8X\x0a\x00\x00\x00\x08\x00\x00\x00\x03\x02\x01\x04\x03\x02'
                + 'ANMF\x04\x00\x00\x00abcd'
                + 'ANMF\x10\x00\x00\x00abcd'
            ), ranges);
            expect(ranges.truncated).to.equal(true);
            expect(ranges.resumeEnd).to.equal(8 + 0x46);
        });

        // The RIFF size declares 24 bytes after the ANMF chunk, which runs past the view.
        function getAnimatedWebpPrefix(flags) {
            return 'RIFF\x46\x00\x00\x00WEBP'
                + 'VP8X\x0a\x00\x00\x00' + flags + '\x00\x00\x00\x03\x02\x01\x04\x03\x02'
                + 'ANMF\x10\x00\x00\x00abcd';
        }
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
