import Constants from './constants.js';
import {getNullTerminatedStringFromDataView, getStringFromDataView} from './utils.js';
// import {get64BitValue} from './image-header-iso-bmff-utils.js';
import {parseItemLocationBox} from './image-header-iso-bmff-iloc.js';

// HEIC and AVIF files are based on the ISO-BMFF format. This file format is
// built up by boxes. There are boxes and full boxes. All box types have a
// length (4 or 8 bytes) and a type (4 bytes). Full boxes also have a version
// (1 byte) and flags (3 bytes). The boxes can be nested. Each box type has its
// own structure that can be seen in the specification.
//
// For metadata we are interested in the meta box. The meta box contains sub
// boxes. The sub box type iinf has info about which types of metadata are
// present in the file. The item ID we get from there we then look up in the
// iloc sub box to get the offset to the real location of the metadata.
//
// The ICC profiles is a bit more nested. We have to look in
// meta > iprp > ipco > colr, and then the whole profile is stored there.

// These are actually 32-bit strings, not random IDs, e.g. "ftyp" and "meta".
const TYPE_FTYP = 0x66747970;
const TYPE_IPRP = 0x69707270;
const TYPE_META = 0x6d657461;
const TYPE_ILOC = 0x696c6f63;
const TYPE_IINF = 0x69696e66;
const TYPE_INFE = 0x696e6665;
const TYPE_IPCO = 0x6970636f;
const TYPE_COLR = 0x636f6c72;

// const EXTENSION_TYPE_FDEL = 0x6664656c;

export const ITEM_INFO_TYPE_EXIF = 0x45786966;
export const ITEM_INFO_TYPE_MIME = 0x6d696d65;
const ITEM_INFO_TYPE_URI = 0x75726920;

/**
 * Parses a ISO-BMFF box from the provided data view starting at the given offset.
 *
 * @param {DataView} dataView - The DataView to parse.
 * @param {number} offset - The offset at which to start parsing.
 * @returns {Object} The parsed box.
 */
export function parseBox(dataView, offset) {
    const BOX_TYPE_OFFSET = 4;
    const BOX_MIN_LENGTH = 8;
    const VERSION_SIZE = 1;

    const {length, contentOffset} = getBoxLength(dataView, offset);
    if (length < BOX_MIN_LENGTH) {
        return undefined;
    }

    const type = dataView.getUint32(offset + BOX_TYPE_OFFSET);

    if (type === TYPE_FTYP) {
        return parseFileTypeBox(dataView, contentOffset, length);
    }
    if (type === TYPE_IPRP) {
        return parseItemPropertiesBox(dataView, offset, contentOffset, length);
    }
    if (type === TYPE_IPCO) {
        return parseItemPropertyContainerBox(dataView, offset, contentOffset, length);
    }
    if (type === TYPE_COLR) {
        return parseColorInformationBox(dataView, contentOffset, length);
    }

    // The following are full boxes, also containing version and flags.
    const version = dataView.getUint8(contentOffset);

    if (type === TYPE_META) {
        return parseMetadataBox(dataView, offset, contentOffset + VERSION_SIZE, length);
    }
    if (type === TYPE_ILOC) {
        return parseItemLocationBox(dataView, version, contentOffset + VERSION_SIZE, length);
    }
    if (type === TYPE_IINF) {
        return parseItemInformationBox(dataView, offset, version, contentOffset + VERSION_SIZE, length);
    }
    if (type === TYPE_INFE) {
        return parseItemInformationEntryBox(dataView, offset, version, contentOffset + VERSION_SIZE, length);
    }

    return {
        // type: getStringFromDataView(dataView, offset + BOX_TYPE_OFFSET, 4),
        type: undefined,
        length
    };
}

/**
 * @typedef {Object} BoxLength
 * @property {number} length The length of the box including length and type.
 * @property {number} contentOffset
 */

/**
 * @param {DataView} dataView
 * @param {number} offset
 * @returns {BoxLength}
 */
