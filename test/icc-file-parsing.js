/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import * as fs from 'fs';
import {parseTags} from '../src/icc-tags';
const ICC_V2 = './test/icc/sRGB2014.icc';
const ICC_V4 = './test/icc/sRGB_v4_ICC_preference.icc';

describe('load-icc-v2', () => {
    it('should load ICC v2 file ', () => {
        const ab = new Uint8Array(fs.readFileSync(ICC_V2)).buffer;
        const tags = parseTags(new DataView(ab));
        expect(tags['ICC Description'].value).to.equal('sRGB2014');
        expect(tags['ICC Copyright'].value).to.equal('Copyright International Color Consortium');
        expect(tags['ICC Profile Date'].value).to.equal('2015-02-15T00:00:00.000Z');
    });

    it('should load ICC v4 file ', () => {
        const ab = new Uint8Array(fs.readFileSync(ICC_V4)).buffer;
        const tags = parseTags(new DataView(ab));
        expect(tags['ICC Description'].value).to.equal('sRGB v4 ICC preference perceptual intent beta');
        expect(tags['ICC Copyright'].value).to.equal('Copyright 2007 International Color Consortium');
        expect(tags['ICC Profile Date'].value).to.equal('2007-07-25T00:05:37.000Z');
    });
});
