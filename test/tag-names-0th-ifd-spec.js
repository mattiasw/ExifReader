import {expect} from 'chai';
import TagNames0thIfd from '../src/tag-names-0th-ifd';

describe('tag-names-0th-ifd', () => {
    it('should have tag ImageWidth', () => {
        expect(TagNames0thIfd[0x0100]).to.equal('ImageWidth');
    });

    it('should have tag ImageLength', () => {
        expect(TagNames0thIfd[0x0101]).to.equal('ImageLength');
    });

    it('should have tag BitsPerSample', () => {
        expect(TagNames0thIfd[0x0102]).to.equal('BitsPerSample');
    });

    it('should have tag Compression', () => {
        expect(TagNames0thIfd[0x0103]).to.equal('Compression');
    });

    it('should have tag PhotometricInterpretation', () => {
        expect(TagNames0thIfd[0x0106]).to.equal('PhotometricInterpretation');
    });

    it('should have tag ImageDescription', () => {
        expect(TagNames0thIfd[0x010e]).to.equal('ImageDescription');
    });

    it('should have tag Make', () => {
        expect(TagNames0thIfd[0x010f]).to.equal('Make');
    });

    it('should have tag Model', () => {
        expect(TagNames0thIfd[0x0110]).to.equal('Model');
    });

    it('should have tag StripOffsets', () => {
        expect(TagNames0thIfd[0x0111]).to.equal('StripOffsets');
    });

    it('should report correct name and description for Orientation', () => {
        expect(TagNames0thIfd[0x0112].name).to.equal('Orientation');
        expect(TagNames0thIfd[0x0112].description(1)).to.equal('top-left');
        expect(TagNames0thIfd[0x0112].description(2)).to.equal('top-right');
        expect(TagNames0thIfd[0x0112].description(3)).to.equal('bottom-right');
        expect(TagNames0thIfd[0x0112].description(4)).to.equal('bottom-left');
        expect(TagNames0thIfd[0x0112].description(5)).to.equal('left-top');
        expect(TagNames0thIfd[0x0112].description(6)).to.equal('right-top');
        expect(TagNames0thIfd[0x0112].description(7)).to.equal('right-bottom');
        expect(TagNames0thIfd[0x0112].description(8)).to.equal('left-bottom');
        expect(TagNames0thIfd[0x0112].description(4711)).to.equal('Undefined');
    });

    it('should have tag SamplesPerPixel', () => {
        expect(TagNames0thIfd[0x0115]).to.equal('SamplesPerPixel');
    });

    it('should have tag RowsPerStrip', () => {
        expect(TagNames0thIfd[0x0116]).to.equal('RowsPerStrip');
    });

    it('should have tag StripByteCounts', () => {
        expect(TagNames0thIfd[0x0117]).to.equal('StripByteCounts');
    });

    it('should have tag XResolution', () => {
        expect(TagNames0thIfd[0x011a]).to.equal('XResolution');
    });

    it('should have tag YResolution', () => {
        expect(TagNames0thIfd[0x011b]).to.equal('YResolution');
    });

    it('should have tag PlanarConfiguration', () => {
        expect(TagNames0thIfd[0x011c]).to.equal('PlanarConfiguration');
    });

    it('should report correct name and description for ResolutionUnit', () => {
        expect(TagNames0thIfd[0x0128].name).to.equal('ResolutionUnit');
        expect(TagNames0thIfd[0x0128].description(2)).to.equal('inches');
        expect(TagNames0thIfd[0x0128].description(3)).to.equal('centimeters');
        expect(TagNames0thIfd[0x0128].description(4711)).to.equal('Unknown');
    });

    it('should have tag TransferFunction', () => {
        expect(TagNames0thIfd[0x012d]).to.equal('TransferFunction');
    });

    it('should have tag Software', () => {
        expect(TagNames0thIfd[0x0131]).to.equal('Software');
    });

    it('should have tag DateTime', () => {
        expect(TagNames0thIfd[0x0132]).to.equal('DateTime');
    });

    it('should have tag Artist', () => {
        expect(TagNames0thIfd[0x013b]).to.equal('Artist');
    });

    it('should have tag WhitePoint', () => {
        expect(TagNames0thIfd[0x013e]).to.equal('WhitePoint');
    });

    it('should have tag PrimaryChromaticities', () => {
        expect(TagNames0thIfd[0x013f]).to.equal('PrimaryChromaticities');
    });

    it('should have tag JPEGInterchangeFormat', () => {
        expect(TagNames0thIfd[0x0201]).to.equal('JPEGInterchangeFormat');
    });

    it('should have tag JPEGInterchangeFormatLength', () => {
        expect(TagNames0thIfd[0x0202]).to.equal('JPEGInterchangeFormatLength');
    });

    it('should have tag YCbCrCoefficients', () => {
        expect(TagNames0thIfd[0x0211]).to.equal('YCbCrCoefficients');
    });

    it('should have tag YCbCrSubSampling', () => {
        expect(TagNames0thIfd[0x0212]).to.equal('YCbCrSubSampling');
    });

    it('should report correct name and description for YCbCrPositioning', () => {
        expect(TagNames0thIfd[0x0213].name).to.equal('YCbCrPositioning');
        expect(TagNames0thIfd[0x0213].description(1)).to.equal('centered');
        expect(TagNames0thIfd[0x0213].description(2)).to.equal('co-sited');
        expect(TagNames0thIfd[0x0213].description(4711)).to.equal('undefined 4711');
    });

    it('should have tag ReferenceBlackWhite', () => {
        expect(TagNames0thIfd[0x0214]).to.equal('ReferenceBlackWhite');
    });

    it('should report correct name and description for Copyright', () => {
        expect(TagNames0thIfd[0x8298].name).to.equal('Copyright');
        expect(TagNames0thIfd[0x8298].description(['A', 'B'])).to.equal('A; B');
    });

    it('should have tag Exif IFD Pointer', () => {
        expect(TagNames0thIfd[0x8769]).to.equal('Exif IFD Pointer');
    });

    it('should have tag GPS Info IFD Pointer', () => {
        expect(TagNames0thIfd[0x8825]).to.equal('GPS Info IFD Pointer');
    });
});
