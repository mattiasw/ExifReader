/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getByteStringFromNumber} from './test-utils.js';
import ImageHeaderHeic from '../../src/image-header-heic.js';

describe('image-header-heic', () => {
    it('should fail for too short data buffer', () => {
        const dataView = getDataView('\x00');
        expect(ImageHeaderHeic.isHeicFile(dataView)).to.be.false;
    });

    it('should fail for invalid image format', () => {
        const dataView = getDataView('------------');
        expect(ImageHeaderHeic.isHeicFile(dataView)).to.be.false;
    });

    it('should pass for valid image format', () => {
        const dataView = getDataView(getBox('ftyp', 'heic'));
        expect(ImageHeaderHeic.isHeicFile(dataView)).to.be.true;
    });

    describe('major brand recognition', () => {
        const majorBrands = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1'];

        for (const brand of majorBrands) {
            it(`should find header offset in HEIC file with major brand ${brand}`, () => {
                const dataView = getDataView(getBox('ftyp', brand) + getMetaBoxWithIccProfile());
                const appMarkerValues = ImageHeaderHeic.findHeicOffsets(dataView);
                expect(appMarkerValues.hasAppMarkers).to.be.true;
            });
        }
    });
});

function getBox(type, content) {
    const LENGTH_SIZE = 4;
    const size = LENGTH_SIZE + type.length + content.length;
    return getByteStringFromNumber(size, 4) + type + content;
}

// An ICC chunk (meta > iprp > ipco > colr) is the smallest metadata source
// that makes the real findOffsets report hasAppMarkers.
function getMetaBoxWithIccProfile() {
    const COLOR_TYPE = 'prof';
    const ICC_CONTENT = '<ICC content>';
    const colrContent = COLOR_TYPE + getByteStringFromNumber(ICC_CONTENT.length + 4, 4) + ICC_CONTENT;
    return getFullBox('meta', 0, getBox('iprp', getBox('ipco', getBox('colr', colrContent))));
}

function getFullBox(type, version, content) {
    const FLAGS = '\x00\x00\x00';
    return getBox(type, String.fromCharCode(version) + FLAGS + content);
}
