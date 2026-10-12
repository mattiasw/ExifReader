/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import * as IfdTypes from '../../src/ifd-types.js';
import * as TagNamesModule from '../../src/tag-names.js';

const EXPECTED_TYPES = {
    IFD_TYPE_0TH: '0th',
    IFD_TYPE_1ST: '1st',
    IFD_TYPE_EXIF: 'exif',
    IFD_TYPE_GPS: 'gps',
    IFD_TYPE_INTEROPERABILITY: 'interoperability',
    IFD_TYPE_MPF: 'mpf',
    IFD_TYPE_CANON: 'canon',
    IFD_TYPE_PENTAX: 'pentax'
};

describe('ifd-types', () => {
    for (const name in EXPECTED_TYPES) {
        it(`has ${name}`, () => {
            expect(IfdTypes[name]).to.equal(EXPECTED_TYPES[name]);
        });

        // External importers have always got these from tag-names.js, so the
        // re-export has to keep working after the extraction.
        it(`is re-exported from tag-names as ${name}`, () => {
            expect(TagNamesModule[name]).to.equal(EXPECTED_TYPES[name]);
        });
    }
});
