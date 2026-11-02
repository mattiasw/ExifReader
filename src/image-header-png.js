/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Specification: http://www.libpng.org/pub/png/spec/1.2/

import {getStringFromDataView, getStringValueFromArray, addBlock, pushRange, COMPRESSION_METHOD_NONE, MAX_METADATA_BLOCKS} from './utils.js';

export default {
    isPngFile,
    findPngOffsets
};

const PNG_ID = '\x89\x50\x4e\x47\x0d\x0a\x1a\x0a';
const PNG_CHUNK_LENGTH_SIZE = 4;
export const PNG_CHUNK_TYPE_SIZE = 4;
export const PNG_CHUNK_LENGTH_OFFSET = 0;
export const PNG_CHUNK_TYPE_OFFSET = PNG_CHUNK_LENGTH_SIZE;
export const PNG_CHUNK_DATA_OFFSET = PNG_CHUNK_LENGTH_SIZE + PNG_CHUNK_TYPE_SIZE;
const PNG_XMP_PREFIX = 'XML:com.adobe.xmp\x00';
export const TYPE_TEXT = 'tEXt';
export const TYPE_ITXT = 'iTXt';
export const TYPE_ZTXT = 'zTXt';
export const TYPE_PHYS = 'pHYs';
export const TYPE_TIME = 'tIME';
export const TYPE_EXIF = 'eXIf';
export const TYPE_ICCP = 'iCCP';
// PNG spec: an iCCP profile name is at most 79 bytes, like a text keyword.
const MAX_ICC_PROFILE_NAME_LENGTH = 79;
export const EXIF_PROFILE_NAME = 'raw profile type exif';
export const IPTC_PROFILE_NAME = 'raw profile type iptc';
const STATE_KEYWORD = 'STATE_KEYWORD';
const STATE_COMPRESSION = 'STATE_COMPRESSION';
const STATE_LANG = 'STATE_LANG';
const STATE_TRANSLATED_KEYWORD = 'STATE_TRANSLATED_KEYWORD';
const STATE_TEXT = 'STATE_TEXT';
const COMPRESSION_SECTION_ITXT_EXTRA_BYTE = 1;
const COMPRESSION_FLAG_COMPRESSED = 1;
const COMPRESSION_METHOD_DEFLATE = 0;
// PNG spec: a keyword is 1-79 bytes.
const MAX_KEYWORD_LENGTH = 79;
// Our own bound: BCP 47 sets no maximum, but real tags are far shorter.
const MAX_LANGUAGE_TAG_LENGTH = 79;
// Guards against memory exhaustion from a crafted file: every text chunk is its
// own block, and a file of 8 MiB holds 600,000 empty ones. Real files have tens.
const MAX_TEXT_CHUNK_BLOCKS = MAX_METADATA_BLOCKS;
// A text chunk past the cap is listed against the shared block of its type and
// never read, so that metadataRange still covers it.
const DROPPED_TEXT_CHUNK_BLOCKS = {};
DROPPED_TEXT_CHUNK_BLOCKS[TYPE_TEXT] = getDroppedTextChunkBlock(TYPE_TEXT);
DROPPED_TEXT_CHUNK_BLOCKS[TYPE_ITXT] = getDroppedTextChunkBlock(TYPE_ITXT);
DROPPED_TEXT_CHUNK_BLOCKS[TYPE_ZTXT] = getDroppedTextChunkBlock(TYPE_ZTXT);

function getDroppedTextChunkBlock(chunkType) {
    return {kind: 'pngText', text: {chunkType, name: undefined, valueOffset: undefined, valueLength: undefined}};
}

/**
 * Checks if the provided data view represents a PNG file.
 *
 * @param {DataView} dataView The data view to check.
 * @returns {boolean} True if the data view starts with the PNG signature.
 */
function isPngFile(dataView) {
    return !!dataView && getStringFromDataView(dataView, 0, PNG_ID.length) === PNG_ID;
}

