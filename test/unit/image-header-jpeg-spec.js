/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getConsoleWarnSpy, getDataView} from './test-utils';
import ImageHeaderJpeg from '../../src/image-header-jpeg';

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

    it('should find no tags when there are no markers', () => {
        const offsets = ImageHeaderJpeg.findJpegOffsets(getDataView('\xff\xd8----------'));
        expect(offsets).to.deep.equal({
            hasAppMarkers: false,
            fileDataOffset: undefined,
            jfifDataOffset: undefined,
            tiffHeaderOffset: undefined,
            iptcDataOffset: undefined,
            xmpChunks: undefined,
            iccChunks: undefined,
            mpfDataOffset: undefined
        });
    });

    it('should find no tags when there is no Exif identifier for APP1', () => {
        const offsets = ImageHeaderJpeg.findJpegOffsets(getDataView('\xff\xd8\xff\xe1--------'));
        expect(offsets).to.deep.equal({
            hasAppMarkers: true,
            fileDataOffset: undefined,
            jfifDataOffset: undefined,
            tiffHeaderOffset: undefined,
            iptcDataOffset: undefined,
            xmpChunks: undefined,
            iccChunks: undefined,
            mpfDataOffset: undefined
        });
    });

    it('should find no tags for faulty APP markers', () => {
        const offsets = ImageHeaderJpeg.findJpegOffsets(getDataView('\xff\xd8\xfe\xdc\x00\x6fJFIF\x65\x01\x01\x01\x00\x48'));
        expect(offsets).to.deep.equal({
            hasAppMarkers: false,
            fileDataOffset: undefined,
            jfifDataOffset: undefined,
            tiffHeaderOffset: undefined,
            iptcDataOffset: undefined,
            xmpChunks: undefined,
            iccChunks: undefined,
            mpfDataOffset: undefined
        });
    });

    it('should handle APP2 markers', () => {
        const dataView = getDataView(`${JPEG_IMAGE_START}\xff\xe2\x00\x07XXXX\x00\xff\xe0\x00\x07JFXX\x00${SOME_MARKER_CONTENT}`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).tiffHeaderOffset).to.equal(39);
    });

    it('should recognize APP2 ICC data', () => {
        const dataView = getDataView(`${JPEG_IMAGE_START}\xff\xe2\x00\xa0ICC_PROFILE\x00\x07\x09`);
        const {iccChunks} = ImageHeaderJpeg.findJpegOffsets(dataView);
        expect(iccChunks).to.have.lengthOf(1);
        expect(iccChunks[0].chunkNumber).to.equal(7);
        expect(iccChunks[0].chunksTotal).to.equal(9);
        expect(iccChunks[0].length).to.equal(144);
        expect(iccChunks[0].offset).to.equal(29);
    });

    it('should recognize APP2 MPF data', () => {
        const dataView = getDataView(`${JPEG_IMAGE_START}\xff\xe2\x00\x06MPF\x00\x4d\x4d`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).mpfDataOffset).to.equal(19);
    });

    it('should handle JFIF APP0 markers', () => {
        const dataView = getDataView(`\xff\xd8${APP0_MARKER}\x00\x07JFIF\x00`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).jfifDataOffset).to.equal(4);
    });

    it('should handle JFXX APP0 markers', () => {
        const dataView = getDataView(`${JPEG_IMAGE_START}\xff\xe0\x00\x07JFXX\x00${SOME_MARKER_CONTENT}`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).tiffHeaderOffset).to.equal(30);
    });

    it('should handle unknown high ID APP markers', () => {
        const dataView = getDataView(`\xff\xd8${APP_UNKNOWN_MARKER}\x00\x07XXXX\x00${SOME_MARKER_CONTENT}`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).tiffHeaderOffset).to.equal(21);
    });

    it('should handle reversed order of JFIF-Exif hybrid', () => {
        const dataView = getDataView(`\xff\xd8${APP1_MARKER}\x00\x08Exif\x00\x00\xff\xe0\x00\x07JFIF\x00`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).tiffHeaderOffset).to.equal(12);
    });

    it('should prefer Exif segment with IFD entries when multiple Exif segments exist', () => {
        const validTiffHeaderLittleEndian = '\x49\x49\x2a\x00\x08\x00\x00\x00';
        const valid0thIfdWithOneEntry = '\x01\x00'
            + '\x0f\x01\x02\x00\x01\x00\x00\x00\x00\x00\x00\x00'
            + '\x00\x00\x00\x00';
        const validExifSegment = `${APP1_MARKER}\x00\x22Exif\x00\x00${validTiffHeaderLittleEndian}${valid0thIfdWithOneEntry}`;

        const invalid0thIfdWithZeroEntries = '\x00\x00' + '\x00\x00\x00\x00';
        const invalidExifSegment = `${APP1_MARKER}\x00\x16Exif\x00\x00${validTiffHeaderLittleEndian}${invalid0thIfdWithZeroEntries}`;

        const dataView = getDataView(`\xff\xd8${validExifSegment}${invalidExifSegment}`);
        const warnSpy = getConsoleWarnSpy();
        try {
            expect(ImageHeaderJpeg.findJpegOffsets(dataView).tiffHeaderOffset).to.equal(12);
            expect(warnSpy.hasWarned).to.be.true;
        } finally {
            warnSpy.reset();
        }
    });

    it('should handle fill bytes', () => {
        const FILL_BYTE = '\xff';
        const dataView = getDataView(`${JPEG_IMAGE_START}\xff\xe2\x00\x07XXXX\x00${FILL_BYTE}\xff\xe0\x00\x07JFXX\x00${SOME_MARKER_CONTENT}`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).tiffHeaderOffset).to.equal(40);
    });

    it('should recognize IPTC data', () => {
        const dataView = getDataView('\xff\xd8\xff\xed\x00\x14Photoshop 3.0\x008BIM');
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).iptcDataOffset).to.equal(20);
    });

    it('should keep first valid IPTC APP13 offset when later APP13 segment is malformed', () => {
        const firstIptcSegment = '\xff\xed\x00\x14Photoshop 3.0\x008BIM';
        const malformedIptcSegment = '\xff\xed\x00\x14Photoshop 3.0\x00ABCD';
        const dataView = getDataView(`\xff\xd8${firstIptcSegment}${malformedIptcSegment}`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).iptcDataOffset).to.equal(20);
    });

    it('should handle IPTC Comment markers', () => {
        const dataView = getDataView(`${JPEG_IMAGE_START}${COMMENT_MARKER}\x00\x2bOptimized by JPEGmin\x00`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).hasAppMarkers).to.be.true;
    });

    it('should recognize Start of Frame (Baseline DCT) data', () => {
        const dataView = getDataView(`\xff\xd8${SOF0_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).fileDataOffset).to.equal(4);
    });

    it('should recognize Start of Frame (Progressive DCT) data', () => {
        const dataView = getDataView(`\xff\xd8${SOF2_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).fileDataOffset).to.equal(4);
    });

    it('should handle Define Huffman Table(s) marker', () => {
        const dataView = getDataView(`\xff\xd8${DHT_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).hasAppMarkers).to.be.true;
    });

    it('should handle Define Quantization Table(s) marker', () => {
        const dataView = getDataView(`\xff\xd8${DQT_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).hasAppMarkers).to.be.true;
    });

    it('should handle Define Restart Interval marker', () => {
        const dataView = getDataView(`\xff\xd8${DRI_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).hasAppMarkers).to.be.true;
    });

    it('should handle Start of Scan marker', () => {
        const dataView = getDataView(`\xff\xd8${SOS_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`);
        expect(ImageHeaderJpeg.findJpegOffsets(dataView).hasAppMarkers).to.be.true;
    });

    it('should recognize IPTC XMP data', () => {
        const dataView = getDataView(`\xff\xd8${APP1_MARKER}\x00\x1fhttp://ns.adobe.com/xap/1.0/\x00`);
        const {xmpChunks: [{dataOffset}]} = ImageHeaderJpeg.findJpegOffsets(dataView);
        expect(dataOffset).to.equal(35);
    });

    it('should report correct size for IPTC XMP metadata', () => {
        const dataView = getDataView(`\xff\xd8${APP1_MARKER}\x00\x49http://ns.adobe.com/xap/1.0/\x00`);
        const {xmpChunks: [{length}]} = ImageHeaderJpeg.findJpegOffsets(dataView);
        expect(length).to.equal(42);
    });

    it('should recognize Extended XMP data', () => {
        const dataView = getDataView(`\xff\xd8${APP1_MARKER}\x00\x25http://ns.adobe.com/xmp/extension/\x00`);
        const {xmpChunks: [{dataOffset}]} = ImageHeaderJpeg.findJpegOffsets(dataView);
        expect(dataOffset).to.equal(81);
    });

    it('should handle multiple XMP segments', () => {
        const guid = '5740B4AB4292ABB7BDCE0639415FA33F';
        const totalLength = '\x03\x02\x01\x00';
        const offset = '\x00\x00\x02\x01';
        const dataView = getDataView(
            '\xff\xd8'
            + `${APP1_MARKER}\x00\x1fhttp://ns.adobe.com/xap/1.0/\x00`
            + `${APP1_MARKER}\x00\x4dhttp://ns.adobe.com/xmp/extension/\x00${guid}${totalLength}${offset}`
        );

        const {
            xmpChunks: [
                {dataOffset: dataOffset0, length: length0},
                {dataOffset: dataOffset1, length: length1}
            ]
        } = ImageHeaderJpeg.findJpegOffsets(dataView);

        expect(dataOffset0).to.equal(35);
        expect(length0).to.equal(0);
        expect(dataOffset1).to.equal(114);
        expect(length1).to.equal(0);
    });

    describe('metadataBlocks', () => {
        it('should not attach truncated when metadataBlocks is not given', () => {
            const dataView = getDataView('\xff\xd8\xff\xe1\x00\x08Exif\x00\x00');
            const offsets = ImageHeaderJpeg.findJpegOffsets(dataView);
            expect(offsets).to.not.have.property('truncated');
        });

        it('should emit no blocks when the out-array stays empty for markerless data', () => {
            const dataView = getDataView('\xff\xd8----------');
            const metadataBlocks = [];
            ImageHeaderJpeg.findJpegOffsets(dataView, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([]);
        });

        it('should emit an exif block for an APP1 Exif segment', () => {
            const dataView = getDataView('\xff\xd8\xff\xe1\x00\x08Exif\x00\x00');
            const metadataBlocks = [];
            ImageHeaderJpeg.findJpegOffsets(dataView, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'exif', start: 2, end: 12},
            ]);
        });

        it('should emit an xmp block for an APP1 XMP segment', () => {
            const dataView = getDataView('\xff\xd8\xff\xe1\x00\x1fhttp://ns.adobe.com/xap/1.0/\x00');
            const metadataBlocks = [];
            ImageHeaderJpeg.findJpegOffsets(dataView, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'xmp', start: 2, end: 35},
            ]);
        });

        it('should emit an xmp block for an APP1 extended XMP segment', () => {
            const dataView = getDataView('\xff\xd8\xff\xe1\x00\x25http://ns.adobe.com/xmp/extension/\x00');
            const metadataBlocks = [];
            ImageHeaderJpeg.findJpegOffsets(dataView, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'xmp', start: 2, end: 41},
            ]);
        });

        it('should emit an iptc block for an APP13 Photoshop segment', () => {
            const dataView = getDataView('\xff\xd8\xff\xed\x00\x14Photoshop 3.0\x008BIM');
            const metadataBlocks = [];
            ImageHeaderJpeg.findJpegOffsets(dataView, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'iptc', start: 2, end: 24},
            ]);
        });

        it('should emit an icc block for an APP2 ICC_PROFILE segment', () => {
            const dataView = getDataView('\xff\xd8\xff\xe2\x00\xa0ICC_PROFILE\x00\x07\x09');
            const metadataBlocks = [];
            ImageHeaderJpeg.findJpegOffsets(dataView, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'icc', start: 2, end: 164},
            ]);
        });

        it('should emit an mpf block for an APP2 MPF segment', () => {
            const dataView = getDataView('\xff\xd8\xff\xe2\x00\x06MPF\x00\x4d\x4d');
            const metadataBlocks = [];
            ImageHeaderJpeg.findJpegOffsets(dataView, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'mpf', start: 2, end: 10},
            ]);
        });

        it('should emit a jfif block for an APP0 JFIF segment', () => {
            const dataView = getDataView('\xff\xd8\xff\xe0\x00\x07JFIF\x00');
            const metadataBlocks = [];
            ImageHeaderJpeg.findJpegOffsets(dataView, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'jfif', start: 2, end: 11},
            ]);
        });

        it('should emit a file block for a SOF0 segment', () => {
            const dataView = getDataView(`\xff\xd8\xff\xc0\x00\x04\x47\x11${SOME_MARKER_CONTENT}`);
            const metadataBlocks = [];
            ImageHeaderJpeg.findJpegOffsets(dataView, metadataBlocks);
            expect(metadataBlocks[0]).to.deep.equal({type: 'file', start: 2, end: 8});
        });

        it('should emit a file block for a SOF2 segment', () => {
            const dataView = getDataView(`\xff\xd8\xff\xc2\x00\x04\x47\x11${SOME_MARKER_CONTENT}`);
            const metadataBlocks = [];
            ImageHeaderJpeg.findJpegOffsets(dataView, metadataBlocks);
            expect(metadataBlocks[0]).to.deep.equal({type: 'file', start: 2, end: 8});
        });

        it('should emit all Exif segments as separate blocks when multiple are present', () => {
            const validTiffHeaderLittleEndian = '\x49\x49\x2a\x00\x08\x00\x00\x00';
            const valid0thIfdWithOneEntry = '\x01\x00'
                + '\x0f\x01\x02\x00\x01\x00\x00\x00\x00\x00\x00\x00'
                + '\x00\x00\x00\x00';
            const validExifSegment = `${APP1_MARKER}\x00\x22Exif\x00\x00${validTiffHeaderLittleEndian}${valid0thIfdWithOneEntry}`;
            const invalid0thIfdWithZeroEntries = '\x00\x00' + '\x00\x00\x00\x00';
            const invalidExifSegment = `${APP1_MARKER}\x00\x16Exif\x00\x00${validTiffHeaderLittleEndian}${invalid0thIfdWithZeroEntries}`;

            const dataView = getDataView(`\xff\xd8${validExifSegment}${invalidExifSegment}`);
            const warnSpy = getConsoleWarnSpy();
            try {
                const metadataBlocks = [];
                ImageHeaderJpeg.findJpegOffsets(dataView, metadataBlocks);
                const exifBlocks = metadataBlocks.filter((block) => block.type === 'exif');
                expect(exifBlocks).to.have.lengthOf(2);
            } finally {
                warnSpy.reset();
            }
        });

        it('should mark metadataBlocks as truncated when SOS was not reached', () => {
            const dataView = getDataView('\xff\xd8\xff\xe1\x00\x08Exif\x00\x00');
            const metadataBlocks = [];
            ImageHeaderJpeg.findJpegOffsets(dataView, metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(true);
        });

        it('should mark metadataBlocks as not truncated when SOS was reached', () => {
            const dataView = getDataView('\xff\xd8\xff\xe1\x00\x08Exif\x00\x00\xff\xda\x00\x04\x00\x00');
            const metadataBlocks = [];
            ImageHeaderJpeg.findJpegOffsets(dataView, metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(false);
        });

        it('should emit multiple icc blocks for multi-chunk ICC', () => {
            const dataView = getDataView(
                '\xff\xd8'
                + '\xff\xe2\x00\xa0ICC_PROFILE\x00\x01\x02' + '\x00'.repeat(0xa0 - (2 + 12 + 2))
                + '\xff\xe2\x00\x40ICC_PROFILE\x00\x02\x02' + '\x00'.repeat(0x40 - (2 + 12 + 2))
            );
            const metadataBlocks = [];
            ImageHeaderJpeg.findJpegOffsets(dataView, metadataBlocks);
            const iccBlocks = metadataBlocks.filter((block) => block.type === 'icc');
            expect(iccBlocks).to.have.lengthOf(2);
            expect(iccBlocks[0]).to.deep.equal({type: 'icc', start: 2, end: 164});
            expect(iccBlocks[1]).to.deep.equal({type: 'icc', start: 164, end: 230});
        });
    });
});