function getBoxLength(dataView, offset) {
    const BOX_LENGTH_SIZE = 4;
    const BOX_TYPE_SIZE = 4;
    const BOX_EXTENDED_SIZE = 8;
    const BOX_EXTENDED_SIZE_LOW_OFFSET = 12;

    const boxLength = dataView.getUint32(offset);
    if (extendsToEndOfFile(boxLength)) {
        return {
            length: dataView.byteLength - offset,
            contentOffset: offset + BOX_LENGTH_SIZE + BOX_TYPE_SIZE,
        };
    }
    if (hasExtendedSize(boxLength)) {
        if (hasEmptyHighBits(dataView, offset)) {
            // It's a bit tricky to handle 64 bit numbers in JavaScript. Let's
            // wait until there are real-world examples where it is necessary.
            return {
                length: dataView.getUint32(offset + BOX_EXTENDED_SIZE_LOW_OFFSET),
                contentOffset: offset + BOX_LENGTH_SIZE + BOX_TYPE_SIZE + BOX_EXTENDED_SIZE,
            };
        }
    }

    return {
        length: boxLength,
        contentOffset: offset + BOX_LENGTH_SIZE + BOX_TYPE_SIZE,
    };
}

function extendsToEndOfFile(boxLength) {
    return boxLength === 0;
}

function hasExtendedSize(boxLength) {
    return boxLength === 1;
}

function hasEmptyHighBits(dataView, offset) {
    const BOX_EXTENDED_SIZE_OFFSET = 8;
    return dataView.getUint32(offset + BOX_EXTENDED_SIZE_OFFSET) === 0;
}

/**
 * @typedef {Object} Offsets
 * @property {number} tiffHeaderOffset
 * @property {Array<Object>} xmpChunks
 * @property {Array<Object>} iccChunks
 * @property {boolean} hasAppMarkers
 */

/**
 * Finds the offsets of ISO-BMFF-structued data in the provided data view.
 *
 * @param {DataView} dataView - The data view to find offsets in.
 * @returns {Offsets} An object containing the offsets of the TIFF header, XMP chunks, ICC chunks, and a boolean indicating if any of these exist.
 */
export function findOffsets(dataView) {
    if (Constants.USE_EXIF || Constants.USE_XMP || Constants.USE_ICC) {
        const offsets = {};
        const metaBox = findMetaBox(dataView);

        if (!metaBox) {
            return {hasAppMarkers: false};
        }

        if (Constants.USE_EXIF) {
            offsets.tiffHeaderOffset = findExifOffset(dataView, metaBox);
        }
        if (Constants.USE_XMP) {
            offsets.xmpChunks = findXmpChunks(metaBox);
        }
        if (Constants.USE_ICC) {
            offsets.iccChunks = findIccChunks(metaBox);
        }
        offsets.hasAppMarkers = (offsets.tiffHeaderOffset !== undefined) || (offsets.xmpChunks !== undefined) || (offsets.iccChunks !== undefined);
        return offsets;
    }

    return {};
}

function findMetaBox(dataView) {
    const BOX_LENGTH_SIZE = 4;
    const BOX_TYPE_SIZE = 4;

    let offset = 0;

    while (offset + BOX_LENGTH_SIZE + BOX_TYPE_SIZE <= dataView.byteLength) {
        const box = parseBox(dataView, offset);

        if (box === undefined) {
            break;
        }

        if (box.type === 'meta') {
            return box;
        }

        offset += box.length;
    }

    return undefined;
}

function findExifOffset(dataView, metaBox) {
    try {
        const exifItemId = findIinfExifItemId(metaBox).itemId;
        const ilocItem = findIlocItem(metaBox, exifItemId);
        const exifOffset = ilocItem.baseOffset + ilocItem.extents[0].extentOffset;
        return getTiffHeaderOffset(dataView, exifOffset);
    } catch (error) {
        return undefined;
    }
}

function findIinfExifItemId(metaBox) {
    return metaBox.subBoxes.find((box) => box.type === 'iinf').itemInfos.find((itemInfo) => itemInfo.itemType === ITEM_INFO_TYPE_EXIF);
}

function findIlocItem(metaBox, itemId) {
    return metaBox.subBoxes.find((box) => box.type === 'iloc').items.find((item) => item.itemId === itemId);
}

function getTiffHeaderOffset(dataView, exifOffset) {
    // ISO-BMFF formatted files store the Exif data as an "Exif block" where the
    // first 32 bits is the TIFF header offset.
    const TIFF_HEADER_OFFSET_SIZE = 4;
    return exifOffset + TIFF_HEADER_OFFSET_SIZE + dataView.getUint32(exifOffset);
}

