/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getConsoleWarnSpy, getDataView, swapProperties} from './test-utils.js';
import Constants from '../../src/constants.js';
import ImageHeaderJpeg from '../../src/image-header-jpeg.js';

const JPEG_IMAGE_START = '\xff\xd8\xff\xe0\x00\x07JFIF\x00';
const APP0_MARKER = '\xff\xe0';
const APP1_MARKER = '\xff\xe1';
const APP_UNKNOWN_MARKER = '\xff\xea';
const COMMENT_MARKER = '\xff\xfe';
const SOF0_MARKER = '\xff\xc0';
const SOF2_MARKER = '\xff\xc2';
const DHT_MARKER = '\xff\xc4';
const DQT_MARKER = '\xff\xdb';
const DRI_MARKER = '\xff\xdd';
const SOS_MARKER = '\xff\xda';
const SOME_MARKER_CONTENT = `${APP1_MARKER}\x47\x11Exif\x00\x00`;
// The smallest well-formed APP2 ICC segment: the marker, a field length of 16 covering
// the length field plus the identifier plus the two chunk bytes, then chunk 1 of 1.
const MINIMAL_ICC_SEGMENT = '\xff\xe2\x00\x10ICC_PROFILE\x00\x01\x01';
// A larger APP2 ICC segment: a field length of 20 puts four bytes of profile data after
// the two chunk bytes, so a scan that reuses another segment's length loses its place.
const PADDED_ICC_SEGMENT = '\xff\xe2\x00\x14ICC_PROFILE\x00\x01\x01\x00\x00\x00\x00';
// The smallest APP1 XMP segment: a field length of 31 covers the length field plus
// the identifier, with no packet bytes.
const MINIMAL_XMP_SEGMENT = '\xff\xe1\x00\x1fhttp://ns.adobe.com/xap/1.0/\x00';
// A larger APP1 XMP segment: a field length of 35 puts four packet bytes after the
// identifier, so a scan that reuses another segment's length loses its place.
const PADDED_XMP_SEGMENT = '\xff\xe1\x00\x23http://ns.adobe.com/xap/1.0/\x00\x00\x00\x00\x00';
// The smallest APP1 extended XMP segment: the identifier, the GUID, the total length
// and the offset, with no packet bytes.
const MINIMAL_EXTENDED_XMP_SEGMENT = '\xff\xe1\x00\x4dhttp://ns.adobe.com/xmp/extension/\x00'
    + '5740B4AB4292ABB7BDCE0639415FA33F\x00\x00\x00\x00\x00\x00\x00\x00';
// A larger APP1 extended XMP segment: a field length of 81 puts four packet bytes after
// the offset, so a scan that reuses another segment's length loses its place.
const PADDED_EXTENDED_XMP_SEGMENT = '\xff\xe1\x00\x51http://ns.adobe.com/xmp/extension/\x00'
    + '5740B4AB4292ABB7BDCE0639415FA33F\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00';
const TIFF_HEADER_LITTLE_ENDIAN = '\x49\x49\x2a\x00\x08\x00\x00\x00';
const ZEROTH_IFD_WITH_ONE_ENTRY = '\x01\x00'
    + '\x0f\x01\x02\x00\x01\x00\x00\x00\x00\x00\x00\x00'
    + '\x00\x00\x00\x00';
const ZEROTH_IFD_WITH_ZERO_ENTRIES = '\x00\x00' + '\x00\x00\x00\x00';
const EXIF_SEGMENT_WITH_IFD_ENTRY = `${APP1_MARKER}\x00\x22Exif\x00\x00${TIFF_HEADER_LITTLE_ENDIAN}${ZEROTH_IFD_WITH_ONE_ENTRY}`;
const EXIF_SEGMENT_WITHOUT_IFD_ENTRIES = `${APP1_MARKER}\x00\x16Exif\x00\x00${TIFF_HEADER_LITTLE_ENDIAN}${ZEROTH_IFD_WITH_ZERO_ENTRIES}`;
// Longer than EXIF_SEGMENT_WITH_IFD_ENTRY, so preferring that one shows an empty 0th IFD loses whatever the segment size.
const PADDED_EXIF_SEGMENT_WITHOUT_IFD_ENTRIES = `${APP1_MARKER}\x00\x26Exif\x00\x00${TIFF_HEADER_LITTLE_ENDIAN}${ZEROTH_IFD_WITH_ZERO_ENTRIES}`
    + '\x00'.repeat(16);

