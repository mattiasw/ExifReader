/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import {TYPE_PHYS, TYPE_TIME} from '../../src/image-header-png.js';
import PngTags from '../../src/png-tags';

describe('png-tags', () => {
    describe('pHYs chunks', () => {
        const CHUNK_LENGTH = '\x00\x00\x00\x09';
        const CHUNK_TYPE = TYPE_PHYS;
        const CHUNK_PREFIX = CHUNK_LENGTH + CHUNK_TYPE;

        it('should read image tags', () => {
            const dataView = getDataView(CHUNK_PREFIX + '\x01\x02\x03\x04\x02\x03\x04\x05\x01');
            expect(PngTags.read(dataView, [0])['Pixels Per Unit X']).to.deep.equal({
                value: 0x01020304,
                description: '' + parseInt('01020304', 16)
            });
            expect(PngTags.read(dataView, [0])['Pixels Per Unit Y']).to.deep.equal({
                value: 0x02030405,
                description: '' + parseInt('02030405', 16)
            });
            expect(PngTags.read(dataView, [0])['Pixel Units']).to.deep.equal({
                value: 1,
                description: 'meters'
            });
        });

        it('should read unknown pixel unit', () => {
            const dataView = getDataView(CHUNK_PREFIX + '\x01\x01\x01\x01\x01\x01\x01\x01\x00');
            expect(PngTags.read(dataView, [0])['Pixel Units']).to.deep.equal({
                value: 0,
                description: 'Unknown'
            });
        });

        it('should handle when chunk size is smaller than it should', () => {
            const SHORT_CHUNK_LENGTH = '\x00\x00\x00\x06';
            const dataView = getDataView(SHORT_CHUNK_LENGTH + CHUNK_TYPE + '\x01\x02\x03\x04\x00\x00');
            expect(PngTags.read(dataView, [0])['Pixels Per Unit X']).to.deep.equal({
                value: 0x01020304,
                description: '' + parseInt('01020304', 16)
            });
            expect(PngTags.read(dataView, [0])['Pixels Per Unit Y']).to.be.undefined;
            expect(PngTags.read(dataView, [0])['Pixel Units']).to.be.undefined;
        });
    });

    describe('tIME chunks', () => {
        const CHUNK_LENGTH = '\x00\x00\x00\x07';
        const CHUNK_PREFIX = CHUNK_LENGTH + TYPE_TIME;

        it('should read modify date tag', () => {
            const dataView = getDataView(CHUNK_PREFIX + '\x07\xe7\x03\x0c\x0d\x0e\x1a');
            expect(PngTags.read(dataView, [0])['Modify Date']).to.deep.equal({
                value: [2023, 3, 12, 13, 14, 26],
                description: '2023-03-12 13:14:26'
            });
        });
    });
});
