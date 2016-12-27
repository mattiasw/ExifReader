import ByteOrder from './byte-order';
import Types from './types';
import TagNames from './tag-names';

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
    10: Types.getSrationalAt
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
        return Object.assign(tags, readIfd(dataView, 'exif', tiffHeaderOffset, tiffHeaderOffset + tags[EXIF_IFD_POINTER_KEY].value, byteOrder));
    }

    return tags;
}

function readGpsIfd(tags, dataView, tiffHeaderOffset, byteOrder) {
    if (tags[GPS_INFO_IFD_POINTER_KEY] !== undefined) {
        return Object.assign(tags, readIfd(dataView, 'gps', tiffHeaderOffset, tiffHeaderOffset + tags[GPS_INFO_IFD_POINTER_KEY].value, byteOrder));
    }

    return tags;
}

function readInteroperabilityIfd(tags, dataView, tiffHeaderOffset, byteOrder) {
    if (tags[INTEROPERABILITY_IFD_POINTER_KEY] !== undefined) {
        return Object.assign(tags, readIfd(dataView, 'interoperability', tiffHeaderOffset, tiffHeaderOffset + tags[INTEROPERABILITY_IFD_POINTER_KEY].value, byteOrder));
    }

    return tags;
}

function readIfd(dataView, ifdType, tiffHeaderOffset, offset, byteOrder) {
    const tags = {};
    const numberOfFields = Types.getShortAt(dataView, offset, byteOrder);
    offset += 2;
    for (let fieldIndex = 0; fieldIndex < numberOfFields; fieldIndex++) {
        const tag = readTag(dataView, ifdType, tiffHeaderOffset, offset, byteOrder);
        if (tag !== undefined) {
            tags[tag.name] = {'value': tag.value, 'description': tag.description};
        }
        offset += 12;
    }

    return tags;
}

function readTag(dataView, ifdType, tiffHeaderOffset, offset, byteOrder) {
    const tagCode = Types.getShortAt(dataView, offset, byteOrder);
    const tagType = Types.getShortAt(dataView, offset + 2, byteOrder);
    const tagCount = Types.getLongAt(dataView, offset + 4, byteOrder);
    let tagValue;

    if (Types.typeSizes[tagType] === undefined) {
        return undefined;
    }

    if (Types.typeSizes[tagType] * tagCount <= 4) {
        // If the value itself fits in four bytes, it is recorded instead of just
        // the offset.
        tagValue = getTagValue(dataView, offset + 8, tagType, tagCount, byteOrder);
    } else {
        const tagValueOffset = Types.getLongAt(dataView, offset + 8, byteOrder);
        tagValue = getTagValue(dataView, tiffHeaderOffset + tagValueOffset, tagType, tagCount, byteOrder);
    }
    if (tagType === Types.tagTypes['ASCII']) {
        tagValue = splitNullSeparatedAsciiString(tagValue);
    }
    if (TagNames[ifdType][tagCode] !== undefined) {
        let tagName, tagDescription;

        if ((TagNames[ifdType][tagCode]['name'] !== undefined) && (TagNames[ifdType][tagCode]['description'] !== undefined)) {
            tagName = TagNames[ifdType][tagCode]['name'];
            tagDescription = TagNames[ifdType][tagCode]['description'](tagValue);
        } else {
            tagName = TagNames[ifdType][tagCode];
            if (tagValue instanceof Array) {
                tagDescription = tagValue.join(', ');
            } else {
                tagDescription = tagValue;
            }
        }
        return {
            name: tagName,
            value: tagValue,
            description: tagDescription
        };
    }

    return {
        name: `undefined-${tagCode}`,
        value: tagValue,
        description: tagValue
    };
}

function getTagValue(dataView, offset, type, count, byteOrder) {
    let value = [];

    for (let valueIndex = 0; valueIndex < count; valueIndex++) {
        value.push(getTagValueAt[type](dataView, offset, byteOrder));
        offset += Types.typeSizes[type];
    }

    if (value.length === 1) {
        value = value[0];
    } else if (type === Types.tagTypes['ASCII']) {
        value = Types.getAsciiValue(value);
    }

    return value;
}

function splitNullSeparatedAsciiString(string) {
    const tagValue = [];
    let i = 0;

    for (const character of string) {
        if (character === '\x00') {
            i++;
            continue;
        }
        if (tagValue[i] === undefined) {
            tagValue[i] = '';
        }
        tagValue[i] += character;
    }

    return tagValue;
}
