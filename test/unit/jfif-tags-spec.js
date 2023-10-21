/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getArrayBuffer} from './test-utils';
import JfifTags from '../../src/jfif-tags';

const JFIF_IDENTIFIER = '\x4a\x46\x49\x46\x00';
const JFIF_VERSION = '\x01\x02';
const JFIF_DATA_CONTENT_VERSION = `\x00\x09${JFIF_IDENTIFIER}${JFIF_VERSION}`;
const JFIF_DATA_CONTENT_RESOLUTION_UNIT_NONE = `\x00\x0a${JFIF_IDENTIFIER}${JFIF_VERSION}\x00`;
const JFIF_DATA_CONTENT_RESOLUTION_UNIT_INCHES = `\x00\x0a${JFIF_IDENTIFIER}${JFIF_VERSION}\x01`;
const JFIF_DATA_CONTENT_RESOLUTION_UNIT_CM = `\x00\x0a${JFIF_IDENTIFIER}${JFIF_VERSION}\x02`;
const JFIF_DATA_CONTENT_RESOLUTION_UNIT_UNKNOWN = `\x00\x0a${JFIF_IDENTIFIER}${JFIF_VERSION}\x99`;
const JFIF_DATA_CONTENT_XRESOLUTION = `\x00\x0c${JFIF_IDENTIFIER}${JFIF_VERSION}\x99\x00\xab`;
const JFIF_DATA_CONTENT_YRESOLUTION = `\x00\x0e${JFIF_IDENTIFIER}${JFIF_VERSION}\x99\x00\xab\x00\xbc`;
const JFIF_THUMBNAIL_PIXEL_DATA = '\x0a\x0b\x0c\x0d\x0e\x0f';
const JFIF_DATA_CONTENT_THUMBNAIL = `\x00\x16${JFIF_IDENTIFIER}${JFIF_VERSION}\x99\x00\xab\x00\xbc\x01\x02${JFIF_THUMBNAIL_PIXEL_DATA}`;
const OFFSET = 0;

describe('jfif-tags', () => {
    it('should read JFIF version', () => {
        const dataView = getDataView(JFIF_DATA_CONTENT_VERSION);
        expect(JfifTags.read(dataView, OFFSET)['JFIF Version']).to.deep.equal({
            value: 0x0102,
            description: '1.2'
        });
    });

    it('should read resolution unit None', () => {
        const dataView = getDataView(JFIF_DATA_CONTENT_RESOLUTION_UNIT_NONE);
        expect(JfifTags.read(dataView, OFFSET)['Resolution Unit']).to.deep.equal({
            value: 0x00,
            description: 'None'
        });
    });

    it('should read resolution unit inches', () => {
        const dataView = getDataView(JFIF_DATA_CONTENT_RESOLUTION_UNIT_INCHES);
        expect(JfifTags.read(dataView, OFFSET)['Resolution Unit']).to.deep.equal({
            value: 0x01,
            description: 'inches'
        });
    });

    it('should read resolution unit cm', () => {
        const dataView = getDataView(JFIF_DATA_CONTENT_RESOLUTION_UNIT_CM);
        expect(JfifTags.read(dataView, OFFSET)['Resolution Unit']).to.deep.equal({
            value: 0x02,
            description: 'cm'
        });
    });

    it('should read resolution unit Unknown', () => {
        const dataView = getDataView(JFIF_DATA_CONTENT_RESOLUTION_UNIT_UNKNOWN);
        expect(JfifTags.read(dataView, OFFSET)['Resolution Unit']).to.deep.equal({
            value: 0x99,
            description: 'Unknown'
        });
    });

    it('should read XResolution', () => {
        const dataView = getDataView(JFIF_DATA_CONTENT_XRESOLUTION);
        expect(JfifTags.read(dataView, OFFSET)['XResolution']).to.deep.equal({
            value: 0xab,
            description: '171'
        });
    });

    it('should read YResolution', () => {
        const dataView = getDataView(JFIF_DATA_CONTENT_YRESOLUTION);
        expect(JfifTags.read(dataView, OFFSET)['YResolution']).to.deep.equal({
            value: 0xbc,
            description: '188'
        });
    });

    it('should read thumbnail', () => {
        const dataView = getDataView(JFIF_DATA_CONTENT_THUMBNAIL);
        const tags = JfifTags.read(dataView, OFFSET);
        expect(tags['JFIF Thumbnail Width']).to.deep.equal({
            value: 0x01,
            description: '1px'
        });
        expect(tags['JFIF Thumbnail Height']).to.deep.equal({
            value: 0x02,
            description: '2px'
        });
        const thumbnailValue = Array.from(new Uint8Array(tags['JFIF Thumbnail'].value));
        const expectedValue = Array.from(getArrayBuffer(JFIF_THUMBNAIL_PIXEL_DATA));
        expect(thumbnailValue).to.deep.equal(expectedValue);
        expect(tags['JFIF Thumbnail'].description).to.equal('<24-bit RGB pixel data>');
    });
});
