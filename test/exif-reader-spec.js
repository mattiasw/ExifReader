/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getConsoleWarnSpy} from './test-utils';
import {__RewireAPI__ as ExifReaderRewireAPI} from '../src/exif-reader';
import * as ExifReader from '../src/exif-reader';
import exifErrors from '../src/errors';

const OFFSET_TEST_VALUE = 4711;
const XMP_FIELD_LENGTH_TEST_VALUE = 47;

describe('exif-reader', () => {
    afterEach(() => {
        ExifReaderRewireAPI.__ResetDependency__('ImageHeader');
        ExifReaderRewireAPI.__ResetDependency__('Tags');
        ExifReaderRewireAPI.__ResetDependency__('IptcTags');
        ExifReaderRewireAPI.__ResetDependency__('XmpTags');
    });

    it('should give a warning if a full DataView implementation is not available', () => {
        const warnSpy = getConsoleWarnSpy();
        const tags = ExifReader.load();
        expect(warnSpy.hasWarned).to.be.true;
        expect(tags).to.deep.equal({});
        warnSpy.reset();
    });

    it('should fail when there is no Exif data', () => {
        rewireImageHeader({
            hasAppMarkers: false,
            tiffHeaderOffset: undefined,
            iptcDataOffset: undefined,
            xmpDataOffset: undefined,
            xmpFieldLength: undefined
        });
        expect(() => ExifReader.loadView()).to.throw(exifErrors.MetadataMissingError);
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
        rewireForLoadView({xmpDataOffset: OFFSET_TEST_VALUE, xmpFieldLength: XMP_FIELD_LENGTH_TEST_VALUE}, 'XmpTags', myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should expand segments into separated properties on return object if specified', () => {
        const myTags = {
            exif: {MyExifTag: 42},
            iptc: {MyIptcTag: 43},
            xmp: {MyXmpTag: 44}
        };
        rewireImageHeader({
            tiffHeaderOffset: OFFSET_TEST_VALUE,
            iptcDataOffset: OFFSET_TEST_VALUE,
            xmpDataOffset: OFFSET_TEST_VALUE,
            xmpFieldLength: XMP_FIELD_LENGTH_TEST_VALUE
        });
        rewireTagsRead('Tags', myTags.exif);
        rewireTagsRead('IptcTags', myTags.iptc);
        rewireTagsRead('XmpTags', myTags.xmp);

        expect(ExifReader.loadView({}, {expanded: true})).to.deep.equal(myTags);
    });
});

function rewireForLoadView(appMarkersValue, tagsObject, tagsValue) {
    rewireImageHeader(appMarkersValue);
    rewireTagsRead(tagsObject, tagsValue);
}

function rewireImageHeader(appMarkersValue) {
    ExifReaderRewireAPI.__Rewire__('ImageHeader', {
        check() {
            // Always succeed.
        },
        parseAppMarkers() {
            return appMarkersValue;
        }
    });
}

function rewireTagsRead(tagsObject, tagsValue) {
    ExifReaderRewireAPI.__Rewire__(tagsObject, {
        read(dataView, offset, fieldLength) {
            if ((offset !== OFFSET_TEST_VALUE)
                || ((tagsObject === 'XmpTags') && (fieldLength !== XMP_FIELD_LENGTH_TEST_VALUE))) {
                return {};
            }
            return tagsValue;
        }
    });
}
