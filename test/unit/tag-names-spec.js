/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import TagNames from '../../src/tag-names';

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
});
