/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Constants from './constants.js';
import {objectAssign} from './utils.js';
import ByteOrder from './byte-order.js';
import Types from './types.js';
import TagNames from './tag-names.js';
import {deferInit, getBase64Image} from './utils.js';

const EXIF_IFD_POINTER_KEY = 'Exif IFD Pointer';
const GPS_INFO_IFD_POINTER_KEY = 'GPS Info IFD Pointer';
const INTEROPERABILITY_IFD_POINTER_KEY = 'Interoperability IFD Pointer';

const getTagValueAt = {
    1: Types.getByteAt,
    2: Types.getAsciiAt,
    3: Types.getShortAt,
    4: Types.getLongAt,
    5: Types.getRationalAt,
    7: Types.getUndefinedAt,
    9: Types.getSlongAt,
    10: Types.getSrationalAt,
    13: Types.getIfdPointerAt
};

export default {
    read,
    readMpf
};

function read(dataView, tiffHeaderOffset, includeUnknown) {
    const byteOrder = ByteOrder.getByteOrder(dataView, tiffHeaderOffset);
    let tags = read0thIfd(dataView, tiffHeaderOffset, byteOrder, includeUnknown);
    tags = readExifIfd(tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown);
    tags = readGpsIfd(tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown);
    tags = readInteroperabilityIfd(tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown);

    return tags;
}

function read0thIfd(dataView, tiffHeaderOffset, byteOrder, includeUnknown) {
    return readIfd(dataView, '0th', tiffHeaderOffset, get0thIfdOffset(dataView, tiffHeaderOffset, byteOrder), byteOrder, includeUnknown);
}

function get0thIfdOffset(dataView, tiffHeaderOffset, byteOrder) {
    return tiffHeaderOffset + Types.getLongAt(dataView, tiffHeaderOffset + 4, byteOrder);
}

function readExifIfd(tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown) {
    if (tags[EXIF_IFD_POINTER_KEY] !== undefined) {
        return objectAssign(tags, readIfd(dataView, 'exif', tiffHeaderOffset, tiffHeaderOffset + tags[EXIF_IFD_POINTER_KEY].value, byteOrder, includeUnknown));
    }

    return tags;
}

function readGpsIfd(tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown) {
    if (tags[GPS_INFO_IFD_POINTER_KEY] !== undefined) {
        return objectAssign(tags, readIfd(dataView, 'gps', tiffHeaderOffset, tiffHeaderOffset + tags[GPS_INFO_IFD_POINTER_KEY].value, byteOrder, includeUnknown));
    }

    return tags;
}

function readInteroperabilityIfd(tags, dataView, tiffHeaderOffset, byteOrder, includeUnknown) {
    if (tags[INTEROPERABILITY_IFD_POINTER_KEY] !== undefined) {
        return objectAssign(tags, readIfd(dataView, 'interoperability', tiffHeaderOffset, tiffHeaderOffset + tags[INTEROPERABILITY_IFD_POINTER_KEY].value, byteOrder, includeUnknown));
    }

    return tags;
}

function readMpf(dataView, dataOffset, includeUnknown) {
    const byteOrder = ByteOrder.getByteOrder(dataView, dataOffset);
    const tags = readIfd(dataView, 'mpf', dataOffset, get0thIfdOffset(dataView, dataOffset, byteOrder), byteOrder, includeUnknown);
    return addMpfImages(dataView, dataOffset, tags, byteOrder);
}

function addMpfImages(dataView, dataOffset, tags, byteOrder) {
    const ENTRY_SIZE = 16;

    if (!tags['MPEntry']) {
        return tags;
    }

    const images = [];
    for (let i = 0; i < Math.ceil(tags['MPEntry'].value.length / ENTRY_SIZE); i++) {
        images[i] = {};

        const attributes = getImageNumberValue(tags['MPEntry'].value, i * ENTRY_SIZE, Types.getTypeSize('LONG'), byteOrder);
        images[i]['ImageFlags'] = getImageFlags(attributes);
        images[i]['ImageFormat'] = getImageFormat(attributes);
        images[i]['ImageType'] = getImageType(attributes);

        const imageSize = getImageNumberValue(tags['MPEntry'].value, i * ENTRY_SIZE + 4, Types.getTypeSize('LONG'), byteOrder);
        images[i]['ImageSize'] = {
            value: imageSize,
            description: '' + imageSize
        };

        const imageOffset = isFirstIndividualImage(i) ? 0 : getImageNumberValue(tags['MPEntry'].value, i * ENTRY_SIZE + 8, Types.getTypeSize('LONG'), byteOrder) + dataOffset;
        images[i]['ImageOffset'] = {
            value: imageOffset,
            description: '' + imageOffset
        };

        const dependentImage1EntryNumber =
            getImageNumberValue(tags['MPEntry'].value, i * ENTRY_SIZE + 12, Types.getTypeSize('SHORT'), byteOrder);
        images[i]['DependentImage1EntryNumber'] = {
            value: dependentImage1EntryNumber,
            description: '' + dependentImage1EntryNumber
        };

        const dependentImage2EntryNumber =
            getImageNumberValue(tags['MPEntry'].value, i * ENTRY_SIZE + 14, Types.getTypeSize('SHORT'), byteOrder);
        images[i]['DependentImage2EntryNumber'] = {
            value: dependentImage2EntryNumber,
            description: '' + dependentImage2EntryNumber
        };

        images[i].image = dataView.buffer.slice(imageOffset, imageOffset + imageSize);
        deferInit(images[i], 'base64', function () {
            return getBase64Image(this.image);
        });
    }

    tags['Images'] = images;

    return tags;
}

