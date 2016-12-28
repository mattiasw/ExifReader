import {expect} from 'chai';
import TagNames from '../src/tag-names';

describe('tag-names', () => {
    it('should have 0th IFD tag names', () => {
        expect(TagNames['0th']).to.be.defined;
    });

    it('should have Exif IFD tag names', () => {
        expect(TagNames['exif']).to.be.defined;
    });

    it('should have GPS Info IFD tag names', () => {
        expect(TagNames['gps']).to.be.defined;
    });

    it('should have Interoperability IFD tag names', () => {
        expect(TagNames['interoperability']).to.be.defined;
    });
});