/**
 * Walks the PNG chunk list and reports the blocks ExifReader reads.
 *
 * Every tEXt, iTXt and zTXt chunk but the XMP iTXt is its own block, classified
 * by keyword: `exif` for a raw Exif profile, `iptc` for a raw IPTC profile and
 * `pngText` for anything else, with `compression` set for a compressed chunk.
 * zTXt chunks are reported in every mode; the orchestrator decides whether a
 * compressed block is read. Text chunks past the first MAX_TEXT_CHUNK_BLOCKS
 * are only listed in `ranges`.
 *
 * @param {DataView} dataView The data view to find blocks in.
 * @param {Array<Object>=} ranges Optional out-array. When provided, receives
 *     one `{block, start, end}` span per recognized chunk and gets
 *     `truncated` set to true if the loop never saw an IEND chunk.
 * @returns {Array<Object>} The blocks, in chunk order.
 */
function findPngOffsets(dataView, ranges) {
    const PNG_CRC_SIZE = 4;
    const TYPE_IEND = 'IEND';
    const TYPE_IHDR = 'IHDR';

    const blocks = [];
    let fileBlock;
    let xmpBlock;
    let exifBlock;
    let iccBlock;
    let textChunkCount = 0;

    let offset = PNG_ID.length;
    let sawIEnd = false;

    while (offset + PNG_CHUNK_LENGTH_SIZE + PNG_CHUNK_TYPE_SIZE <= dataView.byteLength) {
        let block;
        const chunkDataLength = dataView.getUint32(offset + PNG_CHUNK_LENGTH_OFFSET);
        const chunkType = getStringFromDataView(dataView, offset + PNG_CHUNK_TYPE_OFFSET, PNG_CHUNK_TYPE_SIZE);

        if (chunkType === TYPE_IEND) {
            sawIEnd = true;
        } else if (chunkType === TYPE_IHDR) {
            fileBlock = fileBlock || addBlock(blocks, {kind: 'pngFile'});
            fileBlock.dataOffset = offset + PNG_CHUNK_DATA_OFFSET;
            block = fileBlock;
        } else if (isPngXmpChunk(dataView, chunkType, offset)) {
            const dataOffset = getPngXmpDataOffset(dataView, offset);
            if (dataOffset !== undefined) {
                xmpBlock = xmpBlock || addBlock(blocks, {kind: 'xmp'});
                xmpBlock.chunks = [{
                    dataOffset,
                    length: chunkDataLength - (dataOffset - (offset + PNG_CHUNK_DATA_OFFSET))
                }];
                block = xmpBlock;
            }
        } else if (isPngTextChunk(chunkType)) {
            if (textChunkCount < MAX_TEXT_CHUNK_BLOCKS) {
                block = addBlock(blocks, getTextChunkBlock(dataView, offset + PNG_CHUNK_DATA_OFFSET, chunkDataLength, chunkType));
            } else {
                block = DROPPED_TEXT_CHUNK_BLOCKS[chunkType];
            }
            textChunkCount++;
        } else if (chunkType === TYPE_EXIF) {
            exifBlock = exifBlock || addBlock(blocks, {kind: 'exif'});
            exifBlock.tiffHeaderOffset = offset + PNG_CHUNK_DATA_OFFSET;
            block = exifBlock;
        } else if (chunkType === TYPE_ICCP) {
            const iccHeaderOffset = offset + PNG_CHUNK_DATA_OFFSET;
            const iccHeader = parseIccHeader(dataView, iccHeaderOffset, chunkDataLength);
            if (iccHeader !== undefined) {
                // PNG spec: a file has at most one iCCP chunk, so only the first valid one is kept.
                if (!iccBlock) {
                    iccBlock = addBlock(blocks, {
                        kind: 'icc',
                        compression: iccHeader.compressionMethod === COMPRESSION_METHOD_DEFLATE ? 'deflate' : 'unknown',
                        chunks: [{
                            offset: iccHeader.compressedProfileOffset,
                            length: chunkDataLength - (iccHeader.compressedProfileOffset - iccHeaderOffset),
                            chunkNumber: 1,
                            chunksTotal: 1,
                            profileName: iccHeader.profileName,
                            compressionMethod: iccHeader.compressionMethod
                        }]
                    });
                }
                block = iccBlock;
            }
        } else if (isPngChunk(chunkType)) {
            block = addBlock(blocks, {kind: 'pngChunk', dataOffset: offset + PNG_CHUNK_LENGTH_OFFSET});
        }

        const chunkTotalSize = chunkDataLength
            + PNG_CHUNK_LENGTH_SIZE
            + PNG_CHUNK_TYPE_SIZE
            + PNG_CRC_SIZE;

        pushRange(ranges, block, offset, offset + chunkTotalSize);

        offset += chunkTotalSize;
    }

    if (ranges) {
        ranges.truncated = !sawIEnd;
    }

    return blocks;
}

