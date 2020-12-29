/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import TagNamesMpfIfd from '../../src/tag-names-mpf-ifd';

describe('tag-names-mpf-ifd', () => {
    it('should have tag MPFVersion', () => {
        expect(TagNamesMpfIfd[0xb000].name).to.equal('MPFVersion');
        expect(TagNamesMpfIfd[0xb000].description([48, 49, 48, 48])).to.equal('0100');
    });

    it('should have tag NumberOfImages', () => {
        expect(TagNamesMpfIfd[0xb001]).to.equal('NumberOfImages');
    });

    it('should have tag MPEntry', () => {
        expect(TagNamesMpfIfd[0xb002]).to.equal('MPEntry');
    });

    it('should have tag ImageUIDList', () => {
        expect(TagNamesMpfIfd[0xb003]).to.equal('ImageUIDList');
    });

    it('should have tag TotalFrames', () => {
        expect(TagNamesMpfIfd[0xb004]).to.equal('TotalFrames');
    });
});
