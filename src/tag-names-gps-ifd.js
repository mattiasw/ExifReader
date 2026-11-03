/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getEncodedString, getCalculatedGpsValue} from './tag-names-utils.js';
import {
    getGPSVersionIDDescription,
    getGPSLatitudeRefDescription,
    getGPSLongitudeRefDescription,
    getGPSAltitudeRefDescription,
    getGPSAltitudeDescription,
    getGPSTimeStampDescription,
    getGPSStatusDescription,
    getGPSMeasureModeDescription,
    getGPSSpeedRefDescription,
    getGPSTrackRefDescription,
    getGPSImgDirectionRefDescription,
    getGPSDestLatitudeRefDescription,
    getGPSDestLatitudeDescription,
    getGPSDestLongitudeRefDescription,
    getGPSDestLongitudeDescription,
    getGPSDestBearingRefDescription,
    getGPSDestDistanceRefDescription,
    getGPSDifferentialDescription
} from './tag-names-gps-ifd-descriptions.js';

export default {
    0x0000: {
        'name': 'GPSVersionID',
        'description': getGPSVersionIDDescription
    },
    0x0001: {
        'name': 'GPSLatitudeRef',
        'description': getGPSLatitudeRefDescription
    },
    0x0002: {
        'name': 'GPSLatitude',
        'description': getCalculatedGpsValue
    },
    0x0003: {
        'name': 'GPSLongitudeRef',
        'description': getGPSLongitudeRefDescription
    },
    0x0004: {
        'name': 'GPSLongitude',
        'description': getCalculatedGpsValue
    },
    0x0005: {
        'name': 'GPSAltitudeRef',
        'description': getGPSAltitudeRefDescription
    },
    0x0006: {
        'name': 'GPSAltitude',
        'description': getGPSAltitudeDescription
    },
    0x0007: {
        'name': 'GPSTimeStamp',
        'description': getGPSTimeStampDescription
    },
    0x0008: 'GPSSatellites',
    0x0009: {
        'name': 'GPSStatus',
        'description': getGPSStatusDescription
    },
    0x000a: {
        'name': 'GPSMeasureMode',
        'description': getGPSMeasureModeDescription
    },
    0x000b: 'GPSDOP',
    0x000c: {
        'name': 'GPSSpeedRef',
        'description': getGPSSpeedRefDescription
    },
    0x000d: 'GPSSpeed',
    0x000e: {
        'name': 'GPSTrackRef',
        'description': getGPSTrackRefDescription
    },
    0x000f: 'GPSTrack',
    0x0010: {
        'name': 'GPSImgDirectionRef',
        'description': getGPSImgDirectionRefDescription
    },
    0x0011: 'GPSImgDirection',
    0x0012: 'GPSMapDatum',
    0x0013: {
        'name': 'GPSDestLatitudeRef',
        'description': getGPSDestLatitudeRefDescription
    },
    0x0014: {
        'name': 'GPSDestLatitude',
        'description': getGPSDestLatitudeDescription
    },
    0x0015: {
        'name': 'GPSDestLongitudeRef',
        'description': getGPSDestLongitudeRefDescription
    },
    0x0016: {
        'name': 'GPSDestLongitude',
        'description': getGPSDestLongitudeDescription
    },
    0x0017: {
        'name': 'GPSDestBearingRef',
        'description': getGPSDestBearingRefDescription
    },
    0x0018: 'GPSDestBearing',
    0x0019: {
        'name': 'GPSDestDistanceRef',
        'description': getGPSDestDistanceRefDescription
    },
    0x001a: 'GPSDestDistance',
    0x001b: {
        'name': 'GPSProcessingMethod',
        'description': getEncodedString
    },
    0x001c: {
        'name': 'GPSAreaInformation',
        'description': getEncodedString
    },
    0x001d: 'GPSDateStamp',
    0x001e: {
        'name': 'GPSDifferential',
        'description': getGPSDifferentialDescription
    },
    0x001f: 'GPSHPositioningError'
};
