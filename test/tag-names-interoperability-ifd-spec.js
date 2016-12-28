import {expect} from 'chai';
import TagNamesInteroperabilityIfd from '../src/tag-names-interoperability-ifd';

describe('tag-names-interoperability-ifd', () => {
    it('should have tag InteroperabilityIndex', () => {
        expect(TagNamesInteroperabilityIfd[0x0001]).to.equal('InteroperabilityIndex');
    });
});
