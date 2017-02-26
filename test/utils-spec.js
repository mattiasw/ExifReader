import {expect} from 'chai';
import {getDataView} from './test-utils';
import * as Utils from '../src/utils';

describe('utils', () => {
    it('should extract string from DataView', () => {
        const dataView = getDataView('\x00\x00MyString\x00');
        expect(Utils.getStringFromDataView(dataView, 2, 8)).to.equal('MyString');
    });

    it('should handle length that is too large when extracting string from DataView', () => {
        const dataView = getDataView('\x00\x00MyString');
        expect(Utils.getStringFromDataView(dataView, 2, 10)).to.equal('MyString');
    });
});
