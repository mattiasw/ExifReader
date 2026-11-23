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

        expect(IsoBmffFileTags.read(dataView, {imageDimensionsOffset: PADDING.length})).to.deep.equal({
            'Image Width': {value: WIDTH, description: `${WIDTH}px`},
            'Image Height': {value: HEIGHT, description: `${HEIGHT}px`},
        });
    });

    it('should return no tags when the height is cut off', () => {
        const dataView = getDataView(PADDING + getByteStringFromNumber(WIDTH, 4) + getByteStringFromNumber(HEIGHT, 3));

        expect(IsoBmffFileTags.read(dataView, {imageDimensionsOffset: PADDING.length})).to.deep.equal({});
    });

    describe('pixel information', () => {
        function getPixi(depths) {
            return getByteStringFromNumber(depths.length, 1)
                + depths.map((depth) => getByteStringFromNumber(depth, 1)).join('');
        }

        function readPixi(data) {
            return IsoBmffFileTags.read(getDataView(PADDING + data), {pixelInformationOffset: PADDING.length});
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

            const result = IsoBmffFileTags.read(dataView, {
                imageDimensionsOffset: PADDING.length,
                pixelInformationOffset: PADDING.length + dimensions.length,
            });

            expect(Object.keys(result)).to.deep.equal(['Image Width', 'Image Height', 'Color Components', 'Bits Per Sample']);
            expect(result['Image Width']).to.deep.equal({value: WIDTH, description: `${WIDTH}px`});
            expect(result['Bits Per Sample']).to.deep.equal({value: 8, description: '8'});
        });
    });

    describe('rotation', () => {
        function readRotation(byte) {
            return IsoBmffFileTags.read(getDataView(PADDING + byte), {rotationOffset: PADDING.length});
        }

        it('should describe angle 0 as no rotation', () => {
            expect(readRotation('\x00')).to.deep.equal({Rotation: {value: 0, description: 'None'}});
        });

        it('should describe angle 1, 90 degrees anticlockwise, as a clockwise turn of 270', () => {
            expect(readRotation('\x01')).to.deep.equal({Rotation: {value: 90, description: 'Rotate 270 CW'}});
        });

        it('should describe angle 2 as a half turn', () => {
            expect(readRotation('\x02')).to.deep.equal({Rotation: {value: 180, description: 'Rotate 180'}});
        });

        it('should describe angle 3, 270 degrees anticlockwise, as a clockwise turn of 90', () => {
            expect(readRotation('\x03')).to.deep.equal({Rotation: {value: 270, description: 'Rotate 90 CW'}});
        });

        it('should ignore the reserved bits', () => {
            expect(readRotation('\xff')).to.deep.equal({Rotation: {value: 270, description: 'Rotate 90 CW'}});
            expect(readRotation('\xfc')).to.deep.equal({Rotation: {value: 0, description: 'None'}});
        });

        it('should return no tag when the angle is past the data', () => {
            expect(readRotation('')).to.deep.equal({});
        });
    });

    describe('mirror', () => {
        function readMirror(byte) {
            return IsoBmffFileTags.read(getDataView(PADDING + byte), {mirrorOffset: PADDING.length});
        }

        it('should describe mode 0, top and bottom exchanged, as a vertical mirror', () => {
            expect(readMirror('\x00')).to.deep.equal({Mirror: {value: 0, description: 'Mirror vertical'}});
        });

        it('should describe mode 1, left and right exchanged, as a horizontal mirror', () => {
            expect(readMirror('\x01')).to.deep.equal({Mirror: {value: 1, description: 'Mirror horizontal'}});
        });

        it('should ignore the reserved bits', () => {
            expect(readMirror('\xfe')).to.deep.equal({Mirror: {value: 0, description: 'Mirror vertical'}});
            expect(readMirror('\xff')).to.deep.equal({Mirror: {value: 1, description: 'Mirror horizontal'}});
        });

        it('should return no tag when the mode is past the data', () => {
            expect(readMirror('')).to.deep.equal({});
        });
    });

    it('should return all six tags in order when all four offsets are given', () => {
        const dimensions = getByteStringFromNumber(WIDTH, 4) + getByteStringFromNumber(HEIGHT, 4);
        const pixi = '\x03\x08\x08\x08';
        const MIRROR = '\x01';
        const ROTATION = '\x02';
        const dataView = getDataView(PADDING + dimensions + pixi + MIRROR + ROTATION);
        const pixiOffset = PADDING.length + dimensions.length;
        const mirrorOffset = pixiOffset + pixi.length;

        const result = IsoBmffFileTags.read(dataView, {
            imageDimensionsOffset: PADDING.length,
            pixelInformationOffset: pixiOffset,
            rotationOffset: mirrorOffset + MIRROR.length,
            mirrorOffset,
        });

        expect(Object.keys(result)).to.deep.equal(
            ['Image Width', 'Image Height', 'Color Components', 'Bits Per Sample', 'Rotation', 'Mirror']
        );
        expect(result.Rotation).to.deep.equal({value: 180, description: 'Rotate 180'});
        expect(result.Mirror).to.deep.equal({value: 1, description: 'Mirror horizontal'});
    });

    it('should return no tags without offsets', () => {
        expect(IsoBmffFileTags.read(getDataView(PADDING), {})).to.deep.equal({});
    });
});
