/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {iccTags, iccProfile, sliceToString} from './icc-tag-names.js';
import {getStringFromDataView, getUnicodeStringFromDataView, decompress, COMPRESSION_METHOD_NONE, COMPRESSION_METHOD_DEFLATE} from './utils.js';

export default {
    read
};

const PROFILE_HEADER_LENGTH = 84;
const ICC_TAG_COUNT_OFFSET = 128;
const ICC_SIGNATURE = 'acsp';
const TAG_TYPE_DESC = 'desc';
const TAG_TYPE_MULTI_LOCALIZED_UNICODE_TYPE = 'mluc';
const TAG_TYPE_TEXT = 'text';
const TAG_TYPE_SIGNATURE = 'sig ';
const TAG_TABLE_SINGLE_TAG_DATA = 12;
const MIN_MULTI_LOCALIZED_UNICODE_RECORD_SIZE = 12;
const MULTI_LOCALIZED_UNICODE_RECORDS_OFFSET = 16;

// ICC profile data can be longer than application segment max length of ~64k.
// so it can be split into multiple APP2 segments. Each segment includes
// total chunk count and chunk number.
// Here we read all chunks into single continuous array of bytes.
// Compressed ICC profile data only has support for a single chunk.
function read(dataView, iccData, async, decompressConfig) {
    if (async && iccData[0].compressionMethod !== COMPRESSION_METHOD_NONE) {
        return readCompressedIcc(dataView, iccData, decompressConfig);
    }

    return readIcc(dataView, iccData);
}

function readCompressedIcc(dataView, iccData, decompressConfig) {
    if (!compressionMethodIsSupported(iccData[0].compressionMethod)) {
        return {};
    }
    const compressedDataView = new DataView(dataView.buffer.slice(iccData[0].offset, iccData[0].offset + iccData[0].length));
    return decompress(compressedDataView, iccData[0].compressionMethod, 'utf-8', 'dataview', decompressConfig)
        .then(parseTags)
        .catch(() => ({}));
}

function compressionMethodIsSupported(compressionMethod) {
    return compressionMethod === COMPRESSION_METHOD_DEFLATE;
}

function readIcc(dataView, iccData) {
    try {
        const totalIccProfileLength = iccData.reduce((sum, icc) => sum + icc.length, 0);

        const iccBinaryData = new Uint8Array(totalIccProfileLength);
        let offset = 0;
        const buffer = getBuffer(dataView);

        for (let chunkNumber = 1; chunkNumber <= iccData.length; chunkNumber++) {
            const iccDataChunk = iccData.find((x) => x.chunkNumber === chunkNumber);
            if (!iccDataChunk) {
                throw new Error(`ICC chunk ${chunkNumber} not found`);
            }

            const data = buffer.slice(iccDataChunk.offset, iccDataChunk.offset + iccDataChunk.length);
            const chunkData = new Uint8Array(data);

            iccBinaryData.set(chunkData, offset);
            offset += chunkData.length;
        }

        return parseTags(new DataView(iccBinaryData.buffer));
    } catch (error) {
        return {};
    }
}

function getBuffer(dataView) {
    if (Array.isArray(dataView)) {
        return (new DataView(Uint8Array.from(dataView).buffer)).buffer;
    }
    return dataView.buffer;
}

function iccDoesNotHaveTagCount(dataView) {
    return dataView.byteLength < (ICC_TAG_COUNT_OFFSET + 4);
}

function doesNotHaveTagData(dataView, tagHeaderOffset) {
    return dataView.byteLength < tagHeaderOffset + TAG_TABLE_SINGLE_TAG_DATA;
}

