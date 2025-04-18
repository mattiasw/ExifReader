/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Constants from './constants.js';
import Types from './types.js';
import TagNames, {IFD_TYPE_0TH, IFD_TYPE_1ST, IFD_TYPE_PENTAX} from './tag-names.js';

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

export function get0thIfdOffset(dataView, tiffHeaderOffset, byteOrder) {
    return tiffHeaderOffset + Types.getLongAt(dataView, tiffHeaderOffset + 4, byteOrder);
}

export function readIfd(dataView, ifdType, offsetOrigin, offset, byteOrder, includeUnknown) {
    const FIELD_COUNT_SIZE = Types.getTypeSize('SHORT');
    const FIELD_SIZE = 12;

    const tags = {};
    const numberOfFields = getNumberOfFields(dataView, offset, byteOrder);

    offset += FIELD_COUNT_SIZE;
    for (let fieldIndex = 0; fieldIndex < numberOfFields; fieldIndex++) {
        if (offset + FIELD_SIZE > dataView.byteLength) {
            break;
        }

        const tag = readTag(dataView, ifdType, offsetOrigin, offset, byteOrder, includeUnknown);
        if (tag !== undefined) {
            tags[tag.name] = {
                'id': tag.id,
                'value': tag.value,
                'description': tag.description
            };
            if (tag.name === 'MakerNote' || (ifdType === IFD_TYPE_PENTAX && tag.name === 'LevelInfo')) {
                tags[tag.name].__offset = tag.__offset;
            }
        }

        offset += FIELD_SIZE;
    }

    if (Constants.USE_THUMBNAIL && (offset < dataView.byteLength - Types.getTypeSize('LONG'))) {
        const nextIfdOffset = Types.getLongAt(dataView, offset, byteOrder);
        if (nextIfdOffset !== 0 && ifdType === IFD_TYPE_0TH) {
            tags['Thumbnail'] = readIfd(dataView, IFD_TYPE_1ST, offsetOrigin, offsetOrigin + nextIfdOffset, byteOrder, includeUnknown);
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

function readTag(dataView, ifdType, offsetOrigin, offset, byteOrder, includeUnknown) {
    const TAG_CODE_IPTC_NAA = 0x83bb;
    const TAG_TYPE_OFFSET = Types.getTypeSize('SHORT');
    const TAG_COUNT_OFFSET = TAG_TYPE_OFFSET + Types.getTypeSize('SHORT');
    const TAG_VALUE_OFFSET = TAG_COUNT_OFFSET + Types.getTypeSize('LONG');

    const tagCode = Types.getShortAt(dataView, offset, byteOrder);
    const tagType = Types.getShortAt(dataView, offset + TAG_TYPE_OFFSET, byteOrder);
    const tagCount = Types.getLongAt(dataView, offset + TAG_COUNT_OFFSET, byteOrder);
    let tagValue;
    let tagValueOffset;

    if (Types.typeSizes[tagType] === undefined || (!includeUnknown && TagNames[ifdType][tagCode] === undefined)) {
        return undefined;
    }

    if (tagValueFitsInOffsetSlot(tagType, tagCount)) {
        tagValueOffset = offset + TAG_VALUE_OFFSET;
        tagValue = getTagValue(dataView, tagValueOffset, tagType, tagCount, byteOrder);
    } else {
        tagValueOffset = Types.getLongAt(dataView, offset + TAG_VALUE_OFFSET, byteOrder);
        if (tagValueFitsInDataView(dataView, offsetOrigin, tagValueOffset, tagType, tagCount)) {
            const forceByteType = tagCode === TAG_CODE_IPTC_NAA;
            tagValue = getTagValue(dataView, offsetOrigin + tagValueOffset, tagType, tagCount, byteOrder, forceByteType);
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
        description: tagDescription,
        __offset: tagValueOffset
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

function tagValueFitsInDataView(dataView, offsetOrigin, tagValueOffset, tagType, tagCount) {
    return offsetOrigin + tagValueOffset + Types.typeSizes[tagType] * tagCount <= dataView.byteLength;
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