function isPngXmpChunk(dataView, chunkType, offset) {
    return (chunkType === TYPE_ITXT)
        && (getStringFromDataView(dataView, offset + PNG_CHUNK_DATA_OFFSET, PNG_XMP_PREFIX.length) === PNG_XMP_PREFIX);
}

function isPngTextChunk(chunkType) {
    return chunkType === TYPE_TEXT || chunkType === TYPE_ITXT || chunkType === TYPE_ZTXT;
}

function isPngChunk(chunkType) {
    const SUPPORTED_PNG_CHUNK_TYPES = [TYPE_PHYS, TYPE_TIME];
    return SUPPORTED_PNG_CHUNK_TYPES.includes(chunkType);
}

// The block carries where the text bytes are, not a copy of them: a block the
// orchestrator hides or a group the filter leaves out is never read.
function getTextChunkBlock(dataView, offset, length, chunkType) {
    const textChunk = parseTextChunk(dataView, offset, length, chunkType);
    if (textChunk === undefined) {
        return getDroppedTextChunkBlock(chunkType);
    }
    const name = getName(chunkType, textChunk.langChars, textChunk.keywordChars);
    const block = {kind: getTextChunkKind(name)};
    if (textChunk.compressionMethod !== COMPRESSION_METHOD_NONE) {
        block.compression = textChunk.compressionMethod === COMPRESSION_METHOD_DEFLATE ? 'deflate' : 'unknown';
    }
    block.text = {chunkType, name, valueOffset: textChunk.valueOffset, valueLength: textChunk.valueLength};
    return block;
}

function parseTextChunk(dataView, offset, length, type) {
    const keywordChars = [];
    const langChars = [];
    let valueOffset;
    let valueLength;
    let parsingState = STATE_KEYWORD;
    let compressionMethod = COMPRESSION_METHOD_NONE;
    const chunkEnd = Math.min(offset + length, dataView.byteLength);

    for (let i = 0; i < length && offset + i < dataView.byteLength; i++) {
        if (parsingState === STATE_COMPRESSION) {
            compressionMethod = getTextChunkCompressionMethod({type, dataView, offset: offset + i, chunkEnd});
            if (type === TYPE_ITXT) {
                i += COMPRESSION_SECTION_ITXT_EXTRA_BYTE;
            }
            parsingState = moveToNextState(type, parsingState);
            continue;
        } else if (parsingState === STATE_TEXT) {
            valueOffset = offset + i;
            valueLength = length - i;
            break;
        }
        const byte = dataView.getUint8(offset + i);
        if (byte === 0) {
            parsingState = moveToNextState(type, parsingState);
        } else if (parsingState === STATE_KEYWORD) {
            if (keywordChars.length >= MAX_KEYWORD_LENGTH) {
                return undefined;
            }
            keywordChars.push(byte);
        } else if (parsingState === STATE_LANG) {
            if (langChars.length >= MAX_LANGUAGE_TAG_LENGTH) {
                return undefined;
            }
            langChars.push(byte);
        }
    }

    return {keywordChars, langChars, compressionMethod, valueOffset, valueLength};
}

