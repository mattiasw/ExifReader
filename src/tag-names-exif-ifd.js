/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getEncodedString, getVersionString} from './tag-names-utils.js';
import TagNamesCommon from './tag-names-common.js';
import {
    getOECFDescription,
    getSensitivityTypeDescription,
    getMaxApertureValueDescription,
    getSubjectDistanceDescription,
    getFlashDescription,
    getSecurityClassificationDescription,
    getSubjectAreaDescription,
    getMakerNoteDescription,
    getAmbientTemperatureDescription,
    getHumidityDescription,
    getPressureDescription,
    getWaterDepthDescription,
    getAccelerationDescription,
    getCameraElevationAngleDescription,
    getSpatialFrequencyResponseDescription,
    getSubjectLocationDescription,
    getSensingMethodDescription,
    getFileSourceDescription,
    getSceneTypeDescription,
    getCFAPatternDescription,
    getDigitalZoomRatioDescription,
    getGainControlDescription,
    getDeviceSettingDescriptionDescription,
    getSubjectDistanceRangeDescription,
    getLensSpecificationDescription,
    getCompositeImageDescription
} from './tag-names-exif-ifd-descriptions.js';

export default {
    0x829a: {
        'name': 'ExposureTime',
        'description': TagNamesCommon.ExposureTime
    },
    0x829d: {
        'name': 'FNumber',
        'description': TagNamesCommon.FNumber
    },
    0x8822: {
        'name': 'ExposureProgram',
        'description': TagNamesCommon.ExposureProgram
    },
    0x8824: 'SpectralSensitivity',
    0x8827: 'ISOSpeedRatings',
    0x8828: {
        'name': 'OECF',
        'description': getOECFDescription
    },
    0x882a: 'TimeZoneOffset',
    0x882b: 'SelfTimerMode',
    0x8830: {
        name: 'SensitivityType',
        description: getSensitivityTypeDescription
    },
    0x8831: 'StandardOutputSensitivity',
    0x8832: 'RecommendedExposureIndex',
    0x8833: 'ISOSpeed',
    0x8834: 'ISOSpeedLatitudeyyy',
    0x8835: 'ISOSpeedLatitudezzz',
    0x9000: {
        'name': 'ExifVersion',
        'description': getVersionString
    },
    0x9003: 'DateTimeOriginal',
    0x9004: 'DateTimeDigitized',
    0x9009: 'GooglePlusUploadCode',
    0x9010: 'OffsetTime',
    0x9011: 'OffsetTimeOriginal',
    0x9012: 'OffsetTimeDigitized',
    0x9101: {
        'name': 'ComponentsConfiguration',
        'description': TagNamesCommon.ComponentsConfiguration
    },
    0x9102: 'CompressedBitsPerPixel',
    0x9201: {
        'name': 'ShutterSpeedValue',
        'description': TagNamesCommon.ShutterSpeedValue
    },
    0x9202: {
        'name': 'ApertureValue',
        'description': TagNamesCommon.ApertureValue
    },
    0x9203: 'BrightnessValue',
    0x9204: 'ExposureBiasValue',
    0x9205: {
        'name': 'MaxApertureValue',
        'description': getMaxApertureValueDescription
    },
    0x9206: {
        'name': 'SubjectDistance',
        'description': getSubjectDistanceDescription
    },
    0x9207: {
        'name': 'MeteringMode',
        'description': TagNamesCommon.MeteringMode
    },
    0x9208: {
        'name': 'LightSource',
        description: TagNamesCommon.LightSource
    },
    0x9209: {
        'name': 'Flash',
        'description': getFlashDescription
    },
    0x920a: {
        'name': 'FocalLength',
        'description': TagNamesCommon.FocalLength
    },
    0x9211: 'ImageNumber',
    0x9212: {
        name: 'SecurityClassification',
        description: getSecurityClassificationDescription
    },
    0x9213: 'ImageHistory',
    0x9214: {
        'name': 'SubjectArea',
        'description': getSubjectAreaDescription
    },
    0x927c: {
        'name': 'MakerNote',
        'description': getMakerNoteDescription
    },
    0x9286: {
        'name': 'UserComment',
        'description': getEncodedString
    },
    0x9290: 'SubSecTime',
    0x9291: 'SubSecTimeOriginal',
    0x9292: 'SubSecTimeDigitized',
    0x935c: 'ImageSourceData',
    0x9400: {
        'name': 'AmbientTemperature',
        'description': getAmbientTemperatureDescription
    },
    0x9401: {
        'name': 'Humidity',
        'description': getHumidityDescription
    },
    0x9402: {
        'name': 'Pressure',
        'description': getPressureDescription
    },
    0x9403: {
        'name': 'WaterDepth',
        'description': getWaterDepthDescription
    },
    0x9404: {
        'name': 'Acceleration',
        'description': getAccelerationDescription
    },
    0x9405: {
        'name': 'CameraElevationAngle',
        'description': getCameraElevationAngleDescription
    },
    0xa000: {
        'name': 'FlashpixVersion',
        'description': getVersionString
    },
    0xa001: {
        'name': 'ColorSpace',
        'description': TagNamesCommon.ColorSpace
    },
    0xa002: 'PixelXDimension',
    0xa003: 'PixelYDimension',
    0xa004: 'RelatedSoundFile',
    0xa005: 'Interoperability IFD Pointer',
    0xa20b: 'FlashEnergy',
    0xa20c: {
        'name': 'SpatialFrequencyResponse',
        'description': getSpatialFrequencyResponseDescription
    },
    0xa20e: 'FocalPlaneXResolution',
    0xa20f: 'FocalPlaneYResolution',
    0xa210: {
        'name': 'FocalPlaneResolutionUnit',
        'description': TagNamesCommon.FocalPlaneResolutionUnit
    },
    0xa214: {
        'name': 'SubjectLocation',
        'description': getSubjectLocationDescription
    },
    0xa215: 'ExposureIndex',
    0xa217: {
        'name': 'SensingMethod',
        'description': getSensingMethodDescription
    },
    0xa300: {
        'name': 'FileSource',
        'description': getFileSourceDescription
    },
    0xa301: {
        'name': 'SceneType',
        'description': getSceneTypeDescription
    },
    0xa302: {
        'name': 'CFAPattern',
        'description': getCFAPatternDescription
    },
    0xa401: {
        'name': 'CustomRendered',
        'description': TagNamesCommon.CustomRendered
    },
    0xa402: {
        'name': 'ExposureMode',
        'description': TagNamesCommon.ExposureMode
    },
    0xa403: {
        'name': 'WhiteBalance',
        'description': TagNamesCommon.WhiteBalance
    },
    0xa404: {
        'name': 'DigitalZoomRatio',
        'description': getDigitalZoomRatioDescription
    },
    0xa405: {
        'name': 'FocalLengthIn35mmFilm', // Sometimes called FocalLengthIn35mmFormat.
        'description': TagNamesCommon.FocalLengthIn35mmFilm
    },
    0xa406: {
        'name': 'SceneCaptureType',
        'description': TagNamesCommon.SceneCaptureType
    },
    0xa407: {
        'name': 'GainControl',
        'description': getGainControlDescription
    },
    0xa408: {
        'name': 'Contrast',
        'description': TagNamesCommon.Contrast
    },
    0xa409: {
        'name': 'Saturation',
        'description': TagNamesCommon.Saturation
    },
    0xa40a: {
        'name': 'Sharpness',
        'description': TagNamesCommon.Sharpness
    },
    0xa40b: {
        'name': 'DeviceSettingDescription',
        'description': getDeviceSettingDescriptionDescription
    },
    0xa40c: {
        'name': 'SubjectDistanceRange',
        'description': getSubjectDistanceRangeDescription
    },
    0xa420: 'ImageUniqueID',
    0xa430: 'CameraOwnerName',
    0xa431: 'BodySerialNumber',
    0xa432: {
        'name': 'LensSpecification',
        'description': getLensSpecificationDescription
    },
    0xa433: 'LensMake',
    0xa434: 'LensModel',
    0xa435: 'LensSerialNumber',
    0xa460: {
        name: 'CompositeImage',
        description: getCompositeImageDescription
    },
    0xa461: 'SourceImageNumberOfCompositeImage',
    0xa462: 'SourceExposureTimesOfCompositeImage',
    0xa500: 'Gamma',
    0xea1c: 'Padding',
    0xea1d: 'OffsetSchema',
    0xfde8: 'OwnerName',
    0xfde9: 'SerialNumber',
    0xfdea: 'Lens',
    0xfe4c: 'RawFile',
    0xfe4d: 'Converter',
    0xfe4e: 'WhiteBalance',
    0xfe51: 'Exposure',
    0xfe52: 'Shadows',
    0xfe53: 'Brightness',
    0xfe54: 'Contrast',
    0xfe55: 'Saturation',
    0xfe56: 'Sharpness',
    0xfe57: 'Smoothness',
    0xfe58: 'MoireFilter'
};
