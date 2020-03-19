/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {__RewireAPI__ as ExifReaderRewireAPI} from '../src/exif-reader';
import * as ExifReader from '../src/exif-reader';
import exifErrors from '../src/errors';

const OFFSET_TEST_VALUE = 4711;
const XMP_FIELD_LENGTH_TEST_VALUE = 47;
const OFFSET_TEST_VALUE_ICC2_1 = 27110;
const OFFSET_TEST_VALUE_ICC2_2 = 47110;

describe('exif-reader', () => {
    afterEach(() => {
        ExifReaderRewireAPI.__ResetDependency__('DataViewWrapper');
        ExifReaderRewireAPI.__ResetDependency__('loadView');
        ExifReaderRewireAPI.__ResetDependency__('ImageHeader');
        ExifReaderRewireAPI.__ResetDependency__('FileTags');
        ExifReaderRewireAPI.__ResetDependency__('Tags');
        ExifReaderRewireAPI.__ResetDependency__('IptcTags');
        ExifReaderRewireAPI.__ResetDependency__('XmpTags');
        ExifReaderRewireAPI.__ResetDependency__('PngFileTags');
        ExifReaderRewireAPI.__ResetDependency__('Thumbnail');
    });

    it('should throw an error if the passed buffer is non-compliant', () => {
        expect(() => ExifReader.load()).to.throw;
    });

    it('should fall back on DataView wrapper if DataView implementation if a full DataView implementation is not available', () => {
        let dataViewWrapperWasCalled = false;
        ExifReaderRewireAPI.__Rewire__('DataViewWrapper', function () {
            dataViewWrapperWasCalled = true;
        });
        ExifReaderRewireAPI.__Rewire__('loadView', function () {
            // Do nothing in this test.
        });

        ExifReader.load();

        expect(dataViewWrapperWasCalled).to.be.true;
    });

    it('should fail when there is no Exif data', () => {
        rewireImageHeader({
            hasAppMarkers: false,
            fileDataOffset: undefined,
            tiffHeaderOffset: undefined,
            iptcDataOffset: undefined,
            xmpChunks: undefined,
            iccChunks: undefined
        });
        expect(() => ExifReader.loadView()).to.throw(exifErrors.MetadataMissingError);
    });

    it('should be able to find file data segment', () => {
        const myTags = {MyTag: 42};
        rewireForLoadView({fileDataOffset: OFFSET_TEST_VALUE}, 'FileTags', myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find Exif APP segment', () => {
        const myTags = {MyExifTag: 42};
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find IPTC APP segment', () => {
        const myTags = {MyIptcTag: 42};
        rewireForLoadView({iptcDataOffset: OFFSET_TEST_VALUE}, 'IptcTags', myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find XMP APP segment', () => {
        const myTags = {MyXmpTag: 42};

        rewireImageHeader({xmpChunks: [{dataOffset: OFFSET_TEST_VALUE, length: XMP_FIELD_LENGTH_TEST_VALUE}]});
        rewireXmpTagsRead(myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find ICC APP segment', () => {
        const myTags = {MyIccTag: 42};

        rewireImageHeader({iccChunks: [OFFSET_TEST_VALUE_ICC2_1, OFFSET_TEST_VALUE_ICC2_2]});
        rewireIccTagsRead(myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find PNG file data segment', () => {
        const myTags = {MyTag: 42};
        rewireForLoadView({pngHeaderOffset: OFFSET_TEST_VALUE}, 'PngFileTags', myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should expand segments into separated properties on return object if specified', () => {
        const myTags = {
            file: {MyFileTag: 42},
            exif: {MyExifTag: 43},
            iptc: {MyIptcTag: 44},
            xmp: {MyXmpTag: 45},
            icc: {MyIccTag: 42},
            Thumbnail: {type: 'image/jpeg'}
        };
        rewireImageHeader({
            fileDataOffset: OFFSET_TEST_VALUE,
            tiffHeaderOffset: OFFSET_TEST_VALUE,
            iptcDataOffset: OFFSET_TEST_VALUE,
            xmpChunks: [{
                dataOffset: OFFSET_TEST_VALUE,
                length: XMP_FIELD_LENGTH_TEST_VALUE
            }],
            iccChunks: [OFFSET_TEST_VALUE_ICC2_1, OFFSET_TEST_VALUE_ICC2_2]
        });
        rewireTagsRead('FileTags', myTags.file);
        rewireTagsRead('Tags', {...myTags.exif, Thumbnail: myTags.Thumbnail});
        rewireTagsRead('IptcTags', myTags.iptc);
        rewireXmpTagsRead(myTags.xmp);
        rewireIccTagsRead(myTags.icc);

        expect(ExifReader.loadView({}, {expanded: true})).to.deep.equal(myTags);
    });

    it('should retrieve a thumbnail', () => {
        const myThumbnail = {type: 'image/jpeg'};
        const myTags = {MyExifTag: 43, Thumbnail: myThumbnail};
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);
        rewireThumbnail(myThumbnail);

        expect(ExifReader.loadView({})['Thumbnail']).to.deep.equal({image: '<image data>', ...myThumbnail});
        expect(ExifReader.loadView({}, {expanded: true})['Thumbnail']).to.deep.equal({image: '<image data>', ...myThumbnail});
    });
});

function rewireForLoadView(appMarkersValue, tagsObject, tagsValue) {
    rewireImageHeader(appMarkersValue);
    rewireTagsRead(tagsObject, tagsValue);
}

function rewireImageHeader(appMarkersValue) {
    ExifReaderRewireAPI.__Rewire__('ImageHeader', {
        parseAppMarkers() {
            return appMarkersValue;
        }
    });
}

function rewireTagsRead(tagsObject, tagsValue) {
    ExifReaderRewireAPI.__Rewire__(tagsObject, {
        read(dataView, offset) {
            if (offset === OFFSET_TEST_VALUE) {
                return tagsValue;
            }
            return {};
        }
    });
}

function rewireXmpTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('XmpTags', {
        read(dataView, xmpData) {
            if ((xmpData[0].dataOffset === OFFSET_TEST_VALUE) && (xmpData[0].length === XMP_FIELD_LENGTH_TEST_VALUE)) {
                return tagsValue;
            }
            return {};
        }
    });
}

function rewireIccTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('IccTags', {
        read(dataView, iccData) {
            if (iccData.length === 2 && iccData[0] === OFFSET_TEST_VALUE_ICC2_1 && iccData[1] === OFFSET_TEST_VALUE_ICC2_2) {
                return tagsValue;
            }
            return {};
        }
    });
}

function rewireThumbnail(thumbnailTags) {
    ExifReaderRewireAPI.__Rewire__('Thumbnail', {
        get(dataView, tags) {
            expect(tags).to.deep.equal(thumbnailTags);
            return {image: '<image data>', ...thumbnailTags};
        }
    });
}
