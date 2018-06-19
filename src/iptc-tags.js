/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import IptcTagNames from './iptc-tag-names';

const BYTES_8BIM = 0x3842494d;
const BYTES_8BIM_SIZE = 4;
const RESOURCE_BLOCK_HEADER_SIZE = BYTES_8BIM_SIZE + 8;
const NAA_RESOURCE_BLOCK_TYPE = 0x0404;
const TAG_HEADER_SIZE = 5;

export default {
    read
};

function read(dataView, dataOffset) {
    try {
        const {naaBlock, dataOffset: newDataOffset} = getNaaResourceBlock(dataView, dataOffset);
        return parseTags(dataView, naaBlock, newDataOffset);
    } catch (error) {
        return {};
    }
}

function getNaaResourceBlock(dataView, dataOffset) {
    while (dataOffset + RESOURCE_BLOCK_HEADER_SIZE <= dataView.byteLength) {
        const resourceBlock = getResourceBlock(dataView, dataOffset);
        if (isNaaResourceBlock(resourceBlock)) {
            return {naaBlock: resourceBlock, dataOffset};
        }
        dataOffset += RESOURCE_BLOCK_HEADER_SIZE + resourceBlock.size + getBlockPadding(resourceBlock);
    }
    throw new Error('No IPTC NAA resource block.');
}

function getResourceBlock(dataView, dataOffset) {
    const RESOURCE_BLOCK_SIZE_OFFSET = 10;

    if (dataView.getUint32(dataOffset, false) !== BYTES_8BIM) {
        throw new Error('Not an IPTC resource block.');
    }

    return {
        type: dataView.getUint16(dataOffset + BYTES_8BIM_SIZE, false),
        size: dataView.getUint16(dataOffset + RESOURCE_BLOCK_SIZE_OFFSET, false)
    };
}

function isNaaResourceBlock(resourceBlock) {
    return resourceBlock.type === NAA_RESOURCE_BLOCK_TYPE;
}

function getBlockPadding(resourceBlock) {
    if (resourceBlock.size % 2 !== 0) {
        return 1;
    }
    return 0;
}

function parseTags(dataView, naaBlock, dataOffset) {
    const tags = {};

    dataOffset += RESOURCE_BLOCK_HEADER_SIZE;
    const endOfBlockOffset = dataOffset + naaBlock['size'];

    while ((dataOffset < endOfBlockOffset) && (dataOffset < dataView.byteLength)) {
        const {tag, tagSize} = readTag(dataView, dataOffset, tags);

        if ((tags[tag.name] === undefined) || (tag['repeatable'] === undefined)) {
            tags[tag.name] = {
                value: tag.value,
                description: tag.description
            };
        } else {
            if (!(tags[tag.name] instanceof Array)) {
                tags[tag.name] = [{
                    value: tags[tag.name].value,
                    description: tags[tag.name].description
                }];
            }
            tags[tag.name].push({
                value: tag.value,
                description: tag.description
            });
        }

        dataOffset += TAG_HEADER_SIZE + tagSize;
    }

    return tags;
}

function readTag(dataView, dataOffset, tags) {
    const TAG_CODE_OFFSET = 1;
    const TAG_SIZE_OFFSET = 3;

    const tagCode = dataView.getUint16(dataOffset + TAG_CODE_OFFSET, false);
    const tagSize = dataView.getUint16(dataOffset + TAG_SIZE_OFFSET, false);
    const tagValue = getTagValue(dataView, dataOffset + TAG_HEADER_SIZE, tagSize);
    let tag;

    if (IptcTagNames['iptc'][tagCode] !== undefined) {
        let tagName, tagDescription;

        if ((IptcTagNames['iptc'][tagCode]['name'] !== undefined)
            && (IptcTagNames['iptc'][tagCode]['description'] !== undefined)) {
            tagName = IptcTagNames['iptc'][tagCode]['name'];
            tagDescription = IptcTagNames['iptc'][tagCode]['description'](tagValue, tags);
        } else {
            if (IptcTagNames['iptc'][tagCode]['name'] !== undefined) {
                tagName = IptcTagNames['iptc'][tagCode]['name'];
            } else {
                tagName = IptcTagNames['iptc'][tagCode];
            }
            if (tagValue instanceof Array) {
                tagDescription = tagValue.map((charCode) => String.fromCharCode(charCode)).join('');
                tagDescription = decodeAsciiValue(tagDescription);
            } else {
                tagDescription = tagValue;
            }
        }
        tag = {
            name: tagName,
            value: tagValue,
            description: tagDescription
        };
        if (IptcTagNames['iptc'][tagCode]['repeatable'] !== undefined) {
            tag['repeatable'] = true;
        }
    } else {
        tag = {
            name: `undefined-${tagCode}`,
            value: tagValue,
            description: tagValue
        };
    }

    return {tag, tagSize};
}

function getTagValue(dataView, offset, size) {
    const value = [];

    for (let valueIndex = 0; valueIndex < size; valueIndex++) {
        value.push(dataView.getUint8(offset + valueIndex));
    }

    return value;
}

function decodeAsciiValue(asciiValue) {
    try {
        return decodeURIComponent(escape(asciiValue));
    } catch (error) {
        return asciiValue;
    }
}
