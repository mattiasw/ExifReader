/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import TagNamesExifIfd from '../src/tag-names-exif-ifd';
import {getCharacterArray} from './test-utils';

describe('tag-names-exif-ifd', () => {
    it('should have tag ExposureTime', () => {
        expect(TagNamesExifIfd[0x829a]).to.equal('ExposureTime');
    });

    it('should have tag FNumber', () => {
        expect(TagNamesExifIfd[0x829d]).to.equal('FNumber');
    });

    it('should report correct name and description for ExposureProgram', () => {
        const exposureProgramTag = TagNamesExifIfd[0x8822];
        expect(exposureProgramTag.name).to.equal('ExposureProgram');
        expect(exposureProgramTag.description(0)).to.equal('Undefined');
        expect(exposureProgramTag.description(1)).to.equal('Manual');
        expect(exposureProgramTag.description(2)).to.equal('Normal program');
        expect(exposureProgramTag.description(3)).to.equal('Aperture priority');
        expect(exposureProgramTag.description(4)).to.equal('Shutter priority');
        expect(exposureProgramTag.description(5)).to.equal('Creative program');
        expect(exposureProgramTag.description(6)).to.equal('Action program');
        expect(exposureProgramTag.description(7)).to.equal('Portrait mode');
        expect(exposureProgramTag.description(8)).to.equal('Landscape mode');
        expect(exposureProgramTag.description(4711)).to.equal('Unknown');
    });

    it('should have tag SpectralSensitivity', () => {
        expect(TagNamesExifIfd[0x8824]).to.equal('SpectralSensitivity');
    });

    it('should have tag ISOSpeedRatings', () => {
        expect(TagNamesExifIfd[0x8827]).to.equal('ISOSpeedRatings');
    });

    it('should report correct name and description for OECF', () => {
        expect(TagNamesExifIfd[0x8828].name).to.equal('OECF');
        expect(TagNamesExifIfd[0x8828].description(4711)).to.equal('[Raw OECF table data]');
    });

    it('should have tag ExifVersion', () => {
        expect(TagNamesExifIfd[0x9000].description([0x30, 0x32, 0x32, 0x30])).to.equal('0220');
    });

    it('should have tag DateTimeOriginal', () => {
        expect(TagNamesExifIfd[0x9003]).to.equal('DateTimeOriginal');
    });

    it('should have tag DateTimeDigitized', () => {
        expect(TagNamesExifIfd[0x9004]).to.equal('DateTimeDigitized');
    });

    it('should report correct name and description for ComponentsConfiguration', () => {
        expect(TagNamesExifIfd[0x9101].name).to.equal('ComponentsConfiguration');
        expect(TagNamesExifIfd[0x9101].description([0x34, 0x35, 0x36, 0x30])).to.equal('RGB');
        expect(TagNamesExifIfd[0x9101].description([0x31, 0x32, 0x33, 0x30])).to.equal('YCbCr');
    });

    it('should have tag CompressedBitsPerPixel', () => {
        expect(TagNamesExifIfd[0x9102]).to.equal('CompressedBitsPerPixel');
    });

    it('should have tag ShutterSpeedValue', () => {
        expect(TagNamesExifIfd[0x9201]).to.equal('ShutterSpeedValue');
    });

    it('should have tag ApertureValue', () => {
        expect(TagNamesExifIfd[0x9202]).to.equal('ApertureValue');
    });

    it('should have tag BrightnessValue', () => {
        expect(TagNamesExifIfd[0x9203]).to.equal('BrightnessValue');
    });

    it('should have tag ExposureBiasValue', () => {
        expect(TagNamesExifIfd[0x9204]).to.equal('ExposureBiasValue');
    });

    it('should have tag MaxApertureValue', () => {
        expect(TagNamesExifIfd[0x9205]).to.equal('MaxApertureValue');
    });

    it('should have tag SubjectDistance', () => {
        expect(TagNamesExifIfd[0x9206]).to.equal('SubjectDistance');
    });

    it('should report correct name and description for MeteringMode', () => {
        expect(TagNamesExifIfd[0x9207].name).to.equal('MeteringMode');
        expect(TagNamesExifIfd[0x9207].description(1)).to.equal('Average');
        expect(TagNamesExifIfd[0x9207].description(2)).to.equal('CenterWeightedAverage');
        expect(TagNamesExifIfd[0x9207].description(3)).to.equal('Spot');
        expect(TagNamesExifIfd[0x9207].description(4)).to.equal('MultiSpot');
        expect(TagNamesExifIfd[0x9207].description(5)).to.equal('Pattern');
        expect(TagNamesExifIfd[0x9207].description(6)).to.equal('Partial');
        expect(TagNamesExifIfd[0x9207].description(255)).to.equal('Other');
        expect(TagNamesExifIfd[0x9207].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for LightSource', () => {
        expect(TagNamesExifIfd[0x9208].name).to.equal('LightSource');
        expect(TagNamesExifIfd[0x9208].description(1)).to.equal('Daylight');
        expect(TagNamesExifIfd[0x9208].description(2)).to.equal('Fluorescent');
        expect(TagNamesExifIfd[0x9208].description(3)).to.equal('Tungsten (incandescent light)');
        expect(TagNamesExifIfd[0x9208].description(4)).to.equal('Flash');
        expect(TagNamesExifIfd[0x9208].description(9)).to.equal('Fine weather');
        expect(TagNamesExifIfd[0x9208].description(10)).to.equal('Cloudy weather');
        expect(TagNamesExifIfd[0x9208].description(11)).to.equal('Shade');
        expect(TagNamesExifIfd[0x9208].description(12)).to.equal('Daylight fluorescent (D 5700 – 7100K)');
        expect(TagNamesExifIfd[0x9208].description(13)).to.equal('Day white fluorescent (N 4600 – 5400K)');
        expect(TagNamesExifIfd[0x9208].description(14)).to.equal('Cool white fluorescent (W 3900 – 4500K)');
        expect(TagNamesExifIfd[0x9208].description(15)).to.equal('White fluorescent (WW 3200 – 3700K)');
        expect(TagNamesExifIfd[0x9208].description(17)).to.equal('Standard light A');
        expect(TagNamesExifIfd[0x9208].description(18)).to.equal('Standard light B');
        expect(TagNamesExifIfd[0x9208].description(19)).to.equal('Standard light C');
        expect(TagNamesExifIfd[0x9208].description(20)).to.equal('D55');
        expect(TagNamesExifIfd[0x9208].description(21)).to.equal('D65');
        expect(TagNamesExifIfd[0x9208].description(22)).to.equal('D75');
        expect(TagNamesExifIfd[0x9208].description(23)).to.equal('D50');
        expect(TagNamesExifIfd[0x9208].description(24)).to.equal('ISO studio tungsten');
        expect(TagNamesExifIfd[0x9208].description(255)).to.equal('Other light source');
        expect(TagNamesExifIfd[0x9208].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for Flash', () => {
        expect(TagNamesExifIfd[0x9209].name).to.equal('Flash');
        expect(TagNamesExifIfd[0x9209].description(0x00)).to.equal('Flash did not fire');
        expect(TagNamesExifIfd[0x9209].description(0x01)).to.equal('Flash fired');
        expect(TagNamesExifIfd[0x9209].description(0x05)).to.equal('Strobe return light not detected');
        expect(TagNamesExifIfd[0x9209].description(0x07)).to.equal('Strobe return light detected');
        expect(TagNamesExifIfd[0x9209].description(0x09)).to.equal('Flash fired, compulsory flash mode');
        expect(TagNamesExifIfd[0x9209].description(0x0d)).to.equal('Flash fired, compulsory flash mode, return light not detected');
        expect(TagNamesExifIfd[0x9209].description(0x0f)).to.equal('Flash fired, compulsory flash mode, return light detected');
        expect(TagNamesExifIfd[0x9209].description(0x10)).to.equal('Flash did not fire, compulsory flash mode');
        expect(TagNamesExifIfd[0x9209].description(0x18)).to.equal('Flash did not fire, auto mode');
        expect(TagNamesExifIfd[0x9209].description(0x19)).to.equal('Flash fired, auto mode');
        expect(TagNamesExifIfd[0x9209].description(0x1d)).to.equal('Flash fired, auto mode, return light not detected');
        expect(TagNamesExifIfd[0x9209].description(0x1f)).to.equal('Flash fired, auto mode, return light detected');
        expect(TagNamesExifIfd[0x9209].description(0x20)).to.equal('No flash function');
        expect(TagNamesExifIfd[0x9209].description(0x41)).to.equal('Flash fired, red-eye reduction mode');
        expect(TagNamesExifIfd[0x9209].description(0x45)).to.equal('Flash fired, red-eye reduction mode, return light not detected');
        expect(TagNamesExifIfd[0x9209].description(0x47)).to.equal('Flash fired, red-eye reduction mode, return light detected');
        expect(TagNamesExifIfd[0x9209].description(0x49)).to.equal('Flash fired, compulsory flash mode, red-eye reduction mode');
        expect(TagNamesExifIfd[0x9209].description(0x4d)).to.equal('Flash fired, compulsory flash mode, red-eye reduction mode, return light not detected');
        expect(TagNamesExifIfd[0x9209].description(0x4f)).to.equal('Flash fired, compulsory flash mode, red-eye reduction mode, return light detected');
        expect(TagNamesExifIfd[0x9209].description(0x59)).to.equal('Flash fired, auto mode, red-eye reduction mode');
        expect(TagNamesExifIfd[0x9209].description(0x5d)).to.equal('Flash fired, auto mode, return light not detected, red-eye reduction mode');
        expect(TagNamesExifIfd[0x9209].description(0x5f)).to.equal('Flash fired, auto mode, return light detected, red-eye reduction mode');
        expect(TagNamesExifIfd[0x9209].description(4711)).to.equal('Unknown');
    });

    it('should have tag FocalLength', () => {
        expect(TagNamesExifIfd[0x920a]).to.equal('FocalLength');
    });

    it('should report correct name and description for SubjectArea', () => {
        expect(TagNamesExifIfd[0x9214].name).to.equal('SubjectArea');
        expect(TagNamesExifIfd[0x9214].description([0x4711, 0x4812])).to.equal('Location; X: 18193, Y: 18450');
        expect(TagNamesExifIfd[0x9214].description([0x4711, 0x4812, 0x42])).to.equal('Circle; X: 18193, Y: 18450, diameter: 66');
        expect(TagNamesExifIfd[0x9214].description([0x4711, 0x4812, 0x42, 0x43])).to.equal('Rectangle; X: 18193, Y: 18450, width: 66, height: 67');
        expect(TagNamesExifIfd[0x9214].description([])).to.equal('Unknown');
    });

    it('should report correct name and description for MakerNote', () => {
        expect(TagNamesExifIfd[0x927c].name).to.equal('MakerNote');
        expect(TagNamesExifIfd[0x927c].description()).to.equal('[Raw maker note data]');
    });

    it('should report correct name and description for UserComment', () => {
        expect(TagNamesExifIfd[0x9286].name).to.equal('UserComment');
        expect(TagNamesExifIfd[0x9286].description(getCharacterArray('ASCII\x00\x00\x00ABC'))).to.equal('ABC');
        expect(TagNamesExifIfd[0x9286].description(getCharacterArray('JIS\x00\x00\x00\x00\x00'))).to.equal('[JIS encoded text]');
        expect(TagNamesExifIfd[0x9286].description(getCharacterArray('UNICODE\x00'))).to.equal('[Unicode encoded text]');
        expect(TagNamesExifIfd[0x9286].description(getCharacterArray('\x00\x00\x00\x00\x00\x00\x00\x00'))).to.equal('[Undefined encoding]');
    });

    it('should have tag SubSecTime', () => {
        expect(TagNamesExifIfd[0x9290]).to.equal('SubSecTime');
    });

    it('should have tag SubSecTimeOriginal', () => {
        expect(TagNamesExifIfd[0x9291]).to.equal('SubSecTimeOriginal');
    });

    it('should have tag SubSecTimeDigitized', () => {
        expect(TagNamesExifIfd[0x9292]).to.equal('SubSecTimeDigitized');
    });

    it('should report correct name and description for FlashpixVersion', () => {
        expect(TagNamesExifIfd[0xa000].name).to.equal('FlashpixVersion');
        expect(TagNamesExifIfd[0xa000].description([0x30, 0x31, 0x30, 0x30])).to.equal('0100');
    });

    it('should report correct name and description for ColorSpace', () => {
        expect(TagNamesExifIfd[0xa001].name).to.equal('ColorSpace');
        expect(TagNamesExifIfd[0xa001].description(1)).to.equal('sRGB');
        expect(TagNamesExifIfd[0xa001].description(0xffff)).to.equal('Uncalibrated');
        expect(TagNamesExifIfd[0xa001].description(4711)).to.equal('Unknown');
    });

    it('should have tag PixelXDimension', () => {
        expect(TagNamesExifIfd[0xa002]).to.equal('PixelXDimension');
    });

    it('should have tag PixelYDimension', () => {
        expect(TagNamesExifIfd[0xa003]).to.equal('PixelYDimension');
    });

    it('should have tag RelatedSoundFile', () => {
        expect(TagNamesExifIfd[0xa004]).to.equal('RelatedSoundFile');
    });

    it('should have tag Interoperability IFD Pointer', () => {
        expect(TagNamesExifIfd[0xa005]).to.equal('Interoperability IFD Pointer');
    });

    it('should have tag FlashEnergy', () => {
        expect(TagNamesExifIfd[0xa20b]).to.equal('FlashEnergy');
    });

    it('should report correct name and description for SpatialFrequencyResponse', () => {
        expect(TagNamesExifIfd[0xa20c].name).to.equal('SpatialFrequencyResponse');
        expect(TagNamesExifIfd[0xa20c].description()).to.equal('[Raw SFR table data]');
    });

    it('should have tag FocalPlaneXResolution', () => {
        expect(TagNamesExifIfd[0xa20e]).to.equal('FocalPlaneXResolution');
    });

    it('should have tag FocalPlaneYResolution', () => {
        expect(TagNamesExifIfd[0xa20f]).to.equal('FocalPlaneYResolution');
    });

    it('should report correct name and description for FocalPlaneResolutionUnit', () => {
        expect(TagNamesExifIfd[0xa210].name).to.equal('FocalPlaneResolutionUnit');
        expect(TagNamesExifIfd[0xa210].description(2)).to.equal('inches');
        expect(TagNamesExifIfd[0xa210].description(3)).to.equal('centimeters');
        expect(TagNamesExifIfd[0xa210].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for SubjectLocation', () => {
        expect(TagNamesExifIfd[0xa214].name).to.equal('SubjectLocation');
        expect(TagNamesExifIfd[0xa214].description([0x4711, 0x4812])).to.equal('X: 18193, Y: 18450');
    });

    it('should have tag ExposureIndex', () => {
        expect(TagNamesExifIfd[0xa215]).to.equal('ExposureIndex');
    });

    it('should report correct name and description for SensingMethod', () => {
        expect(TagNamesExifIfd[0xa217].name).to.equal('SensingMethod');
        expect(TagNamesExifIfd[0xa217].description(1)).to.equal('Undefined');
        expect(TagNamesExifIfd[0xa217].description(2)).to.equal('One-chip color area sensor');
        expect(TagNamesExifIfd[0xa217].description(3)).to.equal('Two-chip color area sensor');
        expect(TagNamesExifIfd[0xa217].description(4)).to.equal('Three-chip color area sensor');
        expect(TagNamesExifIfd[0xa217].description(5)).to.equal('Color sequential area sensor');
        expect(TagNamesExifIfd[0xa217].description(7)).to.equal('Trilinear sensor');
        expect(TagNamesExifIfd[0xa217].description(8)).to.equal('Color sequential linear sensor');
        expect(TagNamesExifIfd[0xa217].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for FileSource', () => {
        expect(TagNamesExifIfd[0xa300].name).to.equal('FileSource');
        expect(TagNamesExifIfd[0xa300].description(3)).to.equal('DSC');
        expect(TagNamesExifIfd[0xa300].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for SceneType', () => {
        expect(TagNamesExifIfd[0xa301].name).to.equal('SceneType');
        expect(TagNamesExifIfd[0xa301].description(1)).to.equal('A directly photographed image');
        expect(TagNamesExifIfd[0xa301].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for CFAPattern', () => {
        expect(TagNamesExifIfd[0xa302].name).to.equal('CFAPattern');
        expect(TagNamesExifIfd[0xa302].description()).to.equal('[Raw CFA pattern table data]');
    });

    it('should report correct name and description for CustomRendered', () => {
        expect(TagNamesExifIfd[0xa401].name).to.equal('CustomRendered');
        expect(TagNamesExifIfd[0xa401].description(0)).to.equal('Normal process');
        expect(TagNamesExifIfd[0xa401].description(1)).to.equal('Custom process');
        expect(TagNamesExifIfd[0xa401].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for ExposureMode', () => {
        expect(TagNamesExifIfd[0xa402].name).to.equal('ExposureMode');
        expect(TagNamesExifIfd[0xa402].description(0)).to.equal('Auto exposure');
        expect(TagNamesExifIfd[0xa402].description(1)).to.equal('Manual exposure');
        expect(TagNamesExifIfd[0xa402].description(2)).to.equal('Auto bracket');
        expect(TagNamesExifIfd[0xa402].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for WhiteBalance', () => {
        expect(TagNamesExifIfd[0xa403].name).to.equal('WhiteBalance');
        expect(TagNamesExifIfd[0xa403].description(0)).to.equal('Auto white balance');
        expect(TagNamesExifIfd[0xa403].description(1)).to.equal('Manual white balance');
        expect(TagNamesExifIfd[0xa403].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for DigitalZoomRatio', () => {
        expect(TagNamesExifIfd[0xa404].name).to.equal('DigitalZoomRatio');
        expect(TagNamesExifIfd[0xa404].description(0)).to.equal('Digital zoom was not used');
        expect(TagNamesExifIfd[0xa404].description(4.711)).to.equal(4.711);
    });

    it('should report correct name and description for FocalLengthIn35mmFilm', () => {
        expect(TagNamesExifIfd[0xa405].name).to.equal('FocalLengthIn35mmFilm');
        expect(TagNamesExifIfd[0xa405].description(0)).to.equal('Unknown');
        expect(TagNamesExifIfd[0xa405].description(4711)).to.equal(4711);
    });

    it('should report correct name and description for SceneCaptureType', () => {
        expect(TagNamesExifIfd[0xa406].name).to.equal('SceneCaptureType');
        expect(TagNamesExifIfd[0xa406].description(0)).to.equal('Standard');
        expect(TagNamesExifIfd[0xa406].description(1)).to.equal('Landscape');
        expect(TagNamesExifIfd[0xa406].description(2)).to.equal('Portrait');
        expect(TagNamesExifIfd[0xa406].description(3)).to.equal('Night scene');
        expect(TagNamesExifIfd[0xa406].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for GainControl', () => {
        expect(TagNamesExifIfd[0xa407].name).to.equal('GainControl');
        expect(TagNamesExifIfd[0xa407].description(0)).to.equal('None');
        expect(TagNamesExifIfd[0xa407].description(1)).to.equal('Low gain up');
        expect(TagNamesExifIfd[0xa407].description(2)).to.equal('High gain up');
        expect(TagNamesExifIfd[0xa407].description(3)).to.equal('Low gain down');
        expect(TagNamesExifIfd[0xa407].description(4)).to.equal('High gain down');
        expect(TagNamesExifIfd[0xa407].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for Contrast', () => {
        expect(TagNamesExifIfd[0xa408].name).to.equal('Contrast');
        expect(TagNamesExifIfd[0xa408].description(0)).to.equal('Normal');
        expect(TagNamesExifIfd[0xa408].description(1)).to.equal('Soft');
        expect(TagNamesExifIfd[0xa408].description(2)).to.equal('Hard');
        expect(TagNamesExifIfd[0xa408].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for Saturation', () => {
        expect(TagNamesExifIfd[0xa409].name).to.equal('Saturation');
        expect(TagNamesExifIfd[0xa409].description(0)).to.equal('Normal');
        expect(TagNamesExifIfd[0xa409].description(1)).to.equal('Low saturation');
        expect(TagNamesExifIfd[0xa409].description(2)).to.equal('High saturation');
        expect(TagNamesExifIfd[0xa409].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for Sharpness', () => {
        expect(TagNamesExifIfd[0xa40a].name).to.equal('Sharpness');
        expect(TagNamesExifIfd[0xa40a].description(0)).to.equal('Normal');
        expect(TagNamesExifIfd[0xa40a].description(1)).to.equal('Soft');
        expect(TagNamesExifIfd[0xa40a].description(2)).to.equal('Hard');
        expect(TagNamesExifIfd[0xa40a].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for DeviceSettingDescription', () => {
        expect(TagNamesExifIfd[0xa40b].name).to.equal('DeviceSettingDescription');
        expect(TagNamesExifIfd[0xa40b].description()).to.equal('[Raw device settings table data]');
    });

    it('should report correct name and description for SubjectDistanceRange', () => {
        expect(TagNamesExifIfd[0xa40c].name).to.equal('SubjectDistanceRange');
        expect(TagNamesExifIfd[0xa40c].description(1)).to.equal('Macro');
        expect(TagNamesExifIfd[0xa40c].description(2)).to.equal('Close view');
        expect(TagNamesExifIfd[0xa40c].description(3)).to.equal('Distant view');
        expect(TagNamesExifIfd[0xa40c].description(4711)).to.equal('Unknown');
    });

    it('should have tag ImageUniqueID', () => {
        expect(TagNamesExifIfd[0xa420]).to.equal('ImageUniqueID');
    });
});
