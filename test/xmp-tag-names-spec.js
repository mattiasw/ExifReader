import {expect} from 'chai';
import XmpTagNames from '../src/xmp-tag-names';

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
});
