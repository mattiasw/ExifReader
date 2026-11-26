/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import XmpTagNames from '../../src/xmp-tag-names.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('xmp-tag-names', () => {
    it('should import the shared descriptions by name and not the default object', () => {
        const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'xmp-tag-names.js'), 'utf8');

        expect(source).to.not.match(/^import \w+[ ,]/m);
        expect(source).to.not.include('TagNamesCommon');
    });

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
        expect(XmpTagNames['exif:GPSLatitude']('48,28.800000S')).to.equal('48.48S');
    });

    it('should include seconds and direction in exif:GPSLatitude descriptions', () => {
        expect(XmpTagNames['exif:GPSLatitude']('48,30,36N')).to.equal('48.51N');
        expect(XmpTagNames['exif:GPSLatitude']('48,30,36S')).to.equal('48.51S');
        expect(XmpTagNames['exif:GPSLatitude']('0,0,0N')).to.equal('0N');
    });

    it('should handle faulty value for exif:GPSLatitude', () => {
        expect(XmpTagNames['exif:GPSLatitude']('faulty')).to.equal('faulty');
        expect(XmpTagNames['exif:GPSLatitude']('faulty0,faulty1')).to.equal('faulty0,faulty1');
        expect(XmpTagNames['exif:GPSLatitude']('48,30,faultyN')).to.equal('48,30,faultyN');
    });

    it('should report correct description for exif:GPSLongitude', () => {
        expect(XmpTagNames['exif:GPSLongitude']('17,18.600000E')).to.equal('17.31E');
        expect(XmpTagNames['exif:GPSLongitude']('17,18.600000W')).to.equal('17.31W');
    });

    it('should include seconds and direction in exif:GPSLongitude descriptions', () => {
        expect(XmpTagNames['exif:GPSLongitude']('17,15,0E')).to.equal('17.25E');
        expect(XmpTagNames['exif:GPSLongitude']('17,15,0W')).to.equal('17.25W');
    });

    it('should handle faulty value for exif:GPSLongitude', () => {
        expect(XmpTagNames['exif:GPSLongitude']('faulty')).to.equal('faulty');
        expect(XmpTagNames['exif:GPSLongitude']('faulty0,faulty1')).to.equal('faulty0,faulty1');
        expect(XmpTagNames['exif:GPSLongitude']('17,15,')).to.equal('17,15,');
    });

    it('should keep the fractions of degrees and seconds in exif:GPSLatitude descriptions', () => {
        expect(XmpTagNames['exif:GPSLatitude']('48,30,36.5N')).to.equal('48.51013888888889N');
        expect(XmpTagNames['exif:GPSLatitude']('48.5,0N')).to.equal('48.5N');
    });

    it('should return an exif:GPSLatitude value without a direction unchanged', () => {
        expect(XmpTagNames['exif:GPSLatitude']('48,28.8')).to.equal('48,28.8');
        expect(XmpTagNames['exif:GPSLatitude']('48,30,36')).to.equal('48,30,36');
    });

    it('should return a GPS coordinate value with four parts unchanged', () => {
        expect(XmpTagNames['exif:GPSLatitude']('48,30,36,99N')).to.equal('48,30,36,99N');
        expect(XmpTagNames['exif:GPSLongitude'](' 9, 30, 38,15')).to.equal(' 9, 30, 38,15');
    });

    it('should ignore whitespace around an exif:GPSLatitude value', () => {
        expect(XmpTagNames['exif:GPSLatitude']('48,30,36N ')).to.equal('48.51N');
        expect(XmpTagNames['exif:GPSLatitude'](' 48,30,36N')).to.equal('48.51N');
    });

    it('should describe a lower-case GPS coordinate direction in upper case', () => {
        expect(XmpTagNames['exif:GPSLatitude']('48,30,36n')).to.equal('48.51N');
        expect(XmpTagNames['exif:GPSLongitude']('17,15,0w')).to.equal('17.25W');
    });

    it('should return an exif:GPSLatitude value that does not end in a direction unchanged', () => {
        expect(XmpTagNames['exif:GPSLatitude']('48,30,36X')).to.equal('48,30,36X');
        expect(XmpTagNames['exif:GPSLatitude']('48,30,36N5')).to.equal('48,30,36N5');
        expect(XmpTagNames['exif:GPSLatitude']('48,30,36NE')).to.equal('48,30,36NE');
    });

    it('should return an exif:GPSLatitude value with parts that are not plain decimals unchanged', () => {
        const values = [
            '-48,30,36N',
            '1,2,3e5N',
            '0x10,0x20,0x30N',
            '48,30,1e999N',
            '48, 30, 36N',
            '48,30.,36N',
            '.5,30,36N',
            '48.,30,36N',
            '48,.5N',
            '48,30,.5N',
            '48,30,36.N',
            ',30,36N'
        ];
        for (const value of values) {
            expect(XmpTagNames['exif:GPSLatitude'](value), value).to.equal(value);
        }
    });

    it('should return an exif:GPSLatitude value that is not a finite number unchanged', () => {
        const value = '1' + '0'.repeat(400) + ',0N';
        expect(XmpTagNames['exif:GPSLatitude'](value)).to.equal(value);
    });

    it('should report correct description for exif:GPSDestLatitude', () => {
        expect(XmpTagNames['exif:GPSDestLatitude']('48,28.8N')).to.equal('48.48N');
        expect(XmpTagNames['exif:GPSDestLatitude']('faulty')).to.equal('faulty');
        expect(XmpTagNames['exif:GPSDestLatitude']('17,15,30')).to.equal('17,15,30');
    });

    it('should report correct description for exif:GPSDestLongitude', () => {
        expect(XmpTagNames['exif:GPSDestLongitude']('17,15,30W')).to.equal('17.258333333333333W');
        expect(XmpTagNames['exif:GPSDestLongitude']('faulty')).to.equal('faulty');
        expect(XmpTagNames['exif:GPSDestLongitude']('17,15,30')).to.equal('17,15,30');
    });

    it('should report correct description for exif:FNumber', () => {
        expect(XmpTagNames['exif:FNumber']('71/10')).to.equal('f/7.1');
    });

    it('should report correct description for exif:FocalLength', () => {
        expect(XmpTagNames['exif:FocalLength']('250/1')).to.equal('250 mm');
    });

    it('should report correct description for exif:FocalPlaneResolutionUnit', () => {
        expect(XmpTagNames['exif:FocalPlaneResolutionUnit']('1')).to.equal('Unknown');
        expect(XmpTagNames['exif:FocalPlaneResolutionUnit']('2')).to.equal('inches');
        expect(XmpTagNames['exif:FocalPlaneResolutionUnit']('3')).to.equal('centimeters');
        expect(XmpTagNames['exif:FocalPlaneResolutionUnit']('4')).to.equal('millimeters');
    });

    it('should report correct description for exif:ApertureValue', () => {
        expect(XmpTagNames['exif:ApertureValue']('633985/100000')).to.equal('9.00');
        expect(XmpTagNames['exif:ApertureValue']('633985/0')).to.equal('Infinity');
    });

    it('should report correct description for exif:ColorSpace', () => {
        expect(XmpTagNames['exif:ColorSpace']('1')).to.equal('sRGB');
        expect(XmpTagNames['exif:ColorSpace']('0xffff')).to.equal('Uncalibrated');
        expect(XmpTagNames['exif:ColorSpace']('4711')).to.equal('Unknown');
    });

    it('should report correct description for exif:Contrast', () => {
        expect(XmpTagNames['exif:Contrast']('0')).to.equal('Normal');
        expect(XmpTagNames['exif:Contrast']('1')).to.equal('Soft');
        expect(XmpTagNames['exif:Contrast']('2')).to.equal('Hard');
        expect(XmpTagNames['exif:Contrast']('4711')).to.equal('Unknown');
    });

    it('should report correct description for exif:CustomRendered', () => {
        expect(XmpTagNames['exif:CustomRendered']('0')).to.equal('Normal process');
        expect(XmpTagNames['exif:CustomRendered']('1')).to.equal('Custom process');
        expect(XmpTagNames['exif:CustomRendered']('4711')).to.equal('Unknown');
    });

    it('should report correct description for exif:ExposureMode', () => {
        expect(XmpTagNames['exif:ExposureMode']('0')).to.equal('Auto exposure');
        expect(XmpTagNames['exif:ExposureMode']('1')).to.equal('Manual exposure');
        expect(XmpTagNames['exif:ExposureMode']('2')).to.equal('Auto bracket');
        expect(XmpTagNames['exif:ExposureMode']('4711')).to.equal('Unknown');
    });

    it('should report correct description for exif:ExposureProgram', () => {
        expect(XmpTagNames['exif:ExposureProgram']('0')).to.equal('Undefined');
        expect(XmpTagNames['exif:ExposureProgram']('1')).to.equal('Manual');
        expect(XmpTagNames['exif:ExposureProgram']('2')).to.equal('Normal program');
        expect(XmpTagNames['exif:ExposureProgram']('3')).to.equal('Aperture priority');
        expect(XmpTagNames['exif:ExposureProgram']('4')).to.equal('Shutter priority');
        expect(XmpTagNames['exif:ExposureProgram']('5')).to.equal('Creative program');
        expect(XmpTagNames['exif:ExposureProgram']('6')).to.equal('Action program');
        expect(XmpTagNames['exif:ExposureProgram']('7')).to.equal('Portrait mode');
        expect(XmpTagNames['exif:ExposureProgram']('8')).to.equal('Landscape mode');
        expect(XmpTagNames['exif:ExposureProgram']('9')).to.equal('Bulb');
        expect(XmpTagNames['exif:ExposureProgram']('4711')).to.equal('Unknown');
    });

    it('should report correct description for exif:ExposureTime', () => {
        expect(XmpTagNames['exif:ExposureTime']('4/1000')).to.equal('1/250');
        expect(XmpTagNames['exif:ExposureTime']('6/1')).to.equal('6');
        expect(XmpTagNames['exif:ExposureTime']('1/1')).to.equal('1');
        expect(XmpTagNames['exif:ExposureTime']('0/1000')).to.equal('0/1000');
    });

    it('should report correct description for exif:MeteringMode', () => {
        expect(XmpTagNames['exif:MeteringMode']('1')).to.equal('Average');
        expect(XmpTagNames['exif:MeteringMode']('2')).to.equal('CenterWeightedAverage');
        expect(XmpTagNames['exif:MeteringMode']('3')).to.equal('Spot');
        expect(XmpTagNames['exif:MeteringMode']('4')).to.equal('MultiSpot');
        expect(XmpTagNames['exif:MeteringMode']('5')).to.equal('Pattern');
        expect(XmpTagNames['exif:MeteringMode']('6')).to.equal('Partial');
        expect(XmpTagNames['exif:MeteringMode']('255')).to.equal('Other');
        expect(XmpTagNames['exif:MeteringMode']('4711')).to.equal('Unknown');
    });

    it('should report correct description for exif:Saturation', () => {
        expect(XmpTagNames['exif:Saturation']('0')).to.equal('Normal');
        expect(XmpTagNames['exif:Saturation']('1')).to.equal('Low saturation');
        expect(XmpTagNames['exif:Saturation']('2')).to.equal('High saturation');
        expect(XmpTagNames['exif:Saturation']('4711')).to.equal('Unknown');
    });

    it('should report correct description for exif:SceneCaptureType', () => {
        expect(XmpTagNames['exif:SceneCaptureType']('0')).to.equal('Standard');
        expect(XmpTagNames['exif:SceneCaptureType']('1')).to.equal('Landscape');
        expect(XmpTagNames['exif:SceneCaptureType']('2')).to.equal('Portrait');
        expect(XmpTagNames['exif:SceneCaptureType']('3')).to.equal('Night scene');
        expect(XmpTagNames['exif:SceneCaptureType']('4711')).to.equal('Unknown');
    });

    it('should report correct description for exif:Sharpness', () => {
        expect(XmpTagNames['exif:Sharpness']('0')).to.equal('Normal');
        expect(XmpTagNames['exif:Sharpness']('1')).to.equal('Soft');
        expect(XmpTagNames['exif:Sharpness']('2')).to.equal('Hard');
        expect(XmpTagNames['exif:Sharpness']('4711')).to.equal('Unknown');
    });

    it('should report correct description for exif:ShutterSpeedValue', () => {
        expect(XmpTagNames['exif:ShutterSpeedValue']('46435/9999')).to.equal('1/25');
        expect(XmpTagNames['exif:ShutterSpeedValue']('-2584963/1000000')).to.equal('6');
        expect(XmpTagNames['exif:ShutterSpeedValue']('0/1')).to.equal('1');
        expect(XmpTagNames['exif:ShutterSpeedValue']('2000/0')).to.equal('1/Infinity');
    });

    it('should report correct description for exif:WhiteBalance', () => {
        expect(XmpTagNames['exif:WhiteBalance']('0')).to.equal('Auto white balance');
        expect(XmpTagNames['exif:WhiteBalance']('1')).to.equal('Manual white balance');
        expect(XmpTagNames['exif:WhiteBalance']('4711')).to.equal('Unknown');
    });

    it('should report correct description for exif:ComponentsConfiguration', () => {
        expect(XmpTagNames['exif:ComponentsConfiguration']({}, '4, 5, 6, 0')).to.equal('RGB');
        expect(XmpTagNames['exif:ComponentsConfiguration']({}, '1, 2, 3, 0')).to.equal('YCbCr');
        expect(XmpTagNames['exif:ComponentsConfiguration']({}, 'YCbCr')).to.equal('YCbCr');
    });

    it('should report correct description for tiff:ResolutionUnit', () => {
        expect(XmpTagNames['tiff:ResolutionUnit']('2')).to.equal('inches');
        expect(XmpTagNames['tiff:ResolutionUnit']('3')).to.equal('centimeters');
        expect(XmpTagNames['tiff:ResolutionUnit']('4711')).to.equal('Unknown');
    });

    it('should report correct description for tiff:XResolution', () => {
        expect(XmpTagNames['tiff:XResolution']('300000/1000')).to.equal('300');
        expect(XmpTagNames['tiff:XResolution']('300/0')).to.equal('Infinity');
    });

    it('should report correct description for tiff:YResolution', () => {
        expect(XmpTagNames['tiff:YResolution']('300000/1000')).to.equal('300');
        expect(XmpTagNames['tiff:YResolution']('300/0')).to.equal('Infinity');
    });
});
