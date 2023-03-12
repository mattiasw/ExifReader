/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import {__RewireAPI__ as ImageHeaderRewireAPI} from '../../src/image-header';
import {__RewireAPI__ as ImageHeaderPngRewireAPI} from '../../src/image-header-png';
import ImageHeader from '../../src/image-header';

describe('image-header', () => {
    afterEach(() => {
        ImageHeaderRewireAPI.__ResetDependency__('Constants');
        ImageHeaderRewireAPI.__ResetDependency__('Tiff');
        ImageHeaderRewireAPI.__ResetDependency__('Jpeg');
        ImageHeaderRewireAPI.__ResetDependency__('Png');
        ImageHeaderRewireAPI.__ResetDependency__('Heic');
        ImageHeaderRewireAPI.__ResetDependency__('Webp');
        ImageHeaderPngRewireAPI.__ResetDependency__('Constants');
    });

    it('should fail for too short data buffer', () => {
        const dataView = getDataView('\x00');
        expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
    });

    it('should fail for invalid image format', () => {
        const dataView = getDataView('------------');
        expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
    });

    it('should fail for undefined input value', () => {
        expect(() => ImageHeader.parseAppMarkers(undefined)).to.throw(/Invalid image format/);
    });

    describe('TIFF files', () => {
        const TIFF_IMAGE_START = '\x49\x49\x2a\x00';

        it('should accept well-formed header of TIFF image data with little-endian encoding', () => {
            const dataView = getDataView('\x49\x49\x2a\x00');
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.not.throw();
        });

        it('should accept well-formed header of TIFF image data with big-endian encoding', () => {
            const dataView = getDataView('\x4d\x4d\x00\x2a');
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.not.throw();
        });

        it('should find header offset in TIFF file', () => {
            const dataView = getDataView(TIFF_IMAGE_START);
            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
            expect(appMarkerValues).to.deep.equal({
                hasAppMarkers: true,
                tiffHeaderOffset: 0
            });
        });

        it('should handle when TIFF files have been excluded in a custom build', () => {
            ImageHeaderRewireAPI.__Rewire__('Constants', {USE_TIFF: false});
            const dataView = getDataView(TIFF_IMAGE_START);
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('JPEG files', () => {
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

        it('should accept well-formed header of JPEG image data', () => {
            const dataView = getDataView('\xff\xd8\xff\xe100Exif\x00\x00');
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.not.throw();
        });

        it('should find no tags when there are no markers', () => {
            const dataView = getDataView('\xff\xd8----------');
            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
            expect(appMarkerValues).to.deep.equal({
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
            const dataView = getDataView('\xff\xd8\xff\xe1--------');
            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
            expect(appMarkerValues).to.deep.equal({
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
            const dataView = getDataView('\xff\xd8\xfe\xdc\x00\x6fJFIF\x65\x01\x01\x01\x00\x48');
            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
            expect(appMarkerValues).to.deep.equal({
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
            const {tiffHeaderOffset} = ImageHeader.parseAppMarkers(dataView);
            expect(tiffHeaderOffset).to.equal(39);
        });

        it('should recognize APP2 ICC data', () => {
            const dataView = getDataView(`${JPEG_IMAGE_START}\xff\xe2\x00\xa0ICC_PROFILE\x00\x07\x09`);
            const {iccChunks} = ImageHeader.parseAppMarkers(dataView);
            expect(iccChunks).to.have.lengthOf(1);
            expect(iccChunks[0].chunkNumber).to.equal(7);
            expect(iccChunks[0].chunksTotal).to.equal(9);
            expect(iccChunks[0].length).to.equal(144);
            expect(iccChunks[0].offset).to.equal(29);
        });

        it('should recognize APP2 MPF data', () => {
            const dataView = getDataView(`${JPEG_IMAGE_START}\xff\xe2\x00\x06MPF\x00\x4d\x4d`);
            const {mpfDataOffset} = ImageHeader.parseAppMarkers(dataView);
            expect(mpfDataOffset).to.equal(19);
        });

        it('should handle JFIF APP0 markers', () => {
            const dataView = getDataView(`\xff\xd8${APP0_MARKER}\x00\x07JFIF\x00`);
            const {jfifDataOffset} = ImageHeader.parseAppMarkers(dataView);
            expect(jfifDataOffset).to.equal(4);
        });

        it('should handle JFXX APP0 markers', () => {
            const dataView = getDataView(`${JPEG_IMAGE_START}\xff\xe0\x00\x07JFXX\x00${SOME_MARKER_CONTENT}`);
            const {tiffHeaderOffset} = ImageHeader.parseAppMarkers(dataView);
            expect(tiffHeaderOffset).to.equal(30);
        });

        it('should handle unknown high ID APP markers', () => {
            const dataView = getDataView(`\xff\xd8${APP_UNKNOWN_MARKER}\x00\x07XXXX\x00${SOME_MARKER_CONTENT}`);
            const {tiffHeaderOffset} = ImageHeader.parseAppMarkers(dataView);
            expect(tiffHeaderOffset).to.equal(21);
        });

        it('should handle reversed order of JFIF-Exif hybrid', () => {
            const dataView = getDataView(`\xff\xd8${APP1_MARKER}\x00\x08Exif\x00\x00\xff\xe0\x00\x07JFIF\x00`);
            const {tiffHeaderOffset} = ImageHeader.parseAppMarkers(dataView);
            expect(tiffHeaderOffset).to.equal(12);
        });

        it('should handle fill bytes', () => {
            const FILL_BYTE = '\xff';
            const dataView = getDataView(`${JPEG_IMAGE_START}\xff\xe2\x00\x07XXXX\x00${FILL_BYTE}\xff\xe0\x00\x07JFXX\x00${SOME_MARKER_CONTENT}`);
            const {tiffHeaderOffset} = ImageHeader.parseAppMarkers(dataView);
            expect(tiffHeaderOffset).to.equal(40);
        });

        it('should recognize IPTC data', () => {
            const dataView = getDataView('\xff\xd8\xff\xed\x00\x10Photoshop 3.0\x00');
            const {iptcDataOffset} = ImageHeader.parseAppMarkers(dataView);
            expect(iptcDataOffset).to.equal(20);
        });

        it('should handle IPTC Comment markers', () => {
            const dataView = getDataView(`${JPEG_IMAGE_START}${COMMENT_MARKER}\x00\x2bOptimized by JPEGmin\x00`);
            const {hasAppMarkers} = ImageHeader.parseAppMarkers(dataView);
            expect(hasAppMarkers).to.be.true;
        });

        it('should recognize Start of Frame (Baseline DCT) data', () => {
            const dataView = getDataView(`\xff\xd8${SOF0_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`);
            const {fileDataOffset} = ImageHeader.parseAppMarkers(dataView);
            expect(fileDataOffset).to.equal(4);
        });

        it('should recognize Start of Frame (Progressive DCT) data', () => {
            const dataView = getDataView(`\xff\xd8${SOF2_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`);
            const {fileDataOffset} = ImageHeader.parseAppMarkers(dataView);
            expect(fileDataOffset).to.equal(4);
        });

        it('should handle Define Huffman Table(s) marker', () => {
            const dataView = getDataView(`\xff\xd8${DHT_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`);
            const {hasAppMarkers} = ImageHeader.parseAppMarkers(dataView);
            expect(hasAppMarkers).to.be.true;
        });

        it('should handle Define Quantization Table(s) marker', () => {
            const dataView = getDataView(`\xff\xd8${DQT_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`);
            const {hasAppMarkers} = ImageHeader.parseAppMarkers(dataView);
            expect(hasAppMarkers).to.be.true;
        });

        it('should handle Define Restart Interval marker', () => {
            const dataView = getDataView(`\xff\xd8${DRI_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`);
            const {hasAppMarkers} = ImageHeader.parseAppMarkers(dataView);
            expect(hasAppMarkers).to.be.true;
        });

        it('should handle Start of Scan marker', () => {
            const dataView = getDataView(`\xff\xd8${SOS_MARKER}\x00\x04\x47\x11${SOME_MARKER_CONTENT}`);
            const {hasAppMarkers} = ImageHeader.parseAppMarkers(dataView);
            expect(hasAppMarkers).to.be.true;
        });

        it('should recognize IPTC XMP data', () => {
            const dataView = getDataView(`\xff\xd8${APP1_MARKER}\x00\x1fhttp://ns.adobe.com/xap/1.0/\x00`);
            const {xmpChunks: [{dataOffset}]} = ImageHeader.parseAppMarkers(dataView);
            expect(dataOffset).to.equal(35);
        });

        it('should report correct size for IPTC XMP metadata', () => {
            const dataView = getDataView(`\xff\xd8${APP1_MARKER}\x00\x49http://ns.adobe.com/xap/1.0/\x00`);
            const {xmpChunks: [{length}]} = ImageHeader.parseAppMarkers(dataView);
            expect(length).to.equal(42);
        });

        it('should recognize Extended XMP data', () => {
            const dataView = getDataView(`\xff\xd8${APP1_MARKER}\x00\x25http://ns.adobe.com/xmp/extension/\x00`);
            const {xmpChunks: [{dataOffset}]} = ImageHeader.parseAppMarkers(dataView);
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
            } = ImageHeader.parseAppMarkers(dataView);

            expect(dataOffset0).to.equal(35);
            expect(length0).to.equal(0);
            expect(dataOffset1).to.equal(114);
            expect(length1).to.equal(0);
        });

        it('should handle when JPEG files have been excluded in a custom build', () => {
            ImageHeaderRewireAPI.__Rewire__('Constants', {USE_JPEG: false});
            const dataView = getDataView('\xff\xd8\xff\xe100Exif\x00\x00');
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('PNG files', () => {
        const PNG_IMAGE_START = '\x89\x50\x4e\x47\x0d\x0a\x1a\x0a';

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

            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);

            expect(appMarkerValues).to.deep.equal({
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

            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);

            expect(appMarkerValues).to.deep.equal({
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

            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);

            expect(appMarkerValues).to.deep.equal({
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

        it('should find pHYs chunks', () => {
            const chunkData = '\x01\x02\x03\x04\x02\x03\x04\x05\x01';
            const chunkLength = `\x00\x00\x00${String.fromCharCode(chunkData.length)}`;
            const chunkType = 'pHYs';
            const crcChecksum = '\x00\x00\x00\x00';

            const dataView = getDataView(
                PNG_IMAGE_START
                + chunkLength + chunkType + chunkData + crcChecksum
            );

            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);

            expect(appMarkerValues).to.deep.equal({
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

            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);

            expect(appMarkerValues).to.deep.equal({
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

            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);

            expect(appMarkerValues).to.deep.equal({
                hasAppMarkers: true,
                tiffHeaderOffset: PNG_IMAGE_START.length + chunkLength.length + chunkType.length,
            });
        });

        it('should handle when PNG files have been excluded in a custom build', () => {
            ImageHeaderRewireAPI.__Rewire__('Constants', {USE_PNG: false});
            const dataView = getDataView(PNG_IMAGE_START);
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });

        it('should handle when PNG file tags have been excluded in a custom build', () => {
            ImageHeaderRewireAPI.__Rewire__('Constants', {USE_PNG: true, USE_PNG_FILE: false});
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

            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({hasAppMarkers: false});
        });
    });

    describe('HEIC files', () => {
        const dataView = {};
        const offsets = {};

        beforeEach(() => {
            ImageHeaderRewireAPI.__Rewire__('Heic', {
                isHeicFile: (_dataView) => _dataView === dataView,
                findHeicOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            });
        });

        it('should handle HEIC files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal(offsets);
        });

        it('should ignore file when it\'s not a HEIC image', () => {
            ImageHeaderRewireAPI.__Rewire__('Heic', {
                isHeicFile: () => false
            });

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when HEIC files have been excluded in a custom build', () => {
            ImageHeaderRewireAPI.__Rewire__('Constants', {USE_HEIC: false});
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('WebP files', () => {
        const dataView = {};
        const offsets = {};

        beforeEach(() => {
            ImageHeaderRewireAPI.__Rewire__('Webp', {
                isWebpFile: (_dataView) => _dataView === dataView,
                findOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            });
        });

        it('should handle WebP files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal(offsets);
        });

        it('should ignore file when it\'s not a WebP image', () => {
            ImageHeaderRewireAPI.__Rewire__('Webp', {
                isWebpFile: () => false
            });

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when WebP files have been excluded in a custom build', () => {
            ImageHeaderRewireAPI.__Rewire__('Constants', {USE_WEBP: false});
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });
});
