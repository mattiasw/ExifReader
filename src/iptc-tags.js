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
    let encoding = undefined;

    dataOffset += RESOURCE_BLOCK_HEADER_SIZE;
    const endOfBlockOffset = dataOffset + naaBlock['size'];

    while ((dataOffset < endOfBlockOffset) && (dataOffset < dataView.byteLength)) {
        const {tag, tagSize} = readTag(dataView, dataOffset, tags, encoding);

        // 29/8/18 : if tag is null then it hasn't been parsed correctly
        if (tag === null) {
            break; // Don't attempt any further parsing if the data looks invalid
        }

        // If the tag just parsed specifies the text encoding, save it for decoding later strings
        if ('encoding' in tag) {
            encoding = tag.encoding;
        }

        if ((tags[tag.name] === undefined) || (tag['repeatable'] === undefined)) {
            tags[tag.name] = {
                id: tag.id,
                value: tag.value,
                description: tag.description
            };
        } else {
            if (!(tags[tag.name] instanceof Array)) {
                tags[tag.name] = [{
                    id: tag.id,
                    value: tags[tag.name].value,
                    description: tags[tag.name].description
                }];
            }
            tags[tag.name].push({
                id: tag.id,
                value: tag.value,
                description: tag.description
            });
        }

        dataOffset += TAG_HEADER_SIZE + tagSize;
    }

    return tags;
}

function readTag(dataView, dataOffset, tags, encoding) {
    const TAG_LEAD_BYTE = 0x1C;
    const TAG_CODE_OFFSET = 1;
    const TAG_SIZE_OFFSET = 3;

    // 29/8/18 : sanity check that the tag starts with 0x1C
    const leadByte = dataView.getUint8(dataOffset);
    if (leadByte !== TAG_LEAD_BYTE) {
        const tag = null, tagSize = 0;
        return {tag, tagSize};
    }

    const tagCode = dataView.getUint16(dataOffset + TAG_CODE_OFFSET, false);
    const tagSize = dataView.getUint16(dataOffset + TAG_SIZE_OFFSET, false);
    const tagValue = getTagValue(dataView, dataOffset + TAG_HEADER_SIZE, tagSize);
    let tag;

    if (IptcTagNames['iptc'][tagCode] !== undefined) {
        let tagName, tagDescription;

        // Case that both 'name' and 'description' are defined for this code
        if ((IptcTagNames['iptc'][tagCode]['name'] !== undefined)
            && (IptcTagNames['iptc'][tagCode]['description'] !== undefined)) {
            // Case that 'name' is a function rather than a string
            if (typeof (IptcTagNames['iptc'][tagCode]['name']) === 'function') {
                tagName = IptcTagNames['iptc'][tagCode]['name'](tagValue);
            } else {
                // 'name' is a string
                tagName = IptcTagNames['iptc'][tagCode]['name'];
            }
            tagDescription = IptcTagNames['iptc'][tagCode]['description'](tagValue, tags);
        } else {
            // Case that 'name' is defined (but not 'description')
            if (IptcTagNames['iptc'][tagCode]['name'] !== undefined) {
                tagName = IptcTagNames['iptc'][tagCode]['name'];
            } else {
                // Case that the entry is a single string => it's the name
                tagName = IptcTagNames['iptc'][tagCode];
            }
            if (tagValue instanceof Array) {
                // If we have TextEncoder and an encoding
                if ((typeof TextEncoder !== 'undefined') && (encoding !== undefined)) {
                    // Decode the ArrayBuffer using the specified encoding
                    const rawTagValue = dataView.buffer.slice(dataOffset + TAG_HEADER_SIZE, dataOffset + TAG_HEADER_SIZE + tagSize);
                    tagDescription = new TextDecoder(encoding).decode(rawTagValue);
                } else {
                    tagDescription = tagValue.map((charCode) => String.fromCharCode(charCode)).join('');
                    tagDescription = decodeAsciiValue(tagDescription);
                }
            } else {
                tagDescription = tagValue;
            }
        }
        // console.log ("Name:" + tagName + ", ID:"  + tagCode + ", value:" + tagValue);
        tag = {
            id: tagCode,
            name: tagName,
            value: tagValue,
            description: tagDescription
        };
        if (IptcTagNames['iptc'][tagCode]['repeatable'] !== undefined) {
            tag['repeatable'] = true;
        }

        // Optional 'encoding_name' from CCS
        if (IptcTagNames['iptc'][tagCode]['encoding_name'] !== undefined) {
            tag.encoding = IptcTagNames['iptc'][tagCode]['encoding_name'](tagValue);
        }
    } else {
        tag = {
            id: tagCode,
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
