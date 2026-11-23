/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import TagNamesCommon from './tag-names-common.js';
import {
    getSubfileTypeDescription,
    getOldSubfileTypeDescription,
    getThresholdingDescription,
    getFillOrderDescription,
    getOrientationDescription,
    getXPositionDescription,
    getYPositionDescription,
    getGrayResponseUnitDescription,
    getWhitePointDescription,
    getPrimaryChromaticitiesDescription,
    getInkSetDescription,
    getExtraSamplesDescription,
    getSampleFormatDescription,
    getYCbCrCoefficientsDescription,
    getYCbCrPositioningDescription,
    getReferenceBlackWhiteDescription,
    getCopyrightDescription,
    decodeXPValue,
    getDngVersionDescription,
    getMakerNoteSafetyDescription,
    getProfileEmbedPolicyDescription,
    getPreviewColorSpaceDescription,
    getProfileHueSatMapEncodingDescription,
    getProfileLookTableEncodingDescription,
    getDefaultBlackRenderDescription
} from './tag-names-0th-ifd-descriptions.js';

export default {
    0x000b: 'ProcessingSoftware',
    0x00fe: {
        name: 'SubfileType',
        description: getSubfileTypeDescription
    },
    0x00ff: {
        name: 'OldSubfileType',
        description: getOldSubfileTypeDescription
    },
    0x0100: 'ImageWidth',
    0x0101: 'ImageLength',
    0x0102: 'BitsPerSample',
    0x0103: 'Compression',
    0x0106: 'PhotometricInterpretation',
    0x0107: {
        name: 'Thresholding',
        description: getThresholdingDescription
    },
    0x0108: 'CellWidth',
    0x0109: 'CellLength',
    0x010a: {
        name: 'FillOrder',
        description: getFillOrderDescription
    },
    0x010d: 'DocumentName',
    0x010e: 'ImageDescription',
    0x010f: 'Make',
    0x0110: 'Model',
    0x0111: 'StripOffsets',
    0x0112: {
        name: 'Orientation',
        description: getOrientationDescription
    },
    0x0115: 'SamplesPerPixel',
    0x0116: 'RowsPerStrip',
    0x0117: 'StripByteCounts',
    0x0118: 'MinSampleValue',
    0x0119: 'MaxSampleValue',
    0x011a: {
        'name': 'XResolution',
        'description': TagNamesCommon.XResolution
    },
    0x011b: {
        'name': 'YResolution',
        'description': TagNamesCommon.YResolution
    },
    0x011c: 'PlanarConfiguration',
    0x011d: 'PageName',
    0x011e: {
        'name': 'XPosition',
        'description': getXPositionDescription
    },
    0x011f: {
        'name': 'YPosition',
        'description': getYPositionDescription
    },
    0x0122: {
        name: 'GrayResponseUnit',
        description: getGrayResponseUnitDescription
    },
    0x0128: {
        name: 'ResolutionUnit',
        description: TagNamesCommon.ResolutionUnit
    },
    0x0129: 'PageNumber',
    0x012d: 'TransferFunction',
    0x0131: 'Software',
    0x0132: 'DateTime',
    0x013b: 'Artist',
    0x013c: 'HostComputer',
    0x013d: 'Predictor',
    0x013e: {
        'name': 'WhitePoint',
        'description': getWhitePointDescription
    },
    0x013f: {
        'name': 'PrimaryChromaticities',
        'description': getPrimaryChromaticitiesDescription
    },
    0x0141: 'HalftoneHints',
    0x0142: 'TileWidth',
    0x0143: 'TileLength',
    0x014a: 'A100DataOffset',
    0x014c: {
        name: 'InkSet',
        description: getInkSetDescription
    },
    0x0151: 'TargetPrinter',
    0x0152: {
        name: 'ExtraSamples',
        description: getExtraSamplesDescription
    },
    0x0153: {
        name: 'SampleFormat',
        description: getSampleFormatDescription
    },
    0x0201: 'JPEGInterchangeFormat',
    0x0202: 'JPEGInterchangeFormatLength',
    0x0211: {
        'name': 'YCbCrCoefficients',
        'description': getYCbCrCoefficientsDescription
    },
    0x0212: 'YCbCrSubSampling',
    0x0213: {
        name: 'YCbCrPositioning',
        description: getYCbCrPositioningDescription
    },
    0x0214: {
        'name': 'ReferenceBlackWhite',
        'description': getReferenceBlackWhiteDescription
    },
    0x02bc: 'ApplicationNotes',
    0x4746: 'Rating',
    0x4749: 'RatingPercent',
    0x8298: {
        name: 'Copyright',
        description: getCopyrightDescription
    },
    0x830e: 'PixelScale',
    0x83bb: 'IPTC-NAA',
    0x8480: 'IntergraphMatrix',
    0x8482: 'ModelTiePoint',
    0x8546: 'SEMInfo',
    0x85d8: 'ModelTransform',
    0x8649: 'PhotoshopSettings',
    0x8769: 'Exif IFD Pointer',
    0x8773: 'ICC_Profile',
    0x87af: 'GeoTiffDirectory',
    0x87b0: 'GeoTiffDoubleParams',
    0x87b1: 'GeoTiffAsciiParams',
    0x8825: 'GPS Info IFD Pointer',
    0x9c9b: {
        name: 'XPTitle',
        description: decodeXPValue,
    },
    0x9c9c: {
        name: 'XPComment',
        description: decodeXPValue
    },
    0x9c9d: {
        name: 'XPAuthor',
        description: decodeXPValue,
    },
    0x9c9e: {
        name: 'XPKeywords',
        description: decodeXPValue,
    },
    0x9c9f: {
        name: 'XPSubject',
        description: decodeXPValue,
    },
    0xa480: 'GDALMetadata',
    0xa481: 'GDALNoData',
    0xc4a5: 'PrintIM',
    0xc612: {
        name: 'DNGVersion',
        description: getDngVersionDescription
    },
    0xc613: {
        name: 'DNGBackwardVersion',
        description: getDngVersionDescription
    },
    0xc614: 'UniqueCameraModel',
    0xc615: 'LocalizedCameraModel',
    0xc621: 'ColorMatrix1',
    0xc622: 'ColorMatrix2',
    0xc623: 'CameraCalibration1',
    0xc624: 'CameraCalibration2',
    0xc625: 'ReductionMatrix1',
    0xc626: 'ReductionMatrix2',
    0xc627: 'AnalogBalance',
    0xc628: 'AsShotNeutral',
    0xc629: 'AsShotWhiteXY',
    0xc62a: 'BaselineExposure',
    0xc62b: 'BaselineNoise',
    0xc62c: 'BaselineSharpness',
    0xc62e: 'LinearResponseLimit',
    0xc62f: 'CameraSerialNumber',
    0xc630: 'DNGLensInfo',
    0xc633: 'ShadowScale',
    0xc635: {
        name: 'MakerNoteSafety',
        description: getMakerNoteSafetyDescription
    },
    0xc65a: {
        name: 'CalibrationIlluminant1',
        description: TagNamesCommon['LightSource']
    },
    0xc65b: {
        name: 'CalibrationIlluminant2',
        description: TagNamesCommon['LightSource']
    },
    0xc65d: 'RawDataUniqueID',
    0xc68b: 'OriginalRawFileName',
    0xc68c: 'OriginalRawFileData',
    0xc68f: 'AsShotICCProfile',
    0xc690: 'AsShotPreProfileMatrix',
    0xc691: 'CurrentICCProfile',
    0xc692: 'CurrentPreProfileMatrix',
    0xc6bf: 'ColorimetricReference',
    0xc6c5: 'SRawType',
    0xc6d2: 'PanasonicTitle',
    0xc6d3: 'PanasonicTitle2',
    0xc6f3: 'CameraCalibrationSig',
    0xc6f4: 'ProfileCalibrationSig',
    0xc6f5: 'ProfileIFD',
    0xc6f6: 'AsShotProfileName',
    0xc6f8: 'ProfileName',
    0xc6f9: 'ProfileHueSatMapDims',
    0xc6fa: 'ProfileHueSatMapData1',
    0xc6fb: 'ProfileHueSatMapData2',
    0xc6fc: 'ProfileToneCurve',
    0xc6fd: {
        name: 'ProfileEmbedPolicy',
        description: getProfileEmbedPolicyDescription
    },
    0xc6fe: 'ProfileCopyright',
    0xc714: 'ForwardMatrix1',
    0xc715: 'ForwardMatrix2',
    0xc716: 'PreviewApplicationName',
    0xc717: 'PreviewApplicationVersion',
    0xc718: 'PreviewSettingsName',
    0xc719: 'PreviewSettingsDigest',
    0xc71a: {
        name: 'PreviewColorSpace',
        description: getPreviewColorSpaceDescription
    },
    0xc71b: 'PreviewDateTime',
    0xc71c: 'RawImageDigest',
    0xc71d: 'OriginalRawFileDigest',
    0xc725: 'ProfileLookTableDims',
    0xc726: 'ProfileLookTableData',
    0xc763: 'TimeCodes',
    0xc764: 'FrameRate',
    0xc772: 'TStop',
    0xc789: 'ReelName',
    0xc791: 'OriginalDefaultFinalSize',
    0xc792: 'OriginalBestQualitySize',
    0xc793: 'OriginalDefaultCropSize',
    0xc7a1: 'CameraLabel',
    0xc7a3: {
        name: 'ProfileHueSatMapEncoding',
        description: getProfileHueSatMapEncodingDescription
    },
    0xc7a4: {
        name: 'ProfileLookTableEncoding',
        description: getProfileLookTableEncodingDescription
    },
    0xc7a5: 'BaselineExposureOffset',
    0xc7a6: {
        name: 'DefaultBlackRender',
        description: getDefaultBlackRenderDescription
    },
    0xc7a7: 'NewRawImageDigest',
    0xc7a8: 'RawToPreviewGain'
};
