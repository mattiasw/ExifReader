/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import FileTags from '../../src/file-tags';

const FILE_DATA_CONTENT = '\xff\xc0\x00\x11\x08\x01\x02\x02\x03\x03\x01\x22\x00\x02\x11\x01\x03\x11\x01';
const FILE_DATA_CONTENT_GREYSCALE = '\xff\xc0\x0b\x02\x08\x01\x02\x02\x03\x01\x01\x02\x03';
const FILE_DATA_CONTENT_ONLY_LENGTH = '\xff\xc0\x00\x02';
const FILE_DATA_CONTENT_ONLY_DATA_PRECISION = '\xff\xc0\x00\x03\x08';
const FILE_DATA_CONTENT_ONLY_IMAGE_HEIGHT = '\xff\xc0\x00\x05\x08\x01\x02';
const FILE_DATA_CONTENT_ONLY_IMAGE_WIDTH = '\xff\xc0\x00\x07\x08\x01\x02\x02\x03';
const FILE_DATA_CONTENT_ONLY_COLOR_COMPONENTS = '\xff\xc0\x00\x08\x08\x01\x02\x02\x03\x03';
const OFFSET = 2;

describe('file-tags', () => {
    it('should read data precision', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(FileTags.read(dataView, OFFSET)['Bits Per Sample']).to.deep.equal({
            value: 0x08,
            description: '8'
        });
    });

    it('should read image height', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(FileTags.read(dataView, OFFSET)['Image Height']).to.deep.equal({
            value: 0x0102,
            description: '258px'
        });
    });

    it('should read image width', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(FileTags.read(dataView, OFFSET)['Image Width']).to.deep.equal({
            value: 0x0203,
            description: '515px'
        });
    });

    it('should read number of color components', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(FileTags.read(dataView, OFFSET)['Color Components']).to.deep.equal({
            value: 0x03,
            description: '3'
        });
    });

    it('should read greyscale components', () => {
        const dataView = getDataView(FILE_DATA_CONTENT_GREYSCALE);
        expect(FileTags.read(dataView, OFFSET)['Subsampling']).to.deep.equal({
            value: [[0x01, 0x02, 0x03]],
            description: ''
        });
    });

    it('should read color components', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(FileTags.read(dataView, OFFSET)['Subsampling']).to.deep.equal({
            value: [
                [0x01, 0x22, 0x00],
                [0x02, 0x11, 0x01],
                [0x03, 0x11, 0x01]
            ],
            description: 'YCbCr4:2:0 (2 2)'
        });
    });

    it('should handle when marker is shorter than specification dictates', () => {
        expect(FileTags.read(getDataView(FILE_DATA_CONTENT_ONLY_LENGTH), OFFSET)).to.deep.equal({
            'Bits Per Sample': undefined,
            'Image Height': undefined,
            'Image Width': undefined,
            'Color Components': undefined,
            'Subsampling': undefined
        });
        expect(FileTags.read(getDataView(FILE_DATA_CONTENT_ONLY_DATA_PRECISION), OFFSET)['Bits Per Sample']).to.not.be.undefined;
        expect(FileTags.read(getDataView(FILE_DATA_CONTENT_ONLY_IMAGE_HEIGHT), OFFSET)['Image Height']).to.not.be.undefined;
        expect(FileTags.read(getDataView(FILE_DATA_CONTENT_ONLY_IMAGE_WIDTH), OFFSET)['Image Width']).to.not.be.undefined;
        expect(FileTags.read(getDataView(FILE_DATA_CONTENT_ONLY_COLOR_COMPONENTS), OFFSET)['Color Components']).to.not.be.undefined;
    });
});
