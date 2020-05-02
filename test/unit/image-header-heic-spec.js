/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getByteStringFromNumber} from './test-utils';
import {__RewireAPI__ as ImageHeaderHeicRewireAPI} from '../../src/image-header-heic';
import ImageHeaderHeic from '../../src/image-header-heic';

describe('image-header-heic', () => {
    const HEIC_PREFIX = '\x00\x00\x00\x0cftyp';
    const HEADER_SIZE = 8;
    const META_EXTENDED_LENGTH_SIZE = 8;

    afterEach(() => {
        ImageHeaderHeicRewireAPI.__ResetDependency__('Constants');
    });

    it('should fail for too short data buffer', () => {
        const dataView = getDataView('\x00');
        expect(ImageHeaderHeic.isHeicFile(dataView)).to.be.false;
    });

    it('should fail for invalid image format', () => {
        const dataView = getDataView('------------');
        expect(ImageHeaderHeic.isHeicFile(dataView)).to.be.false;
    });

    describe('major brand recognition', () => {
        const majorBrands = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1'];

        for (const brand of majorBrands) {
            it(`should find header offset in HEIC file with major brand ${brand}`, () => {
                const {dataView} = getHeicDataView({brand});
                const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
                expect(appMarkerValues.hasAppMarkers).to.be.true;
            });
        }
    });

    it('should find Exif offset', () => {
        const {dataView, tiffHeaderOffset} = getHeicDataView({ilocItemPadding: true});
        const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
        expect(appMarkerValues.tiffHeaderOffset).to.equal(tiffHeaderOffset);
        expect(appMarkerValues.hasAppMarkers).to.be.true;
    });

    it('should handle when Exif has been excluded in a custom build', () => {
        ImageHeaderHeicRewireAPI.__Rewire__('Constants', {USE_EXIF: false, USE_ICC: true});
        const {dataView} = getHeicDataView({ilocItemPadding: true, colorType: 'prof'});
        const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
        expect(appMarkerValues.tiffHeaderOffset).to.be.undefined;
        expect(appMarkerValues.iccChunks.length).to.equal(1);
        expect(appMarkerValues.hasAppMarkers).to.be.true;
    });

    it('should handle when ICC has been excluded in a custom build', () => {
        ImageHeaderHeicRewireAPI.__Rewire__('Constants', {USE_EXIF: true, USE_ICC: false});
        const {dataView, tiffHeaderOffset} = getHeicDataView({ilocItemPadding: true, colorType: 'prof'});
        const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
        expect(appMarkerValues.tiffHeaderOffset).to.equal(tiffHeaderOffset);
        expect(appMarkerValues.iccChunks).to.be.undefined;
        expect(appMarkerValues.hasAppMarkers).to.be.true;
    });

    for (const colorType of ['prof', 'rICC']) {
        it(`should find ICC chunk with color type "${colorType}"`, () => {
            const {dataView, iccOffset} = getHeicDataView({colorType});
            const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
            expect(appMarkerValues.iccChunks).to.deep.equal([{
                offset: iccOffset,
                length: 13,
                chunkNumber: 1,
                chunksTotal: 1
            }]);
            expect(appMarkerValues.hasAppMarkers).to.be.true;
        });
    }

    it('should ignore other atoms than meta', () => {
        const {dataView, tiffHeaderOffset} = getHeicDataView({ilocItemPadding: true});
        const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
        expect(appMarkerValues.tiffHeaderOffset).to.equal(tiffHeaderOffset);
        expect(appMarkerValues.hasAppMarkers).to.be.true;
    });

    it('should handle when there is no iloc', () => {
        const {dataView} = getHeicDataView({iloc: false});
        const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
        expect(appMarkerValues.tiffHeaderOffset).to.be.undefined;
        expect(appMarkerValues.hasAppMarkers).to.be.false;
    });

    it('should handle when there is no iloc but there is colr', () => {
        const {dataView} = getHeicDataView({iloc: false, colorType: 'prof'});
        const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
        expect(appMarkerValues.tiffHeaderOffset).to.be.undefined;
        expect(appMarkerValues.iccChunks.length).to.equal(1);
        expect(appMarkerValues.hasAppMarkers).to.be.true;
    });

    it('should handle when there is no Exif item', () => {
        const dataView = getDataView(
            `${HEIC_PREFIX}heic\x00\x00\x00\x14meta`
            + 'iloc\x00\x00\x00\x00\x00\x00\x00\x00'
        );
        const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
        expect(appMarkerValues.tiffHeaderOffset).to.be.undefined;
        expect(appMarkerValues.hasAppMarkers).to.be.false;
    });

    it('should handle when there is no ICC item', () => {
        const dataView = getDataView(
            `${HEIC_PREFIX}heic\x00\x00\x00\x14meta`
        );
        const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
        expect(appMarkerValues.iccChunks).to.be.undefined;
        expect(appMarkerValues.hasAppMarkers).to.be.false;
    });

    it('should handle when there is no matching iloc item index', () => {
        const {dataView} = getHeicDataView({exifLoc: false});
        const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
        expect(appMarkerValues.tiffHeaderOffset).to.be.undefined;
        expect(appMarkerValues.hasAppMarkers).to.be.false;
    });

    it('should handle when Exif pointer points to beyond the end of the file', () => {
        const {dataView} = getHeicDataView({pointerOverreach: true});
        const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
        expect(appMarkerValues.tiffHeaderOffset).to.be.undefined;
        expect(appMarkerValues.hasAppMarkers).to.be.false;
    });

    it('should handle when atom size extends to end of file', () => {
        const {dataView, tiffHeaderOffset} = getHeicDataView({metaLength: 0});
        const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
        expect(appMarkerValues.tiffHeaderOffset).to.equal(tiffHeaderOffset);
        expect(appMarkerValues.hasAppMarkers).to.be.true;
    });

    it('should handle extended size atoms', () => {
        const {dataView, tiffHeaderOffset} = getHeicDataView({metaLength: 1});
        const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
        expect(appMarkerValues.tiffHeaderOffset).to.equal(tiffHeaderOffset);
        expect(appMarkerValues.hasAppMarkers).to.be.true;
    });

    it('should (for now) ignore atoms with extended size larger than 32 bits', () => {
        const {dataView} = getHeicDataView({metaLength: 'huge'});
        const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
        expect(appMarkerValues.tiffHeaderOffset).to.be.undefined;
        expect(appMarkerValues.hasAppMarkers).to.be.false;
    });

    function getHeicDataView({brand, iloc, ilocItemPadding, exifLoc, colorType, atomPadding, metaLength, pointerOverreach} = {}) {
        const META_HEADER_SIZE = 8;
        const ITEM_HEADER_SIZE = 12;
        const EXIF_OFFSET_SIZE = 4;
        const EXIF_PREFIX_LENGTH_OFFSET = 4;

        brand = brand || 'heic';
        iloc = iloc || (iloc === undefined);
        exifLoc = exifLoc || (exifLoc === undefined);

        const exifLocIndex = '\x00\x42';
        const exifItem = `${exifLocIndex}\x00\x00Exif`;
        const colrItem = (colorType ? `\x00\x00\x00\x19colr${colorType}<ICC content>` : '');
        const exifOffset = 0x4711;
        let metaContent =
              exifItem
            + colrItem
            + (iloc ? 'iloc' : 'iref') + '\x00\x00\x00\x00\x00\x00\x00\x00'
            + (ilocItemPadding ? '\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' : '')
            + (exifLoc ? `${exifLocIndex}\x00\x00\x00\x00\x00\x00[ep]\x00\x00\x00\x00` : '\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00')
            + `${getByteStringFromNumber(exifOffset, 4)}`;
        const iccOffset = HEADER_SIZE + brand.length + META_HEADER_SIZE + exifItem.length + ITEM_HEADER_SIZE;
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
            tiffHeaderOffset: exifOffset + exifPointer + EXIF_PREFIX_LENGTH_OFFSET,
            iccOffset
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
