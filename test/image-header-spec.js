import {expect} from 'chai';
import {getDataView} from './utils';
import ImageHeader from '../src/image-header';

describe('image-header', () => {
    it('should fail for too short data buffer', () => {
        const dataView = getDataView('\x00');
        expect(() => ImageHeader.check(dataView)).to.throw(/Invalid image format/);
    });

    it('should fail for invalid image format', () => {
        const dataView = getDataView('------------');
        expect(() => ImageHeader.check(dataView)).to.throw(/Invalid image format/);
    });

    it('should accept well-formed header of JPEG image data', () => {
        const dataView = getDataView('\xff\xd8\xff\xe100Exif\x00\x00');
        expect(() => ImageHeader.check(dataView)).to.not.throw();
    });

    it('should handle APP2 markers', () => {
        const dataView = getDataView('\xff\xd8\xff\xe0\x00\x07JFIF\x00\xff\xe2\x00\x07XXXX\x00\xff\xe0\x00\x07JFXX\x00\xff\xe1\x47\x11Exif\x00\x00');
        const {tiffHeaderOffset} = ImageHeader.parseAppMarkers(dataView);
        expect(tiffHeaderOffset).to.equal(39);
    });

    it('should handle JFIF APP0 markers', () => {
        const dataView = getDataView('\xff\xd8\xff\xe0\x00\x07JFIF\x00\xff\xe1\x47\x11Exif\x00\x00');
        const {tiffHeaderOffset} = ImageHeader.parseAppMarkers(dataView);
        expect(tiffHeaderOffset).to.equal(21);
    });

    it('should handle JFXX APP0 markers', () => {
        const dataView = getDataView('\xff\xd8\xff\xe0\x00\x07JFIF\x00\xff\xe0\x00\x07JFXX\x00\xff\xe1\x47\x11Exif\x00\x00');
        const {tiffHeaderOffset} = ImageHeader.parseAppMarkers(dataView);
        expect(tiffHeaderOffset).to.equal(30);
    });

    it('should handle unknown high ID APP markers', () => {
        const dataView = getDataView('\xff\xd8\xff\xea\x00\x07XXXX\x00\xff\xe1\x47\x11Exif\x00\x00');
        const {tiffHeaderOffset} = ImageHeader.parseAppMarkers(dataView);
        expect(tiffHeaderOffset).to.equal(21);
    });

    it('should handle reversed order of JFIF-Exif hybrid', () => {
        const dataView = getDataView('\xff\xd8\xff\xe1\x00\x08Exif\x00\x00\xff\xe0\x00\x07JFIF\x00');
        const {tiffHeaderOffset} = ImageHeader.parseAppMarkers(dataView);
        expect(tiffHeaderOffset).to.equal(12);
    });

    it('should recognize IPTC data', () => {
        const dataView = getDataView('\xff\xd8\xff\xed\x00\x10Photoshop 3.0\x00');
        const {iptcDataOffset} = ImageHeader.parseAppMarkers(dataView);
        expect(iptcDataOffset).to.equal(20);
    });

    it('should handle IPTC Comment markers', () => {
        const dataView = getDataView('\xff\xd8\xff\xe0\x00\x07JFIF\x00\xff\xfe\x00\x2bOptimized by JPEGmin\x00');
        const {hasAppMarkers} = ImageHeader.parseAppMarkers(dataView);
        expect(hasAppMarkers).to.be.true;
    });
});
