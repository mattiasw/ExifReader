/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import ImageHeader from '../src/image-header';

const JPEG_IMAGE_START = '\xff\xd8\xff\xe0\x00\x07JFIF\x00';
const TIFF_IMAGE_START = '\x49\x49\x2a\x00';
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

    it('should find no tags when there are no markers', () => {
        const dataView = getDataView('\xff\xd8----------');
        const appMarkerValues = ImageHeader.parseAppMarkers(dataView);
        expect(appMarkerValues).to.deep.equal({
            hasAppMarkers: false,
            fileDataOffset: undefined,
            tiffHeaderOffset: undefined,
            iptcDataOffset: undefined,
            xmpDataOffset: undefined,
            xmpFieldLength: undefined
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
            xmpDataOffset: undefined,
            xmpFieldLength: undefined
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
            xmpDataOffset: undefined,
            xmpFieldLength: undefined
        });
    });

    it('should handle APP2 markers', () => {
        const dataView = getDataView(`${JPEG_IMAGE_START}\xff\xe2\x00\x07XXXX\x00\xff\xe0\x00\x07JFXX\x00${SOME_MARKER_CONTENT}`);
        const {tiffHeaderOffset} = ImageHeader.parseAppMarkers(dataView);
        expect(tiffHeaderOffset).to.equal(39);
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
        const {xmpDataOffset} = ImageHeader.parseAppMarkers(dataView);
        expect(xmpDataOffset).to.equal(35);
    });

    it('should report correct size for IPTC XMP metadata', () => {
        const dataView = getDataView(`\xff\xd8${APP1_MARKER}\x00\x49http://ns.adobe.com/xap/1.0/\x00`);
        const {xmpFieldLength} = ImageHeader.parseAppMarkers(dataView);
        expect(xmpFieldLength).to.equal(42);
    });
});
