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

    it('should return no app markers for a JXL file with no metadata boxes', () => {
        const dataView = getDataView(JXL_SIGNATURE + FTYP_BOX);
        const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

        expect(offsets.hasAppMarkers).to.be.false;
        expect(offsets.tiffHeaderOffset).to.be.undefined;
        expect(offsets.xmpChunks).to.be.undefined;
    });

    it('should find Exif data offset', () => {
        const dataView = getDataView(getJxlData({exif: true}));
        const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

        expect(offsets.hasAppMarkers).to.be.true;
        // signature(12) + ftyp(20) + box header(8) + tiff offset prefix(4) + 0 = 44
        expect(offsets.tiffHeaderOffset).to.equal(44);
    });

    it('should find XMP data', () => {
        const dataView = getDataView(getJxlData({xmp: true}));
        const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

        expect(offsets.hasAppMarkers).to.be.true;
        // signature(12) + ftyp(20) + box header(8) = 40
        expect(offsets.xmpChunks).to.deep.equal([{
            dataOffset: 40,
            length: 15
        }]);
    });

    it('should find both Exif and XMP data', () => {
        const dataView = getDataView(getJxlData({exif: true, xmp: true}));
        const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

        expect(offsets.hasAppMarkers).to.be.true;
        expect(offsets.tiffHeaderOffset).to.equal(44);
        // signature(12) + ftyp(20) + exif box(18) + box header(8) = 58
        expect(offsets.xmpChunks).to.deep.equal([{
            dataOffset: 58,
            length: 15
        }]);
    });

    it('should skip unknown box types', () => {
        const dataView = getDataView(getJxlData({unknownBox: true, xmp: true}));
        const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

        expect(offsets.hasAppMarkers).to.be.true;
        // signature(12) + ftyp(20) + unknown(16) + box header(8) = 56
        expect(offsets.xmpChunks).to.deep.equal([{
            dataOffset: 56,
            length: 15
        }]);
    });

    it('should ignore Exif data if it is excluded from custom build', () => {
        restoreConstants = swapProperties(Constants, {USE_EXIF: false, USE_XMP: true});

        const dataView = getDataView(getJxlData({exif: true}));

        expect(ImageHeaderJxl.findJxlOffsets(dataView).tiffHeaderOffset).to.be.undefined;
    });

    it('should ignore XMP data if it is excluded from custom build', () => {
        restoreConstants = swapProperties(Constants, {USE_EXIF: true, USE_XMP: false});

        const dataView = getDataView(getJxlData({xmp: true}));

        expect(ImageHeaderJxl.findJxlOffsets(dataView).xmpChunks).to.be.undefined;
    });

    it('should handle non-zero TIFF header offset prefix in Exif box', () => {
        const tiffOffsetPrefix = '\x00\x00\x00\x06';
        const exifPadding = 'Exif\x00\x00';
        const tiffData = 'TIFFHD';
        const exifContent = tiffOffsetPrefix + exifPadding + tiffData;
        const exifBoxSize = 8 + exifContent.length;

        const dataView = getDataView(
            JXL_SIGNATURE + FTYP_BOX
            + getByteStringFromNumber(exifBoxSize, 4) + 'Exif'
            + exifContent
        );
        const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

        expect(offsets.hasAppMarkers).to.be.true;
        // signature(12) + ftyp(20) + box header(8) + prefix(4) + 6 = 50
        expect(offsets.tiffHeaderOffset).to.equal(50);
    });

    it('should handle truncated file gracefully', () => {
        const dataView = getDataView(
            JXL_SIGNATURE + FTYP_BOX
            + '\x00\x00\x01\x00Exif'
        );
        const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

        expect(offsets).to.have.property('hasAppMarkers');
    });

    it('should handle file with only the JXL signature', () => {
        const dataView = getDataView(JXL_SIGNATURE);
        const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

        expect(offsets.hasAppMarkers).to.be.false;
    });

    it('should recognize a JXL naked codestream', () => {
        expect(ImageHeaderJxl.isJxlFile(getDataView('\xFF\x0Asome_data'))).to.be.true;
    });

    it('should detect codestream offset for a JXL naked codestream', () => {
        const dataView = getDataView('\xFF\x0Asome_codestream_data');
        const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

        expect(offsets.hasAppMarkers).to.be.true;
        expect(offsets.jxlCodestreamOffset).to.equal(0);
    });

    describe('brob boxes', () => {
        it('should detect brob box with Exif original type', () => {
            const dataView = getDataView(getJxlData({brobExif: true}));
            const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

            expect(offsets.hasAppMarkers).to.be.true;
            expect(offsets.brobExifChunk).to.not.be.undefined;
            // signature(12) + ftyp(20) + box header(8) + original type(4) = 44
            expect(offsets.brobExifChunk.dataOffset).to.equal(44);
            expect(offsets.brobExifChunk.length).to.equal('BROTLI_EXIF_DATA'.length);
        });

        it('should detect brob box with xml original type', () => {
            const dataView = getDataView(getJxlData({brobXmp: true}));
            const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

            expect(offsets.hasAppMarkers).to.be.true;
            expect(offsets.brobXmpChunk).to.not.be.undefined;
            // signature(12) + ftyp(20) + box header(8) + original type(4) = 44
            expect(offsets.brobXmpChunk.dataOffset).to.equal(44);
            expect(offsets.brobXmpChunk.length).to.equal('BROTLI_XMP_DATA'.length);
        });

        it('should detect both brob Exif and brob XMP', () => {
            const dataView = getDataView(getJxlData({brobExif: true, brobXmp: true}));
            const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

            expect(offsets.hasAppMarkers).to.be.true;
            expect(offsets.brobExifChunk).to.not.be.undefined;
            expect(offsets.brobXmpChunk).to.not.be.undefined;
        });

        it('should ignore brob box with unknown original type', () => {
            const dataView = getDataView(getJxlData({brobUnknown: true}));
            const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

            expect(offsets.hasAppMarkers).to.be.false;
            expect(offsets.brobExifChunk).to.be.undefined;
            expect(offsets.brobXmpChunk).to.be.undefined;
        });

        it('should prefer plain Exif box over brob Exif', () => {
            const dataView = getDataView(getJxlData({exif: true, brobExif: true}));
            const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

            expect(offsets.hasAppMarkers).to.be.true;
            expect(offsets.tiffHeaderOffset).to.not.be.undefined;
            expect(offsets.brobExifChunk).to.be.undefined;
        });

        it('should prefer plain XMP box over brob XMP', () => {
            const dataView = getDataView(getJxlData({xmp: true, brobXmp: true}));
            const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

            expect(offsets.hasAppMarkers).to.be.true;
            expect(offsets.xmpChunks).to.not.be.undefined;
            expect(offsets.brobXmpChunk).to.be.undefined;
        });

        it('should ignore brob Exif when USE_EXIF is false', () => {
            restoreConstants = swapProperties(Constants, {USE_EXIF: false, USE_XMP: true});

            const dataView = getDataView(getJxlData({brobExif: true}));
            const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

            expect(offsets.brobExifChunk).to.be.undefined;
        });

        it('should ignore brob XMP when USE_XMP is false', () => {
            restoreConstants = swapProperties(Constants, {USE_EXIF: true, USE_XMP: false});

            const dataView = getDataView(getJxlData({brobXmp: true}));
            const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

            expect(offsets.brobXmpChunk).to.be.undefined;
        });
    });

    describe('metadataBlocks', () => {
        it('should emit no blocks when no out-array is given', () => {
            ImageHeaderJxl.findJxlOffsets(getDataView(getJxlData({exif: true, xmp: true})));
            // no observable effect — sanity check: no error
        });

        it('should emit an exif block for an Exif box', () => {
            const dataView = getDataView(getJxlData({exif: true}));
            const metadataBlocks = [];
            ImageHeaderJxl.findJxlOffsets(dataView, metadataBlocks);
            // signature(12) + ftyp(20) = 32; exif box is 8 + 4 + 6 = 18 bytes => end 50
            expect(metadataBlocks).to.deep.equal([
                {type: 'exif', start: 32, end: 50},
            ]);
        });

        it('should emit an xmp block for an xml box', () => {
            const dataView = getDataView(getJxlData({xmp: true}));
            const metadataBlocks = [];
            ImageHeaderJxl.findJxlOffsets(dataView, metadataBlocks);
            // signature(12) + ftyp(20) = 32; xml box is 8 + 15 = 23 bytes => end 55
            expect(metadataBlocks).to.deep.equal([
                {type: 'xmp', start: 32, end: 55},
            ]);
        });

        it('should emit an exif block for a brob box with Exif original type', () => {
            const dataView = getDataView(getJxlData({brobExif: true}));
            const metadataBlocks = [];
            ImageHeaderJxl.findJxlOffsets(dataView, metadataBlocks);
            // brob box: 8 + 4 (original type) + 16 (compressed) = 28 bytes => end 60
            expect(metadataBlocks).to.deep.equal([
                {type: 'exif', start: 32, end: 60},
            ]);
        });

        it('should emit an xmp block for a brob box with xml original type', () => {
            const dataView = getDataView(getJxlData({brobXmp: true}));
            const metadataBlocks = [];
            ImageHeaderJxl.findJxlOffsets(dataView, metadataBlocks);
            // brob box: 8 + 4 (original type) + 15 (compressed) = 27 bytes => end 59
            expect(metadataBlocks).to.deep.equal([
                {type: 'xmp', start: 32, end: 59},
            ]);
        });

        it('should NOT emit a block for a jxlc codestream box (would inflate end past pixel data)', () => {
            const dataView = getDataView(getJxlData({jxlc: true}));
            const metadataBlocks = [];
            ImageHeaderJxl.findJxlOffsets(dataView, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([]);
        });

        it('should NOT emit a block for a jxlp partial codestream box', () => {
            const dataView = getDataView(getJxlData({jxlp: true}));
            const metadataBlocks = [];
            ImageHeaderJxl.findJxlOffsets(dataView, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([]);
        });

        it('should keep metadataRange.end small for a large jxlc box (the bandwidth-saving use case)', () => {
            // Simulate a 1 MiB codestream after the ftyp box. There is no
            // metadata, so metadataBlocks must be empty — not include a
            // 1 MiB-long block. (Bare codestreams produce no block list either.)
            const largeCodestream = '\x00'.repeat(1024 * 1024 - 8);
            // jxlc box header (8) + 1 MiB - 8 bytes content = 1 MiB box total
            const boxLen = getByteStringFromNumber(1024 * 1024, 4);
            const data = JXL_SIGNATURE + FTYP_BOX + boxLen + 'jxlc' + largeCodestream;
            const dataView = getDataView(data);
            const metadataBlocks = [];
            ImageHeaderJxl.findJxlOffsets(dataView, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([]);
        });

        it('should leave metadataBlocks empty for a naked codestream', () => {
            const dataView = getDataView('\xFF\x0Asome_codestream_data');
            const metadataBlocks = [];
            ImageHeaderJxl.findJxlOffsets(dataView, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([]);
        });

        it('should emit blocks for both Exif and XMP boxes', () => {
            const dataView = getDataView(getJxlData({exif: true, xmp: true}));
            const metadataBlocks = [];
            ImageHeaderJxl.findJxlOffsets(dataView, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'exif', start: 32, end: 50},
                {type: 'xmp', start: 50, end: 73},
            ]);
        });

        it('should not include a jxlc block even when accompanied by Exif/XMP', () => {
            const dataView = getDataView(getJxlData({exif: true, xmp: true, jxlc: true}));
            const metadataBlocks = [];
            ImageHeaderJxl.findJxlOffsets(dataView, metadataBlocks);
            const types = metadataBlocks.map((block) => block.type);
            expect(types).to.deep.equal(['exif', 'xmp']);
        });

        it('should emit a brob(Exif) block even when a regular Exif box already appeared (regular-then-brob)', () => {
            // exif box is added before brobExif by getJxlData. Both physical
            // boxes carry Exif and a downstream caller persisting the prefix
            // needs to keep both byte ranges.
            const dataView = getDataView(getJxlData({exif: true, brobExif: true}));
            const metadataBlocks = [];
            ImageHeaderJxl.findJxlOffsets(dataView, metadataBlocks);
            const exifBlocks = metadataBlocks.filter((block) => block.type === 'exif');
            expect(exifBlocks).to.have.lengthOf(2);
        });

        it('should emit a brob(xml) block even when a regular xml box already appeared', () => {
            const dataView = getDataView(getJxlData({xmp: true, brobXmp: true}));
            const metadataBlocks = [];
            ImageHeaderJxl.findJxlOffsets(dataView, metadataBlocks);
            const xmpBlocks = metadataBlocks.filter((block) => block.type === 'xmp');
            expect(xmpBlocks).to.have.lengthOf(2);
        });
    });

    describe('codestream offset', () => {
        it('should detect jxlc box and return codestream offset', () => {
            const dataView = getDataView(getJxlData({jxlc: true}));
            const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

            expect(offsets.jxlCodestreamOffset).to.not.be.undefined;
            expect(offsets.hasAppMarkers).to.be.true;
        });

        it('should return offset 0 for bare codestream', () => {
            const dataView = getDataView('\xFF\x0Asome_codestream_data');
            const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

            expect(offsets.jxlCodestreamOffset).to.equal(0);
            expect(offsets.hasAppMarkers).to.be.true;
        });

        it('should detect first jxlp box and return codestream offset', () => {
            const dataView = getDataView(getJxlData({jxlp: true}));
            const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

            expect(offsets.jxlCodestreamOffset).to.not.be.undefined;
            expect(offsets.hasAppMarkers).to.be.true;
        });

        it('should detect codestream even without metadata boxes', () => {
            restoreConstants = swapProperties(Constants, {USE_EXIF: false, USE_XMP: false});

            const dataView = getDataView(getJxlData({jxlc: true}));
            const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

            expect(offsets.jxlCodestreamOffset).to.not.be.undefined;
            expect(offsets.hasAppMarkers).to.be.true;
        });
    });
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
