/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import PngFileTags from '../src/png-file-tags';

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

describe('file-tags', () => {
    it('should read image width', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(PngFileTags.read(dataView, 0)['Image Width']).to.deep.equal({
            value: 0x01020304,
            description: '16909060px'
        });
    });

    it('should read image height', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(PngFileTags.read(dataView, 0)['Image Height']).to.deep.equal({
            value: 0x04030201,
            description: '67305985px'
        });
    });

    it('should read bit depth', () => {
        const dataView = getDataView(FILE_DATA_CONTENT);
        expect(PngFileTags.read(dataView, 0)['Bit Depth']).to.deep.equal({
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

            expect(PngFileTags.read(dataView, 0)['Color Type']).to.deep.equal({
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

            expect(PngFileTags.read(dataView, 0)['Compression']).to.deep.equal({
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

            expect(PngFileTags.read(dataView, 0)['Filter']).to.deep.equal({
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

            expect(PngFileTags.read(dataView, 0)['Interlace']).to.deep.equal({
                value: Number(type),
                description: interlaceTypes[type]
            });
        }
    });
});
