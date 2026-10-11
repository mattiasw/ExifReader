/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getByteStringFromNumber} from './test-utils.js';
import IsoBmffFileTags from '../../src/iso-bmff-file-tags.js';

describe('iso-bmff-file-tags', () => {
    const PADDING = '\x00\x00\x00';
    const WIDTH = 0x12345;
    const HEIGHT = 0x23456;

    it('should read the width and the height as 32-bit big-endian values', () => {
        const dataView = getDataView(PADDING + getByteStringFromNumber(WIDTH, 4) + getByteStringFromNumber(HEIGHT, 4));

        expect(IsoBmffFileTags.read(dataView, PADDING.length)).to.deep.equal({
            'Image Width': {value: WIDTH, description: `${WIDTH}px`},
            'Image Height': {value: HEIGHT, description: `${HEIGHT}px`},
        });
    });

    it('should return no tags when the height is cut off', () => {
        const dataView = getDataView(PADDING + getByteStringFromNumber(WIDTH, 4) + getByteStringFromNumber(HEIGHT, 3));

        expect(IsoBmffFileTags.read(dataView, PADDING.length)).to.deep.equal({});
    });

    describe('pixel information', () => {
        function getPixi(depths) {
            return getByteStringFromNumber(depths.length, 1)
                + depths.map((depth) => getByteStringFromNumber(depth, 1)).join('');
        }

        function readPixi(data) {
            return IsoBmffFileTags.read(getDataView(PADDING + data), undefined, PADDING.length);
        }

        it('should read the color components and the shared bit depth', () => {
            expect(readPixi(getPixi([8, 8, 8]))).to.deep.equal({
                'Color Components': {value: 3, description: '3'},
                'Bits Per Sample': {value: 8, description: '8'},
            });
        });

        it('should leave out the bits per sample when the first depth differs', () => {
            expect(readPixi(getPixi([10, 8, 8]))).to.deep.equal({
                'Color Components': {value: 3, description: '3'},
            });
        });

        it('should leave out the bits per sample when the last depth differs', () => {
            expect(readPixi(getPixi([8, 8, 10]))).to.deep.equal({
                'Color Components': {value: 3, description: '3'},
            });
        });

        it('should leave out the bits per sample when there are no channels', () => {
            expect(readPixi(getPixi([]))).to.deep.equal({
                'Color Components': {value: 0, description: '0'},
            });
        });

        it('should return no tags when the bit depths are cut off', () => {
            expect(readPixi(getPixi([8, 8, 8]).slice(0, 3))).to.deep.equal({});
        });

        it('should return no tags when the channel count is past the data', () => {
            expect(readPixi('')).to.deep.equal({});
        });

        it('should return all tags in order when both offsets are given', () => {
            const dimensions = getByteStringFromNumber(WIDTH, 4) + getByteStringFromNumber(HEIGHT, 4);
            const dataView = getDataView(PADDING + dimensions + getPixi([8, 8, 8]));

            const result = IsoBmffFileTags.read(dataView, PADDING.length, PADDING.length + dimensions.length);

            expect(Object.keys(result)).to.deep.equal(['Image Width', 'Image Height', 'Color Components', 'Bits Per Sample']);
            expect(result['Image Width']).to.deep.equal({value: WIDTH, description: `${WIDTH}px`});
            expect(result['Bits Per Sample']).to.deep.equal({value: 8, description: '8'});
        });
    });
});
