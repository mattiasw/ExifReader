/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getByteStringFromNumber, getDataView, swapProperties} from './test-utils.js';
import Constants from '../../src/constants.js';
import ImageHeaderJxl from '../../src/image-header-jxl.js';

const JXL_SIGNATURE = '\x00\x00\x00\x0CJXL \x0D\x0A\x87\x0A';
const FTYP_BOX = '\x00\x00\x00\x14ftypjxl \x00\x00\x00\x00jxl ';

describe('image-header-jxl', () => {
    let restoreConstants;

    afterEach(() => {
        if (restoreConstants) {
            restoreConstants();
            restoreConstants = undefined;
        }
    });

    it('should handle empty input', () => {
        expect(ImageHeaderJxl.isJxlFile(undefined)).to.be.false;
    });

    it('should recognize a JXL container file', () => {
        expect(ImageHeaderJxl.isJxlFile(getDataView(JXL_SIGNATURE))).to.be.true;
    });

    it('should not recognize something else as a JXL file', () => {
        expect(ImageHeaderJxl.isJxlFile(getDataView('RIFFxxxxWEBP'))).to.be.false;
    });

    it('should not recognize a too-short buffer as JXL', () => {
        expect(ImageHeaderJxl.isJxlFile(getDataView('\x00\x00\x00\x0CJXL'))).to.be.false;
    });

    it('should return no blocks for a JXL file with no metadata boxes', () => {
        expect(findBlocks(JXL_SIGNATURE + FTYP_BOX)).to.deep.equal([]);
    });

    it('should find the Exif box as an exif block', () => {
        // signature(12) + ftyp(20) + box header(8) + tiff offset prefix(4) + 0 = 44
        expect(findBlocks(getJxlData({exif: true}))).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 44}]);
    });

    it('should find the xml box as an xmp block', () => {
        // signature(12) + ftyp(20) + box header(8) = 40
        expect(findBlocks(getJxlData({xmp: true}))).to.deep.equal([{kind: 'xmp', chunks: [{dataOffset: 40, length: 15}]}]);
    });

    it('should find both Exif and XMP data', () => {
        // signature(12) + ftyp(20) + exif box(18) + box header(8) = 58
        expect(findBlocks(getJxlData({exif: true, xmp: true}))).to.deep.equal([
            {kind: 'exif', tiffHeaderOffset: 44},
            {kind: 'xmp', chunks: [{dataOffset: 58, length: 15}]},
        ]);
    });

    it('should keep the last of two Exif boxes and the last of two xml boxes, listing all four', () => {
        const exifBox = getByteStringFromNumber(18, 4) + 'Exif' + '\x00\x00\x00\x00' + 'TIFFHD';
        const xmlBox = getByteStringFromNumber(12, 4) + 'xml ' + '<x/>';
        const ranges = [];

        const blocks = findBlocks(JXL_SIGNATURE + FTYP_BOX + exifBox + xmlBox + exifBox + xmlBox, ranges);

        expect(blocks).to.deep.equal([
            {kind: 'exif', tiffHeaderOffset: 32 + 18 + 12 + 12},
            {kind: 'xmp', chunks: [{dataOffset: 32 + 18 + 12 + 18 + 8, length: 4}]},
        ]);
        expect(ranges.map((range) => range.block)).to.deep.equal([blocks[0], blocks[1], blocks[0], blocks[1]]);
        expect(ranges[2].block).to.equal(blocks[0]);
        expect(ranges[3].block).to.equal(blocks[1]);
    });

    it('should skip unknown box types', () => {
        // signature(12) + ftyp(20) + unknown(16) + box header(8) = 56
        expect(findBlocks(getJxlData({unknownBox: true, xmp: true}))).to.deep.equal([{kind: 'xmp', chunks: [{dataOffset: 56, length: 15}]}]);
    });

    it('should report Exif data even if it is excluded from custom build', () => {
        restoreConstants = swapProperties(Constants, {USE_EXIF: false, USE_XMP: true});
        const ranges = [];

        const blocks = findBlocks(getJxlData({exif: true}), ranges);

        expect(blocks[0].tiffHeaderOffset).to.be.a('number');
        expect(ranges.map((range) => range.block.kind)).to.deep.equal(['exif']);
    });

    it('should report XMP data even if it is excluded from custom build', () => {
        restoreConstants = swapProperties(Constants, {USE_EXIF: true, USE_XMP: false});
        const ranges = [];

        const blocks = findBlocks(getJxlData({xmp: true}), ranges);

        expect(blocks[0].chunks).to.have.lengthOf(1);
        expect(ranges.map((range) => range.block.kind)).to.deep.equal(['xmp']);
    });

    it('should handle non-zero TIFF header offset prefix in Exif box', () => {
        const tiffOffsetPrefix = '\x00\x00\x00\x06';
        const exifPadding = 'Exif\x00\x00';
        const tiffData = 'TIFFHD';
        const exifContent = tiffOffsetPrefix + exifPadding + tiffData;
        const exifBoxSize = 8 + exifContent.length;

        const blocks = findBlocks(
            JXL_SIGNATURE + FTYP_BOX
            + getByteStringFromNumber(exifBoxSize, 4) + 'Exif'
            + exifContent
        );

        // signature(12) + ftyp(20) + box header(8) + prefix(4) + 6 = 50
        expect(blocks).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 50}]);
    });

    it('should handle truncated file gracefully', () => {
        expect(findBlocks(JXL_SIGNATURE + FTYP_BOX + '\x00\x00\x01\x00Exif')).to.deep.equal([]);
    });

    it('should stop at a box whose length is shorter than its header', () => {
        const exifContent = '\x00\x00\x00\x00' + 'TIFFHD';
        const blocks = findBlocks(
            JXL_SIGNATURE + FTYP_BOX
            + getByteStringFromNumber(4, 4)
            + getByteStringFromNumber(8 + exifContent.length, 4) + 'Exif' + exifContent
        );

        expect(blocks).to.deep.equal([]);
    });

    it('should stop at an extended-size xml box whose length is shorter than its 16-byte header', () => {
        const blocks = findBlocks(
            JXL_SIGNATURE + FTYP_BOX
            + getByteStringFromNumber(1, 4) + 'xml ' + getByteStringFromNumber(0, 4) + getByteStringFromNumber(8, 4)
            + '<x/>'
        );

        expect(blocks).to.deep.equal([]);
    });

    it('should stop at an extended-size Exif box whose length is shorter than its 16-byte header', () => {
        // The padding is a TIFF header offset field the buffer has room for but the box does not.
        const blocks = findBlocks(
            JXL_SIGNATURE + FTYP_BOX
            + getByteStringFromNumber(1, 4) + 'Exif' + getByteStringFromNumber(0, 4) + getByteStringFromNumber(8, 4)
            + getByteStringFromNumber(0, 4)
        );

        expect(blocks).to.deep.equal([]);
    });

    it('should not read an Exif box\'s TIFF header offset from the next box, listing the box but not reading it', () => {
        const ranges = [];

        const blocks = findBlocks(
            JXL_SIGNATURE + FTYP_BOX
            + getByteStringFromNumber(8, 4) + 'Exif'
            + getByteStringFromNumber(12, 4) + 'xml ' + '<x/>',
            ranges
        );

        expect(blocks).to.deep.equal([{kind: 'xmp', chunks: [{dataOffset: 48, length: 4}]}]);
        expect(ranges).to.deep.equal([
            {block: {kind: 'exif'}, start: 32, end: 40},
            {block: blocks[0], start: 40, end: 52},
        ]);
    });

    it('should read the TIFF header offset of an Exif box that only just holds it', () => {
        const blocks = findBlocks(
            JXL_SIGNATURE + FTYP_BOX
            + getByteStringFromNumber(12, 4) + 'Exif' + getByteStringFromNumber(0, 4)
        );

        // signature(12) + ftyp(20) + box header(8) + prefix(4) = 44
        expect(blocks).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 44}]);
    });

    it('should handle file with only the JXL signature', () => {
        expect(findBlocks(JXL_SIGNATURE)).to.deep.equal([]);
    });

    it('should recognize a JXL naked codestream', () => {
        expect(ImageHeaderJxl.isJxlFile(getDataView('\xFF\x0Asome_data'))).to.be.true;
    });

    it('should report a JXL naked codestream as a jxlFile block at offset 0 and nothing else', () => {
        const ranges = [];

        const blocks = findBlocks('\xFF\x0Asome_codestream_data', ranges);

        expect(blocks).to.deep.equal([{kind: 'jxlFile', codestreamOffset: 0}]);
        expect(ranges).to.deep.equal([]);
    });

    describe('brob boxes', () => {
        it('should report a brob box with Exif original type as a brotli-compressed exif block', () => {
            // signature(12) + ftyp(20) + box header(8) + original type(4) = 44
            expect(findBlocks(getJxlData({brobExif: true}))).to.deep.equal([
                {kind: 'exif', compression: 'brotli', dataOffset: 44, length: 'BROTLI_EXIF_DATA'.length},
            ]);
        });

        it('should report a brob box with xml original type as a brotli-compressed xmp block', () => {
            expect(findBlocks(getJxlData({brobXmp: true}))).to.deep.equal([
                {kind: 'xmp', compression: 'brotli', dataOffset: 44, length: 'BROTLI_XMP_DATA'.length},
            ]);
        });

        it('should report both brob Exif and brob XMP', () => {
            expect(findBlocks(getJxlData({brobExif: true, brobXmp: true})).map((block) => [block.kind, block.compression])).to.deep.equal([
                ['exif', 'brotli'],
                ['xmp', 'brotli'],
            ]);
        });

        it('should ignore brob box with unknown original type', () => {
            const ranges = [];

            expect(findBlocks(getJxlData({brobUnknown: true}), ranges)).to.deep.equal([]);
            expect(ranges).to.deep.equal([]);
        });

        it('should prefer the plain Exif box over brob Exif, listing both', () => {
            const ranges = [];

            const blocks = findBlocks(getJxlData({exif: true, brobExif: true}), ranges);

            expect(blocks).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 44}]);
            expect(ranges).to.deep.equal([
                {block: blocks[0], start: 32, end: 50},
                {block: {kind: 'exif', compression: 'brotli', dataOffset: 62, length: 'BROTLI_EXIF_DATA'.length}, start: 50, end: 78},
            ]);
        });

        it('should prefer a plain Exif box that follows the brob Exif box', () => {
            const brobBox = getByteStringFromNumber(8 + 4 + 16, 4) + 'brob' + 'Exif' + 'BROTLI_EXIF_DATA';
            const exifBox = getByteStringFromNumber(18, 4) + 'Exif' + '\x00\x00\x00\x00' + 'TIFFHD';
            const ranges = [];

            const blocks = findBlocks(JXL_SIGNATURE + FTYP_BOX + brobBox + exifBox, ranges);

            expect(blocks).to.deep.equal([{kind: 'exif', tiffHeaderOffset: 32 + 28 + 12}]);
            expect(ranges.map((range) => [range.block.compression, range.start, range.end])).to.deep.equal([
                ['brotli', 32, 60],
                [undefined, 60, 78],
            ]);
        });

        it('should let a brob Exif box win over an Exif box too short for its TIFF header offset', () => {
            const shortExifBox = getByteStringFromNumber(10, 4) + 'Exif' + '\x00\x00';
            const brobBox = getByteStringFromNumber(8 + 4 + 16, 4) + 'brob' + 'Exif' + 'BROTLI_EXIF_DATA';
            const ranges = [];

            const blocks = findBlocks(JXL_SIGNATURE + FTYP_BOX + shortExifBox + brobBox, ranges);

            expect(blocks).to.deep.equal([{kind: 'exif', compression: 'brotli', dataOffset: 32 + 10 + 12, length: 16}]);
            expect(ranges).to.deep.equal([
                {block: {kind: 'exif'}, start: 32, end: 42},
                {block: blocks[0], start: 42, end: 70},
            ]);
        });

        it('should keep the first of two brob Exif boxes and list the second against its own block', () => {
            const brobBox = getByteStringFromNumber(8 + 4 + 16, 4) + 'brob' + 'Exif' + 'BROTLI_EXIF_DATA';
            const ranges = [];

            const blocks = findBlocks(JXL_SIGNATURE + FTYP_BOX + brobBox + brobBox, ranges);

            expect(blocks).to.deep.equal([{kind: 'exif', compression: 'brotli', dataOffset: 44, length: 16}]);
            expect(ranges).to.deep.equal([
                {block: blocks[0], start: 32, end: 60},
                {block: {kind: 'exif', compression: 'brotli', dataOffset: 72, length: 16}, start: 60, end: 88},
            ]);
            expect(ranges[0].block).to.equal(blocks[0]);
            expect(ranges[1].block).to.not.equal(blocks[0]);
        });

        it('should prefer the plain xml box over brob XMP, listing both', () => {
            const ranges = [];

            const blocks = findBlocks(getJxlData({xmp: true, brobXmp: true}), ranges);

            expect(blocks).to.deep.equal([{kind: 'xmp', chunks: [{dataOffset: 40, length: 15}]}]);
            expect(ranges).to.deep.equal([
                {block: blocks[0], start: 32, end: 55},
                {block: {kind: 'xmp', compression: 'brotli', dataOffset: 67, length: 'BROTLI_XMP_DATA'.length}, start: 55, end: 82},
            ]);
        });

        it('should keep the first of two brob xml boxes', () => {
            const brobBox = getByteStringFromNumber(8 + 4 + 15, 4) + 'brob' + 'xml ' + 'BROTLI_XMP_DATA';

            const blocks = findBlocks(JXL_SIGNATURE + FTYP_BOX + brobBox + brobBox);

            expect(blocks).to.deep.equal([{kind: 'xmp', compression: 'brotli', dataOffset: 44, length: 15}]);
        });

        it('should report brob Exif when USE_EXIF is false', () => {
            restoreConstants = swapProperties(Constants, {USE_EXIF: false, USE_XMP: true});
            const ranges = [];

            const blocks = findBlocks(getJxlData({brobExif: true}), ranges);

            expect(blocks.map((block) => block.kind)).to.deep.equal(['exif']);
            expect(ranges.map((range) => range.block.kind)).to.deep.equal(['exif']);
        });

        it('should report brob XMP when USE_XMP is false', () => {
            restoreConstants = swapProperties(Constants, {USE_EXIF: true, USE_XMP: false});
            const ranges = [];

            const blocks = findBlocks(getJxlData({brobXmp: true}), ranges);

            expect(blocks.map((block) => block.kind)).to.deep.equal(['xmp']);
            expect(ranges.map((range) => range.block.kind)).to.deep.equal(['xmp']);
        });

        it('should skip a brob box too short for its original type and keep walking', () => {
            // The short brob's would-be original type is the next box's length field.
            const blocks = findBlocks(getShortBrobData('xml '));

            expect(blocks.map((block) => block.kind)).to.deep.equal(['xmp']);
            expect(blocks[0].chunks[0].dataOffset).to.equal(48);
        });

        it('should skip a brob box too short for an Exif original type and keep walking', () => {
            const blocks = findBlocks(getShortBrobData('Exif'));

            expect(blocks.map((block) => block.kind)).to.deep.equal(['xmp']);
            expect(blocks[0].chunks[0].dataOffset).to.equal(48);
        });

        it('should accept a brob box that only just holds its original type', () => {
            const blocks = findBlocks(JXL_SIGNATURE + FTYP_BOX + getByteStringFromNumber(12, 4) + 'brob' + 'xml ');

            expect(blocks).to.deep.equal([{kind: 'xmp', compression: 'brotli', dataOffset: 44, length: 0}]);
        });

        it('should ignore a brob box truncated before its original type', () => {
            expect(findBlocks(JXL_SIGNATURE + FTYP_BOX + getByteStringFromNumber(256, 4) + 'brob')).to.deep.equal([]);
        });
    });

    describe('ranges', () => {
        it('should list no spans when no out-array is given', () => {
            expect(findBlocks(getJxlData({exif: true, xmp: true}))).to.not.have.property('truncated');
        });

        it('should list the span of an Exif box, linked to the exif block', () => {
            const ranges = [];
            const blocks = findBlocks(getJxlData({exif: true}), ranges);
            // signature(12) + ftyp(20) = 32; exif box is 8 + 4 + 6 = 18 bytes => end 50
            expect(ranges).to.deep.equal([{block: blocks[0], start: 32, end: 50}]);
            expect(ranges[0].block).to.equal(blocks[0]);
        });

        it('should list the span of an xml box', () => {
            const ranges = [];
            const blocks = findBlocks(getJxlData({xmp: true}), ranges);
            // signature(12) + ftyp(20) = 32; xml box is 8 + 15 = 23 bytes => end 55
            expect(ranges).to.deep.equal([{block: blocks[0], start: 32, end: 55}]);
        });

        it('should list the span of a brob box with Exif original type', () => {
            const ranges = [];
            const blocks = findBlocks(getJxlData({brobExif: true}), ranges);
            // brob box: 8 + 4 (original type) + 16 (compressed) = 28 bytes => end 60
            expect(ranges).to.deep.equal([{block: blocks[0], start: 32, end: 60}]);
        });

        it('should list the span of a brob box with xml original type', () => {
            const ranges = [];
            const blocks = findBlocks(getJxlData({brobXmp: true}), ranges);
            // brob box: 8 + 4 (original type) + 15 (compressed) = 27 bytes => end 59
            expect(ranges).to.deep.equal([{block: blocks[0], start: 32, end: 59}]);
        });

        it('should NOT list a jxlc codestream box (would inflate end past pixel data)', () => {
            const ranges = [];
            findBlocks(getJxlData({jxlc: true}), ranges);
            expect(ranges).to.deep.equal([]);
        });

        it('should NOT list a jxlp partial codestream box', () => {
            const ranges = [];
            findBlocks(getJxlData({jxlp: true}), ranges);
            expect(ranges).to.deep.equal([]);
        });

        it('should keep metadataRange.end small for a large jxlc box (the bandwidth-saving use case)', () => {
            // Simulate a 1 MiB codestream after the ftyp box. There is no
            // metadata, so the ranges must be empty, not hold a 1 MiB-long span.
            const largeCodestream = '\x00'.repeat(1024 * 1024 - 8);
            // jxlc box header (8) + 1 MiB - 8 bytes content = 1 MiB box total
            const boxLen = getByteStringFromNumber(1024 * 1024, 4);
            const ranges = [];
            findBlocks(JXL_SIGNATURE + FTYP_BOX + boxLen + 'jxlc' + largeCodestream, ranges);
            expect(ranges).to.deep.equal([]);
        });

        it('should list spans for both Exif and XMP boxes', () => {
            const ranges = [];
            const blocks = findBlocks(getJxlData({exif: true, xmp: true}), ranges);
            expect(ranges).to.deep.equal([
                {block: blocks[0], start: 32, end: 50},
                {block: blocks[1], start: 50, end: 73},
            ]);
        });

        it('should not list a jxlc box even when accompanied by Exif/XMP', () => {
            const ranges = [];
            findBlocks(getJxlData({exif: true, xmp: true, jxlc: true}), ranges);
            expect(ranges.map((range) => range.block.kind)).to.deep.equal(['exif', 'xmp']);
        });

        it('should NOT list a brob box too short for its original type', () => {
            const ranges = [];
            const blocks = findBlocks(getShortBrobData('Exif'), ranges);
            // The short brob is 32..40; the xml box after it takes 'Exif' as its length.
            expect(ranges).to.deep.equal([
                {block: blocks[0], start: 40, end: 40 + 0x45786966},
            ]);
        });
    });

    describe('codestream offset', () => {
        it('should detect jxlc box and return a jxlFile block with the codestream offset', () => {
            // signature(12) + ftyp(20) + box header(8) = 40
            expect(findBlocks(getJxlData({jxlc: true}))).to.deep.equal([{kind: 'jxlFile', codestreamOffset: 40}]);
        });

        it('should keep the first of two jxlc boxes', () => {
            const jxlcBox = getByteStringFromNumber(14, 4) + 'jxlc' + '\xFF\x0A\x00\x00\x00\x00';

            expect(findBlocks(JXL_SIGNATURE + FTYP_BOX + jxlcBox + jxlcBox)).to.deep.equal([{kind: 'jxlFile', codestreamOffset: 40}]);
        });

        it('should detect first jxlp box and return the codestream offset after its sequence number', () => {
            expect(findBlocks(getJxlData({jxlp: true}))).to.deep.equal([{kind: 'jxlFile', codestreamOffset: 44}]);
        });

        it('should skip a jxlp box whose sequence number is not 0', () => {
            const jxlpBox = getByteStringFromNumber(12, 4) + 'jxlp' + getByteStringFromNumber(1, 4);

            expect(findBlocks(JXL_SIGNATURE + FTYP_BOX + jxlpBox)).to.deep.equal([]);
        });

        it('should list the jxlFile block after the exif and xmp blocks', () => {
            expect(findBlocks(getJxlData({jxlc: true, exif: true, xmp: true})).map((block) => block.kind)).to.deep.equal(['exif', 'xmp', 'jxlFile']);
        });

        it('should not read a jxlp box\'s sequence number from the next box', () => {
            const blocks = findBlocks(
                JXL_SIGNATURE + FTYP_BOX + getByteStringFromNumber(8, 4) + 'jxlp' + getByteStringFromNumber(0, 4) + 'zzzz'
            );

            expect(blocks).to.deep.equal([]);
        });

        it('should accept a jxlp box that only just holds its sequence number', () => {
            const blocks = findBlocks(
                JXL_SIGNATURE + FTYP_BOX + getByteStringFromNumber(12, 4) + 'jxlp' + getByteStringFromNumber(0, 4)
            );

            // signature(12) + ftyp(20) + box header(8) + sequence number(4) = 44
            expect(blocks).to.deep.equal([{kind: 'jxlFile', codestreamOffset: 44}]);
        });

        it('should ignore a jxlp box truncated before its sequence number', () => {
            expect(findBlocks(JXL_SIGNATURE + FTYP_BOX + getByteStringFromNumber(256, 4) + 'jxlp')).to.deep.equal([]);
        });
    });

    function findBlocks(image, ranges) {
        return ImageHeaderJxl.findJxlOffsets(getDataView(image), ranges);
    }
});