function getTextChunkCompressionMethod({type, dataView, offset, chunkEnd}) {
    if (type === TYPE_ITXT) {
        if (offset + 1 < chunkEnd && dataView.getUint8(offset) === COMPRESSION_FLAG_COMPRESSED) {
            return dataView.getUint8(offset + 1);
        }
    } else if (type === TYPE_ZTXT) {
        return dataView.getUint8(offset);
    }
    return COMPRESSION_METHOD_NONE;
}

function moveToNextState(type, parsingState) {
    if (parsingState === STATE_KEYWORD && [TYPE_ITXT, TYPE_ZTXT].includes(type)) {
        return STATE_COMPRESSION;
    }
    if (parsingState === STATE_COMPRESSION) {
        if (type === TYPE_ITXT) {
            return STATE_LANG;
        }
        return STATE_TEXT;
    }
    if (parsingState === STATE_LANG) {
        return STATE_TRANSLATED_KEYWORD;
    }
    return STATE_TEXT;
}

function getName(type, langChars, keywordChars) {
    const name = getStringValueFromArray(keywordChars);
    if (type === TYPE_TEXT || langChars.length === 0) {
        return name;
    }
    const lang = getStringValueFromArray(langChars);
    return `${name} (${lang})`;
}

// A raw profile is told by its keyword here; the reader checks the payload
// and reads a block whose value is not a profile as plain text.
function getTextChunkKind(name) {
    const lowerCaseName = name.toLowerCase();
    if (lowerCaseName === EXIF_PROFILE_NAME) {
        return 'exif';
    }
    if (lowerCaseName === IPTC_PROFILE_NAME) {
        return 'iptc';
    }
    return 'pngText';
}

function getPngXmpDataOffset(dataView, offset) {
    const COMPRESSION_FLAG_SIZE = 1;
    const COMPRESSION_METHOD_SIZE = 1;

    offset += PNG_CHUNK_DATA_OFFSET + PNG_XMP_PREFIX.length + COMPRESSION_FLAG_SIZE + COMPRESSION_METHOD_SIZE;

    let numberOfNullSeparators = 0;
    while (numberOfNullSeparators < 2 && offset < dataView.byteLength) {
        if (dataView.getUint8(offset) === 0x00) {
            numberOfNullSeparators++;
        }
        offset++;
    }
    if (numberOfNullSeparators < 2) {
        return undefined;
    }
    return offset;
}

function parseIccHeader(dataView, offset, chunkDataLength) {
    const NULL_SEPARATOR_SIZE = 1;
    const COMPRESSION_METHOD_SIZE = 1;
    const chunkEnd = Math.min(offset + chunkDataLength, dataView.byteLength);

    const profileNameLength = getIccProfileNameLength(dataView, offset, chunkEnd);
    if (profileNameLength === undefined) {
        return undefined;
    }
    const compressionMethodOffset = offset + profileNameLength + NULL_SEPARATOR_SIZE;
    if (compressionMethodOffset + COMPRESSION_METHOD_SIZE > chunkEnd) {
        return undefined;
    }

    return {
        profileName: getStringFromDataView(dataView, offset, profileNameLength),
        compressionMethod: dataView.getUint8(compressionMethodOffset),
        compressedProfileOffset: compressionMethodOffset + COMPRESSION_METHOD_SIZE
    };
}

function getIccProfileNameLength(dataView, offset, chunkEnd) {
    for (let i = 0; i <= MAX_ICC_PROFILE_NAME_LENGTH && offset + i < chunkEnd; i++) {
        if (dataView.getUint8(offset + i) === 0) {
            return i;
        }
    }
    return undefined;
}