function getImageNumberValue(entries, offset, size, byteOrder) {
    if (byteOrder === ByteOrder.LITTLE_ENDIAN) {
        let value = 0;
        for (let i = 0; i < size; i++) {
            value += entries[offset + i] << (8 * i);
        }
        return value;
    }

    let value = 0;
    for (let i = 0; i < size; i++) {
        value += entries[offset + i] << (8 * (size - 1 - i));
    }
    return value;
}

function getImageFlags(attributes) {
    const flags = [
        (attributes >> 31) & 0x1,
        (attributes >> 30) & 0x1,
        (attributes >> 29) & 0x1
    ];

    const flagsDescription = [];

    if (flags[0]) {
        flagsDescription.push('Dependent Parent Image');
    }
    if (flags[1]) {
        flagsDescription.push('Dependent Child Image');
    }
    if (flags[2]) {
        flagsDescription.push('Representative Image');
    }

    return {
        value: flags,
        description: flagsDescription.join(', ') || 'None'
    };
}

function getImageFormat(attributes) {
    const imageFormat = attributes >> 24 & 0x7;
    return {
        value: imageFormat,
        description: imageFormat === 0 ? 'JPEG' : 'Unknown'
    };
}

function getImageType(attributes) {
    const type = attributes & 0xffffff;
    const descriptions = {
        0x30000: 'Baseline MP Primary Image',
        0x10001: 'Large Thumbnail (VGA equivalent)',
        0x10002: 'Large Thumbnail (Full HD equivalent)',
        0x20001: 'Multi-Frame Image (Panorama)',
        0x20002: 'Multi-Frame Image (Disparity)',
        0x20003: 'Multi-Frame Image (Multi-Angle)',
        0x0: 'Undefined',
    };

    return {
        value: type,
        description: descriptions[type] || 'Unknown'
    };
}

function isFirstIndividualImage(i) {
    return i === 0;
}

function readIfd(dataView, ifdType, tiffHeaderOffset, offset, byteOrder, includeUnknown) {
    const FIELD_COUNT_SIZE = Types.getTypeSize('SHORT');
    const FIELD_SIZE = 12;

    const tags = {};
    const numberOfFields = getNumberOfFields(dataView, offset, byteOrder);

    offset += FIELD_COUNT_SIZE;
    for (let fieldIndex = 0; fieldIndex < numberOfFields; fieldIndex++) {
        if (offset + FIELD_SIZE > dataView.byteLength) {
            break;
        }

        const tag = readTag(dataView, ifdType, tiffHeaderOffset, offset, byteOrder, includeUnknown);
        if (tag !== undefined) {
            tags[tag.name] = {
                'id': tag.id,
                'value': tag.value,
                'description': tag.description
            };
        }

        offset += FIELD_SIZE;
    }

    if (Constants.USE_THUMBNAIL && (offset < dataView.byteLength - Types.getTypeSize('LONG'))) {
        const nextIfdOffset = Types.getLongAt(dataView, offset, byteOrder);
        if (nextIfdOffset !== 0) {
            tags['Thumbnail'] = readIfd(dataView, ifdType, tiffHeaderOffset, tiffHeaderOffset + nextIfdOffset, byteOrder, true);
        }
    }

    return tags;
}

function getNumberOfFields(dataView, offset, byteOrder) {
    if (offset + Types.getTypeSize('SHORT') <= dataView.byteLength) {
        return Types.getShortAt(dataView, offset, byteOrder);
    }
    return 0;
}

