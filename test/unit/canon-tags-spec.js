/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {__RewireAPI__ as CanonTagsRewireAPI} from '../../src/canon-tags';
import CanonTags from '../../src/canon-tags';
import {LITTLE_ENDIAN} from '../../src/byte-order';

const TIFF_HEADER_OFFSET = 42;
const OFFSET = 4711;

describe('canon-tags', () => {
    afterEach(() => {
        CanonTagsRewireAPI.__ResetDependency__('readIfd');
    });

    it('should be able to handle when there are no tags in a Canon IFD', () => {
        rewireCanonReadIfd({});

        const tags = CanonTags.read('<mock dataview>', TIFF_HEADER_OFFSET, OFFSET, LITTLE_ENDIAN, false);

        expect(tags).to.deep.equal({});
    });

    it('should be able to handle when there is shot info but no tags in a Canon IFD', () => {
        rewireCanonReadIfd({ShotInfo: getShotInfoData({})});

        const tags = CanonTags.read('<mock dataview>', TIFF_HEADER_OFFSET, OFFSET, LITTLE_ENDIAN, false);

        expect(tags).to.deep.equal({});
        expect(tags['ShotInfo']).to.be.undefined;
    });

    it('should be able to read AutoRotate=0 from shot info from a Canon IFD', () => {
        rewireCanonReadIfd({ShotInfo: getShotInfoData({[CanonTags.SHOT_INFO_AUTO_ROTATE]: 0})});

        const tags = CanonTags.read('<mock dataview>', TIFF_HEADER_OFFSET, OFFSET, LITTLE_ENDIAN, false);

        expect(tags['AutoRotate'].value).to.equal(0);
        expect(tags['AutoRotate'].description).to.equal('None');
        expect(tags['ShotInfo']).to.be.undefined;
    });

    it('should be able to read AutoRotate=1 from shot info from a Canon IFD', () => {
        rewireCanonReadIfd({ShotInfo: getShotInfoData({[CanonTags.SHOT_INFO_AUTO_ROTATE]: 1})});

        const tags = CanonTags.read('<mock dataview>', TIFF_HEADER_OFFSET, OFFSET, LITTLE_ENDIAN, false);

        expect(tags['AutoRotate'].value).to.equal(1);
        expect(tags['AutoRotate'].description).to.equal('Rotate 90 CW');
    });

    it('should be able to read AutoRotate=2 from shot info from a Canon IFD', () => {
        rewireCanonReadIfd({ShotInfo: getShotInfoData({[CanonTags.SHOT_INFO_AUTO_ROTATE]: 2})});

        const tags = CanonTags.read('<mock dataview>', TIFF_HEADER_OFFSET, OFFSET, LITTLE_ENDIAN, false);

        expect(tags['AutoRotate'].value).to.equal(2);
        expect(tags['AutoRotate'].description).to.equal('Rotate 180');
    });

    it('should be able to read AutoRotate=3 from shot info from a Canon IFD', () => {
        rewireCanonReadIfd({ShotInfo: getShotInfoData({[CanonTags.SHOT_INFO_AUTO_ROTATE]: 3})});

        const tags = CanonTags.read('<mock dataview>', TIFF_HEADER_OFFSET, OFFSET, LITTLE_ENDIAN, false);

        expect(tags['AutoRotate'].value).to.equal(3);
        expect(tags['AutoRotate'].description).to.equal('Rotate 270 CW');
    });

    it('should be able to handle unknown AutoRotate value from shot info from a Canon IFD', () => {
        rewireCanonReadIfd({ShotInfo: getShotInfoData({[CanonTags.SHOT_INFO_AUTO_ROTATE]: 42})});

        const tags = CanonTags.read('<mock dataview>', TIFF_HEADER_OFFSET, OFFSET, LITTLE_ENDIAN, false);

        expect(tags['AutoRotate'].value).to.equal(42);
        expect(tags['AutoRotate'].description).to.equal('Unknown');
    });
});

function getShotInfoData(config) {
    const data = Array(34).fill(undefined);
    data[0] = data.length; // Size

    for (const key in config) {
        data[key] = config[key];
    }

    return {
        value: data
    };
}

function rewireCanonReadIfd(tags) {
    CanonTagsRewireAPI.__Rewire__('readIfd', (_dataView, _ifdType, tiffHeaderOffset, offset) => {
        expect(tiffHeaderOffset).to.equal(TIFF_HEADER_OFFSET);
        expect(offset).to.equal(TIFF_HEADER_OFFSET + OFFSET);

        return tags;
    });
}
