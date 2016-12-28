/**
 * ExifReader 2.0.0
 * http://github.com/mattiasw/exifreader
 * Copyright (C) 2011-2016  Mattias Wallander <mattias@wallander.eu>
 * Licensed under the GNU Lesser General Public License version 3 or later
 * See license text at http://www.gnu.org/licenses/lgpl.txt
 */

import ImageHeader from './image-header';
import Tags from './tags';
import IptcTags from './iptc-tags';

export function load(data) {
    return loadView(new DataView(data));
}

export function loadView(dataView) {
    let foundMetaData = false;
    let tags;

    ImageHeader.check(dataView);
    const {tiffHeaderOffset, iptcDataOffset} = ImageHeader.parseAppMarkers(dataView);

    if (hasExifData(tiffHeaderOffset)) {
        foundMetaData = true;
        tags = Tags.read(dataView, tiffHeaderOffset);
    }
    if (hasIptcData(iptcDataOffset)) {
        foundMetaData = true;
        Object.assign(tags, IptcTags.read(dataView, iptcDataOffset));
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
