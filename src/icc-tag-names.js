/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringFromDataView} from './utils.js';

export const iccTags = {
    'desc': {
        'name': 'ICC Description',
    },
    'cprt': {
        'name': 'ICC Copyright',
    },
    'dmdd': {
        'name': 'ICC Device Model Description',
    },
    'vued': {
        'name': 'ICC Viewing Conditions Description',
    },
    'dmnd': {
        'name': 'ICC Device Manufacturer for Display',
    },
    'tech': {
        'name': 'Technology',
    },
};

export const iccProfile = {
    4: {
        'name': 'Preferred CMM type',
        'value': (dataView, offset) => getStringFromDataView(dataView, offset, 4),
        'description': (value) => value !== null ? toCompany(value) : '',
    },
    8: {
        'name': 'Profile Version',
        'value': (dataView, offset) => {
            return (dataView.getUint8(offset)).toString(10) + '.'
            + (dataView.getUint8(offset + 1) >> 4).toString(10) + '.'
            + (dataView.getUint8(offset + 1) % 16).toString(10);
        }
    },
    12: {
        'name': 'Profile/Device class',
        'value': (dataView, offset) => getStringFromDataView(dataView, offset, 4),
        'description': (value) => {
            switch (value.toLowerCase()) {
                case 'scnr': return 'Input Device profile';
                case 'mntr': return 'Display Device profile';
                case 'prtr': return 'Output Device profile';
                case 'link': return 'DeviceLink profile';
                case 'abst': return 'Abstract profile';
                case 'spac': return 'ColorSpace profile';
                case 'nmcl': return 'NamedColor profile';
                case 'cenc': return 'ColorEncodingSpace profile';
                case 'mid ': return 'MultiplexIdentification profile';
                case 'mlnk': return 'MultiplexLink profile';
                case 'mvis': return 'MultiplexVisualization profile';
                default: return value;
            }
        }
    },
    16: {
        'name': 'Color Space',
        'value': (dataView, offset) => getStringFromDataView(dataView, offset, 4)
    },
    20: {
        'name': 'Connection Space',
        'value': (dataView, offset) => getStringFromDataView(dataView, offset, 4)
    },
    24: {
        'name': 'ICC Profile Date',
        'value': (dataView, offset) => parseDate(dataView, offset).toISOString()
    },
    36: {
        'name': 'ICC Signature',
        'value': (dataView, offset) => sliceToString(dataView.buffer.slice(offset, offset + 4))
    },
    40: {
        'name': 'Primary Platform',
        'value': (dataView, offset) => getStringFromDataView(dataView, offset, 4),
        'description': (value) => toCompany(value)
    },
    48: {
        'name': 'Device Manufacturer',
        'value': (dataView, offset) => getStringFromDataView(dataView, offset, 4),
        'description': (value) => toCompany(value)
    },
    52: {
        'name': 'Device Model Number',
        'value': (dataView, offset) => getStringFromDataView(dataView, offset, 4)
    },
    64: {
        'name': 'Rendering Intent',
        'value': (dataView, offset) => dataView.getUint32(offset),
        'description': (value) => {
            switch (value) {
                case 0: return 'Perceptual';
                case 1: return 'Relative Colorimetric';
                case 2: return 'Saturation';
                case 3: return 'Absolute Colorimetric';
                default: return value;
            }
        }
    },

    80: {
        'name': 'Profile Creator',
        'value': (dataView, offset) => getStringFromDataView(dataView, offset, 4)
    },
};

function parseDate(dataView, offset) {
    const year = dataView.getUint16(offset);
    const month = dataView.getUint16(offset + 2) - 1;
    const day = dataView.getUint16(offset + 4);
    const hours = dataView.getUint16(offset + 6);
    const minutes = dataView.getUint16(offset + 8);
    const seconds = dataView.getUint16(offset + 10);
    return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
}

function sliceToString(slice) {
    return String.fromCharCode.apply(null, new Uint8Array(slice));
}

function toCompany(value) {
    switch (value.toLowerCase()) {
        case 'appl': return 'Apple';
        case 'adbe': return 'Adobe';
        case 'msft': return 'Microsoft';
        case 'sunw': return 'Sun Microsystems';
        case 'sgi': return 'Silicon Graphics';
        case 'tgnt': return 'Taligent';
        default: return value;
    }
}
