import {get64BitValue} from './image-header-iso-bmff-utils.js';

export function parseItemLocationBox(dataView, version, contentOffset, boxLength) {
    const FLAGS_SIZE = 3;

    const {offsets, sizes} = getItemLocationBoxOffsetsAndSizes(version, contentOffset + FLAGS_SIZE);

    const offsetSize = dataView.getUint8(offsets.offsetSize) >> 4;
    sizes.item.extent.extentOffset = offsetSize;
    const lengthSize = dataView.getUint8(offsets.lengthSize) & 0x0f;
    sizes.item.extent.extentLength = lengthSize;
    const baseOffsetSize = dataView.getUint8(offsets.baseOffsetSize) >> 4;
    sizes.item.baseOffset = baseOffsetSize;
    const indexSize = getIndexSize(dataView, offsets.indexSize, version);
    sizes.item.extent.extentIndex = indexSize !== undefined ? indexSize : 0;
    const itemCount = getItemCount(dataView, offsets.itemCount, version);

    return {
        type: 'iloc',
        items: getItems(dataView, version, offsets, sizes, offsetSize, lengthSize, indexSize, itemCount),
        length: boxLength
    };
}

function getItemLocationBoxOffsetsAndSizes(version, contentOffset) {
    const sizes = {
        item: {
            dataReferenceIndex: 2,
            extentCount: 2,
            extent: {}
        }
    };
    if (version < 2) {
        sizes.itemCount = 2;
        sizes.item.itemId = 2;
    } else if (version === 2) {
        sizes.itemCount = 4;
        sizes.item.itemId = 4;
    }
    if (version === 1 || version === 2) {
        sizes.item.constructionMethod = 2;
    } else {
        sizes.item.constructionMethod = 0;
    }

    const offsets = {
        offsetSize: contentOffset,
        lengthSize: contentOffset,
        baseOffsetSize: contentOffset + 1,
        indexSize: contentOffset + 1
    };
    offsets.itemCount = contentOffset + 2;
    offsets.items = offsets.itemCount + sizes.itemCount;
    offsets.item = {
        itemId: 0
    };
    offsets.item.constructionMethod = offsets.item.itemId + sizes.item.itemId;
    offsets.item.dataReferenceIndex = offsets.item.constructionMethod + sizes.item.constructionMethod;

    return {offsets, sizes};
}

function getIndexSize(dataView, offset, version) {
    if (version === 1 || version === 2) {
        return dataView.getUint8(offset) & 0x0f;
    }
    return undefined;
}

function getItemCount(dataView, offset, version) {
    if (version < 2) {
        return dataView.getUint16(offset);
    } else if (version === 2) {
        return dataView.getUint32(offset);
    }
    return undefined;
}

function getItems(dataView, version, offsets, sizes, offsetSize, lengthSize, indexSize, itemCount) {
    if (itemCount === undefined) {
        return [];
    }

    const items = [];
    let offset = offsets.items;

    for (let i = 0; i < itemCount; i++) {
        const item = {extents: []};
        item.itemId = getItemId(dataView, offset, version);
        offset += sizes.item.itemId;
        item.constructionMethod = (version === 1) || (version === 2) ? dataView.getUint16(offset) & 0x0f : undefined;
        offset += sizes.item.constructionMethod;
        item.dataReferenceIndex = dataView.getUint16(offset);
        offset += sizes.item.dataReferenceIndex;
        item.baseOffset = getVariableSizedValue(dataView, offset, sizes.item.baseOffset);
        offset += sizes.item.baseOffset;
        item.extentCount = dataView.getUint16(offset);
        offset += sizes.item.extentCount;
        for (let j = 0; j < item.extentCount; j++) {
            const extent = {};

            extent.extentIndex = getExtentIndex(dataView, version, offset, indexSize);
            offset += sizes.item.extent.extentIndex;
            extent.extentOffset = getVariableSizedValue(dataView, offset, offsetSize);
            offset += sizes.item.extent.extentOffset;
            extent.extentLength = getVariableSizedValue(dataView, offset, lengthSize);
            offset += sizes.item.extent.extentLength;

            item.extents.push(extent);
        }

        items.push(item);
    }

    return items;
}

function getItemId(dataView, offset, version) {
    if (version < 2) {
        return dataView.getUint16(offset);
    } else if (version === 2) {
        return dataView.getUint32(offset);
    }
    return undefined;
}

function getExtentIndex(dataView, version, offset, indexSize) {
    if ((version === 1 || version === 2) && indexSize > 0) {
        return getVariableSizedValue(dataView, offset, indexSize);
    }
    return undefined;
}

function getVariableSizedValue(dataView, offset, size) {
    if (size === 4) {
        return dataView.getUint32(offset);
    }
    if (size === 8) {
        // eslint-disable-next-line no-console
        console.warn('This file uses an 8-bit offset which is currently not supported by ExifReader. Contact the maintainer to get it fixed.');
        return get64BitValue(dataView, offset);
    }
    return 0;
}
