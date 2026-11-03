/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Specification: http://www.libpng.org/pub/png/spec/1.2/

import {getStringFromDataView, decompress, getCompressionMethod, setProperty, getTagKey, COMPRESSION_METHOD_NONE, getHexDigitValue} from './utils.js';
import TagDecoder from './tag-decoder.js';
import {TYPE_TEXT, TYPE_ITXT, TYPE_ZTXT, EXIF_PROFILE_NAME, IPTC_PROFILE_NAME} from './image-header-png.js';
import {filterTagsForParse} from './tag-filter.js';

export default {
    read
};

const EXIF_OFFSET = 6;
const MAX_COMPRESSED_TEXT_CHUNKS = 255;

/**
 * Reads one PNG text-chunk block: `{kind, compression?, text: {chunkType, name,
 * valueOffset, valueLength}}`. A block whose `text.name` is undefined (a
 * keyword or language tag over 79 bytes) is skipped, and so is a compressed
 * chunk past the first MAX_COMPRESSED_TEXT_CHUNKS of a load.
 *
 * @param {object} block The finder's block.
 * @param {object} context The load context: `dataView`, `tagFilter` and the
 *     pooled `decompress`.
 * @returns {{tags: object, blocks?: Array<object>}|Promise<{tags: object, blocks?: Array<object>}>|undefined}
 *     The text tag, parse-filtered, or for a raw profile no tags and an emitted
 *     exif or iptc block whose `getDataView()` decodes the profile on demand
 *     (and throws on a bad one). A compressed chunk gives a promise; a
 *     decompression failure gives a placeholder text tag.
 */
function read(block, context) {
    if (block.text.name === undefined) {
        return undefined;
    }
    if (block.compression === undefined) {
        return classify(getUncompressedTag(context.dataView, block.text), context, false);
    }
    if (context.compressedPngTextChunks >= MAX_COMPRESSED_TEXT_CHUNKS) {
        return undefined;
    }
    context.compressedPngTextChunks++;
    return decompressTextChunk(context, block).then((tag) => classify(tag, context, true));
}

// The payload check keeps a chunk whose keyword says profile but whose payload
// does not as a plain text tag.
function classify({name, value, description}, context, decompressed) {
    if (isExifGroupTag(name, value)) {
        return {tags: {}, blocks: [{kind: 'exif', tiffHeaderOffset: EXIF_OFFSET, origin: 'rawProfile', decompressed, getDataView: () => decodeRawData(value)}]};
    }
    if (isIptcGroupTag(name, value)) {
        return {tags: {}, blocks: [{kind: 'iptc', dataOffset: 0, origin: 'rawProfile', decompressed, getDataView: () => decodeRawData(value)}]};
    }
    if (name && context.tagFilter.shouldParseGroup('png')) {
        const tags = {};
        setProperty(tags, getTagKey(name), {value, description});
        return {tags: filterTagsForParse('png', tags, context.tagFilter)};
    }
    return undefined;
}

/**
 * Whether the finder blocks hold a `Raw profile type iptc` text chunk that
 * `read` will read: by payload for an uncompressed chunk, by keyword alone for
 * a compressed one among the first MAX_COMPRESSED_TEXT_CHUNKS named compressed
 * chunks, the ones `read` decompresses.
 *
 * @param {Array<object>} finderBlocks In dispatch order.
 * @param {DataView} dataView The file.
 * @returns {boolean}
 */
export function hasRawIptcProfile(finderBlocks, dataView) {
    let compressedChunks = 0;
    for (let i = 0; i < finderBlocks.length; i++) {
        const block = finderBlocks[i];
        if (block.text === undefined || block.text.name === undefined) {
            continue;
        }
        if (block.compression !== undefined) {
            compressedChunks++;
            if (block.kind === 'iptc' && compressedChunks <= MAX_COMPRESSED_TEXT_CHUNKS) {
                return true;
            }
        } else if (block.kind === 'iptc' && isUncompressedIptcProfile(block, dataView)) {
            return true;
        }
    }
    return false;
}

function isUncompressedIptcProfile(block, dataView) {
    const tag = getUncompressedTag(dataView, block.text);
    return isIptcGroupTag(tag.name, tag.value);
}

function getUncompressedTag(dataView, text) {
    const decodedValueChars = decompress(getValueView(dataView, text), COMPRESSION_METHOD_NONE, getEncodingFromType(text.chunkType), 'string');
    return constructTag(decodedValueChars, text.chunkType, text.name);
}

// The same slice the parser made while it copied the value: the chunk's declared
// end, clamped to the buffer by slice itself.
function getValueView(dataView, {valueOffset, valueLength}) {
    if (valueOffset === undefined) {
        return undefined;
    }
    const byteOffset = dataView.byteOffset;
    return new DataView(dataView.buffer.slice(byteOffset + valueOffset, byteOffset + valueOffset + valueLength));
}

function decompressTextChunk(context, {compression, text}) {
    const valueView = getValueView(context.dataView, text);
    if (valueView === undefined) {
        return Promise.resolve(constructPlaceholderTag(text));
    }
    return context.decompress(valueView, getCompressionMethod(compression), getEncodingFromType(text.chunkType), 'string')
        .then((decompressedValueChars) => constructTag(decompressedValueChars, text.chunkType, text.name))
        .catch(() => constructPlaceholderTag(text));
}

function constructPlaceholderTag({chunkType, name}) {
    return constructTag('<text using unknown compression>', chunkType, name);
}

function getEncodingFromType(type) {
    if (type === TYPE_TEXT || type === TYPE_ZTXT) {
        return 'latin1';
    }
    return 'utf-8';
}

function constructTag(valueChars, chunkType, name) {
    const value = getValue(valueChars);

    return {
        name,
        value,
        description: chunkType === TYPE_ITXT ? getDescription(valueChars) : value
    };
}

function getValue(valueChars) {
    if (valueChars instanceof DataView) {
        return getStringFromDataView(valueChars, 0, valueChars.byteLength);
    }
    return valueChars;
}

function getDescription(valueChars) {
    return TagDecoder.decode('UTF-8', valueChars);
}

function isExifGroupTag(name, value) {
    return name.toLowerCase() === EXIF_PROFILE_NAME && value.substring(1, 5) === 'exif';
}

function isIptcGroupTag(name, value) {
    return name.toLowerCase() === IPTC_PROFILE_NAME && value.substring(1, 5) === 'iptc';
}

function decodeRawData(value) {
    const header = /\n(exif|iptc)\n\s*\d+\n/.exec(value);
    if (!header) {
        throw new Error('Invalid raw profile header.');
    }
    const dataStart = header.index + header[0].length;
    const digitCount = countHexDigits(value, dataStart);
    if (digitCount % 2 !== 0) {
        throw new Error('Odd number of hex digits in raw profile.');
    }

    const bytes = new Uint8Array(digitCount / 2);
    let byteIndex = 0;
    let highNibble = -1;
    for (let i = dataStart; i < value.length; i++) {
        const nibble = getHexDigitValue(value.charCodeAt(i));
        if (nibble < 0) {
            // Newlines and any other non-hex character are skipped, as ImageMagick and exiv2 do.
            continue;
        }
        if (highNibble < 0) {
            highNibble = nibble;
        } else {
            bytes[byteIndex++] = (highNibble << 4) | nibble;
            highNibble = -1;
        }
    }
    return new DataView(bytes.buffer);
}

function countHexDigits(value, start) {
    let count = 0;
    for (let i = start; i < value.length; i++) {
        if (getHexDigitValue(value.charCodeAt(i)) >= 0) {
            count++;
        }
    }
    return count;
}
