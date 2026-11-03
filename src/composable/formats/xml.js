/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Xml from '../../xml.js';
import {FORMAT_BRAND} from '../brand.js';

export const xmlHeader = {
    fileType: {value: 'xml', description: 'XML'},
    detect: (dataView) => Xml.isXMLFile(dataView),
    find: (dataView, ranges) => Xml.findOffsets(dataView, ranges),
};

export const xml = {
    header: xmlHeader,
    readers: [],
    brand: FORMAT_BRAND,
};
