/**
 * ExifReader
 * http://github.com/mattiasw/exifreader
 * Copyright (C) 2011-2017  Mattias Wallander <mattias@wallander.eu>
 * Licensed under the GNU Lesser General Public License version 3 or later
 * See license text at http://www.gnu.org/licenses/lgpl.txt
 */

import ImageHeader from './image-header';
import Tags from './tags';
import IptcTags from './iptc-tags';
import XmpTags from './xmp-tags';

export function load(data) {
    let dataView;

    try {
        dataView = new DataView(data);
    } catch (error) {
        console.warn('Warning: A full DataView implementation is not available. If you\'re using Node.js you probably want to do this:\n  1. Install a DataView polyfill, e.g. jdataview: npm install --save jdataview\n  2. Require that at the top of your script: global.DataView = require(\'jdataview\');\nSee an example of this in the ExifReader example directory.');  // eslint-disable-line no-console
        return {};
    }

    return loadView(dataView);
}

export function loadView(dataView) {
    let foundMetaData = false;
    let tags = {};

    ImageHeader.check(dataView);
    const {tiffHeaderOffset, iptcDataOffset, xmpDataOffset, xmpFieldLength} = ImageHeader.parseAppMarkers(dataView);

    if (hasExifData(tiffHeaderOffset)) {
        foundMetaData = true;
        tags = Object.assign({}, tags, Tags.read(dataView, tiffHeaderOffset));
    }
    if (hasIptcData(iptcDataOffset)) {
        foundMetaData = true;
        tags = Object.assign({}, tags, IptcTags.read(dataView, iptcDataOffset));
    }
    if (hasXmpData(xmpDataOffset)) {
        foundMetaData = true;
        tags = Object.assign({}, tags, XmpTags.read(dataView, xmpDataOffset, xmpFieldLength));
    }
    if (!foundMetaData) {
        throw new Error('No Exif data');
    }

    return tags;
}

function hasExifData(tiffHeaderOffset) {
    return tiffHeaderOffset !== undefined;
}

function hasIptcData(iptcDataOffset) {
    return iptcDataOffset !== undefined;
}

function hasXmpData(xmpDataOffset) {
    return xmpDataOffset !== undefined;
}