function findXmpChunks(metaBox) {
    try {
        const xmpItemId = findIinfXmpItemId(metaBox).itemId;
        const ilocItem = findIlocItem(metaBox, xmpItemId);
        const ilocItemExtent = findIlocItem(metaBox, xmpItemId).extents[0];
        return [
            {
                dataOffset: ilocItem.baseOffset + ilocItemExtent.extentOffset,
                length: ilocItemExtent.extentLength,
            }
        ];
    } catch (error) {
        return undefined;
    }
}

function findIinfXmpItemId(metaBox) {
    return metaBox.subBoxes.find((box) => box.type === 'iinf')
        .itemInfos.find((itemInfo) => itemInfo.itemType === ITEM_INFO_TYPE_MIME && itemInfo.contentType === 'application/rdf+xml');
}

function findIccChunks(metaBox) {
    // This finds the first ICC chunk, but there could be one for each image
    // that is embedded in the file. If it turns out we need to match the ICC
    // chunk to a specific image, we need to check the "ipma" in addition to the
    // "ipco" (currently we only extract the "ipco" so more code would be
    // needed).
    try {
        const icc = metaBox.subBoxes.find((box) => box.type === 'iprp')
            .subBoxes.find((box) => box.type === 'ipco')
            .properties.find((box) => box.type === 'colr')
            .icc;
        if (icc) {
            return [icc];
        }
    } catch (error) {
        // Let it pass through.
    }
    return undefined;
}

function parseFileTypeBox(dataView, contentOffset, boxLength) {
    const MAJOR_BRAND_SIZE = 4;
    const majorBrand = getStringFromDataView(dataView, contentOffset, MAJOR_BRAND_SIZE);

    return {
        type: 'ftyp',
        majorBrand,
        length: boxLength
    };
}

function parseItemPropertiesBox(dataView, startOffset, contentOffset, length) {
    return {
        type: 'iprp',
        subBoxes: parseSubBoxes(dataView, contentOffset, length - (contentOffset - startOffset)),
        length,
    };
}

function parseItemPropertyContainerBox(dataView, startOffset, contentOffset, length) {
    return {
        type: 'ipco',
        properties: parseSubBoxes(dataView, contentOffset, length - (contentOffset - startOffset)),
        length,
    };
}

function parseColorInformationBox(dataView, contentOffset, length) {
    return {
        type: 'colr',
        icc: parseIcc(dataView, contentOffset),
        length,
    };
}

function parseIcc(dataView, contentOffset) {
    const COLOR_TYPE_SIZE = 4;

    const colorType = getStringFromDataView(dataView, contentOffset, COLOR_TYPE_SIZE);
    if (colorType !== 'prof' && colorType !== 'rICC') {
        // Support for nclx would require some restructuring for ICC handling.
        // Probably do it as a separate feature instead of combining with ICC.
        // Exiftool groups it under QuickTime. The test file test.avif has nclx.
        return undefined;
    }

    return {
        offset: contentOffset + COLOR_TYPE_SIZE,
        length: dataView.getUint32(contentOffset + COLOR_TYPE_SIZE),
        chunkNumber: 1,
        chunksTotal: 1
    };
}

function parseMetadataBox(dataView, startOffset, contentOffset, length) {
    const FLAGS_SIZE = 3;

    return {
        type: 'meta',
        subBoxes: parseSubBoxes(dataView, contentOffset + FLAGS_SIZE, length - (contentOffset + FLAGS_SIZE - startOffset)),
        length
    };
}

/**
 * @param {DataView} dataView
 * @param {number} offset The offset to start parsing from.
 * @param {number} length The length of all sub boxes combined.
 * @return {Array<Object>}
 */
function parseSubBoxes(dataView, offset, length) {
    const ACCEPTED_ITEM_INFO_TYPES = [
        ITEM_INFO_TYPE_EXIF,
        ITEM_INFO_TYPE_MIME,
    ];

    const subBoxes = [];
    let currentOffset = offset;
    while (currentOffset < offset + length) {
        const box = parseBox(dataView, currentOffset);
        if (box === undefined) {
            break;
        }
        if (box.type !== undefined && (box.itemType === undefined || ACCEPTED_ITEM_INFO_TYPES.indexOf(box.itemType) !== -1)) {
            subBoxes.push(box);
        }
        currentOffset += box.length;
    }
    return subBoxes;
}

