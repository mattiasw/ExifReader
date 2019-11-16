/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import TagNamesCommon from '../src/tag-names-common';

describe('tag-names-common', () => {
    it('should report correct values for LightSource', () => {
        expect(TagNamesCommon['LightSource'](1)).to.equal('Daylight');
        expect(TagNamesCommon['LightSource'](2)).to.equal('Fluorescent');
        expect(TagNamesCommon['LightSource'](3)).to.equal('Tungsten (incandescent light)');
        expect(TagNamesCommon['LightSource'](4)).to.equal('Flash');
        expect(TagNamesCommon['LightSource'](9)).to.equal('Fine weather');
        expect(TagNamesCommon['LightSource'](10)).to.equal('Cloudy weather');
        expect(TagNamesCommon['LightSource'](11)).to.equal('Shade');
        expect(TagNamesCommon['LightSource'](12)).to.equal('Daylight fluorescent (D 5700 – 7100K)');
        expect(TagNamesCommon['LightSource'](13)).to.equal('Day white fluorescent (N 4600 – 5400K)');
        expect(TagNamesCommon['LightSource'](14)).to.equal('Cool white fluorescent (W 3900 – 4500K)');
        expect(TagNamesCommon['LightSource'](15)).to.equal('White fluorescent (WW 3200 – 3700K)');
        expect(TagNamesCommon['LightSource'](17)).to.equal('Standard light A');
        expect(TagNamesCommon['LightSource'](18)).to.equal('Standard light B');
        expect(TagNamesCommon['LightSource'](19)).to.equal('Standard light C');
        expect(TagNamesCommon['LightSource'](20)).to.equal('D55');
        expect(TagNamesCommon['LightSource'](21)).to.equal('D65');
        expect(TagNamesCommon['LightSource'](22)).to.equal('D75');
        expect(TagNamesCommon['LightSource'](23)).to.equal('D50');
        expect(TagNamesCommon['LightSource'](24)).to.equal('ISO studio tungsten');
        expect(TagNamesCommon['LightSource'](255)).to.equal('Other light source');
        expect(TagNamesCommon['LightSource'](4711)).to.equal('Unknown');
    });
});
