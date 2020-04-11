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

    describe('isArray', () => {
        it('should tell that an empty array is an array', () => {
            expect(Utils.isArray([])).to.be.true;
        });

        it('should tell that a non-empty array is an array', () => {
            expect(Utils.isArray([1])).to.be.true;
        });

        it('should tell that a non-array is not an array', () => {
            expect(Utils.isArray('')).to.be.false;
        });

        it('should tell that an object is not an array', () => {
            expect(Utils.isArray({})).to.be.false;
        });
    });
});
