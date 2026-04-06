/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getByteStringFromNumber, getDataView} from './test-utils';
import {__RewireAPI__ as ImageHeaderJxlRewireAPI} from '../../src/image-header-jxl';
import ImageHeaderJxl from '../../src/image-header-jxl';

const JXL_SIGNATURE = '\x00\x00\x00\x0CJXL \x0D\x0A\x87\x0A';
const FTYP_BOX = '\x00\x00\x00\x14ftypjxl \x00\x00\x00\x00jxl ';

describe('image-header-jxl', () => {
    afterEach(() => {
        ImageHeaderJxlRewireAPI.__ResetDependency__('Constants');
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
        ImageHeaderJxlRewireAPI.__Rewire__('Constants', {USE_EXIF: false, USE_XMP: true});

        const dataView = getDataView(getJxlData({exif: true}));

        expect(ImageHeaderJxl.findJxlOffsets(dataView).tiffHeaderOffset).to.be.undefined;
    });

    it('should ignore XMP data if it is excluded from custom build', () => {
        ImageHeaderJxlRewireAPI.__Rewire__('Constants', {USE_EXIF: true, USE_XMP: false});

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

    it('should return no app markers for a JXL naked codestream', () => {
        const dataView = getDataView('\xFF\x0Asome_codestream_data');
        const offsets = ImageHeaderJxl.findJxlOffsets(dataView);

        expect(offsets.hasAppMarkers).to.be.false;
    });
});

function getJxlData({exif, xmp, unknownBox} = {}) {
    let data = JXL_SIGNATURE + FTYP_BOX;

    if (unknownBox) {
        data += getByteStringFromNumber(16, 4) + 'jxlc' + 'XXXXXXXX';
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

    return data;
}
