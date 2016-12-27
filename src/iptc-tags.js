import IptcTagNames from './iptc-tag-names';

const BYTES_8BIM = 0x3842494d;

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
    while (dataOffset + 12 <= dataView.byteLength) {
        const naaBlock = getResourceBlock(dataView, dataOffset);
        if (naaBlock.type === 0x0404) {
            return {naaBlock, dataOffset};
        }
        dataOffset += 12 + naaBlock.size + getBlockPadding(naaBlock.size);
    }
    throw new Error('No IPTC NAA resource block.');
}

function getResourceBlock(dataView, dataOffset) {
    if (dataView.getUint32(dataOffset, false) !== BYTES_8BIM) {
        throw new Error('Not an IPTC resource block.');
    }

    return {
        type: dataView.getUint16(dataOffset + 4, false),
        size: dataView.getUint16(dataOffset + 10, false)
    };
}

function getBlockPadding(blockSize) {
    if (blockSize % 2 !== 0) {
        return 1;
    }
    return 0;
}

function parseTags(dataView, naaBlock, dataOffset) {
    const tags = {};

    dataOffset += 12;
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

        dataOffset += 5 + tagSize;
    }

    return tags;
}

function readTag(dataView, dataOffset, tags) {
    const tagCode = dataView.getUint16(dataOffset + 1, false);
    const tagSize = dataView.getUint16(dataOffset + 3, false);
    const tagValue = getTagValue(dataView, dataOffset + 5, tagSize);
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