export function parseTags(dataView) {
    const MAX_MLUC_RECORDS = 1000;
    const buffer = dataView.buffer;

    const length = dataView.getUint32();
    if (dataView.byteLength !== length) {
        throw new Error('ICC profile length not matching');
    }

    if (dataView.byteLength < PROFILE_HEADER_LENGTH) {
        throw new Error('ICC profile too short');
    }

    const tags = {};

    const iccProfileKeys = Object.keys(iccProfile);
    for (let i = 0; i < iccProfileKeys.length; i++) {
        const offset = iccProfileKeys[i];
        const profileEntry = iccProfile[offset];
        const value = profileEntry.value(dataView, parseInt(offset, 10));
        let description = value;
        if (profileEntry.description) {
            description = profileEntry.description(value);
        }

        tags[profileEntry.name] = {
            value,
            description
        };
    }

    const signature = sliceToString(buffer.slice(36, 40));
    if (signature !== ICC_SIGNATURE) {
        throw new Error('ICC profile: missing signature');
    }

    /* ICC data is incomplete but we have header parsed so lets return it */
    if (iccDoesNotHaveTagCount(dataView)) {
        return tags;
    }

    const tagCount = dataView.getUint32(128);
    let tagHeaderOffset = 132;
    // Budget for the total mluc text decoded across the whole profile. Caps
    // the decoded text at O(profile size); real profiles use a small fraction.
    let remainingMlucTextBytes = dataView.byteLength;

    for (let i = 0; i < tagCount; i++) {
        if (doesNotHaveTagData(dataView, tagHeaderOffset)) {
            // Not enough room left for the next tag table entry, return what we parsed until now
            return tags;
        }
        const tagSignature = getStringFromDataView(dataView, tagHeaderOffset, 4);
        const tagOffset = dataView.getUint32(tagHeaderOffset + 4);
        const tagSize = dataView.getUint32(tagHeaderOffset + 8);

        if (tagOffset > dataView.byteLength) {
            // Tag data is invalid, lets return what we managed to parse
            return tags;
        }
        const tagType = getStringFromDataView(dataView, tagOffset, 4);

        if (tagType === TAG_TYPE_DESC) {
            const tagValueSize = dataView.getUint32(tagOffset + 8);
            if (tagValueSize > tagSize) {
                // Tag data is invalid, lets return what we managed to parse
                return tags;
            }

            const val = sliceToString(buffer.slice(tagOffset + 12, tagOffset + tagValueSize + 11));
            addTag(tags, tagSignature, val);
        } else if (tagType === TAG_TYPE_MULTI_LOCALIZED_UNICODE_TYPE) {
            const numRecords = dataView.getUint32(tagOffset + 8);
            const recordSize = dataView.getUint32(tagOffset + 12);
            if (recordSize < MIN_MULTI_LOCALIZED_UNICODE_RECORD_SIZE) {
                return tags;
            }
            if (numRecords > MAX_MLUC_RECORDS) {
                return tags;
            }
            const recordsSize = numRecords * recordSize;
            const availableRecordsSize = dataView.byteLength - tagOffset
                - MULTI_LOCALIZED_UNICODE_RECORDS_OFFSET;
            if (recordsSize > availableRecordsSize) {
                return tags;
            }
            // Records may legitimately share or overlap their text within a
            // tag, so clamp each read to the tag bounds and draw from a
            // profile-wide text budget rather than assuming non-overlapping
            // storage. This caps the total decoded text at O(profile size)
            // without truncating real profiles.
            const tagTextEnd = Math.min(tagSize, dataView.byteLength - tagOffset);
            let offset = tagOffset + MULTI_LOCALIZED_UNICODE_RECORDS_OFFSET;
            const val = [];
            for (let recordNum = 0; recordNum < numRecords; recordNum++) {
                const languageCode = getStringFromDataView(dataView, offset + 0, 2);
                const countryCode = getStringFromDataView(dataView, offset + 2, 2);
                const textLength = dataView.getUint32(offset + 4);
                const textOffset = dataView.getUint32(offset + 8);

                const availableInTag = Math.max(0, tagTextEnd - textOffset);
                const boundedTextLength = Math.min(textLength, availableInTag, remainingMlucTextBytes);
                remainingMlucTextBytes -= boundedTextLength;
                const text = getUnicodeStringFromDataView(dataView, tagOffset + textOffset, boundedTextLength);
                val.push({languageCode, countryCode, text});
                offset += recordSize;
            }
            if (numRecords === 1) {
                addTag(tags, tagSignature, val[0].text);
            } else {
                const valObj = {};
                for (let valIndex = 0; valIndex < val.length; valIndex++) {
                    valObj[`${val[valIndex].languageCode}-${val[valIndex].countryCode}`] = val[valIndex].text;
                }
                addTag(tags, tagSignature, valObj);
            }
        } else if (tagType === TAG_TYPE_TEXT) {
            const val = sliceToString(buffer.slice(tagOffset + 8, tagOffset + tagSize - 7));
            addTag(tags, tagSignature, val);
        } else if (tagType === TAG_TYPE_SIGNATURE) {
            const val = sliceToString(buffer.slice(tagOffset + 8, tagOffset + 12));
            addTag(tags, tagSignature, val);
        }
        tagHeaderOffset = tagHeaderOffset + 12;
    }

    return tags;
}

function addTag(tags, tagSignature, value) {
    if (iccTags[tagSignature]) {
        tags[iccTags[tagSignature].name] = {value, description: value};
    } else {
        tags[tagSignature] = {value, description: value};
    }
}