function getJxlData({exif, xmp, unknownBox, brobExif, brobXmp, brobUnknown, jxlc, jxlp} = {}) {
    let data = JXL_SIGNATURE + FTYP_BOX;

    if (unknownBox) {
        data += getByteStringFromNumber(16, 4) + 'unkn' + 'XXXXXXXX';
    }
    if (jxlc) {
        const codestreamData = '\xFF\x0A\x00\x00\x00\x00';
        data += getByteStringFromNumber(8 + codestreamData.length, 4) + 'jxlc' + codestreamData;
    }
    if (jxlp) {
        const sequenceNumber = '\x00\x00\x00\x00';
        const codestreamData = '\xFF\x0A\x00\x00\x00\x00';
        data += getByteStringFromNumber(8 + sequenceNumber.length + codestreamData.length, 4) + 'jxlp' + sequenceNumber + codestreamData;
    }
    if (exif) {
        const tiffOffsetPrefix = '\x00\x00\x00\x00';
        const tiffData = 'TIFFHD';
        const content = tiffOffsetPrefix + tiffData;
        data += getByteStringFromNumber(8 + content.length, 4) + 'Exif' + content;
    }
    if (xmp) {
        const xmpData = '<xmp>test</xmp>';
        data += getByteStringFromNumber(8 + xmpData.length, 4) + 'xml ' + xmpData;
    }
    if (brobExif) {
        const compressedPayload = 'BROTLI_EXIF_DATA';
        const content = 'Exif' + compressedPayload;
        data += getByteStringFromNumber(8 + content.length, 4) + 'brob' + content;
    }
    if (brobXmp) {
        const compressedPayload = 'BROTLI_XMP_DATA';
        const content = 'xml ' + compressedPayload;
        data += getByteStringFromNumber(8 + content.length, 4) + 'brob' + content;
    }
    if (brobUnknown) {
        const compressedPayload = 'BROTLI_UNK';
        const content = 'jxlc' + compressedPayload;
        data += getByteStringFromNumber(8 + content.length, 4) + 'brob' + content;
    }

    return data;
}

function getShortBrobData(originalType) {
    // A length-8 brob has no content, so the next four bytes are both its
    // would-be original type and the next box's length; that box is an xml box.
    return JXL_SIGNATURE + FTYP_BOX + getByteStringFromNumber(8, 4) + 'brob' + originalType + 'xml ' + '<x/>';
}
