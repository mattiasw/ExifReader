import {expect} from 'chai';
import TagNamesGpsIfd from '../src/tag-names-gps-ifd';
import {getCharacterArray} from './test-utils';

describe('tag-names-gps-ifd', () => {
    it('should report correct name and description for GPSVersionID', () => {
        expect(TagNamesGpsIfd[0x0000].name).to.equal('GPSVersionID');
        expect(TagNamesGpsIfd[0x0000].description([2, 2, 0, 0])).to.equal('Version 2.2');
        expect(TagNamesGpsIfd[0x0000].description([4, 7, 1, 1])).to.equal('Unknown');
    });

    it('should handle empty GPSVersionID', () => {
        expect(TagNamesGpsIfd[0x0000].description(0)).to.equal('Unknown');
    });

    it('should report correct name and description for GPSLatitudeRef', () => {
        expect(TagNamesGpsIfd[0x0001].name).to.equal('GPSLatitudeRef');
        expect(TagNamesGpsIfd[0x0001].description(['N'])).to.equal('North latitude');
        expect(TagNamesGpsIfd[0x0001].description(['S'])).to.equal('South latitude');
        expect(TagNamesGpsIfd[0x0001].description(['Z'])).to.equal('Unknown');
    });

    it('should report correct name and description for GPSLatitude', () => {
        // 37.231969, 115.811119 (37° 13' 55.0878", 115° 48' 40.0284")
        expect(TagNamesGpsIfd[0x0002].name).to.equal('GPSLatitude');
        expect(TagNamesGpsIfd[0x0002].description([37, 13, 55.0878])).to.be.closeTo(37.231969, 0.000001);
    });

    it('should report correct name and description for GPSLongitudeRef', () => {
        expect(TagNamesGpsIfd[0x0003].name).to.equal('GPSLongitudeRef');
        expect(TagNamesGpsIfd[0x0003].description(['E'])).to.equal('East longitude');
        expect(TagNamesGpsIfd[0x0003].description(['W'])).to.equal('West longitude');
        expect(TagNamesGpsIfd[0x0003].description(['Z'])).to.equal('Unknown');
    });

    it('should report correct name and description for GPSLongitude', () => {
        // 37.231969, 115.811119 (37° 13' 55.0878", 115° 48' 40.0284")
        expect(TagNamesGpsIfd[0x0004].name).to.equal('GPSLongitude');
        expect(TagNamesGpsIfd[0x0004].description([115, 48, 40.0284])).to.be.closeTo(115.811119, 0.000001);
    });

    it('should report correct name and description for GPSAltitudeRef', () => {
        expect(TagNamesGpsIfd[0x0005].name).to.equal('GPSAltitudeRef');
        expect(TagNamesGpsIfd[0x0005].description(0)).to.equal('Sea level');
        expect(TagNamesGpsIfd[0x0005].description(1)).to.equal('Sea level reference (negative value)');
        expect(TagNamesGpsIfd[0x0005].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for GPSAltitude', () => {
        expect(TagNamesGpsIfd[0x0006].name).to.equal('GPSAltitude');
        expect(TagNamesGpsIfd[0x0006].description(42)).to.equal('42 m');
    });

    it('should report correct name and description for GPSTimeStamp', () => {
        expect(TagNamesGpsIfd[0x0007].name).to.equal('GPSTimeStamp');
        expect(TagNamesGpsIfd[0x0007].description([6, 17, 32.48])).to.equal('06:17:32.48');
        expect(TagNamesGpsIfd[0x0007].description([6, 7, 32.48])).to.equal('06:07:32.48');
        expect(TagNamesGpsIfd[0x0007].description([6, 0, 32.48])).to.equal('06:00:32.48');
    });

    it('should have tag GPSSatellites', () => {
        expect(TagNamesGpsIfd[0x0008]).to.equal('GPSSatellites');
    });

    it('should report correct name and description for GPSStatus', () => {
        expect(TagNamesGpsIfd[0x0009].name).to.equal('GPSStatus');
        expect(TagNamesGpsIfd[0x0009].description(['A'])).to.equal('Measurement in progress');
        expect(TagNamesGpsIfd[0x0009].description(['V'])).to.equal('Measurement Interoperability');
        expect(TagNamesGpsIfd[0x0009].description(['Z'])).to.equal('Unknown');
    });

    it('should report correct name and description for GPSMeasureMode', () => {
        expect(TagNamesGpsIfd[0x000a].name).to.equal('GPSMeasureMode');
        expect(TagNamesGpsIfd[0x000a].description(['2'])).to.equal('2-dimensional measurement');
        expect(TagNamesGpsIfd[0x000a].description(['3'])).to.equal('3-dimensional measurement');
        expect(TagNamesGpsIfd[0x000a].description(['9'])).to.equal('Unknown');
    });

    it('should have tag GPSDOP', () => {
        expect(TagNamesGpsIfd[0x000b]).to.equal('GPSDOP');
    });

    it('should report correct name and description for GPSSpeedRef', () => {
        expect(TagNamesGpsIfd[0x000c].name).to.equal('GPSSpeedRef');
        expect(TagNamesGpsIfd[0x000c].description(['K'])).to.equal('Kilometers per hour');
        expect(TagNamesGpsIfd[0x000c].description(['M'])).to.equal('Miles per hour');
        expect(TagNamesGpsIfd[0x000c].description(['N'])).to.equal('Knots');
        expect(TagNamesGpsIfd[0x000c].description(['Z'])).to.equal('Unknown');
    });

    it('should have tag GPSSpeed', () => {
        expect(TagNamesGpsIfd[0x000d]).to.equal('GPSSpeed');
    });

    it('should report correct name and description for GPSTrackRef', () => {
        expect(TagNamesGpsIfd[0x000e].name).to.equal('GPSTrackRef');
        expect(TagNamesGpsIfd[0x000e].description(['T'])).to.equal('True direction');
        expect(TagNamesGpsIfd[0x000e].description(['M'])).to.equal('Magnetic direction');
        expect(TagNamesGpsIfd[0x000e].description(['Z'])).to.equal('Unknown');
    });

    it('should have tag GPSTrack', () => {
        expect(TagNamesGpsIfd[0x000f]).to.equal('GPSTrack');
    });

    it('should report correct name and description for GPSImgDirectionRef', () => {
        expect(TagNamesGpsIfd[0x0010].name).to.equal('GPSImgDirectionRef');
        expect(TagNamesGpsIfd[0x0010].description(['T'])).to.equal('True direction');
        expect(TagNamesGpsIfd[0x0010].description(['M'])).to.equal('Magnetic direction');
        expect(TagNamesGpsIfd[0x0010].description(['Z'])).to.equal('Unknown');
    });

    it('should have tag GPSImgDirection', () => {
        expect(TagNamesGpsIfd[0x0011]).to.equal('GPSImgDirection');
    });

    it('should have tag GPSMapDatum', () => {
        expect(TagNamesGpsIfd[0x0012]).to.equal('GPSMapDatum');
    });

    it('should report correct name and description for GPSDestLatitudeRef', () => {
        expect(TagNamesGpsIfd[0x0013].name).to.equal('GPSDestLatitudeRef');
        expect(TagNamesGpsIfd[0x0013].description(['N'])).to.equal('North latitude');
        expect(TagNamesGpsIfd[0x0013].description(['S'])).to.equal('South latitude');
        expect(TagNamesGpsIfd[0x0013].description(['Z'])).to.equal('Unknown');
    });

    it('should report correct name and description for GPSDestLatitude', () => {
        // 37.231969, 115.811119 (37° 13' 55.0878", 115° 48' 40.0284")
        expect(TagNamesGpsIfd[0x0014].name).to.equal('GPSDestLatitude');
        expect(TagNamesGpsIfd[0x0014].description([37, 13, 55.0878])).to.be.closeTo(37.231969, 0.000001);
    });

    it('should report correct name and description for GPSDestLongitudeRef', () => {
        expect(TagNamesGpsIfd[0x0015].name).to.equal('GPSDestLongitudeRef');
        expect(TagNamesGpsIfd[0x0015].description(['E'])).to.equal('East longitude');
        expect(TagNamesGpsIfd[0x0015].description(['W'])).to.equal('West longitude');
        expect(TagNamesGpsIfd[0x0015].description(['Z'])).to.equal('Unknown');
    });

    it('should report correct name and description for GPSDestLongitude', () => {
        // 37.231969, 115.811119 (37° 13' 55.0878", 115° 48' 40.0284")
        expect(TagNamesGpsIfd[0x0016].name).to.equal('GPSDestLongitude');
        expect(TagNamesGpsIfd[0x0016].description([115, 48, 40.0284])).to.be.closeTo(115.811119, 0.000001);
    });

    it('should report correct name and description for GPSDestBearingRef', () => {
        expect(TagNamesGpsIfd[0x0017].name).to.equal('GPSDestBearingRef');
        expect(TagNamesGpsIfd[0x0017].description(['T'])).to.equal('True direction');
        expect(TagNamesGpsIfd[0x0017].description(['M'])).to.equal('Magnetic direction');
    });

    it('should have tag GPSDestBearing', () => {
        expect(TagNamesGpsIfd[0x0018]).to.equal('GPSDestBearing');
    });

    it('should report correct name and description for GPSDestDistanceRef', () => {
        expect(TagNamesGpsIfd[0x0019].name).to.equal('GPSDestDistanceRef');
        expect(TagNamesGpsIfd[0x0019].description(['K'])).to.equal('Kilometers');
        expect(TagNamesGpsIfd[0x0019].description(['M'])).to.equal('Miles');
        expect(TagNamesGpsIfd[0x0019].description(['Z'])).to.equal('Unknown');
    });

    it('should have tag GPSDestDistance', () => {
        expect(TagNamesGpsIfd[0x001a]).to.equal('GPSDestDistance');
    });

    it('should report correct name and description for GPSProcessingMethod', () => {
        expect(TagNamesGpsIfd[0x001b].name).to.equal('GPSProcessingMethod');
        expect(TagNamesGpsIfd[0x001b].description(getCharacterArray('ASCII\x00\x00\x00ABC'))).to.equal('ABC');
        expect(TagNamesGpsIfd[0x001b].description(getCharacterArray('JIS\x00\x00\x00\x00\x00'))).to.equal('[JIS encoded text]');
        expect(TagNamesGpsIfd[0x001b].description(getCharacterArray('UNICODE\x00'))).to.equal('[Unicode encoded text]');
        expect(TagNamesGpsIfd[0x001b].description(getCharacterArray('\x00\x00\x00\x00\x00\x00\x00\x00'))).to.equal('[Undefined encoding]');
    });

    it('should handle empty GPSProcessingMethod', () => {
        expect(TagNamesGpsIfd[0x001b].description(0)).to.equal('Undefined');
    });

    it('should report correct name and description for GPSAreaInformation', () => {
        expect(TagNamesGpsIfd[0x001c].name).to.equal('GPSAreaInformation');
        expect(TagNamesGpsIfd[0x001c].description(getCharacterArray('ASCII\x00\x00\x00ABC'))).to.equal('ABC');
        expect(TagNamesGpsIfd[0x001c].description(getCharacterArray('JIS\x00\x00\x00\x00\x00'))).to.equal('[JIS encoded text]');
        expect(TagNamesGpsIfd[0x001c].description(getCharacterArray('UNICODE\x00'))).to.equal('[Unicode encoded text]');
        expect(TagNamesGpsIfd[0x001c].description(getCharacterArray('\x00\x00\x00\x00\x00\x00\x00\x00'))).to.equal('[Undefined encoding]');
    });

    it('should handle empty GPSAreaInformation', () => {
        expect(TagNamesGpsIfd[0x001c].description(0)).to.equal('Undefined');
    });

    it('should have tag GPSDateStamp', () => {
        expect(TagNamesGpsIfd[0x001d]).to.equal('GPSDateStamp');
    });

    it('should report correct name and description for GPSDifferential', () => {
        expect(TagNamesGpsIfd[0x001e].name).to.equal('GPSDifferential');
        expect(TagNamesGpsIfd[0x001e].description(0)).to.equal('Measurement without differential correction');
        expect(TagNamesGpsIfd[0x001e].description(1)).to.equal('Differential correction applied');
        expect(TagNamesGpsIfd[0x001e].description(4711)).to.equal('Unknown');
    });
});
