/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {FORMAT_BRAND, GROUP_BRAND, FILTER_BRAND} from '../../../src/composable/brand.js';

describe('composable/brand', () => {
    it('should export three distinct brands', () => {
        expect(FORMAT_BRAND).to.not.equal(GROUP_BRAND);
        expect(FILTER_BRAND).to.not.equal(FORMAT_BRAND);
        expect(FILTER_BRAND).to.not.equal(GROUP_BRAND);
    });

    it('should hold the same brands in a second instance of the module', async () => {
        const secondCopy = await import('../../../src/composable/brand.js?second-copy');

        expect(secondCopy.FORMAT_BRAND).to.equal(FORMAT_BRAND);
        expect(secondCopy.GROUP_BRAND).to.equal(GROUP_BRAND);
        expect(secondCopy.FILTER_BRAND).to.equal(FILTER_BRAND);
    });
});
