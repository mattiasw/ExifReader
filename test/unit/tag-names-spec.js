/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import Constants from '../../src/constants.js';
import TagNames from '../../src/tag-names.js';
import TagNames0thIfd from '../../src/tag-names-0th-ifd.js';
import TagNamesGpsIfd from '../../src/tag-names-gps-ifd.js';
import TagNamesInteroperabilityIfd from '../../src/tag-names-interoperability-ifd.js';
import {swapProperties} from './test-utils.js';

const EXIF_IFD_TYPES = ['0th', '1st', 'exif', 'gps', 'interoperability'];

const restoreFunctions = [];
let reimportCount = 0;

describe('tag-names', () => {
    afterEach(() => {
        while (restoreFunctions.length > 0) {
            restoreFunctions.pop()();
        }
    });

    it('should have 0th IFD tag names', () => {
        expect(TagNames['0th']).to.not.be.undefined;
    });

    it('should have Exif IFD tag names', () => {
        expect(TagNames['exif']).to.not.be.undefined;
    });

    it('should have GPS Info IFD tag names', () => {
        expect(TagNames['gps']).to.not.be.undefined;
    });

    it('should have Interoperability IFD tag names', () => {
        expect(TagNames['interoperability']).to.not.be.undefined;
    });

    it('should have MPF tag names', () => {
        expect(TagNames['mpf']).to.not.be.undefined;
    });

    it('should have Canon IFD tag names', () => {
        expect(TagNames['canon']).to.not.be.undefined;
    });

    it('should leave out the Exif tag names when Exif tags have been excluded', async () => {
        const tagNames = await getTagNamesBuiltWith({USE_EXIF: false});

        for (const ifdType of EXIF_IFD_TYPES) {
            expect(tagNames[ifdType]).to.deep.equal({});
        }
    });

    it('should leave the MPF and maker note tag names to their own flags when Exif tags have been excluded', async () => {
        const tagNames = await getTagNamesBuiltWith({USE_EXIF: false});

        for (const ifdType of ['mpf', 'canon', 'pentax']) {
            expect(Object.keys(tagNames[ifdType])).to.not.be.empty;
        }
    });

    it('should have the Exif tag names when Exif tags have been included', async () => {
        const tagNames = await getTagNamesBuiltWith({USE_EXIF: true});

        for (const ifdType of EXIF_IFD_TYPES) {
            expect(Object.keys(tagNames[ifdType])).to.not.be.empty;
        }
        expect(tagNames['0th']).to.equal(tagNames['exif']);
        expect(tagNames['1st']).to.equal(TagNames0thIfd);
        expect(tagNames['gps']).to.equal(TagNamesGpsIfd);
        expect(tagNames['interoperability']).to.equal(TagNamesInteroperabilityIfd);
    });
});

// The dictionary is built while the module is evaluated, so a swapped constant
// only shows in a fresh instance of it. The query string forces one, while the
// constants module it imports stays the shared, already swapped instance.
function getTagNamesBuiltWith(flags) {
    restoreFunctions.push(swapProperties(Constants, flags));
    reimportCount += 1;
    return import(`../../src/tag-names.js?build=${reimportCount}`)
        .then((tagNamesModule) => tagNamesModule.default);
}
