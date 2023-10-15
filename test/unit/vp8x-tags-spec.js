/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import Vp8xTags from '../../src/vp8x-tags';

describe('vp8x-tags', () => {
    const TEST_PADDING = '\x01\x02\x03\x04';

    it('should read alpha', () => {
        const dataView = getDataView('\x10' + '\x00'.repeat(9));
        expect(Vp8xTags.read(dataView, 0)).to.deep.equal({
            Alpha: {value: 1, description: 'Yes'},
            Animation: {value: 0, description: 'No'},
            ImageWidth: {value: 1, description: '1px'},
            ImageHeight: {value: 1, description: '1px'},
        });
    });

    it('should read animation', () => {
        const dataView = getDataView('\x02' + '\x00'.repeat(9));
        expect(Vp8xTags.read(dataView, 0)).to.deep.equal({
            Alpha: {value: 0, description: 'No'},
            Animation: {value: 1, description: 'Yes'},
            ImageWidth: {value: 1, description: '1px'},
            ImageHeight: {value: 1, description: '1px'},
        });
    });

    it('should read image width', () => {
        const dataView = getDataView('\x00'.repeat(4) + '\x03\x02\x01\x00\x00\x00');
        expect(Vp8xTags.read(dataView, 0)).to.deep.equal({
            Alpha: {value: 0, description: 'No'},
            Animation: {value: 0, description: 'No'},
            ImageWidth: {value: 0x010204, description: '66052px'},
            ImageHeight: {value: 1, description: '1px'},
        });
    });

    it('should read image height', () => {
        const dataView = getDataView('\x00'.repeat(7) + '\x04\x03\x02');
        expect(Vp8xTags.read(dataView, 0)).to.deep.equal({
            Alpha: {value: 0, description: 'No'},
            Animation: {value: 0, description: 'No'},
            ImageWidth: {value: 1, description: '1px'},
            ImageHeight: {value: 0x020305, description: '131845px'},
        });
    });

    it('should read multiples', () => {
        const dataView = getDataView(TEST_PADDING + '\x3e\x00\x00\x00\x03\x02\x01\x04\x03\x02');
        expect(Vp8xTags.read(dataView, TEST_PADDING.length)).to.deep.equal({
            Animation: {value: 1, description: 'Yes'},
            Alpha: {value: 1, description: 'Yes'},
            ImageWidth: {value: 0x010204, description: '66052px'},
            ImageHeight: {value: 0x020305, description: '131845px'},
        });
    });
});
