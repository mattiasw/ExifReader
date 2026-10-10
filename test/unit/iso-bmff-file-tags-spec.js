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
});
