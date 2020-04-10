/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import TagNames0thIfd from '../../src/tag-names-0th-ifd';
import TagNamesCommon from '../../src/tag-names-common';

describe('tag-names-0th-ifd', () => {
    it('should have tag ProcessingSoftware', () => {
        expect(TagNames0thIfd[0x000b]).to.equal('ProcessingSoftware');
    });

    it('should have tag SubfileType', () => {
        expect(TagNames0thIfd[0x00fe].name).to.equal('SubfileType');
        expect(TagNames0thIfd[0x00fe].description(0x0)).to.equal('Full-resolution image');
        expect(TagNames0thIfd[0x00fe].description(0x1)).to.equal('Reduced-resolution image');
        expect(TagNames0thIfd[0x00fe].description(0x2)).to.equal('Single page of multi-page image');
        expect(TagNames0thIfd[0x00fe].description(0x3)).to.equal('Single page of multi-page reduced-resolution image');
        expect(TagNames0thIfd[0x00fe].description(0x4)).to.equal('Transparency mask');
        expect(TagNames0thIfd[0x00fe].description(0x5)).to.equal('Transparency mask of reduced-resolution image');
        expect(TagNames0thIfd[0x00fe].description(0x6)).to.equal('Transparency mask of multi-page image');
        expect(TagNames0thIfd[0x00fe].description(0x7)).to.equal('Transparency mask of reduced-resolution multi-page image');
        expect(TagNames0thIfd[0x00fe].description(0x10001)).to.equal('Alternate reduced-resolution image');
        expect(TagNames0thIfd[0x00fe].description(0xffffffff)).to.equal('Invalid');
        expect(TagNames0thIfd[0x00fe].description(0xabcdef)).to.equal('Unknown');
    });

    it('should have tag OldSubfileType', () => {
        expect(TagNames0thIfd[0x00ff].name).to.equal('OldSubfileType');
        expect(TagNames0thIfd[0x00ff].description(0x0)).to.equal('Full-resolution image');
        expect(TagNames0thIfd[0x00ff].description(0x1)).to.equal('Reduced-resolution image');
        expect(TagNames0thIfd[0x00ff].description(0x2)).to.equal('Single page of multi-page image');
        expect(TagNames0thIfd[0x00ff].description(0xab)).to.equal('Unknown');
    });

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

    it('should have tag Thresholding', () => {
        expect(TagNames0thIfd[0x0107].name).to.equal('Thresholding');
        expect(TagNames0thIfd[0x0107].description(1)).to.equal('No dithering or halftoning');
        expect(TagNames0thIfd[0x0107].description(2)).to.equal('Ordered dither or halfton');
        expect(TagNames0thIfd[0x0107].description(3)).to.equal('Randomized dither');
        expect(TagNames0thIfd[0x0107].description(42)).to.equal('Unknown');
    });

    it('should have tag CellWidth', () => {
        expect(TagNames0thIfd[0x0108]).to.equal('CellWidth');
    });

    it('should have tag CellLength', () => {
        expect(TagNames0thIfd[0x0109]).to.equal('CellLength');
    });

    it('should have tag FillOrder', () => {
        expect(TagNames0thIfd[0x010a].name).to.equal('FillOrder');
        expect(TagNames0thIfd[0x010a].description(1)).to.equal('Normal');
        expect(TagNames0thIfd[0x010a].description(2)).to.equal('Reversed');
        expect(TagNames0thIfd[0x010a].description(42)).to.equal('Unknown');
    });

    it('should have tag DocumentName', () => {
        expect(TagNames0thIfd[0x010d]).to.equal('DocumentName');
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

    it('should have tag MinSampleValue', () => {
        expect(TagNames0thIfd[0x0118]).to.equal('MinSampleValue');
    });

    it('should have tag MaxSampleValue', () => {
        expect(TagNames0thIfd[0x0119]).to.equal('MaxSampleValue');
    });

    it('should have tag XResolution', () => {
        expect(TagNames0thIfd[0x011a].name).to.equal('XResolution');
        expect(TagNames0thIfd[0x011a].description([300000, 1000])).to.equal('300');
        expect(TagNames0thIfd[0x011a].description([300, 0])).to.equal('Infinity');
    });

    it('should have tag YResolution', () => {
        expect(TagNames0thIfd[0x011b].name).to.equal('YResolution');
        expect(TagNames0thIfd[0x011b].description([300000, 1000])).to.equal('300');
        expect(TagNames0thIfd[0x011b].description([300, 0])).to.equal('Infinity');
    });

    it('should have tag PlanarConfiguration', () => {
        expect(TagNames0thIfd[0x011c]).to.equal('PlanarConfiguration');
    });

    it('should have tag PageName', () => {
        expect(TagNames0thIfd[0x011d]).to.equal('PageName');
    });

    it('should have tag XPosition', () => {
        expect(TagNames0thIfd[0x011e].name).to.equal('XPosition');
        expect(TagNames0thIfd[0x011e].description([3000, 10])).to.equal('300');
        expect(TagNames0thIfd[0x011e].description([300, 0])).to.equal('Infinity');
    });

    it('should have tag YPosition', () => {
        expect(TagNames0thIfd[0x011f].name).to.equal('YPosition');
        expect(TagNames0thIfd[0x011f].description([3000, 10])).to.equal('300');
        expect(TagNames0thIfd[0x011f].description([300, 0])).to.equal('Infinity');
    });

    it('should report correct name and description for GrayResponseUnit', () => {
        expect(TagNames0thIfd[0x0122].name).to.equal('GrayResponseUnit');
        expect(TagNames0thIfd[0x0122].description(1)).to.equal('0.1');
        expect(TagNames0thIfd[0x0122].description(2)).to.equal('0.001');
        expect(TagNames0thIfd[0x0122].description(3)).to.equal('0.0001');
        expect(TagNames0thIfd[0x0122].description(4)).to.equal('1e-05');
        expect(TagNames0thIfd[0x0122].description(5)).to.equal('1e-06');
        expect(TagNames0thIfd[0x0122].description(4711)).to.equal('Unknown');
    });

    it('should report correct name and description for ResolutionUnit', () => {
        expect(TagNames0thIfd[0x0128].name).to.equal('ResolutionUnit');
        expect(TagNames0thIfd[0x0128].description(2)).to.equal('inches');
        expect(TagNames0thIfd[0x0128].description(3)).to.equal('centimeters');
        expect(TagNames0thIfd[0x0128].description(4711)).to.equal('Unknown');
    });

    it('should have tag PageNumber', () => {
        expect(TagNames0thIfd[0x0129]).to.equal('PageNumber');
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

    it('should have tag HostComputer', () => {
        expect(TagNames0thIfd[0x013c]).to.equal('HostComputer');
    });

    it('should have tag Predictor', () => {
        expect(TagNames0thIfd[0x013d]).to.equal('Predictor');
    });

    it('should have tag WhitePoint', () => {
        expect(TagNames0thIfd[0x013e].name).to.equal('WhitePoint');
        expect(TagNames0thIfd[0x013e].description([[30, 100], [40, 200]])).to.equal('30/100, 40/200');
    });

    it('should have tag PrimaryChromaticities', () => {
        expect(TagNames0thIfd[0x013f].name).to.equal('PrimaryChromaticities');
        expect(TagNames0thIfd[0x013f].description([[30, 100], [40, 200], [50, 300], [60, 400], [70, 500], [80, 600]]))
            .to.equal('30/100, 40/200, 50/300, 60/400, 70/500, 80/600');
    });

    it('should have tag HalftoneHints', () => {
        expect(TagNames0thIfd[0x0141]).to.equal('HalftoneHints');
    });

    it('should have tag TileWidth', () => {
        expect(TagNames0thIfd[0x0142]).to.equal('TileWidth');
    });

    it('should have tag TileLength', () => {
        expect(TagNames0thIfd[0x0143]).to.equal('TileLength');
    });

    it('should have tag A100DataOffset', () => {
        expect(TagNames0thIfd[0x014a]).to.equal('A100DataOffset');
    });

    it('should have tag InkSet', () => {
        expect(TagNames0thIfd[0x014c].name).to.equal('InkSet');
        expect(TagNames0thIfd[0x014c].description(1)).to.equal('CMYK');
        expect(TagNames0thIfd[0x014c].description(2)).to.equal('Not CMYK');
        expect(TagNames0thIfd[0x014c].description(42)).to.equal('Unknown');
    });

    it('should have tag ExtraSamples', () => {
        expect(TagNames0thIfd[0x0152].name).to.equal('ExtraSamples');
        expect(TagNames0thIfd[0x0152].description(0)).to.equal('Unspecified');
        expect(TagNames0thIfd[0x0152].description(1)).to.equal('Associated Alpha');
        expect(TagNames0thIfd[0x0152].description(2)).to.equal('Unassociated Alpha');
        expect(TagNames0thIfd[0x0152].description(42)).to.equal('Unknown');
    });

    it('should have tag SampleFormat', () => {
        expect(TagNames0thIfd[0x0153].name).to.equal('SampleFormat');
        expect(TagNames0thIfd[0x0153].description([0, 1, 2, 3])).to.equal('Unknown, Unsigned, Signed, Float');
        expect(TagNames0thIfd[0x0153].description([4, 5, 6, 7])).to.equal('Undefined, Complex int, Complex float, Unknown');
    });

    it('should have tag TargetPrinter', () => {
        expect(TagNames0thIfd[0x0151]).to.equal('TargetPrinter');
    });

    it('should have tag JPEGInterchangeFormat', () => {
        expect(TagNames0thIfd[0x0201]).to.equal('JPEGInterchangeFormat');
    });

    it('should have tag JPEGInterchangeFormatLength', () => {
        expect(TagNames0thIfd[0x0202]).to.equal('JPEGInterchangeFormatLength');
    });

    it('should have tag YCbCrCoefficients', () => {
        expect(TagNames0thIfd[0x0211].name).to.equal('YCbCrCoefficients');
        expect(TagNames0thIfd[0x0211].description([[299, 1000], [587, 1000], [114, 1000]])).to.equal('0.299/0.587/0.114');
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
        expect(TagNames0thIfd[0x0214].name).to.equal('ReferenceBlackWhite');
        expect(TagNames0thIfd[0x0214].description([[0, 10], [2550, 10], [0, 10], [1280, 10], [0, 10], [1280, 10]]))
            .to.equal('0, 255, 0, 128, 0, 128');
    });

    it('should have tag ApplicationNotes', () => {
        expect(TagNames0thIfd[0x02bc]).to.equal('ApplicationNotes');
    });

    it('should have tag Rating', () => {
        expect(TagNames0thIfd[0x4746]).to.equal('Rating');
    });

    it('should have tag RatingPercent', () => {
        expect(TagNames0thIfd[0x4749]).to.equal('RatingPercent');
    });

    it('should report correct name and description for Copyright', () => {
        expect(TagNames0thIfd[0x8298].name).to.equal('Copyright');
        expect(TagNames0thIfd[0x8298].description(['A', 'B'])).to.equal('A; B');
    });

    it('should have tag PixelScale', () => {
        expect(TagNames0thIfd[0x830e]).to.equal('PixelScale');
    });

    it('should have tag IPTC-NAA', () => {
        expect(TagNames0thIfd[0x83bb]).to.equal('IPTC-NAA');
    });

    it('should have tag IntergraphMatrix', () => {
        expect(TagNames0thIfd[0x8480]).to.equal('IntergraphMatrix');
    });

    it('should have tag ModelTiePoint', () => {
        expect(TagNames0thIfd[0x8482]).to.equal('ModelTiePoint');
    });

    it('should have tag SEMInfo', () => {
        expect(TagNames0thIfd[0x8546]).to.equal('SEMInfo');
    });

    it('should have tag ModelTransform', () => {
        expect(TagNames0thIfd[0x85d8]).to.equal('ModelTransform');
    });

    it('should have tag PhotoshopSettings', () => {
        expect(TagNames0thIfd[0x8649]).to.equal('PhotoshopSettings');
    });

    it('should have tag Exif IFD Pointer', () => {
        expect(TagNames0thIfd[0x8769]).to.equal('Exif IFD Pointer');
    });

    it('should have tag ICC_Profile', () => {
        expect(TagNames0thIfd[0x8773]).to.equal('ICC_Profile');
    });

    it('should have tag GeoTiffDirectory', () => {
        expect(TagNames0thIfd[0x87af]).to.equal('GeoTiffDirectory');
    });

    it('should have tag GeoTiffDoubleParams', () => {
        expect(TagNames0thIfd[0x87b0]).to.equal('GeoTiffDoubleParams');
    });

    it('should have tag GeoTiffAsciiParams', () => {
        expect(TagNames0thIfd[0x87b1]).to.equal('GeoTiffAsciiParams');
    });

    it('should have tag GPS Info IFD Pointer', () => {
        expect(TagNames0thIfd[0x8825]).to.equal('GPS Info IFD Pointer');
    });

    it('should have tag XPTitle', () => {
        expect(TagNames0thIfd[0x9c9b]).to.equal('XPTitle');
    });

    it('should have tag XPComment', () => {
        expect(TagNames0thIfd[0x9c9c]).to.equal('XPComment');
    });

    it('should have tag XPAuthor', () => {
        expect(TagNames0thIfd[0x9c9d]).to.equal('XPAuthor');
    });

    it('should have tag XPKeywords', () => {
        expect(TagNames0thIfd[0x9c9e]).to.equal('XPKeywords');
    });

    it('should have tag XPSubject', () => {
        expect(TagNames0thIfd[0x9c9f]).to.equal('XPSubject');
    });

    it('should have tag GDALMetadata', () => {
        expect(TagNames0thIfd[0xa480]).to.equal('GDALMetadata');
    });

    it('should have tag GDALNoData', () => {
        expect(TagNames0thIfd[0xa481]).to.equal('GDALNoData');
    });

    it('should have tag PrintIM', () => {
        expect(TagNames0thIfd[0xc4a5]).to.equal('PrintIM');
    });

    it('should have tag DNGBackwardVersion', () => {
        expect(TagNames0thIfd[0xc613]).to.equal('DNGBackwardVersion');
    });

    it('should have tag UniqueCameraModel', () => {
        expect(TagNames0thIfd[0xc614]).to.equal('UniqueCameraModel');
    });

    it('should have tag LocalizedCameraModel', () => {
        expect(TagNames0thIfd[0xc615]).to.equal('LocalizedCameraModel');
    });

    it('should have tag ColorMatrix1', () => {
        expect(TagNames0thIfd[0xc621]).to.equal('ColorMatrix1');
    });

    it('should have tag ColorMatrix2', () => {
        expect(TagNames0thIfd[0xc622]).to.equal('ColorMatrix2');
    });

    it('should have tag CameraCalibration1', () => {
        expect(TagNames0thIfd[0xc623]).to.equal('CameraCalibration1');
    });

    it('should have tag CameraCalibration2', () => {
        expect(TagNames0thIfd[0xc624]).to.equal('CameraCalibration2');
    });

    it('should have tag ReductionMatrix1', () => {
        expect(TagNames0thIfd[0xc625]).to.equal('ReductionMatrix1');
    });

    it('should have tag ReductionMatrix2', () => {
        expect(TagNames0thIfd[0xc626]).to.equal('ReductionMatrix2');
    });

    it('should have tag AnalogBalance', () => {
        expect(TagNames0thIfd[0xc627]).to.equal('AnalogBalance');
    });

    it('should have tag AsShotNeutral', () => {
        expect(TagNames0thIfd[0xc628]).to.equal('AsShotNeutral');
    });

    it('should have tag AsShotWhiteXY', () => {
        expect(TagNames0thIfd[0xc629]).to.equal('AsShotWhiteXY');
    });

    it('should have tag BaselineExposure', () => {
        expect(TagNames0thIfd[0xc62a]).to.equal('BaselineExposure');
    });

    it('should have tag BaselineNoise', () => {
        expect(TagNames0thIfd[0xc62b]).to.equal('BaselineNoise');
    });

    it('should have tag BaselineSharpness', () => {
        expect(TagNames0thIfd[0xc62c]).to.equal('BaselineSharpness');
    });

    it('should have tag LinearResponseLimit', () => {
        expect(TagNames0thIfd[0xc62e]).to.equal('LinearResponseLimit');
    });

    it('should have tag CameraSerialNumber', () => {
        expect(TagNames0thIfd[0xc62f]).to.equal('CameraSerialNumber');
    });

    it('should have tag DNGLensInfo', () => {
        expect(TagNames0thIfd[0xc630]).to.equal('DNGLensInfo');
    });

    it('should have tag ShadowScale', () => {
        expect(TagNames0thIfd[0xc633]).to.equal('ShadowScale');
    });

    it('should have tag MakerNoteSafety', () => {
        expect(TagNames0thIfd[0xc635].name).to.equal('MakerNoteSafety');
        expect(TagNames0thIfd[0xc635].description(0)).to.equal('Unsafe');
        expect(TagNames0thIfd[0xc635].description(1)).to.equal('Safe');
        expect(TagNames0thIfd[0xc635].description(42)).to.equal('Unknown');
    });

    it('should have tag CalibrationIlluminant1', () => {
        expect(TagNames0thIfd[0xc65a].name).to.equal('CalibrationIlluminant1');
        expect(TagNames0thIfd[0xc65a].description).to.equal(TagNamesCommon['LightSource']);
    });

    it('should have tag CalibrationIlluminant2', () => {
        expect(TagNames0thIfd[0xc65b].name).to.equal('CalibrationIlluminant2');
        expect(TagNames0thIfd[0xc65b].description).to.equal(TagNamesCommon['LightSource']);
    });

    it('should have tag RawDataUniqueID', () => {
        expect(TagNames0thIfd[0xc65d]).to.equal('RawDataUniqueID');
    });

    it('should have tag OriginalRawFileName', () => {
        expect(TagNames0thIfd[0xc68b]).to.equal('OriginalRawFileName');
    });

    it('should have tag OriginalRawFileData', () => {
        expect(TagNames0thIfd[0xc68c]).to.equal('OriginalRawFileData');
    });

    it('should have tag AsShotICCProfile', () => {
        expect(TagNames0thIfd[0xc68f]).to.equal('AsShotICCProfile');
    });

    it('should have tag AsShotPreProfileMatrix', () => {
        expect(TagNames0thIfd[0xc690]).to.equal('AsShotPreProfileMatrix');
    });

    it('should have tag CurrentICCProfile', () => {
        expect(TagNames0thIfd[0xc691]).to.equal('CurrentICCProfile');
    });

    it('should have tag CurrentPreProfileMatrix', () => {
        expect(TagNames0thIfd[0xc692]).to.equal('CurrentPreProfileMatrix');
    });

    it('should have tag ColorimetricReference', () => {
        expect(TagNames0thIfd[0xc6bf]).to.equal('ColorimetricReference');
    });

    it('should have tag SRawType', () => {
        expect(TagNames0thIfd[0xc6c5]).to.equal('SRawType');
    });

    it('should have tag PanasonicTitle', () => {
        expect(TagNames0thIfd[0xc6d2]).to.equal('PanasonicTitle');
    });

    it('should have tag PanasonicTitle2', () => {
        expect(TagNames0thIfd[0xc6d3]).to.equal('PanasonicTitle2');
    });

    it('should have tag CameraCalibrationSig', () => {
        expect(TagNames0thIfd[0xc6f3]).to.equal('CameraCalibrationSig');
    });

    it('should have tag ProfileCalibrationSig', () => {
        expect(TagNames0thIfd[0xc6f4]).to.equal('ProfileCalibrationSig');
    });

    it('should have tag ProfileIFD', () => {
        expect(TagNames0thIfd[0xc6f5]).to.equal('ProfileIFD');
    });

    it('should have tag AsShotProfileName', () => {
        expect(TagNames0thIfd[0xc6f6]).to.equal('AsShotProfileName');
    });

    it('should have tag ProfileName', () => {
        expect(TagNames0thIfd[0xc6f8]).to.equal('ProfileName');
    });

    it('should have tag ProfileHueSatMapDims', () => {
        expect(TagNames0thIfd[0xc6f9]).to.equal('ProfileHueSatMapDims');
    });

    it('should have tag ProfileHueSatMapData1', () => {
        expect(TagNames0thIfd[0xc6fa]).to.equal('ProfileHueSatMapData1');
    });

    it('should have tag ProfileHueSatMapData2', () => {
        expect(TagNames0thIfd[0xc6fb]).to.equal('ProfileHueSatMapData2');
    });

    it('should have tag ProfileToneCurve', () => {
        expect(TagNames0thIfd[0xc6fc]).to.equal('ProfileToneCurve');
    });

    it('should have tag ProfileEmbedPolicy', () => {
        expect(TagNames0thIfd[0xc6fd].name).to.equal('ProfileEmbedPolicy');
        expect(TagNames0thIfd[0xc6fd].description(0)).to.equal('Allow Copying');
        expect(TagNames0thIfd[0xc6fd].description(1)).to.equal('Embed if Used');
        expect(TagNames0thIfd[0xc6fd].description(2)).to.equal('Never Embed');
        expect(TagNames0thIfd[0xc6fd].description(3)).to.equal('No Restrictions');
        expect(TagNames0thIfd[0xc6fd].description(42)).to.equal('Unknown');
    });

    it('should have tag ProfileCopyright', () => {
        expect(TagNames0thIfd[0xc6fe]).to.equal('ProfileCopyright');
    });

    it('should have tag ForwardMatrix1', () => {
        expect(TagNames0thIfd[0xc714]).to.equal('ForwardMatrix1');
    });

    it('should have tag ForwardMatrix2', () => {
        expect(TagNames0thIfd[0xc715]).to.equal('ForwardMatrix2');
    });

    it('should have tag PreviewApplicationName', () => {
        expect(TagNames0thIfd[0xc716]).to.equal('PreviewApplicationName');
    });

    it('should have tag PreviewApplicationVersion', () => {
        expect(TagNames0thIfd[0xc717]).to.equal('PreviewApplicationVersion');
    });

    it('should have tag PreviewSettingsName', () => {
        expect(TagNames0thIfd[0xc718]).to.equal('PreviewSettingsName');
    });

    it('should have tag PreviewSettingsDigest', () => {
        expect(TagNames0thIfd[0xc719]).to.equal('PreviewSettingsDigest');
    });

    it('should have tag PreviewColorSpace', () => {
        expect(TagNames0thIfd[0xc71a].name).to.equal('PreviewColorSpace');
        expect(TagNames0thIfd[0xc71a].description(0)).to.equal('Unknown');
        expect(TagNames0thIfd[0xc71a].description(1)).to.equal('Gray Gamma 2.2');
        expect(TagNames0thIfd[0xc71a].description(2)).to.equal('sRGB');
        expect(TagNames0thIfd[0xc71a].description(3)).to.equal('Adobe RGB');
        expect(TagNames0thIfd[0xc71a].description(4)).to.equal('ProPhoto RGB');
        expect(TagNames0thIfd[0xc71a].description(42)).to.equal('Unknown');
    });

    it('should have tag PreviewDateTime', () => {
        expect(TagNames0thIfd[0xc71b]).to.equal('PreviewDateTime');
    });

    it('should have tag RawImageDigest', () => {
        expect(TagNames0thIfd[0xc71c]).to.equal('RawImageDigest');
    });

    it('should have tag OriginalRawFileDigest', () => {
        expect(TagNames0thIfd[0xc71d]).to.equal('OriginalRawFileDigest');
    });

    it('should have tag ProfileLookTableDims', () => {
        expect(TagNames0thIfd[0xc725]).to.equal('ProfileLookTableDims');
    });

    it('should have tag ProfileLookTableData', () => {
        expect(TagNames0thIfd[0xc726]).to.equal('ProfileLookTableData');
    });

    it('should have tag TimeCodes', () => {
        expect(TagNames0thIfd[0xc763]).to.equal('TimeCodes');
    });

    it('should have tag FrameRate', () => {
        expect(TagNames0thIfd[0xc764]).to.equal('FrameRate');
    });

    it('should have tag TStop', () => {
        expect(TagNames0thIfd[0xc772]).to.equal('TStop');
    });

    it('should have tag ReelName', () => {
        expect(TagNames0thIfd[0xc789]).to.equal('ReelName');
    });

    it('should have tag OriginalDefaultFinalSize', () => {
        expect(TagNames0thIfd[0xc791]).to.equal('OriginalDefaultFinalSize');
    });

    it('should have tag OriginalBestQualitySize', () => {
        expect(TagNames0thIfd[0xc792]).to.equal('OriginalBestQualitySize');
    });

    it('should have tag OriginalDefaultCropSize', () => {
        expect(TagNames0thIfd[0xc793]).to.equal('OriginalDefaultCropSize');
    });

    it('should have tag CameraLabel', () => {
        expect(TagNames0thIfd[0xc7a1]).to.equal('CameraLabel');
    });

    it('should have tag ProfileHueSatMapEncoding', () => {
        expect(TagNames0thIfd[0xc7a3].name).to.equal('ProfileHueSatMapEncoding');
        expect(TagNames0thIfd[0xc7a3].description(0)).to.equal('Linear');
        expect(TagNames0thIfd[0xc7a3].description(1)).to.equal('sRGB');
        expect(TagNames0thIfd[0xc7a3].description(42)).to.equal('Unknown');
    });

    it('should have tag ProfileLookTableEncoding', () => {
        expect(TagNames0thIfd[0xc7a4].name).to.equal('ProfileLookTableEncoding');
        expect(TagNames0thIfd[0xc7a4].description(0)).to.equal('Linear');
        expect(TagNames0thIfd[0xc7a4].description(1)).to.equal('sRGB');
        expect(TagNames0thIfd[0xc7a4].description(42)).to.equal('Unknown');
    });

    it('should have tag BaselineExposureOffset', () => {
        expect(TagNames0thIfd[0xc7a5]).to.equal('BaselineExposureOffset');
    });

    it('should have tag DefaultBlackRender', () => {
        expect(TagNames0thIfd[0xc7a6].name).to.equal('DefaultBlackRender');
        expect(TagNames0thIfd[0xc7a6].description(0)).to.equal('Auto');
        expect(TagNames0thIfd[0xc7a6].description(1)).to.equal('None');
        expect(TagNames0thIfd[0xc7a6].description(42)).to.equal('Unknown');
    });

    it('should have tag NewRawImageDigest', () => {
        expect(TagNames0thIfd[0xc7a7]).to.equal('NewRawImageDigest');
    });

    it('should have tag RawToPreviewGain', () => {
        expect(TagNames0thIfd[0xc7a8]).to.equal('RawToPreviewGain');
    });
});
