/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
    getModelVersionDescription,
    getFileFormatDescription,
    getFileFormatVersionDescription,
    getCreationDate,
    getCreationTime,
    getEncodingName,
    getARMIdentifierDescription,
    getARMVersionDescription,
    getRecordVersionDescription,
    getEditorialUpdateDescription,
    getSubjectReferenceDescription,
    getActionAdvisedDescription,
    getObjectCycleDescription,
    getRasterizedCaptionDescription,
    getImageOrientationDescription,
    getAudioTypeDescription,
    getAudioSamplingRateDescription,
    getAudioSamplingResolutionDescription,
    getAudioDurationDescription,
    getRecord2DestinationDescription,
    getObjectDataPreviewFileFormatVersionDescription,
    getSizeModeDescription,
    getMaxSubfileSizeDescription,
    getObjectDataSizeAnnouncedDescription,
    getMaximumObjectDataSizeDescription
} from './iptc-tag-names-descriptions.js';

export default {
    'iptc': {
        0x0100: {
            'name': 'Model Version',
            'description': getModelVersionDescription
        },
        0x0105: {
            'name': 'Destination',
            'repeatable': true
        },
        0x0114: {
            'name': 'File Format',
            'description': getFileFormatDescription
        },
        0x0116: {
            'name': 'File Format Version',
            'description': getFileFormatVersionDescription
        },
        0x011e: 'Service Identifier',
        0x0128: 'Envelope Number',
        0x0132: 'Product ID',
        0x013c: 'Envelope Priority',
        0x0146: {
            'name': 'Date Sent',
            'description': getCreationDate
        },
        0x0150: {
            'name': 'Time Sent',
            'description': getCreationTime
        },
        0x015a: {
            'name': 'Coded Character Set',
            'description': getEncodingName,
            'encoding_name': getEncodingName,
        },
        0x0164: 'UNO',
        0x0178: {
            'name': 'ARM Identifier',
            'description': getARMIdentifierDescription
        },
        0x017a: {
            'name': 'ARM Version',
            'description': getARMVersionDescription
        },
        0x0200: {
            'name': 'Record Version',
            'description': getRecordVersionDescription
        },
        0x0203: 'Object Type Reference',
        0x0204: 'Object Attribute Reference',
        0x0205: 'Object Name',
        0x0207: 'Edit Status',
        0x0208: {
            'name': 'Editorial Update',
            'description': getEditorialUpdateDescription
        },
        0x020a: 'Urgency',
        0x020c: {
            'name': 'Subject Reference',
            'repeatable': true,
            'description': getSubjectReferenceDescription
        },
        0x020f: 'Category',
        0x0214: {
            'name': 'Supplemental Category',
            'repeatable': true
        },
        0x0216: 'Fixture Identifier',
        0x0219: {
            'name': 'Keywords',
            'repeatable': true
        },
        0x021a: {
            'name': 'Content Location Code',
            'repeatable': true
        },
        0x021b: {
            'name': 'Content Location Name',
            'repeatable': true
        },
        0x021e: 'Release Date',
        0x0223: 'Release Time',
        0x0225: 'Expiration Date',
        0x0226: 'Expiration Time',
        0x0228: 'Special Instructions',
        0x022a: {
            'name': 'Action Advised',
            'description': getActionAdvisedDescription
        },
        0x022d: {
            'name': 'Reference Service',
            'repeatable': true
        },
        0x022f: {
            'name': 'Reference Date',
            'repeatable': true
        },
        0x0232: {
            'name': 'Reference Number',
            'repeatable': true
        },
        0x0237: {
            'name': 'Date Created',
            'description': getCreationDate
        },
        0x023c: {
            'name': 'Time Created',
            'description': getCreationTime
        },
        0x023e: {
            'name': 'Digital Creation Date',
            'description': getCreationDate
        },
        0x023f: {
            'name': 'Digital Creation Time',
            'description': getCreationTime
        },
        0x0241: 'Originating Program',
        0x0246: 'Program Version',
        0x024b: {
            'name': 'Object Cycle',
            'description': getObjectCycleDescription
        },
        0x0250: {
            'name': 'By-line',
            'repeatable': true
        },
        0x0255: {
            'name': 'By-line Title',
            'repeatable': true
        },
        0x025a: 'City',
        0x025c: 'Sub-location',
        0x025f: 'Province/State',
        0x0264: 'Country/Primary Location Code',
        0x0265: 'Country/Primary Location Name',
        0x0267: 'Original Transmission Reference',
        0x0269: 'Headline',
        0x026e: 'Credit',
        0x0273: 'Source',
        0x0274: 'Copyright Notice',
        0x0276: {
            'name': 'Contact',
            'repeatable': true
        },
        0x0278: 'Caption/Abstract',
        0x027a: {
            'name': 'Writer/Editor',
            'repeatable': true
        },
        0x027d: {
            'name': 'Rasterized Caption',
            'description': getRasterizedCaptionDescription
        },
        0x0282: 'Image Type',
        0x0283: {
            'name': 'Image Orientation',
            'description': getImageOrientationDescription
        },
        0x0287: 'Language Identifier',
        0x0296: {
            'name': 'Audio Type',
            'description': getAudioTypeDescription
        },
        0x0297: {
            'name': 'Audio Sampling Rate',
            'description': getAudioSamplingRateDescription
        },
        0x0298: {
            'name': 'Audio Sampling Resolution',
            'description': getAudioSamplingResolutionDescription
        },
        0x0299: {
            'name': 'Audio Duration',
            'description': getAudioDurationDescription
        },
        0x029a: 'Audio Outcue',
        0x02ba: 'Short Document ID',
        0x02bb: 'Unique Document ID',
        0x02bc: 'Owner ID',
        0x02c8: {
            'name': (value) => {
                if (value.length === 2) {
                    return 'ObjectData Preview File Format';
                }
                return 'Record 2 destination';
            },
            'description': getRecord2DestinationDescription
        },
        0x02c9: {
            'name': 'ObjectData Preview File Format Version',
            'description': getObjectDataPreviewFileFormatVersionDescription
        },
        0x02ca: 'ObjectData Preview Data',
        0x070a: {
            'name': 'Size Mode',
            'description': getSizeModeDescription
        },
        0x0714: {
            'name': 'Max Subfile Size',
            'description': getMaxSubfileSizeDescription
        },
        0x075a: {
            'name': 'ObjectData Size Announced',
            'description': getObjectDataSizeAnnouncedDescription
        },
        0x075f: {
            'name': 'Maximum ObjectData Size',
            'description': getMaximumObjectDataSizeDescription
        }
    }
};
