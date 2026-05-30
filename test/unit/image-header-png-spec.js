/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import {__RewireAPI__ as ImageHeaderPngRewireAPI} from '../../src/image-header-png';
import ImageHeaderPng from '../../src/image-header-png';

const PNG_IMAGE_START = '\x89\x50\x4e\x47\x0d\x0a\x1a\x0a';

describe('image-header-png', () => {
    afterEach(() => {
        ImageHeaderPngRewireAPI.__ResetDependency__('Constants');
    });

    it('should recognize a PNG file', () => {
        expect(ImageHeaderPng.isPngFile(getDataView(PNG_IMAGE_START))).to.be.true;
    });

    it('should not recognize something else as a PNG file', () => {
        expect(ImageHeaderPng.isPngFile(getDataView('RIFFxxxxWEBP'))).to.be.false;
    });

    it('should not recognize undefined input as PNG', () => {
        expect(ImageHeaderPng.isPngFile(undefined)).to.be.false;
    });

    it('should find image header offset', () => {
        const chunkLength = '\x00\x00\x00\x02';
        const chunkType = 'IHDR';
        const chunkData = '\x47\x11';
        const crcChecksum = '\x00\x00\x00\x00';
        const chunkLengthOther = '\x00\x00\x00\x04';
        const chunkTypeOther = 'abcd';
        const chunkDataOther = '\x48\x12\x49\x13';

        const dataView = getDataView(
            PNG_IMAGE_START
            + chunkLengthOther + chunkTypeOther + chunkDataOther + crcChecksum
            + chunkLength + chunkType + chunkData + crcChecksum
        );

        const offsets = ImageHeaderPng.findPngOffsets(dataView);

        expect(offsets).to.deep.equal({
            hasAppMarkers: true,
            pngHeaderOffset: PNG_IMAGE_START.length + 16 + 8,
        });
    });

    it('should find XMP offset in international textual data', () => {
        const xmpPrefix = 'XML:com.adobe.xmp\x00';
        const chunkAdditionalFields = '\x00\x00\x00\x00';
        const chunkLength = `\x00\x00\x00${String.fromCharCode(xmpPrefix.length + chunkAdditionalFields.length + 2)}`;
        const chunkType = 'iTXt';
        const chunkData = `${xmpPrefix}${chunkAdditionalFields}\x47\x11`;
        const crcChecksum = '\x00\x00\x00\x00';
        const chunkLengthOther = '\x00\x00\x00\x04';
        const chunkTypeOther = 'abcd';
        const chunkDataOther = '\x48\x12\x49\x13';

        const dataView = getDataView(
            PNG_IMAGE_START
            + chunkLengthOther + chunkTypeOther + chunkDataOther + crcChecksum
            + chunkLength + chunkType + chunkData + crcChecksum
        );

        const offsets = ImageHeaderPng.findPngOffsets(dataView);

        expect(offsets).to.deep.equal({
            hasAppMarkers: true,
            xmpChunks: [{
                dataOffset: PNG_IMAGE_START.length + 16 + 8 + xmpPrefix.length + chunkAdditionalFields.length,
                length: 2,
            }],
        });
    });

    it('should find tEXt and non-XMP iTXt chunks of textual data', () => {
        const crcChecksum = '\x00\x00\x00\x00';

        const chunkType0 = 'tEXt';
        const chunkData0 = 'MyTag0\x00My value.';
        const chunkLength0 = `\x00\x00\x00${String.fromCharCode(chunkData0.length)}`;
        const chunk0 = chunkLength0 + chunkType0 + chunkData0 + crcChecksum;

        const chunkType1 = 'iTXt';
        const chunkData1 = 'MyTag1\x00\x00\x00\x00\x00My other value.';
        const chunkLength1 = `\x00\x00\x00${String.fromCharCode(chunkData1.length)}`;
        const chunk1 = chunkLength1 + chunkType1 + chunkData1 + crcChecksum;

        const dataView = getDataView(PNG_IMAGE_START + chunk0 + chunk1);

        const offsets = ImageHeaderPng.findPngOffsets(dataView);

        expect(offsets).to.deep.equal({
            hasAppMarkers: true,
            pngTextChunks: [
                {
                    offset: PNG_IMAGE_START.length + chunkLength0.length + chunkType0.length,
                    type: 'tEXt',
                    length: chunkData0.length,
                },
                {
                    offset: PNG_IMAGE_START.length + chunk0.length + chunkLength0.length + chunkType0.length,
                    type: 'iTXt',
                    length: chunkData1.length,
                },
            ],
        });
    });

    it('should find zTXt chunks of compressed textual data', () => {
        const crcChecksum = '\x00\x00\x00\x00';

        const chunkType = 'zTXt';
        const chunkData = 'MyTag0\x00\x00My compressed value.';
        const chunkLength = `\x00\x00\x00${String.fromCharCode(chunkData.length)}`;
        const chunk = chunkLength + chunkType + chunkData + crcChecksum;

        const dataView = getDataView(PNG_IMAGE_START + chunk);

        const offsets = ImageHeaderPng.findPngOffsets(dataView, true);

        expect(offsets).to.deep.equal({
            hasAppMarkers: true,
            pngTextChunks: [
                {
                    offset: PNG_IMAGE_START.length + chunkLength.length + chunkType.length,
                    type: 'zTXt',
                    length: chunkData.length,
                },
            ],
        });
    });

    it('should find iCCP chunks of compressed color profile', () => {
        const crcChecksum = '\x00\x00\x00\x00';

        const chunkType = 'iCCP';
        const chunkDataHeader = 'ProfileName\x00\x00';
        const compressedProfile = '<compressed profile>';
        const chunkLength = `\x00\x00\x00${String.fromCharCode(chunkDataHeader.length + compressedProfile.length)}`;
        const chunk = chunkLength + chunkType + chunkDataHeader + compressedProfile + crcChecksum;

        const dataView = getDataView(PNG_IMAGE_START + chunk);

        const offsets = ImageHeaderPng.findPngOffsets(dataView, true);

        expect(offsets).to.deep.equal({
            hasAppMarkers: true,
            iccChunks: [
                {
                    offset: PNG_IMAGE_START.length + chunkLength.length + chunkType.length + chunkDataHeader.length,
                    length: compressedProfile.length,
                    chunkNumber: 1,
                    chunksTotal: 1,
                    profileName: 'ProfileName',
                    compressionMethod: 0
                },
            ],
        });
    });

    it('should not throw on a truncated iCCP chunk that ends at the profile name', () => {
        // The chunk type and a profile name + null terminator are present, but
        // the buffer ends before the compression-method byte. Reading it must
        // not run past the end of the DataView.
        const chunkType = 'iCCP';
        const chunkDataHeader = 'ProfileName\x00';
        const chunkLength = `\x00\x00\x00${String.fromCharCode(chunkDataHeader.length + 1)}`;
        const dataView = getDataView(PNG_IMAGE_START + chunkLength + chunkType + chunkDataHeader);

        expect(() => ImageHeaderPng.findPngOffsets(dataView, true)).to.not.throw();
        expect(ImageHeaderPng.findPngOffsets(dataView, true)).to.not.have.property('iccChunks');
    });

    it('should find pHYs chunks', () => {
        const chunkData = '\x01\x02\x03\x04\x02\x03\x04\x05\x01';
        const chunkLength = `\x00\x00\x00${String.fromCharCode(chunkData.length)}`;
        const chunkType = 'pHYs';
        const crcChecksum = '\x00\x00\x00\x00';

        const dataView = getDataView(
            PNG_IMAGE_START
            + chunkLength + chunkType + chunkData + crcChecksum
        );

        const offsets = ImageHeaderPng.findPngOffsets(dataView);

        expect(offsets).to.deep.equal({
            hasAppMarkers: true,
            pngChunkOffsets: [PNG_IMAGE_START.length],
        });
    });

    it('should find tIME chunks', () => {
        const chunkData = '\x01\x02\x03\x04\x05\x06\x07';
        const chunkLength = `\x00\x00\x00${String.fromCharCode(chunkData.length)}`;
        const chunkType = 'tIME';
        const crcChecksum = '\x00\x00\x00\x00';

        const dataView = getDataView(
            PNG_IMAGE_START
            + chunkLength + chunkType + chunkData + crcChecksum
        );

        const offsets = ImageHeaderPng.findPngOffsets(dataView);

        expect(offsets).to.deep.equal({
            hasAppMarkers: true,
            pngChunkOffsets: [PNG_IMAGE_START.length],
        });
    });

    it('should find eXIf chunks', () => {
        const chunkData = '\x01\x02\x03';
        const chunkLength = `\x00\x00\x00${String.fromCharCode(chunkData.length)}`;
        const chunkType = 'eXIf';
        const crcChecksum = '\x00\x00\x00\x00';

        const dataView = getDataView(
            PNG_IMAGE_START
            + chunkLength + chunkType + chunkData + crcChecksum
        );

        const offsets = ImageHeaderPng.findPngOffsets(dataView);

        expect(offsets).to.deep.equal({
            hasAppMarkers: true,
            tiffHeaderOffset: PNG_IMAGE_START.length + chunkLength.length + chunkType.length,
        });
    });

    it('should handle when PNG file tags have been excluded in a custom build', () => {
        ImageHeaderPngRewireAPI.__Rewire__('Constants', {USE_PNG: true, USE_PNG_FILE: false});
        const chunkLength = '\x00\x00\x00\x02';
        const chunkType = 'IHDR';
        const chunkData = '\x47\x11';
        const crcChecksum = '\x00\x00\x00\x00';
        const chunkLengthOther = '\x00\x00\x00\x04';
        const chunkTypeOther = 'abcd';
        const chunkDataOther = '\x48\x12\x49\x13';

        const dataView = getDataView(
            PNG_IMAGE_START
            + chunkLengthOther + chunkTypeOther + chunkDataOther + crcChecksum
            + chunkLength + chunkType + chunkData + crcChecksum
        );

        expect(ImageHeaderPng.findPngOffsets(dataView)).to.deep.equal({hasAppMarkers: false});
    });

    describe('metadataBlocks', () => {
        const crcChecksum = '\x00\x00\x00\x00';

        it('should not attach truncated when metadataBlocks is not given', () => {
            const data = '\x47\x11';
            const chunk = '\x00\x00\x00\x02' + 'IHDR' + data + crcChecksum;
            const offsets = ImageHeaderPng.findPngOffsets(getDataView(PNG_IMAGE_START + chunk));
            expect(offsets).to.not.have.property('truncated');
        });

        it('should emit a file block for an IHDR chunk', () => {
            const chunkData = '\x47\x11';
            const chunk = '\x00\x00\x00\x02' + 'IHDR' + chunkData + crcChecksum;
            const metadataBlocks = [];
            ImageHeaderPng.findPngOffsets(getDataView(PNG_IMAGE_START + chunk), false, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'file', start: PNG_IMAGE_START.length, end: PNG_IMAGE_START.length + chunk.length},
            ]);
        });

        it('should emit an exif block for an eXIf chunk', () => {
            const chunkData = '\x01\x02\x03';
            const chunk = '\x00\x00\x00\x03' + 'eXIf' + chunkData + crcChecksum;
            const metadataBlocks = [];
            ImageHeaderPng.findPngOffsets(getDataView(PNG_IMAGE_START + chunk), false, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'exif', start: PNG_IMAGE_START.length, end: PNG_IMAGE_START.length + chunk.length},
            ]);
        });

        it('should emit an xmp block for an iTXt XMP chunk', () => {
            const xmpPrefix = 'XML:com.adobe.xmp\x00';
            const chunkAdditionalFields = '\x00\x00\x00\x00';
            const dataLen = xmpPrefix.length + chunkAdditionalFields.length + 2;
            const chunkLength = `\x00\x00\x00${String.fromCharCode(dataLen)}`;
            const chunkData = `${xmpPrefix}${chunkAdditionalFields}\x47\x11`;
            const chunk = chunkLength + 'iTXt' + chunkData + crcChecksum;
            const metadataBlocks = [];
            ImageHeaderPng.findPngOffsets(getDataView(PNG_IMAGE_START + chunk), false, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'xmp', start: PNG_IMAGE_START.length, end: PNG_IMAGE_START.length + chunk.length},
            ]);
        });

        it('should emit png blocks for tEXt and non-XMP iTXt chunks', () => {
            const data0 = 'MyTag0\x00My value.';
            const chunk0 = `\x00\x00\x00${String.fromCharCode(data0.length)}` + 'tEXt' + data0 + crcChecksum;
            const data1 = 'MyTag1\x00\x00\x00\x00\x00My other value.';
            const chunk1 = `\x00\x00\x00${String.fromCharCode(data1.length)}` + 'iTXt' + data1 + crcChecksum;
            const metadataBlocks = [];
            ImageHeaderPng.findPngOffsets(getDataView(PNG_IMAGE_START + chunk0 + chunk1), false, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'png', start: PNG_IMAGE_START.length, end: PNG_IMAGE_START.length + chunk0.length},
                {type: 'png', start: PNG_IMAGE_START.length + chunk0.length, end: PNG_IMAGE_START.length + chunk0.length + chunk1.length},
            ]);
        });

        it('should emit a png block for a zTXt chunk (async)', () => {
            const data = 'MyTag0\x00\x00My compressed value.';
            const chunk = `\x00\x00\x00${String.fromCharCode(data.length)}` + 'zTXt' + data + crcChecksum;
            const metadataBlocks = [];
            ImageHeaderPng.findPngOffsets(getDataView(PNG_IMAGE_START + chunk), true, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'png', start: PNG_IMAGE_START.length, end: PNG_IMAGE_START.length + chunk.length},
            ]);
        });

        it('should emit an icc block for an iCCP chunk (async)', () => {
            const header = 'ProfileName\x00\x00';
            const compressedProfile = '<compressed profile>';
            const dataLen = header.length + compressedProfile.length;
            const chunk = `\x00\x00\x00${String.fromCharCode(dataLen)}` + 'iCCP' + header + compressedProfile + crcChecksum;
            const metadataBlocks = [];
            ImageHeaderPng.findPngOffsets(getDataView(PNG_IMAGE_START + chunk), true, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'icc', start: PNG_IMAGE_START.length, end: PNG_IMAGE_START.length + chunk.length},
            ]);
        });

        it('should emit a png block for a pHYs chunk', () => {
            const data = '\x01\x02\x03\x04\x02\x03\x04\x05\x01';
            const chunk = `\x00\x00\x00${String.fromCharCode(data.length)}` + 'pHYs' + data + crcChecksum;
            const metadataBlocks = [];
            ImageHeaderPng.findPngOffsets(getDataView(PNG_IMAGE_START + chunk), false, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'png', start: PNG_IMAGE_START.length, end: PNG_IMAGE_START.length + chunk.length},
            ]);
        });

        it('should emit a png block for a tIME chunk', () => {
            const data = '\x01\x02\x03\x04\x05\x06\x07';
            const chunk = `\x00\x00\x00${String.fromCharCode(data.length)}` + 'tIME' + data + crcChecksum;
            const metadataBlocks = [];
            ImageHeaderPng.findPngOffsets(getDataView(PNG_IMAGE_START + chunk), false, metadataBlocks);
            expect(metadataBlocks).to.deep.equal([
                {type: 'png', start: PNG_IMAGE_START.length, end: PNG_IMAGE_START.length + chunk.length},
            ]);
        });

        it('should mark metadataBlocks as truncated when IEND was not reached', () => {
            const data = '\x47\x11';
            const chunk = '\x00\x00\x00\x02' + 'IHDR' + data + crcChecksum;
            const metadataBlocks = [];
            ImageHeaderPng.findPngOffsets(getDataView(PNG_IMAGE_START + chunk), false, metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(true);
        });

        it('should mark metadataBlocks as not truncated when IEND was reached', () => {
            const data = '\x47\x11';
            const chunk = '\x00\x00\x00\x02' + 'IHDR' + data + crcChecksum;
            const iendChunk = '\x00\x00\x00\x00' + 'IEND' + crcChecksum;
            const metadataBlocks = [];
            ImageHeaderPng.findPngOffsets(getDataView(PNG_IMAGE_START + chunk + iendChunk), false, metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(false);
        });
    });
});
