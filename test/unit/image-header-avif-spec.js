/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import {__RewireAPI__ as ImageHeaderAvifRewireAPI} from '../../src/image-header-avif';
import ImageHeaderAvif from '../../src/image-header-avif';

describe('image-header-avif', () => {
    afterEach(() => {
        ImageHeaderAvifRewireAPI.__ResetDependency__('parseBox');
        ImageHeaderAvifRewireAPI.__ResetDependency__('findOffsets');
    });

    it('should fail for too short data buffer', () => {
        const dataView = getDataView('\x00');
        expect(ImageHeaderAvif.isAvifFile(dataView)).to.be.false;
    });

    it('should fail for invalid image format', () => {
        const dataView = getDataView('------------');
        expect(ImageHeaderAvif.isAvifFile(dataView)).to.be.false;
    });

    it('should pass for valid image format', () => {
        ImageHeaderAvifRewireAPI.__Rewire__('parseBox', () => ({majorBrand: 'avif'}));
        const dataView = getDataView('');
        expect(ImageHeaderAvif.isAvifFile(dataView)).to.be.true;
    });

    describe('major brand recognition', () => {
        const majorBrands = ['avif'];

        for (const brand of majorBrands) {
            it(`should find header offset in HEIC file with major brand ${brand}`, () => {
                // Totally fake the dependency.
                ImageHeaderAvifRewireAPI.__Rewire__('findOffsets', (_dataView) => ({[brand]: {hasAppMarkers: true}}[_dataView]));
                const dataView = brand;
                const appMarkerValues = ImageHeaderAvif.findAvifOffsets(dataView);
                expect(appMarkerValues.hasAppMarkers).to.be.true;
            });
        }
    });
});
