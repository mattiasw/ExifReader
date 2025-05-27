/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import Composite, {FOCAL_PLANE_RESOLUTION_UNIT} from '../../src/composite';

describe('composite', () => {
    it('should return undefined when there is nothing to calculate', () => {
        expect(Composite.get({}, false)).to.be.undefined;
        expect(Composite.get({exif: {}}, true)).to.be.undefined;
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
            FocalPlaneResolutionUnit: {value: FOCAL_PLANE_RESOLUTION_UNIT.MILLIMETERS}

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
            FocalPlaneResolutionUnit: {value: FOCAL_PLANE_RESOLUTION_UNIT.MILLIMETERS}
        };
        const expected = {
            value: 50.09729449522534,
            description: '50.1 deg'
        };

        expect(Composite.get({...fileTags, ...exifTags}, false).FieldOfView).to.deep.equal(expected);
        expect(Composite.get({file: fileTags, exif: exifTags}, true).FieldOfView).to.deep.equal(expected);
    });

    it('should calculate FocalLength35efl with resolution unit in inches', () => {
        const fileTags = {
            'Image Width': {value: 3000},
            'Image Height': {value: 2000},
        };
        const exifTags = {
            FocalLength: {value: [50, 1]},
            FocalPlaneXResolution: {value: [300, 1]},
            FocalPlaneYResolution: {value: [300, 1]},
            FocalPlaneResolutionUnit: {value: FOCAL_PLANE_RESOLUTION_UNIT.INCHES}
        };

        const result = Composite.get({file: fileTags, exif: exifTags}, true);
        expect(result.FocalLength35efl).to.exist;
        expect(result.FocalLength35efl.value).to.be.a('number');
        expect(result.FocalLength35efl.value).to.be.greaterThan(0);
    });

    it('should calculate FocalLength35efl with resolution unit in centimeters', () => {
        const fileTags = {
            'Image Width': {value: 4000},
            'Image Height': {value: 3000},
        };
        const exifTags = {
            FocalLength: {value: [35, 1]},
            FocalPlaneXResolution: {value: [118, 1]},
            FocalPlaneYResolution: {value: [118, 1]},
            FocalPlaneResolutionUnit: {value: FOCAL_PLANE_RESOLUTION_UNIT.CENTIMETERS}
        };

        const result = Composite.get({file: fileTags, exif: exifTags}, true);
        expect(result.FocalLength35efl).to.exist;
        expect(result.FocalLength35efl.value).to.be.a('number');
        expect(result.FocalLength35efl.value).to.be.greaterThan(0);
    });

    it('should return undefined when focal plane resolution unit is unknown', () => {
        const fileTags = {
            'Image Width': {value: 6240},
            'Image Height': {value: 4168},
        };
        const exifTags = {
            FocalLength: {value: [250, 10]},
            FocalPlaneXResolution: {value: [10420, 39]},
            FocalPlaneYResolution: {value: [10420, 39]},
            FocalPlaneResolutionUnit: {value: 99}
        };

        expect(Composite.get({...fileTags, ...exifTags}, false)).to.be.undefined;
        expect(Composite.get({file: fileTags, exif: exifTags}, true)).to.be.undefined;
    });

    it('should return undefined when required parameters are missing', () => {
        const incompleteExifTags = {
            FocalLength: {value: [250, 10]},
            FocalPlaneXResolution: {value: [10420, 39]},
            // Missing FocalPlaneYResolution
            FocalPlaneResolutionUnit: {value: FOCAL_PLANE_RESOLUTION_UNIT.MILLIMETERS}
        };

        expect(Composite.get(incompleteExifTags, false)).to.be.undefined;
        expect(Composite.get({exif: incompleteExifTags}, true)).to.be.undefined;
    });

    it('should prioritize direct FocalLengthIn35mmFilm over calculated value', () => {
        const fileTags = {
            'Image Width': {value: 6240},
            'Image Height': {value: 4168},
        };
        const exifTags = {
            FocalLength: {value: [250, 10]},
            FocalLengthIn35mmFilm: {value: 50},
            FocalPlaneXResolution: {value: [10420, 39]},
            FocalPlaneYResolution: {value: [10420, 39]},
            FocalPlaneResolutionUnit: {value: FOCAL_PLANE_RESOLUTION_UNIT.MILLIMETERS}
        };
        const expected = {
            value: 50,
            description: '50 mm'
        };

        expect(Composite.get({...fileTags, ...exifTags}, false).FocalLength35efl).to.deep.equal(expected);
        expect(Composite.get({file: fileTags, exif: exifTags}, true).FocalLength35efl).to.deep.equal(expected);
    });
});
