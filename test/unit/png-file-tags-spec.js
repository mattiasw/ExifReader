/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils.js';
import PngFileTags from '../../src/png-file-tags.js';

const FILE_DATA_CONTENT =
      '\x01\x02\x03\x04' // Width
    + '\x04\x03\x02\x01' // Height
    + '\x08' // Bit depth
    + '\x00' // Color Type
    + '\x00' // Compression
    + '\x00' // Filter
    + '\x00' // Interlace
    ;
const FILE_DATA_COLOR_TYPE_OFFSET = 9;
const FILE_DATA_COMPRESSION_OFFSET = 10;
const FILE_DATA_FILTER_OFFSET = 11;
const FILE_DATA_INTERLACE_OFFSET = 12;
const IMAGE_SIZE_TAGS = {
    'Image Width': {value: 0x01020304, description: '16909060px'},
    'Image Height': {value: 0x04030201, description: '67305985px'}
};

describe('png-file-tags', () => {
    it('should read image width', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(PngFileTags.read(dataView, 0, FILE_DATA_CONTENT.length)['Image Width']).to.deep.equal({
            value: 0x01020304,
            description: '16909060px'
        });
    });

    it('should read image height', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(PngFileTags.read(dataView, 0, FILE_DATA_CONTENT.length)['Image Height']).to.deep.equal({
            value: 0x04030201,
            description: '67305985px'
        });
    });

    it('should read bit depth', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(PngFileTags.read(dataView, 0, FILE_DATA_CONTENT.length)['Bit Depth']).to.deep.equal({
            value: 0x08,
            description: '8'
        });
    });

    it('should read color types', () => {
        const colorTypes = {
            0: 'Grayscale',
            2: 'RGB',
            3: 'Palette',
            4: 'Grayscale with Alpha',
            6: 'RGB with Alpha',
            42: 'Unknown'
        };

        for (const type in colorTypes) {
            const fileDataContent = FILE_DATA_CONTENT.substring(0, FILE_DATA_COLOR_TYPE_OFFSET) + String.fromCharCode(type);
            const dataView = getDataView(fileDataContent);

            expect(PngFileTags.read(dataView, 0, FILE_DATA_CONTENT.length)['Color Type']).to.deep.equal({
                value: Number(type),
                description: colorTypes[type]
            });
        }
    });

    it('should read compression', () => {
        const compressionTypes = {
            0: 'Deflate/Inflate',
            42: 'Unknown'
        };

        for (const type in compressionTypes) {
            const fileDataContent = FILE_DATA_CONTENT.substring(0, FILE_DATA_COMPRESSION_OFFSET) + String.fromCharCode(type);
            const dataView = getDataView(fileDataContent);

            expect(PngFileTags.read(dataView, 0, FILE_DATA_CONTENT.length)['Compression']).to.deep.equal({
                value: Number(type),
                description: compressionTypes[type]
            });
        }
    });

    it('should read filter', () => {
        const filterTypes = {
            0: 'Adaptive',
            42: 'Unknown'
        };

        for (const type in filterTypes) {
            const fileDataContent = FILE_DATA_CONTENT.substring(0, FILE_DATA_FILTER_OFFSET) + String.fromCharCode(type);
            const dataView = getDataView(fileDataContent);

            expect(PngFileTags.read(dataView, 0, FILE_DATA_CONTENT.length)['Filter']).to.deep.equal({
                value: Number(type),
                description: filterTypes[type]
            });
        }
    });

    it('should read interlace', () => {
        const interlaceTypes = {
            0: 'Noninterlaced',
            1: 'Adam7 Interlace',
            42: 'Unknown'
        };

        for (const type in interlaceTypes) {
            const fileDataContent = FILE_DATA_CONTENT.substring(0, FILE_DATA_INTERLACE_OFFSET) + String.fromCharCode(type);
            const dataView = getDataView(fileDataContent);

            expect(PngFileTags.read(dataView, 0, FILE_DATA_CONTENT.length)['Interlace']).to.deep.equal({
                value: Number(type),
                description: interlaceTypes[type]
            });
        }
    });

    it('should leave out all tags when no data follows the offset', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(PngFileTags.read(dataView, FILE_DATA_CONTENT.length, FILE_DATA_CONTENT.length)).to.deep.equal({});
    });

    it('should leave out the tags whose bytes are cut off', () => {
        const dataView = getDataView(FILE_DATA_CONTENT.substring(0, FILE_DATA_COLOR_TYPE_OFFSET));
        expect(PngFileTags.read(dataView, 0, FILE_DATA_CONTENT.length)).to.deep.equal({
            'Image Width': {value: 0x01020304, description: '16909060px'},
            'Image Height': {value: 0x04030201, description: '67305985px'},
            'Bit Depth': {value: 0x08, description: '8'}
        });
    });

    it('should read every field when the chunk declares its 13 bytes', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(PngFileTags.read(dataView, 0, 13)).to.deep.equal({
            'Image Width': {value: 0x01020304, description: '16909060px'},
            'Image Height': {value: 0x04030201, description: '67305985px'},
            'Bit Depth': {value: 0x08, description: '8'},
            'Color Type': {value: 0, description: 'Grayscale'},
            'Compression': {value: 0, description: 'Deflate/Inflate'},
            'Filter': {value: 0, description: 'Adaptive'},
            'Interlace': {value: 0, description: 'Noninterlaced'}
        });
    });

    it('should leave out the fields past the chunk\'s declared length', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(PngFileTags.read(dataView, 0, 8)).to.deep.equal(IMAGE_SIZE_TAGS);
    });

    it('should leave out only the interlace field when the chunk declares 12 bytes', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(Object.keys(PngFileTags.read(dataView, 0, 12))).to.deep.equal(
            ['Image Width', 'Image Height', 'Bit Depth', 'Color Type', 'Compression', 'Filter']
        );
    });

    it('should leave out all fields when the chunk declares no bytes', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(PngFileTags.read(dataView, 0, 0)).to.deep.equal({});
    });

    it('should count the declared length from the chunk data offset', () => {
        const dataView = getDataView('\xff\xff\xff' + FILE_DATA_CONTENT);
        expect(PngFileTags.read(dataView, 3, 8)).to.deep.equal(IMAGE_SIZE_TAGS);
    });

    it('should leave out all fields when no declared length is given', () => {
        expect(PngFileTags.read(getDataView(FILE_DATA_CONTENT), 0)).to.deep.equal({});
        expect(PngFileTags.read(getDataView(FILE_DATA_CONTENT.substring(0, 9)), 0)).to.deep.equal({});
    });
});
