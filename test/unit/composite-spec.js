/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import Composite from '../../src/composite';

describe('composite', () => {
    it('should return undefined when there is nothing to calculate', () => {
        expect(Composite.get({}, false)).to.be.undefined;
        expect(Composite.get({exif: {}}, true)).to.be.undefined;
    });

    it('should calculate ScaleFactorTo35mmEquivalent', () => {
        const tags = {FocalLength: {value: [4500, 1000]}, FocalLengthIn35mmFilm: {value: 24}};
        const expected = {
            value: 5.333333333333333,
            description: '5.3'
        };

        expect(Composite.get(tags, false).ScaleFactorTo35mmEquivalent).to.deep.equal(expected);
        expect(Composite.get({exif: tags}, true).ScaleFactorTo35mmEquivalent).to.deep.equal(expected);
    });

    it('should calculate FieldOfView', () => {
        const tags = {FocalLengthIn35mmFilm: {value: 24}};
        const expected = {
            value: 73.73979529168804,
            description: '73.7 deg'
        };

        expect(Composite.get(tags, false).FieldOfView).to.deep.equal(expected);
        expect(Composite.get({exif: tags}, true).FieldOfView).to.deep.equal(expected);
    });
});
