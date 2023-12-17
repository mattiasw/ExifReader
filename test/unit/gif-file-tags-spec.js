/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import GifFileTags from '../../src/gif-file-tags';

const GIF_SIGNATURE = 'GIF87a';
const FILE_DATA_CONTENT =
    GIF_SIGNATURE
    + '\x02\x01' // Width, always little endian
    + '\x04\x03' // Height, always little endian
    + '\xd6' // 11010110: <color map pos, 1 bit> + <color resolution, 3 bits> + <0, 1 bit> + <bit depth, 3 bits, zero-based>
    ;

describe('gif-file-tags', () => {
    it('should read gif version', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(GifFileTags.read(dataView)['GIF Version']).to.deep.equal({
            value: '87a',
            description: '87a'
        });
    });

    it('should read image width', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(GifFileTags.read(dataView)['Image Width']).to.deep.equal({
            value: 0x0102,
            description: '258px'
        });
    });

    it('should handle when data view is too small', () => {
        const dataView = getDataView('\x01');
        expect(GifFileTags.read(dataView)['Image Width']).to.equal(undefined);
    });

    it('should read image height', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(GifFileTags.read(dataView)['Image Height']).to.deep.equal({
            value: 0x0304,
            description: '772px'
        });
    });

    it('should declare existing global color map', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(GifFileTags.read(dataView)['Global Color Map']).to.deep.equal({
            value: 1,
            description: 'Yes'
        });
    });

    it('should declare non-existing global color map', () => {
        const fileDataContent =
            FILE_DATA_CONTENT.substring(0, GIF_SIGNATURE.length + 4)
            + '\x00'
            + FILE_DATA_CONTENT.substring(GIF_SIGNATURE.length + 4);
        const dataView = getDataView(fileDataContent);
        expect(GifFileTags.read(dataView)['Global Color Map']).to.deep.equal({
            value: 0,
            description: 'No'
        });
    });

    it('should read color resolution depth', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(GifFileTags.read(dataView)['Color Resolution Depth']).to.deep.equal({
            value: 6,
            description: '6 bits'
        });
    });

    it('should read bits per pixel', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(GifFileTags.read(dataView)['Bits Per Pixel']).to.deep.equal({
            value: 7,
            description: '7 bits'
        });
    });
});
