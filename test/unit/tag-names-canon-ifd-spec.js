/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import TagNamesCanonIfd from '../../src/tag-names-canon-ifd';

describe('tag-names-canon-ifd', () => {
    it('should have tag ShotInfo', () => {
        expect(TagNamesCanonIfd[0x0004].name).to.equal('ShotInfo');
        expect(TagNamesCanonIfd[0x0004].description('<data>')).to.equal('<data>');
    });
});