function readTag(dataView, ifdType, tiffHeaderOffset, offset, byteOrder, includeUnknown) {
    const TAG_CODE_IPTC_NAA = 0x83bb;
    const TAG_TYPE_OFFSET = Types.getTypeSize('SHORT');
    const TAG_COUNT_OFFSET = TAG_TYPE_OFFSET + Types.getTypeSize('SHORT');
    const TAG_VALUE_OFFSET = TAG_COUNT_OFFSET + Types.getTypeSize('LONG');

    const tagCode = Types.getShortAt(dataView, offset, byteOrder);
    const tagType = Types.getShortAt(dataView, offset + TAG_TYPE_OFFSET, byteOrder);
    const tagCount = Types.getLongAt(dataView, offset + TAG_COUNT_OFFSET, byteOrder);
    let tagValue;

    if (Types.typeSizes[tagType] === undefined || (!includeUnknown && TagNames[ifdType][tagCode] === undefined)) {
        return undefined;
    }

    if (tagValueFitsInOffsetSlot(tagType, tagCount)) {
        tagValue = getTagValue(dataView, offset + TAG_VALUE_OFFSET, tagType, tagCount, byteOrder);
    } else {
        const tagValueOffset = Types.getLongAt(dataView, offset + TAG_VALUE_OFFSET, byteOrder);
        if (tagValueFitsInDataView(dataView, tiffHeaderOffset, tagValueOffset, tagType, tagCount)) {
            const forceByteType = tagCode === TAG_CODE_IPTC_NAA;
            tagValue = getTagValue(dataView, tiffHeaderOffset + tagValueOffset, tagType, tagCount, byteOrder, forceByteType);
        } else {
            tagValue = '<faulty value>';
        }
    }

    if (tagType === Types.tagTypes['ASCII']) {
        tagValue = splitNullSeparatedAsciiString(tagValue);
        tagValue = decodeAsciiValue(tagValue);
    }

    let tagName = `undefined-${tagCode}`;
    let tagDescription = tagValue;

    if (TagNames[ifdType][tagCode] !== undefined) {
        if ((TagNames[ifdType][tagCode]['name'] !== undefined) && (TagNames[ifdType][tagCode]['description'] !== undefined)) {
            tagName = TagNames[ifdType][tagCode]['name'];
            try {
                tagDescription = TagNames[ifdType][tagCode]['description'](tagValue);
            } catch (error) {
                tagDescription = getDescriptionFromTagValue(tagValue);
            }
        } else if ((tagType === Types.tagTypes['RATIONAL']) || (tagType === Types.tagTypes['SRATIONAL'])) {
            tagName = TagNames[ifdType][tagCode];
            tagDescription = '' + (tagValue[0] / tagValue[1]);
        } else {
            tagName = TagNames[ifdType][tagCode];
            tagDescription = getDescriptionFromTagValue(tagValue);
        }
    }

    return {
        id: tagCode,
        name: tagName,
        value: tagValue,
        description: tagDescription
    };
}

function tagValueFitsInOffsetSlot(tagType, tagCount) {
    return Types.typeSizes[tagType] * tagCount <= Types.getTypeSize('LONG');
}

function getTagValue(dataView, offset, type, count, byteOrder, forceByteType = false) {
    let value = [];

    if (forceByteType) {
        count = count * Types.typeSizes[type];
        type = Types.tagTypes['BYTE'];
    }
    for (let valueIndex = 0; valueIndex < count; valueIndex++) {
        value.push(getTagValueAt[type](dataView, offset, byteOrder));
        offset += Types.typeSizes[type];
    }

    if (type === Types.tagTypes['ASCII']) {
        value = Types.getAsciiValue(value);
    } else if (value.length === 1) {
        value = value[0];
    }

    return value;
}

function tagValueFitsInDataView(dataView, tiffHeaderOffset, tagValueOffset, tagType, tagCount) {
    return tiffHeaderOffset + tagValueOffset + Types.typeSizes[tagType] * tagCount <= dataView.byteLength;
}

function splitNullSeparatedAsciiString(string) {
    const tagValue = [];
    let i = 0;

    for (let j = 0; j < string.length; j++) {
        if (string[j] === '\x00') {
            i++;
            continue;
        }
        if (tagValue[i] === undefined) {
            tagValue[i] = '';
        }
        tagValue[i] += string[j];
    }

    return tagValue;
}

function decodeAsciiValue(asciiValue) {
    try {
        return asciiValue.map((value) => decodeURIComponent(escape(value)));
    } catch (error) {
        return asciiValue;
    }
}

function getDescriptionFromTagValue(tagValue) {
    if (tagValue instanceof Array) {
        return tagValue.join(', ');
    }
    return tagValue;
}
