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

    it('should copy FocalLengthIn35mmFilm to FocalLength35efl when it exists', () => {
        const tags = {FocalLengthIn35mmFilm: {value: 24}};
        const expected = {
            value: 24,
            description: '24 mm'
        };

        expect(Composite.get(tags, false).FocalLength35efl).to.deep.equal(expected);
        expect(Composite.get({exif: tags}, true).FocalLength35efl).to.deep.equal(expected);
    });

    it('should calculate FocalLength35efl', () => {
        const fileTags = {
            'Image Width': {value: 6240},
            'Image Height': {value: 4168},
        };
        const exifTags = {
            FocalLength: {value: [250, 10]},
            FocalPlaneXResolution: {value: [10420, 39]},
            FocalPlaneYResolution: {value: [10420, 39]},
            FocalPlaneResolutionUnit: {value: 4}

        };
        const expected = {
            value: 38.515712019609595,
            description: '38.515712019609595 mm'
        };

        expect(Composite.get({...fileTags, ...exifTags}, false).FocalLength35efl).to.deep.equal(expected);
        expect(Composite.get({file: fileTags, exif: exifTags}, true).FocalLength35efl).to.deep.equal(expected);
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

    it('should calculate FieldOfView from FocalLengthIn35mmFilm', () => {
        const tags = {FocalLengthIn35mmFilm: {value: 24}};
        const expected = {
            value: 73.73979529168804,
            description: '73.7 deg'
        };

        expect(Composite.get(tags, false).FieldOfView).to.deep.equal(expected);
        expect(Composite.get({exif: tags}, true).FieldOfView).to.deep.equal(expected);
    });

    it('should calculate FieldOfView from focalPlaneXResolution', () => {
        const fileTags = {
            'Image Width': {value: 6240},
            'Image Height': {value: 4168},
        };
        const exifTags = {
            FocalLength: {value: [250, 10]},
            FocalPlaneXResolution: {value: [10420, 39]},
            FocalPlaneYResolution: {value: [10420, 39]},
            FocalPlaneResolutionUnit: {value: 4}
        };
        const expected = {
            value: 50.09729449522534,
            description: '50.1 deg'
        };

        expect(Composite.get({...fileTags, ...exifTags}, false).FieldOfView).to.deep.equal(expected);
        expect(Composite.get({file: fileTags, exif: exifTags}, true).FieldOfView).to.deep.equal(expected);
    });
});
