/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {inspect} from 'node:util';
import {expect} from 'chai';
import Composite, {FOCAL_PLANE_RESOLUTION_UNIT} from '../../src/composite.js';
import {swapProperties} from './test-utils.js';

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
        // 6000 x 4000 pixels at 12700/3 pixels per inch is a 36 x 24 mm sensor.
        const fileTags = {
            'Image Width': {value: 6000},
            'Image Height': {value: 4000},
        };
        const exifTags = {
            FocalLength: {value: [50, 1]},
            FocalPlaneXResolution: {value: [12700, 3]},
            FocalPlaneYResolution: {value: [12700, 3]},
            FocalPlaneResolutionUnit: {value: FOCAL_PLANE_RESOLUTION_UNIT.INCHES}
        };

        const result = Composite.get({file: fileTags, exif: exifTags}, true);
        expect(result.FocalLength35efl.value).to.be.closeTo(50 * 43.27 / Math.hypot(36, 24), 1e-9);
    });

    it('should calculate FocalLength35efl with resolution unit in centimeters', () => {
        // 5760 x 3840 pixels at 1600 pixels per centimeter is a 36 x 24 mm sensor.
        const fileTags = {
            'Image Width': {value: 5760},
            'Image Height': {value: 3840},
        };
        const exifTags = {
            FocalLength: {value: [125, 1]},
            FocalPlaneXResolution: {value: [1600, 1]},
            FocalPlaneYResolution: {value: [1600, 1]},
            FocalPlaneResolutionUnit: {value: FOCAL_PLANE_RESOLUTION_UNIT.CENTIMETERS}
        };

        const result = Composite.get({file: fileTags, exif: exifTags}, true);
        expect(result.FocalLength35efl.value).to.be.closeTo(125 * 43.27 / Math.hypot(36, 24), 1e-9);
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

    describe('numeric conversion of inputs', () => {
        const CALCULATED_FOCAL_LENGTH_35EFL = 38.515712019609595;

        function describeValue(value) {
            if (typeof value === 'string' && value.length > 20) {
                return `a ${value.length} character string`;
            }
            return inspect(value);
        }

        function getFocalPlaneFileTags() {
            return {
                'Image Width': {value: 6240},
                'Image Height': {value: 4168},
            };
        }

        function getFocalPlaneExifTags() {
            return {
                FocalLength: {value: [250, 10]},
                FocalPlaneXResolution: {value: [10420, 39]},
                FocalPlaneYResolution: {value: [10420, 39]},
                FocalPlaneResolutionUnit: {value: FOCAL_PLANE_RESOLUTION_UNIT.MILLIMETERS}
            };
        }

        function getFlatAndExpanded(fileTags, exifTags) {
            return [
                Composite.get({...fileTags, ...exifTags}, false),
                Composite.get({file: fileTags, exif: exifTags}, true)
            ];
        }

        function getWithFocalPlaneInputs(fileOverrides, exifOverrides) {
            return getFlatAndExpanded(
                {...getFocalPlaneFileTags(), ...fileOverrides},
                {...getFocalPlaneExifTags(), ...exifOverrides}
            );
        }

        it('should ignore a non-numeric FocalLengthIn35mmFilm', () => {
            for (const result of getFlatAndExpanded({}, {FocalLengthIn35mmFilm: {value: 'abc'}})) {
                expect(result).to.be.undefined;
            }
        });

        for (const value of [NaN, Infinity, -24, 0, '0', '', '   ', '-24', 'abc', null, true, [85], {value: 85}]) {
            it(`should treat FocalLengthIn35mmFilm ${describeValue(value)} as absent`, () => {
                for (const result of getFlatAndExpanded({}, {FocalLengthIn35mmFilm: {value}})) {
                    expect(result).to.be.undefined;
                }
                for (const result of getWithFocalPlaneInputs({}, {FocalLengthIn35mmFilm: {value}})) {
                    expect(result.FocalLength35efl.value).to.equal(CALCULATED_FOCAL_LENGTH_35EFL);
                }
            });
        }

        it('should convert a numeric string FocalLengthIn35mmFilm to a number', () => {
            const [expectedFieldOfView] = getFlatAndExpanded({}, {FocalLengthIn35mmFilm: {value: 85}})
                .map((result) => result.FieldOfView);
            for (const value of ['85', ' 85 ']) {
                for (const result of getFlatAndExpanded({}, {FocalLengthIn35mmFilm: {value}})) {
                    expect(result.FocalLength35efl, value).to.deep.equal({value: 85, description: '85 mm'});
                    expect(result.FieldOfView, value).to.deep.equal(expectedFieldOfView);
                }
            }
        });

        it('should convert a rational string FocalLength', () => {
            const exifTags = {FocalLength: {value: '850/10'}, FocalLengthIn35mmFilm: {value: '85'}};
            for (const result of getFlatAndExpanded({}, exifTags)) {
                expect(result.ScaleFactorTo35mmEquivalent).to.deep.equal({value: 1, description: '1.0'});
            }
        });

        it('should convert a decimal string or a plain number FocalLength', () => {
            for (const value of ['42.5', 42.5]) {
                const exifTags = {FocalLength: {value}, FocalLengthIn35mmFilm: {value: 85}};
                for (const result of getFlatAndExpanded({}, exifTags)) {
                    expect(result.ScaleFactorTo35mmEquivalent, value).to.deep.equal({value: 2, description: '2.0'});
                }
            }
        });

        it('should convert numeric strings inside a rational array', () => {
            const [expected] = getFlatAndExpanded({}, {FocalLength: {value: [850, 10]}, FocalLengthIn35mmFilm: {value: 85}});
            for (const result of getFlatAndExpanded({}, {FocalLength: {value: ['850', '10']}, FocalLengthIn35mmFilm: {value: 85}})) {
                expect(result.ScaleFactorTo35mmEquivalent).to.deep.equal(expected.ScaleFactorTo35mmEquivalent);
            }
        });

        const invalidFocalLengths = [
            [50, 0],
            [0, 0],
            [0, 1],
            [-50, 1],
            [50, -1],
            [NaN, 1],
            '4,4 mm',
            '50/0',
            '0/1',
            '/',
            '50/',
            '/1',
            '1/2/3',
            '/'.repeat(1024 * 1024),
            '',
            'abc',
            0,
            -50,
            NaN,
            Infinity,
            [6240],
            [50, 1, 9],
            [[50, 1], [50, 1]],
            [{value: '50'}, {value: '1'}],
            {value: 50},
            true,
            null
        ];
        for (const value of invalidFocalLengths) {
            it(`should give no ScaleFactorTo35mmEquivalent for FocalLength ${describeValue(value)}`, () => {
                for (const focalLengthIn35mmFilm of [28, 85]) {
                    const exifTags = {FocalLength: {value}, FocalLengthIn35mmFilm: {value: focalLengthIn35mmFilm}};
                    for (const result of getFlatAndExpanded({}, exifTags)) {
                        expect(result.ScaleFactorTo35mmEquivalent).to.be.undefined;
                        expect(result.FocalLength35efl.value).to.equal(focalLengthIn35mmFilm);
                    }
                }
            });
        }

        const invalidFocalPlaneInputs = [
            [{'Image Width': {value: -6240}}, {}],
            [{'Image Width': {value: [6240]}}, {}],
            [{'Image Width': {value: 'wide'}}, {}],
            [{'Image Width': {value: 0}}, {}],
            [{'Image Height': {value: -4168}}, {}],
            [{'Image Height': {value: [4168]}}, {}],
            [{}, {FocalPlaneXResolution: {value: 'abc'}}],
            [{}, {FocalPlaneXResolution: {value: [10420, 0]}}],
            [{}, {FocalPlaneYResolution: {value: 'abc'}}],
            [{}, {FocalPlaneYResolution: {value: [10420, 0]}}],
            [{}, {FocalPlaneResolutionUnit: {value: 'abc'}}],
            [{}, {FocalPlaneResolutionUnit: {value: [4]}}],
            [{}, {FocalLength: {value: [250, 0]}}],
            [{}, {FocalLength: {value: 'abc'}}]
        ];
        for (const [fileOverrides, exifOverrides] of invalidFocalPlaneInputs) {
            it(`should not calculate FocalLength35efl from ${inspect({...fileOverrides, ...exifOverrides})}`, () => {
                for (const result of getWithFocalPlaneInputs(fileOverrides, exifOverrides)) {
                    expect(result).to.be.undefined;
                }
            });
        }

        it('should calculate FocalLength35efl from numeric strings', () => {
            const fileOverrides = {'Image Width': {value: '6240'}, 'Image Height': {value: '4168'}};
            const exifOverrides = {
                FocalLength: {value: '250/10'},
                FocalPlaneXResolution: {value: '10420/39'},
                FocalPlaneYResolution: {value: '10420/39'},
                FocalPlaneResolutionUnit: {value: '4'}
            };
            for (const result of getWithFocalPlaneInputs(fileOverrides, exifOverrides)) {
                expect(result.FocalLength35efl.value).to.equal(CALCULATED_FOCAL_LENGTH_35EFL);
            }
        });

        it('should treat a string resolution unit the same as the number', () => {
            for (const unit of Object.values(FOCAL_PLANE_RESOLUTION_UNIT)) {
                const [expected] = getWithFocalPlaneInputs({}, {FocalPlaneResolutionUnit: {value: unit}});
                for (const result of getWithFocalPlaneInputs({}, {FocalPlaneResolutionUnit: {value: String(unit)}})) {
                    expect(result.FocalLength35efl.value, String(unit)).to.equal(expected.FocalLength35efl.value);
                }
            }
        });

        it('should give a different FocalLength35efl for each resolution unit', () => {
            const values = Object.values(FOCAL_PLANE_RESOLUTION_UNIT).map((unit) => {
                const [result] = getWithFocalPlaneInputs({}, {FocalPlaneResolutionUnit: {value: unit}});
                return result.FocalLength35efl.value;
            });
            expect(new Set(values).size).to.equal(values.length);
        });

        it('should give no FieldOfView when its value overflows', () => {
            for (const result of getFlatAndExpanded({}, {FocalLengthIn35mmFilm: {value: 1e308}})) {
                expect(result.FieldOfView).to.be.undefined;
                expect(result.FocalLength35efl.value).to.equal(1e308);
            }
        });

        it('should give no ScaleFactorTo35mmEquivalent when its value overflows or underflows', () => {
            const cases = [
                {FocalLengthIn35mmFilm: {value: 1e300}, FocalLength: {value: '1/1e300'}},
                {FocalLengthIn35mmFilm: {value: 1e300}, FocalLength: {value: [1, 1e300]}},
                {FocalLengthIn35mmFilm: {value: 1e-300}, FocalLength: {value: [1e300, 1]}}
            ];
            for (const exifTags of cases) {
                for (const result of getFlatAndExpanded({}, exifTags)) {
                    expect(result.ScaleFactorTo35mmEquivalent, inspect(exifTags)).to.be.undefined;
                    expect(result.FocalLength35efl.value).to.equal(exifTags.FocalLengthIn35mmFilm.value);
                }
            }
        });

        it('should give no FocalLength35efl when the calculated value is not finite', () => {
            const fileOverrides = {'Image Width': {value: 1}, 'Image Height': {value: 1}};
            const exifOverrides = {
                FocalPlaneXResolution: {value: [1e300, 1]},
                FocalPlaneYResolution: {value: [1e300, 1]}
            };
            for (const result of getWithFocalPlaneInputs(fileOverrides, exifOverrides)) {
                expect(result).to.be.undefined;
            }
        });

        it('should give no FocalLength35efl when the calculated value underflows', () => {
            const fileOverrides = {'Image Width': {value: 1}, 'Image Height': {value: 1}};
            const exifOverrides = {
                FocalLength: {value: [1e-300, 1]},
                FocalPlaneXResolution: {value: [1e-300, 1]},
                FocalPlaneYResolution: {value: [1e-300, 1]}
            };
            for (const result of getWithFocalPlaneInputs(fileOverrides, exifOverrides)) {
                expect(result).to.be.undefined;
            }
        });

        describe('original pixel dimensions', () => {
            const DOWNSCALED_FILE_TAGS = {'Image Width': {value: 3120}, 'Image Height': {value: 2084}};

            function getPixelDimensionTags(pixelXDimension, pixelYDimension) {
                return {PixelXDimension: {value: pixelXDimension}, PixelYDimension: {value: pixelYDimension}};
            }

            function getFileSizeOnlyValue() {
                const values = getWithFocalPlaneInputs(DOWNSCALED_FILE_TAGS, {})
                    .map((result) => result.FocalLength35efl.value);
                expect(values[0]).to.not.equal(CALCULATED_FOCAL_LENGTH_35EFL);
                expect(values[1]).to.equal(values[0]);
                return values[0];
            }

            it('should calculate FocalLength35efl from PixelXDimension and PixelYDimension instead of the file size', () => {
                for (const result of getWithFocalPlaneInputs(DOWNSCALED_FILE_TAGS, getPixelDimensionTags(6240, 4168))) {
                    expect(result.FocalLength35efl.value).to.equal(CALCULATED_FOCAL_LENGTH_35EFL);
                }
            });

            it('should fall back to the file size when only one pixel dimension is present', () => {
                const fileSizeOnlyValue = getFileSizeOnlyValue();
                for (const exifOverrides of [{PixelXDimension: {value: 6240}}, {PixelYDimension: {value: 4168}}]) {
                    for (const result of getWithFocalPlaneInputs(DOWNSCALED_FILE_TAGS, exifOverrides)) {
                        expect(result.FocalLength35efl.value, inspect(exifOverrides)).to.equal(fileSizeOnlyValue);
                    }
                }
            });

            for (const value of [0, -6240, NaN, Infinity, '', 'abc', null, [6240]]) {
                it(`should fall back to the file size when PixelXDimension is ${describeValue(value)}`, () => {
                    const fileSizeOnlyValue = getFileSizeOnlyValue();
                    for (const result of getWithFocalPlaneInputs(DOWNSCALED_FILE_TAGS, getPixelDimensionTags(value, 4168))) {
                        expect(result.FocalLength35efl.value).to.equal(fileSizeOnlyValue);
                    }
                });

                it(`should fall back to the file size when PixelYDimension is ${describeValue(value)}`, () => {
                    const fileSizeOnlyValue = getFileSizeOnlyValue();
                    for (const result of getWithFocalPlaneInputs(DOWNSCALED_FILE_TAGS, getPixelDimensionTags(6240, value))) {
                        expect(result.FocalLength35efl.value).to.equal(fileSizeOnlyValue);
                    }
                });
            }

            it('should convert numeric string pixel dimensions', () => {
                for (const result of getWithFocalPlaneInputs(DOWNSCALED_FILE_TAGS, getPixelDimensionTags('6240', '4168'))) {
                    expect(result.FocalLength35efl.value).to.equal(CALCULATED_FOCAL_LENGTH_35EFL);
                }
            });

            it('should pair PixelXDimension with FocalPlaneXResolution and PixelYDimension with FocalPlaneYResolution', () => {
                const unequalResolutions = {FocalPlaneYResolution: {value: [5210, 39]}};
                const [expected] = getWithFocalPlaneInputs({}, unequalResolutions);
                expect(expected.FocalLength35efl.value).to.equal(27.756346748775123);
                const exifOverrides = {...unequalResolutions, ...getPixelDimensionTags(6240, 4168)};
                for (const result of getWithFocalPlaneInputs(DOWNSCALED_FILE_TAGS, exifOverrides)) {
                    expect(result.FocalLength35efl.value).to.equal(expected.FocalLength35efl.value);
                }
            });

            it('should calculate FocalLength35efl from the pixel dimensions without a file size', () => {
                const exifTags = {...getFocalPlaneExifTags(), ...getPixelDimensionTags(6240, 4168)};
                for (const result of getFlatAndExpanded({}, exifTags)) {
                    expect(result.FocalLength35efl.value).to.equal(CALCULATED_FOCAL_LENGTH_35EFL);
                }
            });
        });

        describe('string splitting', () => {
            let restore;

            afterEach(() => {
                if (restore) {
                    restore();
                    restore = undefined;
                }
            });

            it('should split a FocalLength made of many slashes into at most three parts', () => {
                const split = String.prototype.split;
                const partCounts = [];
                restore = swapProperties(String.prototype, {
                    split(...args) {
                        const parts = split.apply(this, args);
                        partCounts.push(parts.length);
                        return parts;
                    }
                });

                Composite.get({FocalLength: {value: '/'.repeat(1024)}, FocalLengthIn35mmFilm: {value: 85}}, false);
                restore();
                restore = undefined;

                expect(partCounts).to.not.be.empty;
                expect(Math.max(...partCounts)).to.be.at.most(3);
            });
        });
    });
});