function parseItemInformationBox(dataView, startOffset, version, contentOffset, length) {
    const {offsets} = getItemInformationBoxOffsetsAndSizes(version, contentOffset);

    return {
        type: 'iinf',
        itemInfos: parseSubBoxes(dataView, offsets.itemInfos, length - (offsets.itemInfos - startOffset)),
        length
    };
}

function getItemInformationBoxOffsetsAndSizes(version, contentOffset) {
    const FLAGS_SIZE = 3;

    const offsets = {entryCount: contentOffset + FLAGS_SIZE};
    const sizes = {};

    if (version === 0) {
        sizes.entryCount = 2;
    } else {
        sizes.entryCount = 4;
    }

    offsets.itemInfos = offsets.entryCount + sizes.entryCount;

    return {offsets};
}

function parseItemInformationEntryBox(dataView, startOffset, version, contentOffset, length) {
    const FLAGS_SIZE = 3;

    contentOffset += FLAGS_SIZE;
    const entry = {type: 'infe', length};

    if (version === 0 || version === 1) {
        entry.itemId = dataView.getUint16(contentOffset);
        contentOffset += 2;
        entry.itemProtectionIndex = dataView.getUint16(contentOffset);
        contentOffset += 2;
        entry.itemName = getNullTerminatedStringFromDataView(dataView, contentOffset);
        contentOffset += entry.itemName.length + 1;
        // entry.contentType = getNullTerminatedStringFromDataView(dataView, offset);
        // offset += entry.contentType.length + 1;
        // Since contentEncoding is optional we need to check the offset against length here.
        // entry.contentEncoding = getNullTerminatedStringFromDataView(dataView, offset);
        // offset += entry.contentEncoding.length + 1;
    }
    // The following code should be correct but we currently don't need it.
    // if (version === 1) {
    //     // Everything here is optional, check the offset against length.
    //     entry.extensionType = dataView.getUint32(contentOffset);
    //     contentOffset += 4;
    //     if (entry.extensionType === EXTENSION_TYPE_FDEL) {
    //         entry.contentLocation = getNullTerminatedStringFromDataView(dataView, contentOffset);
    //         contentOffset += entry.contentLocation.length + 1;
    //         entry.contentMd5 = getNullTerminatedStringFromDataView(dataView, contentOffset);
    //         contentOffset += entry.contentMd5.length + 1;
    //         entry.contentLength = get64BitValue(dataView, contentOffset);
    //         contentOffset += 8;
    //         entry.transferLength = get64BitValue(dataView, contentOffset);
    //         contentOffset += 8;
    //         entry.entryCount = dataView.getUint8(contentOffset);
    //         contentOffset += 1;
    //         entry.entries = [];
    //         for (let i = 0; i < entry.entryCount; i++) {
    //             entry.entries.push({groupId: dataView.getUint32(contentOffset)});
    //             contentOffset += 4;
    //         }
    //     }
    // }
    if (version >= 2) {
        if (version === 2) {
            entry.itemId = dataView.getUint16(contentOffset);
            contentOffset += 2;
        } else if (version === 3) {
            entry.itemId = dataView.getUint32(contentOffset);
            contentOffset += 4;
        }
        entry.itemProtectionIndex = dataView.getUint16(contentOffset);
        contentOffset += 2;
        // entry.itemTypeAscii = getStringFromDataView(dataView, offset, 4); // For testing.
        entry.itemType = dataView.getUint32(contentOffset);
        contentOffset += 4;
        entry.itemName = getNullTerminatedStringFromDataView(dataView, contentOffset);
        contentOffset += entry.itemName.length + 1;
        if (entry.itemType === ITEM_INFO_TYPE_MIME) {
            entry.contentType = getNullTerminatedStringFromDataView(dataView, contentOffset);
            contentOffset += entry.contentType.length + 1;
            if (startOffset + length > contentOffset) {
                entry.contentEncoding = getNullTerminatedStringFromDataView(dataView, contentOffset);
                contentOffset += entry.contentEncoding.length + 1;
            }
        } else if (entry.itemType === ITEM_INFO_TYPE_URI) {
            entry.itemUri = getNullTerminatedStringFromDataView(dataView, contentOffset);
            contentOffset += entry.itemUri.length + 1;
        }
    }
    return entry;
}
