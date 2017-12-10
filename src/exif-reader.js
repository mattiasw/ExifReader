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

export function load(data, options = {expanded: false}) {
    let dataView;

    try {
        dataView = new DataView(data);
    } catch (error) {
        console.warn('Warning: A full DataView implementation is not available. If you\'re using Node.js you probably want to do this:\n  1. Install a DataView polyfill, e.g. jdataview: npm install --save jdataview\n  2. Require that at the top of your script: global.DataView = require(\'jdataview\');\nSee an example of this in the ExifReader example directory.');  // eslint-disable-line no-console
        return {};
    }

    return loadView(dataView, options);
}

export function loadView(dataView, options = {expanded: false}) {
    let foundMetaData = false;
    let tags = {};

    ImageHeader.check(dataView);
    const {tiffHeaderOffset, iptcDataOffset, xmpDataOffset, xmpFieldLength} = ImageHeader.parseAppMarkers(dataView);

    if (hasExifData(tiffHeaderOffset)) {
        foundMetaData = true;
        const readTags = Tags.read(dataView, tiffHeaderOffset);
        if (options.expanded) {
            tags.exif = readTags;
        } else {
            tags = Object.assign({}, tags, readTags);
        }
    }
    if (hasIptcData(iptcDataOffset)) {
        foundMetaData = true;
        const readTags = IptcTags.read(dataView, iptcDataOffset);
        if (options.expanded) {
            tags.iptc = readTags;
        } else {
            tags = Object.assign({}, tags, readTags);
        }
    }
    if (hasXmpData(xmpDataOffset)) {
        foundMetaData = true;
        const readTags = XmpTags.read(dataView, xmpDataOffset, xmpFieldLength);
        if (options.expanded) {
            tags.xmp = readTags;
        } else {
            tags = Object.assign({}, tags, readTags);
        }
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
