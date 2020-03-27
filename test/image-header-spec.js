/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getByteStringFromNumber} from './test-utils';
import ImageHeader from '../src/image-header';

const JPEG_IMAGE_START = '\xff\xd8\xff\xe0\x00\x07JFIF\x00';
const TIFF_IMAGE_START = '\x49\x49\x2a\x00';
const PNG_IMAGE_START = '\x89\x50\x4e\x47\x0d\x0a\x1a\x0a';
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

describe('image-header', () => {
    it('should fail for too short data buffer', () => {
        const dataView = getDataView('\x00');
        expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
    });

    it('should fail for invalid image format', () => {
        const dataView = getDataView('------------');
        expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
    });

    it('should accept well-formed header of JPEG image data', () => {
        const dataView = getDataView('\xff\xd8\xff\xe100Exif\x00\x00');
        expect(() => ImageHeader.parseAppMarkers(dataView)).to.not.throw();
    });

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

    describe('PNG files', () => {
        it('should find image header offset', () => {
            const chunkLength = '\x00\x00\x00\x02';
            const chunkType = 'IHDR';
            const chunkData = '\x47\x11';
            const crc = '\x00\x00\x00\x00';
            const chunkLengthOther = '\x00\x00\x00\x04';
            const chunkTypeOther = 'abcd';
            const chunkDataOther = '\x48\x12\x49\x13';

            const dataView = getDataView(
                PNG_IMAGE_START
                + chunkLengthOther + chunkTypeOther + chunkDataOther + crc
                + chunkLength + chunkType + chunkData + crc
            );

            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);

            expect(appMarkerValues).to.deep.equal({
                hasAppMarkers: true,
                pngHeaderOffset: PNG_IMAGE_START.length + 16 + 8,
            });
        });

        it('should find XMP offset in international textual data', () => {
            const xmpPrefix = 'XML:com.adobe.xmp';
            const chunkLength = `\x00\x00\x00${String.fromCharCode(xmpPrefix.length + 2)}`;
            const chunkType = 'iTXt';
            const chunkData = `${xmpPrefix}\x47\x11`;
            const crc = '\x00\x00\x00\x00';
            const chunkLengthOther = '\x00\x00\x00\x04';
            const chunkTypeOther = 'abcd';
            const chunkDataOther = '\x48\x12\x49\x13';

            const dataView = getDataView(
                PNG_IMAGE_START
                + chunkLengthOther + chunkTypeOther + chunkDataOther + crc
                + chunkLength + chunkType + chunkData + crc
            );

            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);

            expect(appMarkerValues).to.deep.equal({
                hasAppMarkers: true,
                xmpChunks: [{
                    dataOffset: PNG_IMAGE_START.length + 16 + 8 + xmpPrefix.length,
                    length: 2,
                }],
            });
        });
    });

    describe('HEIC files', () => {
        const HEIC_PREFIX = '\x00\x00\x00\x0cftyp';
        const HEADER_SIZE = 8;
        const META_EXTENDED_LENGTH_SIZE = 8;

        describe('major brand recognition', () => {
            const majorBrands = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1'];

            for (const brand of majorBrands) {
                it(`should find header offset in HEIC file with major brand ${brand}`, () => {
                    const {dataView} = getHeicDataView({brand});
                    const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
                    expect(appMarkerValues.hasAppMarkers).to.be.true;
                });
            }
        });

        it('should find Exif offset', () => {
            const {dataView, tiffHeaderOffset} = getHeicDataView({ilocItemPadding: true});
            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
            expect(appMarkerValues.tiffHeaderOffset).to.equal(tiffHeaderOffset);
            expect(appMarkerValues.hasAppMarkers).to.be.true;
        });

        it('should ignore other atoms than meta', () => {
            const {dataView, tiffHeaderOffset} = getHeicDataView({ilocItemPadding: true});
            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
            expect(appMarkerValues.tiffHeaderOffset).to.equal(tiffHeaderOffset);
            expect(appMarkerValues.hasAppMarkers).to.be.true;
        });

        it('should handle when there is no iloc', () => {
            const {dataView} = getHeicDataView({iloc: false});
            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
            expect(appMarkerValues.tiffHeaderOffset).to.be.undefined;
            expect(appMarkerValues.hasAppMarkers).to.be.false;
        });

        it('should handle when there is no Exif item', () => {
            const dataView = getDataView(
                `${HEIC_PREFIX}heic\x00\x00\x00\x14meta`
                + 'iloc\x00\x00\x00\x00\x00\x00\x00\x00'
            );
            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
            expect(appMarkerValues.tiffHeaderOffset).to.be.undefined;
            expect(appMarkerValues.hasAppMarkers).to.be.false;
        });

        it('should handle when there is no matching iloc item index', () => {
            const {dataView} = getHeicDataView({exifLoc: false});
            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
            expect(appMarkerValues.tiffHeaderOffset).to.be.undefined;
            expect(appMarkerValues.hasAppMarkers).to.be.false;
        });

        it('should handle when Exif pointer points to beyond the end of the file', () => {
            const {dataView} = getHeicDataView({pointerOverreach: true});
            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
            expect(appMarkerValues.tiffHeaderOffset).to.be.undefined;
            expect(appMarkerValues.hasAppMarkers).to.be.false;
        });

        it('should handle when atom size extends to end of file', () => {
            const {dataView, tiffHeaderOffset} = getHeicDataView({metaLength: 0});
            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
            expect(appMarkerValues.tiffHeaderOffset).to.equal(tiffHeaderOffset);
            expect(appMarkerValues.hasAppMarkers).to.be.true;
        });

        it('should handle extended size atoms', () => {
            const {dataView, tiffHeaderOffset} = getHeicDataView({metaLength: 1});
            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
            expect(appMarkerValues.tiffHeaderOffset).to.equal(tiffHeaderOffset);
            expect(appMarkerValues.hasAppMarkers).to.be.true;
        });

        it('should (for now) ignore atoms with extended size larger than 32 bits', () => {
            const {dataView} = getHeicDataView({metaLength: 'huge'});
            const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
            expect(appMarkerValues.tiffHeaderOffset).to.be.undefined;
            expect(appMarkerValues.hasAppMarkers).to.be.false;
        });

        function getHeicDataView({brand, iloc, ilocItemPadding, exifLoc, atomPadding, metaLength, pointerOverreach} = {}) {
            const META_HEADER_SIZE = 8;
            const EXIF_OFFSET_SIZE = 4;
            const EXIF_PREFIX_LENGTH_OFFSET = 4;

            brand = brand || 'heic';
            iloc = iloc || (iloc === undefined);
            exifLoc = exifLoc || (exifLoc === undefined);

            const exifLocIndex = '\x00\x42';
            const exifOffset = 0x4711;
            let metaContent = `${exifLocIndex}\x00\x00Exif`
                + (iloc ? 'iloc' : 'iref') + '\x00\x00\x00\x00\x00\x00\x00\x00'
                + (ilocItemPadding ? '\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' : '')
                + (exifLoc ? `${exifLocIndex}\x00\x00\x00\x00\x00\x00[ep]\x00\x00\x00\x00` : '\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00')
                + `${getByteStringFromNumber(exifOffset, 4)}`;
            let exifPointer = HEADER_SIZE + brand.length + META_HEADER_SIZE + metaContent.length - EXIF_OFFSET_SIZE;
            if (metaLength === 1) {
                exifPointer += META_EXTENDED_LENGTH_SIZE;
            }
            metaContent = metaContent.replace(
                '[ep]',
                getByteStringFromNumber(exifPointer + (pointerOverreach ? 4 : 0), 4)
            );

            const dataView = getDataView(
                `${HEIC_PREFIX}${brand}`
                + (atomPadding ? '\x00\x00\x00\x0cmoov\x00\x00\x00\x00' : '')
                + `${getMetaLength(metaLength, metaContent)}meta`
                + getExtendedLength(metaLength, metaContent)
                + metaContent
            );

            return {
                dataView,
                tiffHeaderOffset: exifOffset + exifPointer + EXIF_PREFIX_LENGTH_OFFSET
            };
        }

        function getMetaLength(metaLength, metaContent) {
            if (metaLength === undefined) {
                return getByteStringFromNumber(metaContent.length + HEADER_SIZE, 4);
            }
            if (metaLength === 'huge') {
                return getByteStringFromNumber(1, 4);
            }
            return getByteStringFromNumber(metaLength, 4);
        }

        function getExtendedLength(metaLength, metaContent) {
            if (metaLength === 1) {
                return getByteStringFromNumber(metaContent.length + HEADER_SIZE + META_EXTENDED_LENGTH_SIZE, META_EXTENDED_LENGTH_SIZE);
            } else if (metaLength === 'huge') {
                return '\x00\x00\x00\x01\x00\x00\x00\x01';
            }
            return '';
        }
    });

    it('should find no tags when there are no markers', () => {
        const dataView = getDataView('\xff\xd8----------');
        const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
        expect(appMarkerValues).to.deep.equal({
            hasAppMarkers: false,
            fileDataOffset: undefined,
            tiffHeaderOffset: undefined,
            iptcDataOffset: undefined,
            xmpChunks: undefined,
            iccChunks: undefined
        });
    });

    it('should find no tags when there is no Exif identifier for APP1', () => {
        const dataView = getDataView('\xff\xd8\xff\xe1--------');
        const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
        expect(appMarkerValues).to.deep.equal({
            hasAppMarkers: true,
            fileDataOffset: undefined,
            tiffHeaderOffset: undefined,
            iptcDataOffset: undefined,
            xmpChunks: undefined,
            iccChunks: undefined
        });
    });

    it('should find no tags for faulty APP markers', () => {
        const dataView = getDataView('\xff\xd8\xfe\xdc\x00\x6fJFIF\x65\x01\x01\x01\x00\x48');
        const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
        expect(appMarkerValues).to.deep.equal({
            hasAppMarkers: false,
            fileDataOffset: undefined,
            tiffHeaderOffset: undefined,
            iptcDataOffset: undefined,
            xmpChunks: undefined,
            iccChunks: undefined
        });
    });

    it('should handle APP2 markers', () => {
        const dataView = getDataView(`${JPEG_IMAGE_START}\xff\xe2\x00\x07XXXX\x00\xff\xe0\x00\x07JFXX\x00${SOME_MARKER_CONTENT}`);
        const {tiffHeaderOffset} = ImageHeader.parseAppMarkers(dataView);
        expect(tiffHeaderOffset).to.equal(39);
    });

    it('should recognize APP2 ICC data', () => {
        const dataView = getDataView(`${JPEG_IMAGE_START}\xff\xe2\x00\xA0ICC_PROFILE\x00\x07\x09`);
        const {iccChunks} = ImageHeader.parseAppMarkers(dataView);
        expect(iccChunks).to.have.lengthOf(1);
        expect(iccChunks[0].chunkNumber).to.equal(7);
        expect(iccChunks[0].chunksTotal).to.equal(9);
        expect(iccChunks[0].length).to.equal(144);
        expect(iccChunks[0].offset).to.equal(29);
    });

    it('should handle JFIF APP0 markers', () => {
        const dataView = getDataView(`\xff\xd8\xff\xe0\x00\x07JFIF\x00${SOME_MARKER_CONTENT}`);
        const {tiffHeaderOffset} = ImageHeader.parseAppMarkers(dataView);
        expect(tiffHeaderOffset).to.equal(21);
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
});
