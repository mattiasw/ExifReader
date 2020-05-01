/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Constants from './constants.js';
import {objectAssign} from './utils.js';
import ByteOrder from './byte-order.js';
import Types from './types.js';
import TagNames from './tag-names.js';

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
    read
};

function read(dataView, tiffHeaderOffset) {
    const byteOrder = ByteOrder.getByteOrder(dataView, tiffHeaderOffset);
    let tags = read0thIfd(dataView, tiffHeaderOffset, byteOrder);
    tags = readExifIfd(tags, dataView, tiffHeaderOffset, byteOrder);
    tags = readGpsIfd(tags, dataView, tiffHeaderOffset, byteOrder);
    tags = readInteroperabilityIfd(tags, dataView, tiffHeaderOffset, byteOrder);

    return tags;
}

function read0thIfd(dataView, tiffHeaderOffset, byteOrder) {
    return readIfd(dataView, '0th', tiffHeaderOffset, get0thIfdOffset(dataView, tiffHeaderOffset, byteOrder), byteOrder);
}

function get0thIfdOffset(dataView, tiffHeaderOffset, byteOrder) {
    return tiffHeaderOffset + Types.getLongAt(dataView, tiffHeaderOffset + 4, byteOrder);
}

function readExifIfd(tags, dataView, tiffHeaderOffset, byteOrder) {
    if (tags[EXIF_IFD_POINTER_KEY] !== undefined) {
        return objectAssign(tags, readIfd(dataView, 'exif', tiffHeaderOffset, tiffHeaderOffset + tags[EXIF_IFD_POINTER_KEY].value, byteOrder));
    }

    return tags;
}

function readGpsIfd(tags, dataView, tiffHeaderOffset, byteOrder) {
    if (tags[GPS_INFO_IFD_POINTER_KEY] !== undefined) {
        return objectAssign(tags, readIfd(dataView, 'gps', tiffHeaderOffset, tiffHeaderOffset + tags[GPS_INFO_IFD_POINTER_KEY].value, byteOrder));
    }

    return tags;
}

function readInteroperabilityIfd(tags, dataView, tiffHeaderOffset, byteOrder) {
    if (tags[INTEROPERABILITY_IFD_POINTER_KEY] !== undefined) {
        return objectAssign(tags, readIfd(dataView, 'interoperability', tiffHeaderOffset, tiffHeaderOffset + tags[INTEROPERABILITY_IFD_POINTER_KEY].value, byteOrder));
    }

    return tags;
}

function readIfd(dataView, ifdType, tiffHeaderOffset, offset, byteOrder) {
    const FIELD_COUNT_SIZE = Types.getTypeSize('SHORT');
    const FIELD_SIZE = 12;

    const tags = {};
    const numberOfFields = getNumberOfFields(dataView, offset, byteOrder);

    offset += FIELD_COUNT_SIZE;
    for (let fieldIndex = 0; fieldIndex < numberOfFields; fieldIndex++) {
        if (offset + FIELD_SIZE > dataView.byteLength) {
            break;
        }

        const tag = readTag(dataView, ifdType, tiffHeaderOffset, offset, byteOrder);
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
            tags['Thumbnail'] = readIfd(dataView, ifdType, tiffHeaderOffset, tiffHeaderOffset + nextIfdOffset, byteOrder);
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

function readTag(dataView, ifdType, tiffHeaderOffset, offset, byteOrder) {
    const TAG_CODE_IPTC_NAA = 0x83bb;
    const TAG_TYPE_OFFSET = Types.getTypeSize('SHORT');
    const TAG_COUNT_OFFSET = TAG_TYPE_OFFSET + Types.getTypeSize('SHORT');
    const TAG_VALUE_OFFSET = TAG_COUNT_OFFSET + Types.getTypeSize('LONG');

    const tagCode = Types.getShortAt(dataView, offset, byteOrder);
    const tagType = Types.getShortAt(dataView, offset + TAG_TYPE_OFFSET, byteOrder);
    const tagCount = Types.getLongAt(dataView, offset + TAG_COUNT_OFFSET, byteOrder);
    let tagValue;

    if (Types.typeSizes[tagType] === undefined) {
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
