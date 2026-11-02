/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Type and count come from CIPA DC-008-2019 §4.6.3 to §4.6.7, level from the
// compressed column of §4.6.8 Tables 17 to 20: the support level whenever the
// tag's IFD is written (M mandatory, R recommended, O optional, N and J not
// allowed). thumbnailLevel is present only where Table 21 (1st IFD) gives a
// different level. writable: false means the tag is defined outside DC-008 by
// the source named on its line, which this table does not draw on.
// Such a tag is N when it describes how a TIFF stores its image data or points
// at data the writer does not carry, J when a JPEG carries its payload in a
// marker segment, else O.
// DEFAULT_FROM_SOF: the value comes from the JPEG SOF segment.
// DEFAULT_COMPUTED: the writer computes the value (an offset or a length).

const DEFAULT_FROM_SOF = 'fromSof';
const DEFAULT_COMPUTED = 'computed';

const tags = [
    {id: 0x000b, ifd: '0th', name: 'ProcessingSoftware', level: 'O', writable: false}, // vendor
    {id: 0x00fe, ifd: '0th', name: 'SubfileType', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x00ff, ifd: '0th', name: 'OldSubfileType', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x0100, ifd: '0th', name: 'ImageWidth', type: ['SHORT', 'LONG'], count: 1, level: 'J'},
    {id: 0x0101, ifd: '0th', name: 'ImageLength', type: ['SHORT', 'LONG'], count: 1, level: 'J'},
    {id: 0x0102, ifd: '0th', name: 'BitsPerSample', type: 'SHORT', count: 3, level: 'J'},
    {id: 0x0103, ifd: '0th', name: 'Compression', type: 'SHORT', count: 1, level: 'J', thumbnailLevel: 'M', default: 6},
    {id: 0x0106, ifd: '0th', name: 'PhotometricInterpretation', type: 'SHORT', count: 1, level: 'N', thumbnailLevel: 'J'},
    {id: 0x0107, ifd: '0th', name: 'Thresholding', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x0108, ifd: '0th', name: 'CellWidth', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x0109, ifd: '0th', name: 'CellLength', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x010a, ifd: '0th', name: 'FillOrder', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x010d, ifd: '0th', name: 'DocumentName', level: 'O', writable: false}, // TIFF 6.0
    {id: 0x010e, ifd: '0th', name: 'ImageDescription', type: 'ASCII', count: 'any', level: 'R', thumbnailLevel: 'O'},
    {id: 0x010f, ifd: '0th', name: 'Make', type: 'ASCII', count: 'any', level: 'R', thumbnailLevel: 'O'},
    {id: 0x0110, ifd: '0th', name: 'Model', type: 'ASCII', count: 'any', level: 'R', thumbnailLevel: 'O'},
    {id: 0x0111, ifd: '0th', name: 'StripOffsets', type: ['SHORT', 'LONG'], count: 'any', level: 'N'},
    {id: 0x0112, ifd: '0th', name: 'Orientation', type: 'SHORT', count: 1, level: 'R', thumbnailLevel: 'O'},
    {id: 0x0115, ifd: '0th', name: 'SamplesPerPixel', type: 'SHORT', count: 1, level: 'J'},
    {id: 0x0116, ifd: '0th', name: 'RowsPerStrip', type: ['SHORT', 'LONG'], count: 1, level: 'N'},
    {id: 0x0117, ifd: '0th', name: 'StripByteCounts', type: ['SHORT', 'LONG'], count: 'any', level: 'N'},
    {id: 0x0118, ifd: '0th', name: 'MinSampleValue', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x0119, ifd: '0th', name: 'MaxSampleValue', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x011a, ifd: '0th', name: 'XResolution', type: 'RATIONAL', count: 1, level: 'M', default: [72, 1]},
    {id: 0x011b, ifd: '0th', name: 'YResolution', type: 'RATIONAL', count: 1, level: 'M', default: [72, 1]},
    {id: 0x011c, ifd: '0th', name: 'PlanarConfiguration', type: 'SHORT', count: 1, level: 'J'},
    {id: 0x011d, ifd: '0th', name: 'PageName', level: 'O', writable: false}, // TIFF 6.0
    {id: 0x011e, ifd: '0th', name: 'XPosition', level: 'O', writable: false}, // TIFF 6.0
    {id: 0x011f, ifd: '0th', name: 'YPosition', level: 'O', writable: false}, // TIFF 6.0
    {id: 0x0122, ifd: '0th', name: 'GrayResponseUnit', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x0128, ifd: '0th', name: 'ResolutionUnit', type: 'SHORT', count: 1, level: 'M', default: 2},
    {id: 0x0129, ifd: '0th', name: 'PageNumber', level: 'O', writable: false}, // TIFF 6.0
    {id: 0x012d, ifd: '0th', name: 'TransferFunction', type: 'SHORT', count: 768, level: 'O'},
    {id: 0x0131, ifd: '0th', name: 'Software', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0x0132, ifd: '0th', name: 'DateTime', type: 'ASCII', count: 20, level: 'R', thumbnailLevel: 'O'},
    {id: 0x013b, ifd: '0th', name: 'Artist', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0x013c, ifd: '0th', name: 'HostComputer', level: 'O', writable: false}, // TIFF 6.0
    {id: 0x013d, ifd: '0th', name: 'Predictor', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x013e, ifd: '0th', name: 'WhitePoint', type: 'RATIONAL', count: 2, level: 'O'},
    {id: 0x013f, ifd: '0th', name: 'PrimaryChromaticities', type: 'RATIONAL', count: 6, level: 'O'},
    {id: 0x0141, ifd: '0th', name: 'HalftoneHints', level: 'O', writable: false}, // TIFF 6.0
    {id: 0x0142, ifd: '0th', name: 'TileWidth', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x0143, ifd: '0th', name: 'TileLength', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x014a, ifd: '0th', name: 'A100DataOffset', level: 'N', writable: false}, // vendor
    {id: 0x014c, ifd: '0th', name: 'InkSet', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x0151, ifd: '0th', name: 'TargetPrinter', level: 'O', writable: false}, // TIFF 6.0
    {id: 0x0152, ifd: '0th', name: 'ExtraSamples', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x0153, ifd: '0th', name: 'SampleFormat', level: 'N', writable: false}, // TIFF 6.0
    {id: 0x0201, ifd: '0th', name: 'JPEGInterchangeFormat', type: 'LONG', count: 1, level: 'N', thumbnailLevel: 'M', default: DEFAULT_COMPUTED},
    {id: 0x0202, ifd: '0th', name: 'JPEGInterchangeFormatLength', type: 'LONG', count: 1, level: 'N', thumbnailLevel: 'M', default: DEFAULT_COMPUTED},
    {id: 0x0211, ifd: '0th', name: 'YCbCrCoefficients', type: 'RATIONAL', count: 3, level: 'O'},
    {id: 0x0212, ifd: '0th', name: 'YCbCrSubSampling', type: 'SHORT', count: 2, level: 'J'},
    {id: 0x0213, ifd: '0th', name: 'YCbCrPositioning', type: 'SHORT', count: 1, level: 'M', thumbnailLevel: 'O', default: 1},
    {id: 0x0214, ifd: '0th', name: 'ReferenceBlackWhite', type: 'RATIONAL', count: 6, level: 'O'},
    {id: 0x02bc, ifd: '0th', name: 'ApplicationNotes', level: 'J', writable: false}, // XMP (Adobe)
    {id: 0x4746, ifd: '0th', name: 'Rating', level: 'O', writable: false}, // Microsoft
    {id: 0x4749, ifd: '0th', name: 'RatingPercent', level: 'O', writable: false}, // Microsoft
    {id: 0x8298, ifd: '0th', name: 'Copyright', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0x830e, ifd: '0th', name: 'PixelScale', level: 'O', writable: false}, // GeoTIFF
    {id: 0x83bb, ifd: '0th', name: 'IPTC-NAA', level: 'J', writable: false}, // IPTC
    {id: 0x8480, ifd: '0th', name: 'IntergraphMatrix', level: 'O', writable: false}, // vendor
    {id: 0x8482, ifd: '0th', name: 'ModelTiePoint', level: 'O', writable: false}, // GeoTIFF
    {id: 0x8546, ifd: '0th', name: 'SEMInfo', level: 'O', writable: false}, // vendor
    {id: 0x85d8, ifd: '0th', name: 'ModelTransform', level: 'O', writable: false}, // GeoTIFF
    {id: 0x8649, ifd: '0th', name: 'PhotoshopSettings', level: 'J', writable: false}, // Photoshop
    {id: 0x8769, ifd: '0th', name: 'Exif IFD Pointer', type: 'LONG', count: 1, level: 'M', thumbnailLevel: 'O', default: DEFAULT_COMPUTED},
    {id: 0x8773, ifd: '0th', name: 'ICC_Profile', level: 'J', writable: false}, // ICC
    {id: 0x87af, ifd: '0th', name: 'GeoTiffDirectory', level: 'O', writable: false}, // GeoTIFF
    {id: 0x87b0, ifd: '0th', name: 'GeoTiffDoubleParams', level: 'O', writable: false}, // GeoTIFF
    {id: 0x87b1, ifd: '0th', name: 'GeoTiffAsciiParams', level: 'O', writable: false}, // GeoTIFF
    {id: 0x8825, ifd: '0th', name: 'GPS Info IFD Pointer', type: 'LONG', count: 1, level: 'O'},
    {id: 0x9c9b, ifd: '0th', name: 'XPTitle', level: 'O', writable: false}, // Microsoft
    {id: 0x9c9c, ifd: '0th', name: 'XPComment', level: 'O', writable: false}, // Microsoft
    {id: 0x9c9d, ifd: '0th', name: 'XPAuthor', level: 'O', writable: false}, // Microsoft
    {id: 0x9c9e, ifd: '0th', name: 'XPKeywords', level: 'O', writable: false}, // Microsoft
    {id: 0x9c9f, ifd: '0th', name: 'XPSubject', level: 'O', writable: false}, // Microsoft
    {id: 0xa480, ifd: '0th', name: 'GDALMetadata', level: 'O', writable: false}, // GDAL
    {id: 0xa481, ifd: '0th', name: 'GDALNoData', level: 'O', writable: false}, // GDAL
    {id: 0xc4a5, ifd: '0th', name: 'PrintIM', level: 'O', writable: false}, // vendor
    {id: 0xc613, ifd: '0th', name: 'DNGBackwardVersion', level: 'O', writable: false}, // DNG
    {id: 0xc614, ifd: '0th', name: 'UniqueCameraModel', level: 'O', writable: false}, // DNG
    {id: 0xc615, ifd: '0th', name: 'LocalizedCameraModel', level: 'O', writable: false}, // DNG
    {id: 0xc621, ifd: '0th', name: 'ColorMatrix1', level: 'O', writable: false}, // DNG
    {id: 0xc622, ifd: '0th', name: 'ColorMatrix2', level: 'O', writable: false}, // DNG
    {id: 0xc623, ifd: '0th', name: 'CameraCalibration1', level: 'O', writable: false}, // DNG
    {id: 0xc624, ifd: '0th', name: 'CameraCalibration2', level: 'O', writable: false}, // DNG
    {id: 0xc625, ifd: '0th', name: 'ReductionMatrix1', level: 'O', writable: false}, // DNG
    {id: 0xc626, ifd: '0th', name: 'ReductionMatrix2', level: 'O', writable: false}, // DNG
    {id: 0xc627, ifd: '0th', name: 'AnalogBalance', level: 'O', writable: false}, // DNG
    {id: 0xc628, ifd: '0th', name: 'AsShotNeutral', level: 'O', writable: false}, // DNG
    {id: 0xc629, ifd: '0th', name: 'AsShotWhiteXY', level: 'O', writable: false}, // DNG
    {id: 0xc62a, ifd: '0th', name: 'BaselineExposure', level: 'O', writable: false}, // DNG
    {id: 0xc62b, ifd: '0th', name: 'BaselineNoise', level: 'O', writable: false}, // DNG
    {id: 0xc62c, ifd: '0th', name: 'BaselineSharpness', level: 'O', writable: false}, // DNG
    {id: 0xc62e, ifd: '0th', name: 'LinearResponseLimit', level: 'O', writable: false}, // DNG
    {id: 0xc62f, ifd: '0th', name: 'CameraSerialNumber', level: 'O', writable: false}, // DNG
    {id: 0xc630, ifd: '0th', name: 'DNGLensInfo', level: 'O', writable: false}, // DNG
    {id: 0xc633, ifd: '0th', name: 'ShadowScale', level: 'O', writable: false}, // DNG
    {id: 0xc635, ifd: '0th', name: 'MakerNoteSafety', level: 'O', writable: false}, // DNG
    {id: 0xc65a, ifd: '0th', name: 'CalibrationIlluminant1', level: 'O', writable: false}, // DNG
    {id: 0xc65b, ifd: '0th', name: 'CalibrationIlluminant2', level: 'O', writable: false}, // DNG
    {id: 0xc65d, ifd: '0th', name: 'RawDataUniqueID', level: 'O', writable: false}, // DNG
    {id: 0xc68b, ifd: '0th', name: 'OriginalRawFileName', level: 'O', writable: false}, // DNG
    {id: 0xc68c, ifd: '0th', name: 'OriginalRawFileData', level: 'O', writable: false}, // DNG
    {id: 0xc68f, ifd: '0th', name: 'AsShotICCProfile', level: 'O', writable: false}, // DNG
    {id: 0xc690, ifd: '0th', name: 'AsShotPreProfileMatrix', level: 'O', writable: false}, // DNG
    {id: 0xc691, ifd: '0th', name: 'CurrentICCProfile', level: 'O', writable: false}, // DNG
    {id: 0xc692, ifd: '0th', name: 'CurrentPreProfileMatrix', level: 'O', writable: false}, // DNG
    {id: 0xc6bf, ifd: '0th', name: 'ColorimetricReference', level: 'O', writable: false}, // DNG
    {id: 0xc6c5, ifd: '0th', name: 'SRawType', level: 'O', writable: false}, // vendor
    {id: 0xc6d2, ifd: '0th', name: 'PanasonicTitle', level: 'O', writable: false}, // vendor
    {id: 0xc6d3, ifd: '0th', name: 'PanasonicTitle2', level: 'O', writable: false}, // vendor
    {id: 0xc6f3, ifd: '0th', name: 'CameraCalibrationSig', level: 'O', writable: false}, // DNG
    {id: 0xc6f4, ifd: '0th', name: 'ProfileCalibrationSig', level: 'O', writable: false}, // DNG
    {id: 0xc6f5, ifd: '0th', name: 'ProfileIFD', level: 'N', writable: false}, // DNG
    {id: 0xc6f6, ifd: '0th', name: 'AsShotProfileName', level: 'O', writable: false}, // DNG
    {id: 0xc6f8, ifd: '0th', name: 'ProfileName', level: 'O', writable: false}, // DNG
    {id: 0xc6f9, ifd: '0th', name: 'ProfileHueSatMapDims', level: 'O', writable: false}, // DNG
    {id: 0xc6fa, ifd: '0th', name: 'ProfileHueSatMapData1', level: 'O', writable: false}, // DNG
    {id: 0xc6fb, ifd: '0th', name: 'ProfileHueSatMapData2', level: 'O', writable: false}, // DNG
    {id: 0xc6fc, ifd: '0th', name: 'ProfileToneCurve', level: 'O', writable: false}, // DNG
    {id: 0xc6fd, ifd: '0th', name: 'ProfileEmbedPolicy', level: 'O', writable: false}, // DNG
    {id: 0xc6fe, ifd: '0th', name: 'ProfileCopyright', level: 'O', writable: false}, // DNG
    {id: 0xc714, ifd: '0th', name: 'ForwardMatrix1', level: 'O', writable: false}, // DNG
    {id: 0xc715, ifd: '0th', name: 'ForwardMatrix2', level: 'O', writable: false}, // DNG
    {id: 0xc716, ifd: '0th', name: 'PreviewApplicationName', level: 'O', writable: false}, // DNG
    {id: 0xc717, ifd: '0th', name: 'PreviewApplicationVersion', level: 'O', writable: false}, // DNG
    {id: 0xc718, ifd: '0th', name: 'PreviewSettingsName', level: 'O', writable: false}, // DNG
    {id: 0xc719, ifd: '0th', name: 'PreviewSettingsDigest', level: 'O', writable: false}, // DNG
    {id: 0xc71a, ifd: '0th', name: 'PreviewColorSpace', level: 'O', writable: false}, // DNG
    {id: 0xc71b, ifd: '0th', name: 'PreviewDateTime', level: 'O', writable: false}, // DNG
    {id: 0xc71c, ifd: '0th', name: 'RawImageDigest', level: 'O', writable: false}, // DNG
    {id: 0xc71d, ifd: '0th', name: 'OriginalRawFileDigest', level: 'O', writable: false}, // DNG
    {id: 0xc725, ifd: '0th', name: 'ProfileLookTableDims', level: 'O', writable: false}, // DNG
    {id: 0xc726, ifd: '0th', name: 'ProfileLookTableData', level: 'O', writable: false}, // DNG
    {id: 0xc763, ifd: '0th', name: 'TimeCodes', level: 'O', writable: false}, // DNG
    {id: 0xc764, ifd: '0th', name: 'FrameRate', level: 'O', writable: false}, // DNG
    {id: 0xc772, ifd: '0th', name: 'TStop', level: 'O', writable: false}, // DNG
    {id: 0xc789, ifd: '0th', name: 'ReelName', level: 'O', writable: false}, // DNG
    {id: 0xc791, ifd: '0th', name: 'OriginalDefaultFinalSize', level: 'O', writable: false}, // DNG
    {id: 0xc792, ifd: '0th', name: 'OriginalBestQualitySize', level: 'O', writable: false}, // DNG
    {id: 0xc793, ifd: '0th', name: 'OriginalDefaultCropSize', level: 'O', writable: false}, // DNG
    {id: 0xc7a1, ifd: '0th', name: 'CameraLabel', level: 'O', writable: false}, // DNG
    {id: 0xc7a3, ifd: '0th', name: 'ProfileHueSatMapEncoding', level: 'O', writable: false}, // DNG
    {id: 0xc7a4, ifd: '0th', name: 'ProfileLookTableEncoding', level: 'O', writable: false}, // DNG
    {id: 0xc7a5, ifd: '0th', name: 'BaselineExposureOffset', level: 'O', writable: false}, // DNG
    {id: 0xc7a6, ifd: '0th', name: 'DefaultBlackRender', level: 'O', writable: false}, // DNG
    {id: 0xc7a7, ifd: '0th', name: 'NewRawImageDigest', level: 'O', writable: false}, // DNG
    {id: 0xc7a8, ifd: '0th', name: 'RawToPreviewGain', level: 'O', writable: false}, // DNG

    {id: 0x829a, ifd: 'exif', name: 'ExposureTime', type: 'RATIONAL', count: 1, level: 'R'},
    {id: 0x829d, ifd: 'exif', name: 'FNumber', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x8822, ifd: 'exif', name: 'ExposureProgram', type: 'SHORT', count: 1, level: 'O'},
    {id: 0x8824, ifd: 'exif', name: 'SpectralSensitivity', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0x8827, ifd: 'exif', name: 'ISOSpeedRatings', type: 'SHORT', count: 'any', level: 'O'},
    {id: 0x8828, ifd: 'exif', name: 'OECF', type: 'UNDEFINED', count: 'any', level: 'O'},
    {id: 0x882a, ifd: 'exif', name: 'TimeZoneOffset', level: 'O', writable: false}, // TIFF/EP
    {id: 0x882b, ifd: 'exif', name: 'SelfTimerMode', level: 'O', writable: false}, // TIFF/EP
    {id: 0x8830, ifd: 'exif', name: 'SensitivityType', type: 'SHORT', count: 1, level: 'O'},
    {id: 0x8831, ifd: 'exif', name: 'StandardOutputSensitivity', type: 'LONG', count: 1, level: 'O'},
    {id: 0x8832, ifd: 'exif', name: 'RecommendedExposureIndex', type: 'LONG', count: 1, level: 'O'},
    {id: 0x8833, ifd: 'exif', name: 'ISOSpeed', type: 'LONG', count: 1, level: 'O'},
    {id: 0x8834, ifd: 'exif', name: 'ISOSpeedLatitudeyyy', type: 'LONG', count: 1, level: 'O'},
    {id: 0x8835, ifd: 'exif', name: 'ISOSpeedLatitudezzz', type: 'LONG', count: 1, level: 'O'},
    {id: 0x9000, ifd: 'exif', name: 'ExifVersion', type: 'UNDEFINED', count: 4, level: 'M', default: [0x30, 0x32, 0x33, 0x32]},
    {id: 0x9003, ifd: 'exif', name: 'DateTimeOriginal', type: 'ASCII', count: 20, level: 'O'},
    {id: 0x9004, ifd: 'exif', name: 'DateTimeDigitized', type: 'ASCII', count: 20, level: 'O'},
    {id: 0x9009, ifd: 'exif', name: 'GooglePlusUploadCode', level: 'O', writable: false}, // vendor
    {id: 0x9010, ifd: 'exif', name: 'OffsetTime', type: 'ASCII', count: 7, level: 'O'},
    {id: 0x9011, ifd: 'exif', name: 'OffsetTimeOriginal', type: 'ASCII', count: 7, level: 'O'},
    {id: 0x9012, ifd: 'exif', name: 'OffsetTimeDigitized', type: 'ASCII', count: 7, level: 'O'},
    {id: 0x9101, ifd: 'exif', name: 'ComponentsConfiguration', type: 'UNDEFINED', count: 4, level: 'M', default: [1, 2, 3, 0]},
    {id: 0x9102, ifd: 'exif', name: 'CompressedBitsPerPixel', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x9201, ifd: 'exif', name: 'ShutterSpeedValue', type: 'SRATIONAL', count: 1, level: 'O'},
    {id: 0x9202, ifd: 'exif', name: 'ApertureValue', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x9203, ifd: 'exif', name: 'BrightnessValue', type: 'SRATIONAL', count: 1, level: 'O'},
    {id: 0x9204, ifd: 'exif', name: 'ExposureBiasValue', type: 'SRATIONAL', count: 1, level: 'O'},
    {id: 0x9205, ifd: 'exif', name: 'MaxApertureValue', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x9206, ifd: 'exif', name: 'SubjectDistance', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x9207, ifd: 'exif', name: 'MeteringMode', type: 'SHORT', count: 1, level: 'O'},
    {id: 0x9208, ifd: 'exif', name: 'LightSource', type: 'SHORT', count: 1, level: 'O'},
    {id: 0x9209, ifd: 'exif', name: 'Flash', type: 'SHORT', count: 1, level: 'R'},
    {id: 0x920a, ifd: 'exif', name: 'FocalLength', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x9211, ifd: 'exif', name: 'ImageNumber', level: 'O', writable: false}, // TIFF/EP
    {id: 0x9212, ifd: 'exif', name: 'SecurityClassification', level: 'O', writable: false}, // TIFF/EP
    {id: 0x9213, ifd: 'exif', name: 'ImageHistory', level: 'O', writable: false}, // TIFF/EP
    {id: 0x9214, ifd: 'exif', name: 'SubjectArea', type: 'SHORT', count: 'any', level: 'O'}, // DC-008 count: 2 or 3 or 4
    {id: 0x927c, ifd: 'exif', name: 'MakerNote', type: 'UNDEFINED', count: 'any', level: 'O'},
    {id: 0x9286, ifd: 'exif', name: 'UserComment', type: 'UNDEFINED', count: 'any', level: 'O'},
    {id: 0x9290, ifd: 'exif', name: 'SubSecTime', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0x9291, ifd: 'exif', name: 'SubSecTimeOriginal', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0x9292, ifd: 'exif', name: 'SubSecTimeDigitized', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0x935c, ifd: 'exif', name: 'ImageSourceData', level: 'O', writable: false}, // Photoshop
    {id: 0x9400, ifd: 'exif', name: 'AmbientTemperature', type: 'SRATIONAL', count: 1, level: 'O'},
    {id: 0x9401, ifd: 'exif', name: 'Humidity', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x9402, ifd: 'exif', name: 'Pressure', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x9403, ifd: 'exif', name: 'WaterDepth', type: 'SRATIONAL', count: 1, level: 'O'},
    {id: 0x9404, ifd: 'exif', name: 'Acceleration', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x9405, ifd: 'exif', name: 'CameraElevationAngle', type: 'SRATIONAL', count: 1, level: 'O'},
    {id: 0xa000, ifd: 'exif', name: 'FlashpixVersion', type: 'UNDEFINED', count: 4, level: 'M', default: [0x30, 0x31, 0x30, 0x30]},
    {id: 0xa001, ifd: 'exif', name: 'ColorSpace', type: 'SHORT', count: 1, level: 'M', default: 0xffff},
    {id: 0xa002, ifd: 'exif', name: 'PixelXDimension', type: ['SHORT', 'LONG'], count: 1, level: 'M', default: DEFAULT_FROM_SOF},
    {id: 0xa003, ifd: 'exif', name: 'PixelYDimension', type: ['SHORT', 'LONG'], count: 1, level: 'M', default: DEFAULT_FROM_SOF},
    {id: 0xa004, ifd: 'exif', name: 'RelatedSoundFile', type: 'ASCII', count: 13, level: 'O'},
    {id: 0xa005, ifd: 'exif', name: 'Interoperability IFD Pointer', type: 'LONG', count: 1, level: 'O'},
    {id: 0xa20b, ifd: 'exif', name: 'FlashEnergy', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0xa20c, ifd: 'exif', name: 'SpatialFrequencyResponse', type: 'UNDEFINED', count: 'any', level: 'O'},
    {id: 0xa20e, ifd: 'exif', name: 'FocalPlaneXResolution', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0xa20f, ifd: 'exif', name: 'FocalPlaneYResolution', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0xa210, ifd: 'exif', name: 'FocalPlaneResolutionUnit', type: 'SHORT', count: 1, level: 'O'},
    {id: 0xa214, ifd: 'exif', name: 'SubjectLocation', type: 'SHORT', count: 2, level: 'O'},
    {id: 0xa215, ifd: 'exif', name: 'ExposureIndex', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0xa217, ifd: 'exif', name: 'SensingMethod', type: 'SHORT', count: 1, level: 'O'},
    {id: 0xa300, ifd: 'exif', name: 'FileSource', type: 'UNDEFINED', count: 1, level: 'O'},
    {id: 0xa301, ifd: 'exif', name: 'SceneType', type: 'UNDEFINED', count: 1, level: 'O'},
    {id: 0xa302, ifd: 'exif', name: 'CFAPattern', type: 'UNDEFINED', count: 'any', level: 'O'},
    {id: 0xa401, ifd: 'exif', name: 'CustomRendered', type: 'SHORT', count: 1, level: 'O'},
    {id: 0xa402, ifd: 'exif', name: 'ExposureMode', type: 'SHORT', count: 1, level: 'R'},
    {id: 0xa403, ifd: 'exif', name: 'WhiteBalance', type: 'SHORT', count: 1, level: 'R'},
    {id: 0xa404, ifd: 'exif', name: 'DigitalZoomRatio', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0xa405, ifd: 'exif', name: 'FocalLengthIn35mmFilm', type: 'SHORT', count: 1, level: 'O'},
    {id: 0xa406, ifd: 'exif', name: 'SceneCaptureType', type: 'SHORT', count: 1, level: 'R'},
    {id: 0xa407, ifd: 'exif', name: 'GainControl', type: 'SHORT', count: 1, level: 'O'}, // Table 8 says RATIONAL, the definition SHORT
    {id: 0xa408, ifd: 'exif', name: 'Contrast', type: 'SHORT', count: 1, level: 'O'},
    {id: 0xa409, ifd: 'exif', name: 'Saturation', type: 'SHORT', count: 1, level: 'O'},
    {id: 0xa40a, ifd: 'exif', name: 'Sharpness', type: 'SHORT', count: 1, level: 'O'},
    {id: 0xa40b, ifd: 'exif', name: 'DeviceSettingDescription', type: 'UNDEFINED', count: 'any', level: 'O'},
    {id: 0xa40c, ifd: 'exif', name: 'SubjectDistanceRange', type: 'SHORT', count: 1, level: 'O'},
    {id: 0xa420, ifd: 'exif', name: 'ImageUniqueID', type: 'ASCII', count: 33, level: 'O'},
    {id: 0xa430, ifd: 'exif', name: 'CameraOwnerName', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0xa431, ifd: 'exif', name: 'BodySerialNumber', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0xa432, ifd: 'exif', name: 'LensSpecification', type: 'RATIONAL', count: 4, level: 'O'},
    {id: 0xa433, ifd: 'exif', name: 'LensMake', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0xa434, ifd: 'exif', name: 'LensModel', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0xa435, ifd: 'exif', name: 'LensSerialNumber', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0xa460, ifd: 'exif', name: 'CompositeImage', type: 'SHORT', count: 1, level: 'R'},
    {id: 0xa461, ifd: 'exif', name: 'SourceImageNumberOfCompositeImage', type: 'SHORT', count: 2, level: 'O'},
    {id: 0xa462, ifd: 'exif', name: 'SourceExposureTimesOfCompositeImage', type: 'UNDEFINED', count: 'any', level: 'O'},
    {id: 0xa500, ifd: 'exif', name: 'Gamma', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0xea1c, ifd: 'exif', name: 'Padding', level: 'O', writable: false}, // Microsoft
    {id: 0xea1d, ifd: 'exif', name: 'OffsetSchema', level: 'O', writable: false}, // Microsoft
    {id: 0xfde8, ifd: 'exif', name: 'OwnerName', level: 'O', writable: false}, // Adobe
    {id: 0xfde9, ifd: 'exif', name: 'SerialNumber', level: 'O', writable: false}, // Adobe
    {id: 0xfdea, ifd: 'exif', name: 'Lens', level: 'O', writable: false}, // Adobe
    {id: 0xfe4c, ifd: 'exif', name: 'RawFile', level: 'O', writable: false}, // Adobe
    {id: 0xfe4d, ifd: 'exif', name: 'Converter', level: 'O', writable: false}, // Adobe
    {id: 0xfe4e, ifd: 'exif', name: 'WhiteBalance', level: 'O', writable: false}, // Adobe
    {id: 0xfe51, ifd: 'exif', name: 'Exposure', level: 'O', writable: false}, // Adobe
    {id: 0xfe52, ifd: 'exif', name: 'Shadows', level: 'O', writable: false}, // Adobe
    {id: 0xfe53, ifd: 'exif', name: 'Brightness', level: 'O', writable: false}, // Adobe
    {id: 0xfe54, ifd: 'exif', name: 'Contrast', level: 'O', writable: false}, // Adobe
    {id: 0xfe55, ifd: 'exif', name: 'Saturation', level: 'O', writable: false}, // Adobe
    {id: 0xfe56, ifd: 'exif', name: 'Sharpness', level: 'O', writable: false}, // Adobe
    {id: 0xfe57, ifd: 'exif', name: 'Smoothness', level: 'O', writable: false}, // Adobe
    {id: 0xfe58, ifd: 'exif', name: 'MoireFilter', level: 'O', writable: false}, // Adobe

    {id: 0x0000, ifd: 'gps', name: 'GPSVersionID', type: 'BYTE', count: 4, level: 'M', default: [2, 3, 0, 0]}, // Table 19 says O; §4.6.6 makes it mandatory in a GPS IFD
    {id: 0x0001, ifd: 'gps', name: 'GPSLatitudeRef', type: 'ASCII', count: 2, level: 'O'},
    {id: 0x0002, ifd: 'gps', name: 'GPSLatitude', type: 'RATIONAL', count: 3, level: 'O'},
    {id: 0x0003, ifd: 'gps', name: 'GPSLongitudeRef', type: 'ASCII', count: 2, level: 'O'},
    {id: 0x0004, ifd: 'gps', name: 'GPSLongitude', type: 'RATIONAL', count: 3, level: 'O'},
    {id: 0x0005, ifd: 'gps', name: 'GPSAltitudeRef', type: 'BYTE', count: 1, level: 'O'},
    {id: 0x0006, ifd: 'gps', name: 'GPSAltitude', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x0007, ifd: 'gps', name: 'GPSTimeStamp', type: 'RATIONAL', count: 3, level: 'O'},
    {id: 0x0008, ifd: 'gps', name: 'GPSSatellites', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0x0009, ifd: 'gps', name: 'GPSStatus', type: 'ASCII', count: 2, level: 'O'},
    {id: 0x000a, ifd: 'gps', name: 'GPSMeasureMode', type: 'ASCII', count: 2, level: 'O'},
    {id: 0x000b, ifd: 'gps', name: 'GPSDOP', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x000c, ifd: 'gps', name: 'GPSSpeedRef', type: 'ASCII', count: 2, level: 'O'},
    {id: 0x000d, ifd: 'gps', name: 'GPSSpeed', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x000e, ifd: 'gps', name: 'GPSTrackRef', type: 'ASCII', count: 2, level: 'O'},
    {id: 0x000f, ifd: 'gps', name: 'GPSTrack', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x0010, ifd: 'gps', name: 'GPSImgDirectionRef', type: 'ASCII', count: 2, level: 'O'},
    {id: 0x0011, ifd: 'gps', name: 'GPSImgDirection', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x0012, ifd: 'gps', name: 'GPSMapDatum', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0x0013, ifd: 'gps', name: 'GPSDestLatitudeRef', type: 'ASCII', count: 2, level: 'O'},
    {id: 0x0014, ifd: 'gps', name: 'GPSDestLatitude', type: 'RATIONAL', count: 3, level: 'O'},
    {id: 0x0015, ifd: 'gps', name: 'GPSDestLongitudeRef', type: 'ASCII', count: 2, level: 'O'},
    {id: 0x0016, ifd: 'gps', name: 'GPSDestLongitude', type: 'RATIONAL', count: 3, level: 'O'},
    {id: 0x0017, ifd: 'gps', name: 'GPSDestBearingRef', type: 'ASCII', count: 2, level: 'O'},
    {id: 0x0018, ifd: 'gps', name: 'GPSDestBearing', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x0019, ifd: 'gps', name: 'GPSDestDistanceRef', type: 'ASCII', count: 2, level: 'O'},
    {id: 0x001a, ifd: 'gps', name: 'GPSDestDistance', type: 'RATIONAL', count: 1, level: 'O'},
    {id: 0x001b, ifd: 'gps', name: 'GPSProcessingMethod', type: 'UNDEFINED', count: 'any', level: 'O'},
    {id: 0x001c, ifd: 'gps', name: 'GPSAreaInformation', type: 'UNDEFINED', count: 'any', level: 'O'},
    {id: 0x001d, ifd: 'gps', name: 'GPSDateStamp', type: 'ASCII', count: 11, level: 'O'},
    {id: 0x001e, ifd: 'gps', name: 'GPSDifferential', type: 'SHORT', count: 1, level: 'O'},
    {id: 0x001f, ifd: 'gps', name: 'GPSHPositioningError', type: 'RATIONAL', count: 1, level: 'O'},

    {id: 0x0001, ifd: 'interoperability', name: 'InteroperabilityIndex', type: 'ASCII', count: 'any', level: 'O'},
    {id: 0x0002, ifd: 'interoperability', name: 'InteroperabilityVersion', level: 'O', writable: false}, // Exif R98
    {id: 0x1000, ifd: 'interoperability', name: 'RelatedImageFileFormat', level: 'O', writable: false}, // Exif R98
    {id: 0x1001, ifd: 'interoperability', name: 'RelatedImageWidth', level: 'O', writable: false}, // Exif R98
    {id: 0x1002, ifd: 'interoperability', name: 'RelatedImageHeight', level: 'O', writable: false} // Exif R98
];

export default {
    tags,
    DEFAULT_FROM_SOF,
    DEFAULT_COMPUTED
};