describe('image-header-jpeg', () => {
    it('should recognize a JPEG file', () => {
        expect(ImageHeaderJpeg.isJpegFile(getDataView('\xff\xd8\xff\xe100Exif\x00\x00'))).to.be.true;
    });

    it('should not recognize something else as a JPEG file', () => {
        expect(ImageHeaderJpeg.isJpegFile(getDataView('RIFFxxxxWEBP'))).to.be.false;
    });

    it('should not recognize a too-short buffer as JPEG', () => {
        expect(ImageHeaderJpeg.isJpegFile(getDataView('\xff'))).to.be.false;
    });

    it('should not recognize undefined input as JPEG', () => {
        expect(ImageHeaderJpeg.isJpegFile(undefined)).to.be.false;
    });

    it('should find no blocks when there are no markers', () => {
        expect(findBlocks('\xff\xd8----------')).to.deep.equal([]);
    });

    it('should find no blocks when there is no Exif identifier for APP1', () => {
        expect(findBlocks('\xff\xd8\xff\xe1--------')).to.deep.equal([]);
    });

    it('should find no blocks for faulty APP markers', () => {
        expect(findBlocks('\xff\xd8\xfe\xdc\x00\x6fJFIF\x65\x01\x01\x01\x00\x48')).to.deep.equal([]);
    });

    it('should handle APP2 markers', () => {
        const blocks = findBlocks(`${JPEG_IMAGE_START}\xff\xe2\x00\x07XXXX\x00\xff\xe0\x00\x07JFXX\x00${SOME_MARKER_CONTENT}`);
        expect(getBlock(blocks, 'exif')).to.deep.equal({kind: 'exif', tiffHeaderOffset: 39});
    });

    it('should recognize APP2 ICC data', () => {
        const blocks = findBlocks(`${JPEG_IMAGE_START}\xff\xe2\x00\xa0ICC_PROFILE\x00\x07\x09`);
        expect(getBlock(blocks, 'icc')).to.deep.equal({
            kind: 'icc',
            chunks: [{offset: 29, length: 144, chunkNumber: 7, chunksTotal: 9}],
        });
    });

    it('should recognize APP2 MPF data', () => {
        const blocks = findBlocks(`${JPEG_IMAGE_START}\xff\xe2\x00\x06MPF\x00\x4d\x4d`);
        expect(getBlock(blocks, 'mpf')).to.deep.equal({kind: 'mpf', dataOffset: 19});
    });

    it('should handle JFIF APP0 markers', () => {
        expect(findBlocks(`\xff\xd8${APP0_MARKER}\x00\x07JFIF\x00`)).to.deep.equal([{kind: 'jfif', dataOffset: 4}]);
    });

    it('should handle JFXX APP0 markers', () => {
        const blocks = findBlocks(`${JPEG_IMAGE_START}\xff\xe0\x00\x07JFXX\x00${SOME_MARKER_CONTENT}`);
        expect(getBlock(blocks, 'exif')).to.deep.equal({kind: 'exif', tiffHeaderOffset: 30});
    });

    it('should handle unknown high ID APP markers', () => {
        expect(findBlocks(`\xff\xd8${APP_UNKNOWN_MARKER}\x00\x07XXXX\x00${SOME_MARKER_CONTENT}`)).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 21}]);
    });

    it('should handle reversed order of JFIF-Exif hybrid', () => {
        expect(findBlocks(`\xff\xd8${APP1_MARKER}\x00\x08Exif\x00\x00\xff\xe0\x00\x07JFIF\x00`)).to.deep.equal([
            {kind: 'exif', tiffHeaderOffset: 12},
            {kind: 'jfif', dataOffset: 14},
        ]);
    });

    describe('multiple Exif segments', () => {
        let warnSpy;

        beforeEach(() => {
            warnSpy = getConsoleWarnSpy();
        });

        afterEach(() => {
            warnSpy.reset();
        });

        it('should prefer Exif segment with IFD entries when multiple Exif segments exist, as one block with every span', () => {
            const ranges = [];

            const blocks = findBlocks(`\xff\xd8${EXIF_SEGMENT_WITH_IFD_ENTRY}${EXIF_SEGMENT_WITHOUT_IFD_ENTRIES}`, ranges);

            expect(blocks).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 12}]);
            expect(ranges).to.deep.equal([
                {block: blocks[0], start: 2, end: 2 + EXIF_SEGMENT_WITH_IFD_ENTRY.length},
                {block: blocks[0], start: 2 + EXIF_SEGMENT_WITH_IFD_ENTRY.length, end: 2 + EXIF_SEGMENT_WITH_IFD_ENTRY.length + EXIF_SEGMENT_WITHOUT_IFD_ENTRIES.length},
            ]);
            expect(ranges[1].block).to.equal(blocks[0]);
            expect(warnSpy.hasWarned).to.be.true;
        });

        it('should prefer a later Exif segment with IFD entries over an earlier, larger empty one', () => {
            const blocks = findBlocks(`\xff\xd8${PADDED_EXIF_SEGMENT_WITHOUT_IFD_ENTRIES}${EXIF_SEGMENT_WITH_IFD_ENTRY}`);

            expect(blocks).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 52}]);
            expect(warnSpy.hasWarned).to.be.true;
        });

        it('should keep the first of two equally scored Exif segments', () => {
            const blocks = findBlocks(`\xff\xd8${EXIF_SEGMENT_WITH_IFD_ENTRY}${EXIF_SEGMENT_WITH_IFD_ENTRY}`);

            expect(blocks).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 12}]);
        });
    });

    it('should handle fill bytes', () => {
        const FILL_BYTE = '\xff';
        const blocks = findBlocks(`${JPEG_IMAGE_START}\xff\xe2\x00\x07XXXX\x00${FILL_BYTE}\xff\xe0\x00\x07JFXX\x00${SOME_MARKER_CONTENT}`);
        expect(getBlock(blocks, 'exif')).to.deep.equal({kind: 'exif', tiffHeaderOffset: 40});
    });

    it('should recognize IPTC data', () => {
        expect(findBlocks('\xff\xd8\xff\xed\x00\x14Photoshop 3.0\x008BIM')).to.deep.equal([{kind: 'iptc', dataOffset: 20}]);
    });

    it('should keep the last of two IPTC segments, listing both', () => {
        const iptcSegment = '\xff\xed\x00\x14Photoshop 3.0\x008BIM';
        const ranges = [];

        const blocks = findBlocks(`\xff\xd8${iptcSegment}${iptcSegment}`, ranges);

        expect(blocks).to.deep.equal([{kind: 'iptc', dataOffset: 20 + iptcSegment.length}]);
        expect(ranges.map((range) => range.block)).to.deep.equal([blocks[0], blocks[0]]);
    });

    it('should keep the last of two JFIF and MPF segments', () => {
        const jfifSegment = `${APP0_MARKER}\x00\x07JFIF\x00`;
        const mpfSegment = '\xff\xe2\x00\x08MPF\x00\x4d\x4d';

        const blocks = findBlocks(`\xff\xd8${jfifSegment}${mpfSegment}${jfifSegment}${mpfSegment}`);

        expect(blocks).to.deep.equal([
            {kind: 'jfif', dataOffset: 23},
            {kind: 'mpf', dataOffset: 38},
        ]);
    });

    it('should not recognize an APP13 segment that is cut off after its identifier', () => {
        expect(findBlocks('\xff\xd8\xff\xed\xff\xffPhotoshop 3.0')).to.deep.equal([]);
    });

    it('should not recognize an APP2 ICC segment that is cut off before its chunk bytes', () => {
        expect(findBlocks('\xff\xd8\xff\xe2\xff\xffICC_PROFILE\x00')).to.deep.equal([]);
        expect(findBlocks('\xff\xd8\xff\xe2\xff\xffICC_PROFILE\x00\x01')).to.deep.equal([]);
    });

    it('should stop collecting APP2 ICC chunks at the cap while listing every segment', () => {
        const ranges = [];

        const blocks = findBlocks(`\xff\xd8${MINIMAL_ICC_SEGMENT.repeat(300)}`, ranges);

        expect(blocks).to.have.lengthOf(1);
        const {chunks} = blocks[0];
        expect(chunks).to.have.lengthOf(255);
        // The chunks that are kept are the first ones, not the last ones.
        expect(chunks[0].offset).to.equal(20);
        expect(chunks[254].offset).to.equal(4592);
        expect(ranges).to.have.lengthOf(300);
        expect(ranges[299]).to.deep.equal({block: blocks[0], start: 2 + 299 * MINIMAL_ICC_SEGMENT.length, end: 2 + 300 * MINIMAL_ICC_SEGMENT.length});
    });

    it('should keep every APP2 ICC chunk in a file that stays within the cap', () => {
        expect(getBlock(findBlocks(`\xff\xd8${MINIMAL_ICC_SEGMENT.repeat(255)}`), 'icc').chunks).to.have.lengthOf(255);
    });

    it('should leave the APP2 ICC chunks of a file with few chunks untouched', () => {
        const {chunks} = getBlock(findBlocks(`\xff\xd8${MINIMAL_ICC_SEGMENT.repeat(10)}`), 'icc');
        expect(chunks).to.have.lengthOf(10);
        expect(chunks[9]).to.deep.equal({offset: 182, length: 0, chunkNumber: 1, chunksTotal: 1});
    });

    it('should still find later segments after the APP2 ICC cap is reached', () => {
        const ranges = [];
        const blocks = findBlocks(`\xff\xd8${MINIMAL_ICC_SEGMENT.repeat(300)}\xff\xe1\x00\x08Exif\x00\x00`, ranges);
        expect(getBlock(blocks, 'icc').chunks).to.have.lengthOf(255);
        expect(getBlock(blocks, 'exif').tiffHeaderOffset).to.equal(5412);
        expect(ranges).to.deep.include({block: getBlock(blocks, 'icc'), start: 5384, end: 5402});
        expect(ranges).to.deep.include({block: getBlock(blocks, 'exif'), start: 5402, end: 5412});
    });

    it('should keep advancing the scan by the size of each APP2 ICC segment past the cap', () => {
        const blocks = findBlocks(`\xff\xd8${MINIMAL_ICC_SEGMENT.repeat(255)}${PADDED_ICC_SEGMENT.repeat(45)}\xff\xe1\x00\x08Exif\x00\x00`);
        expect(getBlock(blocks, 'icc').chunks).to.have.lengthOf(255);
        expect(getBlock(blocks, 'exif').tiffHeaderOffset).to.equal(5592);
    });

    it('should stop collecting XMP chunks at the cap while listing every segment', () => {
        const ranges = [];

        const blocks = findBlocks(`\xff\xd8${MINIMAL_XMP_SEGMENT.repeat(1100)}`, ranges);

        expect(blocks).to.have.lengthOf(1);
        const {chunks} = blocks[0];
        expect(chunks).to.have.lengthOf(1024);
        // The chunks that are kept are the first ones, not the last ones.
        expect(chunks[0].dataOffset).to.equal(35);
        expect(chunks[1023].dataOffset).to.equal(33794);
        expect(ranges).to.have.lengthOf(1100);
        expect(ranges[1099].block).to.equal(blocks[0]);
    });

    it('should count extended XMP segments toward the same cap', () => {
        const {chunks} = getBlock(findBlocks(`\xff\xd8${MINIMAL_XMP_SEGMENT}${MINIMAL_EXTENDED_XMP_SEGMENT.repeat(1100)}`), 'xmp');
        expect(chunks).to.have.lengthOf(1024);
        expect(chunks[0].dataOffset).to.equal(35);
        expect(chunks[1023].dataOffset).to.equal(80852);
    });

    it('should keep every XMP chunk in a file that stays within the cap', () => {
        expect(getBlock(findBlocks(`\xff\xd8${MINIMAL_XMP_SEGMENT.repeat(1024)}`), 'xmp').chunks).to.have.lengthOf(1024);
    });

    it('should keep advancing the scan by the size of each XMP segment past the cap', () => {
        const ranges = [];
        const blocks = findBlocks(`\xff\xd8${MINIMAL_XMP_SEGMENT.repeat(1024)}${PADDED_XMP_SEGMENT.repeat(45)}\xff\xe1\x00\x08Exif\x00\x00`, ranges);
        expect(getBlock(blocks, 'xmp').chunks).to.have.lengthOf(1024);
        expect(getBlock(blocks, 'exif').tiffHeaderOffset).to.equal(35469);
        expect(ranges).to.deep.include({block: getBlock(blocks, 'xmp'), start: 35422, end: 35459});
        expect(ranges).to.deep.include({block: getBlock(blocks, 'exif'), start: 35459, end: 35469});
    });

    it('should keep advancing the scan by the size of each extended XMP segment past the cap', () => {
        const ranges = [];
        const blocks = findBlocks(`\xff\xd8${MINIMAL_XMP_SEGMENT}${MINIMAL_EXTENDED_XMP_SEGMENT.repeat(1023)}${PADDED_EXTENDED_XMP_SEGMENT.repeat(2)}\xff\xe1\x00\x08Exif\x00\x00`, ranges);
        expect(getBlock(blocks, 'xmp').chunks).to.have.lengthOf(1024);
        expect(getBlock(blocks, 'exif').tiffHeaderOffset).to.equal(81028);
        expect(ranges).to.deep.include({block: getBlock(blocks, 'xmp'), start: 80935, end: 81018});
        expect(ranges).to.deep.include({block: getBlock(blocks, 'exif'), start: 81018, end: 81028});
    });

    it('should keep first valid IPTC APP13 offset when later APP13 segment is malformed', () => {
        const firstIptcSegment = '\xff\xed\x00\x14Photoshop 3.0\x008BIM';
        const malformedIptcSegment = '\xff\xed\x00\x14Photoshop 3.0\x00ABCD';
        expect(findBlocks(`\xff\xd8${firstIptcSegment}${malformedIptcSegment}`)).to.deep.equal([{kind: 'iptc', dataOffset: 20}]);
    });

    it('should walk past Comment markers', () => {
        expect(findBlocks(`${JPEG_IMAGE_START}${COMMENT_MARKER}\x00\x08Optim\x00${SOME_MARKER_CONTENT}`)).to.deep.equal([
            {kind: 'jfif', dataOffset: 4},
            {kind: 'exif', tiffHeaderOffset: 31},
        ]);
    });

    it('should recognize Start of Frame (Baseline DCT) data', () => {
        expect(findBlocks(`\xff\xd8${SOF0_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`)).to.deep.equal([
            {kind: 'file', dataOffset: 4},
            {kind: 'exif', tiffHeaderOffset: 18},
        ]);
    });

    it('should recognize Start of Frame (Progressive DCT) data', () => {
        expect(findBlocks(`\xff\xd8${SOF2_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`)).to.deep.equal([
            {kind: 'file', dataOffset: 4},
            {kind: 'exif', tiffHeaderOffset: 18},
        ]);
    });

    it('should keep the last SOF0 segment over any SOF2 segment, in one file block', () => {
        const sof0Segment = `${SOF0_MARKER}\x00\x04\x47\x11`;
        const sof2Segment = `${SOF2_MARKER}\x00\x04\x47\x11`;
        const ranges = [];

        // The walk needs a few bytes past the last segment to enter it.
        const blocks = findBlocks(`\xff\xd8${sof2Segment}${sof0Segment}${sof0Segment}${sof2Segment}${'\x00'.repeat(8)}`, ranges);

        expect(blocks).to.deep.equal([{kind: 'file', dataOffset: 16}]);
        expect(ranges.map((range) => range.block)).to.deep.equal([blocks[0], blocks[0], blocks[0], blocks[0]]);
    });

    it('should keep the last SOF2 segment when there is no SOF0 segment', () => {
        const sof2Segment = `${SOF2_MARKER}\x00\x04\x47\x11`;

        expect(findBlocks(`\xff\xd8${sof2Segment}${sof2Segment}${'\x00'.repeat(8)}`)).to.deep.equal([{kind: 'file', dataOffset: 10}]);
    });

    it('should walk past the Define Huffman Table(s) marker', () => {
        expect(findBlocks(`\xff\xd8${DHT_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`)).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 18}]);
    });

    it('should walk past the Define Quantization Table(s) marker', () => {
        expect(findBlocks(`\xff\xd8${DQT_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`)).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 18}]);
    });

    it('should walk past the Define Restart Interval marker', () => {
        expect(findBlocks(`\xff\xd8${DRI_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`)).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 18}]);
    });

    it('should walk past the Start of Scan marker', () => {
        expect(findBlocks(`\xff\xd8${SOS_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`)).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 18}]);
    });

    it('should recognize IPTC XMP data', () => {
        expect(findBlocks(`\xff\xd8${APP1_MARKER}\x00\x1fhttp://ns.adobe.com/xap/1.0/\x00`)).to.deep.equal([
            {kind: 'xmp', chunks: [{dataOffset: 35, length: 0}]},
        ]);
    });

    it('should report correct size for IPTC XMP metadata', () => {
        const {chunks: [{length}]} = getBlock(findBlocks(`\xff\xd8${APP1_MARKER}\x00\x49http://ns.adobe.com/xap/1.0/\x00`), 'xmp');
        expect(length).to.equal(42);
    });

    it('should recognize Extended XMP data', () => {
        const {chunks: [{dataOffset}]} = getBlock(findBlocks(`\xff\xd8${APP1_MARKER}\x00\x25http://ns.adobe.com/xmp/extension/\x00`), 'xmp');
        expect(dataOffset).to.equal(81);
    });

    it('should collect multiple XMP segments into one block, in file order', () => {
        const guid = '5740B4AB4292ABB7BDCE0639415FA33F';
        const totalLength = '\x03\x02\x01\x00';
        const offset = '\x00\x00\x02\x01';
        const ranges = [];

        const blocks = findBlocks(
            '\xff\xd8'
            + `${APP1_MARKER}\x00\x1fhttp://ns.adobe.com/xap/1.0/\x00`
            + `${APP1_MARKER}\x00\x4dhttp://ns.adobe.com/xmp/extension/\x00${guid}${totalLength}${offset}`,
            ranges
        );

        expect(blocks).to.deep.equal([
            {kind: 'xmp', chunks: [{dataOffset: 35, length: 0}, {dataOffset: 114, length: 0}]},
        ]);
        expect(ranges).to.deep.equal([
            {block: blocks[0], start: 2, end: 35},
            {block: blocks[0], start: 35, end: 114},
        ]);
    });

    describe('ranges', () => {
        it('should not attach truncated to the blocks when ranges are not asked for', () => {
            expect(findBlocks('\xff\xd8\xff\xe1\x00\x08Exif\x00\x00')).to.not.have.property('truncated');
        });

        it('should leave the ranges empty for markerless data', () => {
            const ranges = [];
            findBlocks('\xff\xd8----------', ranges);
            expect(ranges).to.deep.equal([]);
        });

        it('should list the span of an APP1 Exif segment, linked to the exif block', () => {
            const ranges = [];
            const blocks = findBlocks('\xff\xd8\xff\xe1\x00\x08Exif\x00\x00', ranges);
            expect(ranges).to.deep.equal([{block: blocks[0], start: 2, end: 12}]);
            expect(ranges[0].block).to.equal(blocks[0]);
        });

        it('should list the span of an APP1 XMP segment', () => {
            const ranges = [];
            const blocks = findBlocks('\xff\xd8\xff\xe1\x00\x1fhttp://ns.adobe.com/xap/1.0/\x00', ranges);
            expect(ranges).to.deep.equal([{block: blocks[0], start: 2, end: 35}]);
        });

        it('should list the span of an APP1 extended XMP segment', () => {
            const ranges = [];
            const blocks = findBlocks('\xff\xd8\xff\xe1\x00\x25http://ns.adobe.com/xmp/extension/\x00', ranges);
            expect(ranges).to.deep.equal([{block: blocks[0], start: 2, end: 41}]);
        });

        it('should list the span of an APP13 Photoshop segment', () => {
            const ranges = [];
            const blocks = findBlocks('\xff\xd8\xff\xed\x00\x14Photoshop 3.0\x008BIM', ranges);
            expect(ranges).to.deep.equal([{block: blocks[0], start: 2, end: 24}]);
        });

        it('should list the span of an APP2 ICC_PROFILE segment', () => {
            const ranges = [];
            const blocks = findBlocks('\xff\xd8\xff\xe2\x00\xa0ICC_PROFILE\x00\x07\x09', ranges);
            expect(ranges).to.deep.equal([{block: blocks[0], start: 2, end: 164}]);
        });

        it('should list the span of an APP2 MPF segment', () => {
            const ranges = [];
            const blocks = findBlocks('\xff\xd8\xff\xe2\x00\x06MPF\x00\x4d\x4d', ranges);
            expect(ranges).to.deep.equal([{block: blocks[0], start: 2, end: 10}]);
        });

        it('should list the span of an APP0 JFIF segment', () => {
            const ranges = [];
            const blocks = findBlocks('\xff\xd8\xff\xe0\x00\x07JFIF\x00', ranges);
            expect(ranges).to.deep.equal([{block: blocks[0], start: 2, end: 11}]);
        });

        it('should list the span of a SOF0 segment', () => {
            const ranges = [];
            const blocks = findBlocks(`\xff\xd8\xff\xc0\x00\x04\x47\x11${SOME_MARKER_CONTENT}`, ranges);
            expect(ranges[0]).to.deep.equal({block: blocks[0], start: 2, end: 8});
        });

        it('should list the span of a SOF2 segment', () => {
            const ranges = [];
            const blocks = findBlocks(`\xff\xd8\xff\xc2\x00\x04\x47\x11${SOME_MARKER_CONTENT}`, ranges);
            expect(ranges[0]).to.deep.equal({block: blocks[0], start: 2, end: 8});
        });

        it('should not list the segments the finder walks past without reading', () => {
            const ranges = [];
            const blocks = findBlocks(`\xff\xd8${DQT_MARKER}\x00\x04\x47\x11${COMMENT_MARKER}\x00\x04ab\xff\xe1\x00\x08Exif\x00\x00`, ranges);
            expect(ranges).to.deep.equal([{block: blocks[0], start: 14, end: 24}]);
        });

        it('should widen the last span instead of recording more than 4096 segments', () => {
            const segmentPair = `${APP0_MARKER}\x00\x07JFIF\x00${APP1_MARKER}\x00\x07Exif\x00`;
            const warnSpy = getConsoleWarnSpy();
            try {
                const ranges = [];
                const blocks = findBlocks(`\xff\xd8${segmentPair.repeat(2500)}${SOS_MARKER}\x00\x04\x00\x00`, ranges);
                expect(blocks.map((block) => block.kind)).to.deep.equal(['jfif', 'exif']);
                expect(ranges).to.have.lengthOf(4096);
                expect(ranges[4094]).to.deep.equal({block: blocks[0], start: 2 + 4094 * 9, end: 2 + 4095 * 9});
                expect(ranges[4095]).to.deep.equal({block: blocks[1], start: 2 + 4095 * 9, end: 2 + 5000 * 9});
                expect(ranges.truncated).to.equal(false);
            } finally {
                warnSpy.reset();
            }
        });

        it('should mark the ranges as truncated when SOS was not reached', () => {
            const ranges = [];
            findBlocks('\xff\xd8\xff\xe1\x00\x08Exif\x00\x00', ranges);
            expect(ranges.truncated).to.equal(true);
        });

        it('should mark the ranges as not truncated when SOS was reached', () => {
            const ranges = [];
            findBlocks('\xff\xd8\xff\xe1\x00\x08Exif\x00\x00\xff\xda\x00\x04\x00\x00', ranges);
            expect(ranges.truncated).to.equal(false);
        });

        it('should mark the ranges as not truncated when SOS sits where the loop stops', () => {
            const ranges = [];
            findBlocks('\xff\xd8\xff\xe1\x00\x08Exif\x00\x00\xff\xda', ranges);
            expect(ranges.truncated).to.equal(false);
        });

        it('should list every chunk of a multi-chunk ICC profile, linked to the one icc block', () => {
            const ranges = [];
            const blocks = findBlocks(
                '\xff\xd8'
                + '\xff\xe2\x00\xa0ICC_PROFILE\x00\x01\x02' + '\x00'.repeat(0xa0 - (2 + 12 + 2))
                + '\xff\xe2\x00\x40ICC_PROFILE\x00\x02\x02' + '\x00'.repeat(0x40 - (2 + 12 + 2)),
                ranges
            );
            expect(blocks).to.have.lengthOf(1);
            expect(blocks[0].chunks.map((chunk) => chunk.chunkNumber)).to.deep.equal([1, 2]);
            expect(ranges).to.deep.equal([
                {block: blocks[0], start: 2, end: 164},
                {block: blocks[0], start: 164, end: 230},
            ]);
        });

        it('should report every metadata kind whatever the custom-build flags say', () => {
            const restoreConstants = swapProperties(Constants, {
                USE_FILE: false,
                USE_JFIF: false,
                USE_EXIF: false,
                USE_XMP: false,
                USE_IPTC: false,
                USE_ICC: false,
                USE_MPF: false,
            });
            try {
                const ranges = [];
                const blocks = findBlocks(
                    '\xff\xd8'
                    + `${SOF0_MARKER}\x00\x04\x47\x11`
                    + `${APP0_MARKER}\x00\x07JFIF\x00`
                    + `${APP1_MARKER}\x00\x08Exif\x00\x00`
                    + MINIMAL_XMP_SEGMENT
                    + MINIMAL_EXTENDED_XMP_SEGMENT
                    + '\xff\xed\x00\x14Photoshop 3.0\x008BIM'
                    + MINIMAL_ICC_SEGMENT
                    + '\xff\xe2\x00\x06MPF\x00\x4d\x4d',
                    ranges
                );
                expect(blocks.map((block) => block.kind)).to.deep.equal(['file', 'jfif', 'exif', 'xmp', 'iptc', 'icc', 'mpf']);
                expect(getBlock(blocks, 'file').dataOffset).to.equal(4);
                expect(getBlock(blocks, 'jfif').dataOffset).to.equal(10);
                expect(getBlock(blocks, 'exif').tiffHeaderOffset).to.equal(27);
                expect(getBlock(blocks, 'xmp').chunks).to.have.lengthOf(2);
                expect(getBlock(blocks, 'iptc').dataOffset).to.be.a('number');
                expect(getBlock(blocks, 'icc').chunks).to.have.lengthOf(1);
                expect(getBlock(blocks, 'mpf').dataOffset).to.be.a('number');
                expect(ranges.map((range) => range.block.kind)).to.deep.equal(
                    ['file', 'jfif', 'exif', 'xmp', 'xmp', 'iptc', 'icc', 'mpf']
                );
            } finally {
                restoreConstants();
            }
        });

        it('should not list a segment that is cut off before its chunk bytes', () => {
            const ranges = [];
            findBlocks('\xff\xd8\xff\xe2\xff\xffICC_PROFILE\x00\x01', ranges);
            expect(ranges).to.have.lengthOf(0);
            expect(ranges.truncated).to.equal(true);
        });
    });

    function findBlocks(image, ranges) {
        return ImageHeaderJpeg.findJpegOffsets(getDataView(image), ranges);
    }

    function getBlock(blocks, kind) {
        return blocks.find((block) => block.kind === kind);
    }
});
