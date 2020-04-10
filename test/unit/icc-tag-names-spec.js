/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {iccProfile} from '../../src/icc-tag-names';
import {getDataView} from './test-utils';

const PROFILE_VERSION = '\x02\x40\x00\x00';
const PROFILE_DATE = '\x07\xd0\x00\x07\x00\x1a\x00\x05\x00\x29\x00\x35';
const PROFILE_SIGNATURE = 'acsp';
const PCS_NONE = '\x00\x00\x00\x00';
const RENDERING_INTENT_RELATIVE = '\x00\x00\x00\x01';

function stringToArrayBuffer(str) {
    const arr = new Uint8Array(str.length);
    for (let i = str.length; i--;) {
        arr[i] = str.charCodeAt(i);
    }
    return arr.buffer;
}

function dataViewFromString(str) {
    return new DataView(stringToArrayBuffer(str));
}

describe('icc-tag-names', () => {
    it('should report CMM at position 4', () => {
        expect(iccProfile[4].name).to.equal('Preferred CMM type');
        expect(iccProfile[4].value(dataViewFromString('appl'), 0)).to.equal('appl');
        expect(iccProfile[4].description('appl')).to.equal('Apple');
    });

    it('should report Profile Version at position 8', () => {
        expect(iccProfile[8].name).to.equal('Profile Version');
        expect(iccProfile[8].value(getDataView(PROFILE_VERSION), 0)).to.equal('2.4.0');
    });

    it('should report class version at position 12', () => {
        expect(iccProfile[12].name).to.equal('Profile/Device class');
        expect(iccProfile[12].value(dataViewFromString('mntr'), 0)).to.equal('mntr');
        expect(iccProfile[12].description('scnr')).to.equal('Input Device profile');
        expect(iccProfile[12].description('mntr')).to.equal('Display Device profile');
        expect(iccProfile[12].description('prtr')).to.equal('Output Device profile');
        expect(iccProfile[12].description('link')).to.equal('DeviceLink profile');
        expect(iccProfile[12].description('spac')).to.equal('ColorSpace profile');
        expect(iccProfile[12].description('abst')).to.equal('Abstract profile');
        expect(iccProfile[12].description('nmcl')).to.equal('NamedColor profile');
        expect(iccProfile[12].description('cenc')).to.equal('ColorEncodingSpace profile');
        expect(iccProfile[12].description('mid ')).to.equal('MultiplexIdentification profile');
        expect(iccProfile[12].description('mlnk')).to.equal('MultiplexLink profile');
        expect(iccProfile[12].description('mvis')).to.equal('MultiplexVisualization profile');
    });

    it('should report color space at position 16', () => {
        expect(iccProfile[16].name).to.equal('Color Space');
        expect(iccProfile[16].value(dataViewFromString('CMY '), 0)).to.equal('CMY ');
    });

    it('should report connection space at position 20', () => {
        expect(iccProfile[20].name).to.equal('Connection Space');
        expect(iccProfile[20].value(getDataView(PCS_NONE)), 0).to.equal('');
        expect(iccProfile[20].value(dataViewFromString('Lab '), 0)).to.equal('Lab ');
    });

    it('should report profile date at position 24', () => {
        expect(iccProfile[24].name).to.equal('ICC Profile Date');
        expect(iccProfile[24].value(getDataView(PROFILE_DATE), 0)).to.equal('2000-07-26T05:41:53.000Z');
    });

    it('should report profile signature position 36', () => {
        expect(iccProfile[36].name).to.equal('ICC Signature');
        expect(iccProfile[36].value(getDataView(PROFILE_SIGNATURE), 0)).to.equal('acsp');
    });

    it('should report Primary platform at position 40', () => {
        expect(iccProfile[40].name).to.equal('Primary Platform');
        expect(iccProfile[40].value(dataViewFromString('appl'), 0)).to.equal('appl');
        expect(iccProfile[40].description('appl')).to.equal('Apple');
    });

    it('should report Device Manufacturer at position 48', () => {
        expect(iccProfile[48].name).to.equal('Device Manufacturer');
        expect(iccProfile[48].value(dataViewFromString('adbe'), 0)).to.equal('adbe');
        expect(iccProfile[48].description('adbe')).to.equal('Adobe');
    });

    it('should report Device Model Number at position 52', () => {
        expect(iccProfile[52].name).to.equal('Device Model Number');
        expect(iccProfile[52].value(dataViewFromString('1234'), 0)).to.equal('1234');
    });

    it('should report Rendering Intent at position 64', () => {
        expect(iccProfile[64].name).to.equal('Rendering Intent');
        expect(iccProfile[64].value(getDataView(RENDERING_INTENT_RELATIVE), 0)).to.equal(1);
        expect(iccProfile[64].description(1)).to.equal('Relative Colorimetric');
    });

    it('should report Profile Creator at position 80', () => {
        expect(iccProfile[80].name).to.equal('Profile Creator');
        expect(iccProfile[80].value(dataViewFromString('1234'), 0)).to.equal('1234');
    });
});
