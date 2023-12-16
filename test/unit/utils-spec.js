/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import * as Utils from '../../src/utils';

describe('utils', () => {
    it('should extract string from DataView', () => {
        const dataView = getDataView('\x00\x00MyString\x00');
        expect(Utils.getStringFromDataView(dataView, 2, 8)).to.equal('MyString');
    });

    it('should handle length that is too large when extracting string from DataView', () => {
        const dataView = getDataView('\x00\x00MyString');
        expect(Utils.getStringFromDataView(dataView, 2, 10)).to.equal('MyString');
    });

    it('should parse unicode UTF16BE strings', () => {
        const dataView = getDataView('\x0B\x83\x03\x7D\x04\x2F\x00\x54\x00\x65\x00\x73\x00\x74');
        expect(Utils.getUnicodeStringFromDataView(dataView, 0, dataView.byteLength)).to.equal('ஃͽЯTest');
    });

    it('should pad a string', () => {
        expect(Utils.padStart('1', 3, '0')).to.equal('001');
    });

    it('should not pad a string when not necessary', () => {
        expect(Utils.padStart('123', 3, '0')).to.equal('123');
    });

    it('should parse binary float', () => {
        expect(Utils.parseFloatRadix('0.101', 2)).to.equal(0.625);
        expect(Utils.parseFloatRadix('0.0011', 2)).to.equal(0.1875);
        expect(Utils.parseFloatRadix('-011', 2)).to.equal(-3);
        expect(Utils.parseFloatRadix('-1100.0011', 2)).to.equal(-12.1875);
    });

    it('should repeat a string', () => {
        expect(Utils.strRepeat('a', 3)).to.equal('aaa');
        expect(Utils.strRepeat('a', 0)).to.equal('');
        expect(Utils.strRepeat('a', 1)).to.equal('a');
        expect(Utils.strRepeat('ab', 2)).to.equal('abab');
    });
});
