/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import TagNames from '../../src/tag-names.js';
import TagNames0thIfd from '../../src/tag-names-0th-ifd.js';
import TagNamesGpsIfd from '../../src/tag-names-gps-ifd.js';
import TagNamesInteroperabilityIfd from '../../src/tag-names-interoperability-ifd.js';

describe('tag-names', () => {
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

    it('should have Pentax IFD tag names', () => {
        expect(TagNames['pentax']).to.not.be.undefined;
    });

    it('should have the thumbnail IFD tag names', () => {
        expect(TagNames['1st']).to.equal(TagNames0thIfd);
    });

    it('should share one merged dictionary between the 0th and Exif IFDs', () => {
        expect(TagNames['0th']).to.equal(TagNames['exif']);
        expect(TagNames['0th'][0x010f]).to.equal('Make');
        expect(TagNames['exif'][0x829a]).to.not.be.undefined;
    });

    it('should have a non-empty dictionary for every IFD type', () => {
        for (const ifdType of ['0th', '1st', 'exif', 'gps', 'interoperability', 'mpf', 'canon', 'pentax']) {
            expect(Object.keys(TagNames[ifdType]), ifdType).to.not.be.empty;
        }
        expect(TagNames['gps']).to.equal(TagNamesGpsIfd);
        expect(TagNames['interoperability']).to.equal(TagNamesInteroperabilityIfd);
    });
});
