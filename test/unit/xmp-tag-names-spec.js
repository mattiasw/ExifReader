/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import XmpTagNames from '../../src/xmp-tag-names';

describe('xmp-tag-names', () => {
    it('should report correct description for tiff:Orientation', () => {
        expect(XmpTagNames['tiff:Orientation']('1')).to.equal('Horizontal (normal)');
        expect(XmpTagNames['tiff:Orientation']('2')).to.equal('Mirror horizontal');
        expect(XmpTagNames['tiff:Orientation']('3')).to.equal('Rotate 180');
        expect(XmpTagNames['tiff:Orientation']('4')).to.equal('Mirror vertical');
        expect(XmpTagNames['tiff:Orientation']('5')).to.equal('Mirror horizontal and rotate 270 CW');
        expect(XmpTagNames['tiff:Orientation']('6')).to.equal('Rotate 90 CW');
        expect(XmpTagNames['tiff:Orientation']('7')).to.equal('Mirror horizontal and rotate 90 CW');
        expect(XmpTagNames['tiff:Orientation']('8')).to.equal('Rotate 270 CW');
        expect(XmpTagNames['tiff:Orientation']('42')).to.equal('42');
    });

    it('should report correct description for exif:GPSLatitude', () => {
        expect(XmpTagNames['exif:GPSLatitude']('48,28.800000N')).to.equal('48.48N');
    });

    it('should handle faulty value for exif:GPSLatitude', () => {
        expect(XmpTagNames['exif:GPSLatitude']('faulty')).to.equal('faulty');
        expect(XmpTagNames['exif:GPSLatitude']('faulty0,faulty1')).to.equal('faulty0,faulty1');
    });

    it('should report correct description for exif:GPSLongitude', () => {
        expect(XmpTagNames['exif:GPSLongitude']('17,18.600000E')).to.equal('17.31E');
    });

    it('should handle faulty value for exif:GPSLongitude', () => {
        expect(XmpTagNames['exif:GPSLongitude']('faulty')).to.equal('faulty');
        expect(XmpTagNames['exif:GPSLongitude']('faulty0,faulty1')).to.equal('faulty0,faulty1');
    });
});
