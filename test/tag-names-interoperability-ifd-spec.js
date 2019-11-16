/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import TagNamesInteroperabilityIfd from '../src/tag-names-interoperability-ifd';

describe('tag-names-interoperability-ifd', () => {
    it('should have tag InteroperabilityIndex', () => {
        expect(TagNamesInteroperabilityIfd[0x0001]).to.equal('InteroperabilityIndex');
    });

    it('should have tag InteroperabilityVersion', () => {
        expect(TagNamesInteroperabilityIfd[0x0002].name).to.equal('InteroperabilityVersion');
        expect(TagNamesInteroperabilityIfd[0x0002].description([48, 49, 48, 48])).to.equal('0100');
    });

    it('should have tag RelatedImageFileFormat', () => {
        expect(TagNamesInteroperabilityIfd[0x1000]).to.equal('RelatedImageFileFormat');
    });

    it('should have tag RelatedImageWidth', () => {
        expect(TagNamesInteroperabilityIfd[0x1001]).to.equal('RelatedImageWidth');
    });

    it('should have tag RelatedImageHeight', () => {
        expect(TagNamesInteroperabilityIfd[0x1002]).to.equal('RelatedImageHeight');
    });
});
