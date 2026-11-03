/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {FORMAT_BRAND, GROUP_BRAND} from '../../../src/composable/brand.js';

describe('composable/brand', () => {
    it('should export two distinct brand objects', () => {
        expect(FORMAT_BRAND).to.be.an('object');
        expect(GROUP_BRAND).to.be.an('object');
        expect(FORMAT_BRAND).to.not.equal(GROUP_BRAND);
    });
});
