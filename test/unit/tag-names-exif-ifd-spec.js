/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import TagNamesExifIfd from '../../src/tag-names-exif-ifd';
import TagNamesCommon from '../../src/tag-names-common';
import {getCharacterArray} from '../../src/utils';

describe('tag-names-exif-ifd', () => {
    it('should report correct name and description for ExposureTime', () => {
        expect(TagNamesExifIfd[0x829a].name).to.equal('ExposureTime');
        expect(TagNamesExifIfd[0x829a].description([4, 1000])).to.equal('1/250');
        expect(TagNamesExifIfd[0x829a].description([6, 1])).to.equal('6');
        expect(TagNamesExifIfd[0x829a].description([1, 1])).to.equal('1');
        expect(TagNamesExifIfd[0x829a].description([0, 1000])).to.equal('0/1000');
        expect(TagNamesExifIfd[0x829a].description([8, 10])).to.equal('0.8');
        expect(TagNamesExifIfd[0x829a].description([1, 4])).to.equal('1/4');
        expect(TagNamesExifIfd[0x829a].description([1, 3])).to.equal('0.3');
        expect(TagNamesExifIfd[0x829a].description([100, 399])).to.equal('0.3');
        expect(TagNamesExifIfd[0x829a].description([13, 10])).to.equal('1.3');
        expect(TagNamesExifIfd[0x829a].description([15, 10])).to.equal('1.5');
        expect(TagNamesExifIfd[0x829a].description([4, 3]).substring(0, 6)).to.equal('1.3');
    });

    it('should have tag FNumber', () => {
        expect(TagNamesExifIfd[0x829d].name).to.equal('FNumber');
        expect(TagNamesExifIfd[0x829d].description([14, 5])).to.equal('f/2.8');
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
        expect(exposureProgramTag.description(9)).to.equal('Bulb');
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

    it('should have tag TimeZoneOffset', () => {
        expect(TagNamesExifIfd[0x882a]).to.equal('TimeZoneOffset');
    });

    it('should have tag SelfTimerMode', () => {
        expect(TagNamesExifIfd[0x882b]).to.equal('SelfTimerMode');
    });

    it('should have tag SensitivityType', () => {
        expect(TagNamesExifIfd[0x8830].name).to.equal('SensitivityType');
        expect(TagNamesExifIfd[0x8830].description(0)).to.equal('Unknown');
        expect(TagNamesExifIfd[0x8830].description(1)).to.equal('Standard Output Sensitivity');
        expect(TagNamesExifIfd[0x8830].description(2)).to.equal('Recommended Exposure Index');
        expect(TagNamesExifIfd[0x8830].description(3)).to.equal('ISO Speed');
        expect(TagNamesExifIfd[0x8830].description(4)).to.equal('Standard Output Sensitivity and Recommended Exposure Index');
        expect(TagNamesExifIfd[0x8830].description(5)).to.equal('Standard Output Sensitivity and ISO Speed');
        expect(TagNamesExifIfd[0x8830].description(6)).to.equal('Recommended Exposure Index and ISO Speed');
        expect(TagNamesExifIfd[0x8830].description(7)).to.equal('Standard Output Sensitivity, Recommended Exposure Index and ISO Speed');
        expect(TagNamesExifIfd[0x8830].description(42)).to.equal('Unknown');
    });

    it('should have tag StandardOutputSensitivity', () => {
        expect(TagNamesExifIfd[0x8831]).to.equal('StandardOutputSensitivity');
    });

    it('should have tag RecommendedExposureIndex', () => {
        expect(TagNamesExifIfd[0x8832]).to.equal('RecommendedExposureIndex');
    });

    it('should have tag ISOSpeed', () => {
        expect(TagNamesExifIfd[0x8833]).to.equal('ISOSpeed');
    });

    it('should have tag ISOSpeedLatitudeyyy', () => {
        expect(TagNamesExifIfd[0x8834]).to.equal('ISOSpeedLatitudeyyy');
    });

    it('should have tag ISOSpeedLatitudezzz', () => {
        expect(TagNamesExifIfd[0x8835]).to.equal('ISOSpeedLatitudezzz');
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

    it('should have tag GooglePlusUploadCode', () => {
        expect(TagNamesExifIfd[0x9009]).to.equal('GooglePlusUploadCode');
    });

    it('should have tag OffsetTime', () => {
        expect(TagNamesExifIfd[0x9010]).to.equal('OffsetTime');
    });

    it('should have tag OffsetTimeOriginal', () => {
        expect(TagNamesExifIfd[0x9011]).to.equal('OffsetTimeOriginal');
    });

    it('should have tag OffsetTimeDigitized', () => {
        expect(TagNamesExifIfd[0x9012]).to.equal('OffsetTimeDigitized');
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
        expect(TagNamesExifIfd[0x9201].name).to.equal('ShutterSpeedValue');
        expect(TagNamesExifIfd[0x9201].description([46435, 9999])).to.equal('1/25');
        expect(TagNamesExifIfd[0x9201].description([-2584963, 1000000])).to.equal('6');
        expect(TagNamesExifIfd[0x9201].description([0, 1])).to.equal('1');
        expect(TagNamesExifIfd[0x9201].description([2000, 0])).to.equal('1/Infinity');
    });

    it('should have tag ApertureValue', () => {
        expect(TagNamesExifIfd[0x9202].name).to.equal('ApertureValue');
        expect(TagNamesExifIfd[0x9202].description([633985, 100000])).to.equal('9.00');
        expect(TagNamesExifIfd[0x9202].description([633985, 0])).to.equal('Infinity');
    });

    it('should have tag BrightnessValue', () => {
        expect(TagNamesExifIfd[0x9203]).to.equal('BrightnessValue');
    });

    it('should have tag ExposureBiasValue', () => {
        expect(TagNamesExifIfd[0x9204]).to.equal('ExposureBiasValue');
    });

    it('should have tag MaxApertureValue', () => {
        expect(TagNamesExifIfd[0x9205].name).to.equal('MaxApertureValue');
        expect(TagNamesExifIfd[0x9205].description([633985, 100000])).to.equal('9.00');
        expect(TagNamesExifIfd[0x9205].description([633985, 0])).to.equal('Infinity');
    });

    it('should have tag SubjectDistance', () => {
        expect(TagNamesExifIfd[0x9206].name).to.equal('SubjectDistance');
        expect(TagNamesExifIfd[0x9206].description([3, 2])).to.equal('1.5 m');
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
        expect(TagNamesExifIfd[0x9208].description).to.equal(TagNamesCommon['LightSource']);
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
        expect(TagNamesExifIfd[0x920a].name).to.equal('FocalLength');
        expect(TagNamesExifIfd[0x920a].description([13, 2])).to.equal('6.5 mm');
    });

    it('should have tag ImageNumber', () => {
        expect(TagNamesExifIfd[0x9211]).to.equal('ImageNumber');
    });

    it('should report correct name and description for SecurityClassification', () => {
        expect(TagNamesExifIfd[0x9212].name).to.equal('SecurityClassification');
        expect(TagNamesExifIfd[0x9212].description('C')).to.equal('Confidential');
        expect(TagNamesExifIfd[0x9212].description('R')).to.equal('Restricted');
        expect(TagNamesExifIfd[0x9212].description('S')).to.equal('Secret');
        expect(TagNamesExifIfd[0x9212].description('T')).to.equal('Top Secret');
        expect(TagNamesExifIfd[0x9212].description('U')).to.equal('Unclassified');
        expect(TagNamesExifIfd[0x9212].description('Z')).to.equal('Unknown');
    });

    it('should have tag ImageHistory', () => {
        expect(TagNamesExifIfd[0x9213]).to.equal('ImageHistory');
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

    it('should have tag ImageSourceData', () => {
        expect(TagNamesExifIfd[0x935c]).to.equal('ImageSourceData');
    });

    it('should have tag AmbientTemperature', () => {
        expect(TagNamesExifIfd[0x9400].name).to.equal('AmbientTemperature');
        expect(TagNamesExifIfd[0x9400].description([6, 5])).to.equal('1.2 °C');
    });

    it('should have tag Humidity', () => {
        expect(TagNamesExifIfd[0x9401].name).to.equal('Humidity');
        expect(TagNamesExifIfd[0x9401].description([165, 2])).to.equal('82.5 %');
    });

    it('should have tag Pressure', () => {
        expect(TagNamesExifIfd[0x9402].name).to.equal('Pressure');
        expect(TagNamesExifIfd[0x9402].description([2003, 2])).to.equal('1001.5 hPa');
    });

    it('should have tag WaterDepth', () => {
        expect(TagNamesExifIfd[0x9403].name).to.equal('WaterDepth');
        expect(TagNamesExifIfd[0x9403].description([-13, 2])).to.equal('-6.5 m');
    });

    it('should have tag Acceleration', () => {
        expect(TagNamesExifIfd[0x9404].name).to.equal('Acceleration');
        expect(TagNamesExifIfd[0x9404].description([61, 2])).to.equal('30.5 mGal');
    });

    it('should have tag CameraElevationAngle', () => {
        expect(TagNamesExifIfd[0x9405].name).to.equal('CameraElevationAngle');
        expect(TagNamesExifIfd[0x9405].description([89, 2])).to.equal('44.5 °');
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
        expect(TagNamesExifIfd[0xa404].description([0, 2])).to.equal('Digital zoom was not used');
        expect(TagNamesExifIfd[0xa404].description([9, 2])).to.equal('4.5');
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

    it('should have tag CameraOwnerName', () => {
        expect(TagNamesExifIfd[0xa430]).to.equal('CameraOwnerName');
    });

    it('should have tag BodySerialNumber', () => {
        expect(TagNamesExifIfd[0xa431]).to.equal('BodySerialNumber');
    });

    it('should have tag LensSpecification', () => {
        expect(TagNamesExifIfd[0xa432].name).to.equal('LensSpecification');
        expect(TagNamesExifIfd[0xa432].description([[700, 10], [2000, 10], [40, 10], [40, 10]])).to.equal('70-200 mm f/4');
        expect(TagNamesExifIfd[0xa432].description([[17, 1], [85, 1], [0, 1], [0, 1]])).to.equal('17-85 mm f/0');
        expect(TagNamesExifIfd[0xa432].description([[24, 1], [105, 1], [0, 0], [0, 0]])).to.equal('24-105 mm f/?');
    });

    it('should have tag LensMake', () => {
        expect(TagNamesExifIfd[0xa433]).to.equal('LensMake');
    });

    it('should have tag LensModel', () => {
        expect(TagNamesExifIfd[0xa434]).to.equal('LensModel');
    });

    it('should have tag LensSerialNumber', () => {
        expect(TagNamesExifIfd[0xa435]).to.equal('LensSerialNumber');
    });

    it('should have tag CompositeImage', () => {
        expect(TagNamesExifIfd[0xa460].name).to.equal('CompositeImage');
        expect(TagNamesExifIfd[0xa460].description(0)).to.equal('Unknown');
        expect(TagNamesExifIfd[0xa460].description(1)).to.equal('Not a Composite Image');
        expect(TagNamesExifIfd[0xa460].description(2)).to.equal('General Composite Image');
        expect(TagNamesExifIfd[0xa460].description(3)).to.equal('Composite Image Captured While Shooting');
        expect(TagNamesExifIfd[0xa460].description(42)).to.equal('Unknown');
    });

    it('should have tag SourceImageNumberOfCompositeImage', () => {
        expect(TagNamesExifIfd[0xa461]).to.equal('SourceImageNumberOfCompositeImage');
    });

    it('should have tag SourceExposureTimesOfCompositeImage', () => {
        expect(TagNamesExifIfd[0xa462]).to.equal('SourceExposureTimesOfCompositeImage');
    });

    it('should have tag Gamma', () => {
        expect(TagNamesExifIfd[0xa500]).to.equal('Gamma');
    });

    it('should have tag Padding', () => {
        expect(TagNamesExifIfd[0xea1c]).to.equal('Padding');
    });

    it('should have tag OffsetSchema', () => {
        expect(TagNamesExifIfd[0xea1d]).to.equal('OffsetSchema');
    });

    it('should have tag OwnerName', () => {
        expect(TagNamesExifIfd[0xfde8]).to.equal('OwnerName');
    });

    it('should have tag SerialNumber', () => {
        expect(TagNamesExifIfd[0xfde9]).to.equal('SerialNumber');
    });

    it('should have tag Lens', () => {
        expect(TagNamesExifIfd[0xfdea]).to.equal('Lens');
    });

    it('should have tag RawFile', () => {
        expect(TagNamesExifIfd[0xfe4c]).to.equal('RawFile');
    });

    it('should have tag Converter', () => {
        expect(TagNamesExifIfd[0xfe4d]).to.equal('Converter');
    });

    it('should have tag WhiteBalance', () => {
        expect(TagNamesExifIfd[0xfe4e]).to.equal('WhiteBalance');
    });

    it('should have tag Exposure', () => {
        expect(TagNamesExifIfd[0xfe51]).to.equal('Exposure');
    });

    it('should have tag Shadows', () => {
        expect(TagNamesExifIfd[0xfe52]).to.equal('Shadows');
    });

    it('should have tag Brightness', () => {
        expect(TagNamesExifIfd[0xfe53]).to.equal('Brightness');
    });

    it('should have tag Contrast', () => {
        expect(TagNamesExifIfd[0xfe54]).to.equal('Contrast');
    });

    it('should have tag Saturation', () => {
        expect(TagNamesExifIfd[0xfe55]).to.equal('Saturation');
    });

    it('should have tag Sharpness', () => {
        expect(TagNamesExifIfd[0xfe56]).to.equal('Sharpness');
    });

    it('should have tag Smoothness', () => {
        expect(TagNamesExifIfd[0xfe57]).to.equal('Smoothness');
    });

    it('should have tag MoireFilter', () => {
        expect(TagNamesExifIfd[0xfe58]).to.equal('MoireFilter');
    });
});
