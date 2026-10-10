/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Specification: http://www.libpng.org/pub/png/spec/1.2/

import {getStringValueFromArray, getStringFromDataView, decompress, setProperty, getTagKey, objectAssign, COMPRESSION_METHOD_NONE, getHexDigitValue} from './utils.js';
import TagDecoder from './tag-decoder.js';
import {PNG_CHUNK_LENGTH_OFFSET, PNG_CHUNK_TYPE_OFFSET, PNG_CHUNK_DATA_OFFSET, PNG_CHUNK_TYPE_SIZE, TYPE_TEXT, TYPE_ITXT, TYPE_ZTXT} from './image-header-png.js';
import Tags from './tags.js';
import IptcTags from './iptc-tags.js';
import Constants from './constants.js';
import {NOOP_TAG_FILTER} from './tag-filter.js';
import {addDecompressedValueAllowance, addDecompressedIptcAllowance, takeEmbeddedExifThumbnail} from './tags-helpers.js';

export default {
    read
};

const STATE_KEYWORD = 'STATE_KEYWORD';
const STATE_COMPRESSION = 'STATE_COMPRESSION';
const STATE_LANG = 'STATE_LANG';
const STATE_TRANSLATED_KEYWORD = 'STATE_TRANSLATED_KEYWORD';
const STATE_TEXT = 'STATE_TEXT';
const COMPRESSION_SECTION_ITXT_EXTRA_BYTE = 1;
const COMPRESSION_FLAG_COMPRESSED = 1;
const EXIF_OFFSET = 6;
const MAX_COMPRESSED_TEXT_CHUNKS = 255;
const MAX_DECOMPRESSIONS_IN_FLIGHT = 4;
// PNG spec: a keyword is 1-79 bytes.
const MAX_KEYWORD_LENGTH = 79;
const IPTC_PROFILE_NAME = 'raw profile type iptc';
// Our own bound: BCP 47 sets no maximum, but real tags are far shorter.
const MAX_LANGUAGE_TAG_LENGTH = 79;

/**
 * @param {number[]} pngTextChunks Chunk start offsets, where each chunk's length field is.
 * @param {function(DataView, object, number): object} [getThumbnail] Called with a
 *     decoded Exif raw profile, its thumbnail IFD tags and the TIFF header offset;
 *     returns the thumbnail tags, with `image` set when the thumbnail was read.
 *     No thumbnail is returned when it is not passed.
 * @param {function(DataView, object, number, number, object, {decompressed: boolean, hasIptcBlock: boolean}): object} [readCarriedGroups]
 *     Called with a decoded Exif raw profile, the Exif tags read from it, the TIFF
 *     header offset, the byte order, the value budget and where the profile came
 *     from: `decompressed` when the chunk was compressed, `hasIptcBlock` when the
 *     file has a `Raw profile type iptc` chunk. Returns the parsed groups the Exif
 *     carries, keyed by group name. No groups are read when it is not passed.
 * @returns {{readTags: object, embeddedExifTags: object|undefined, embeddedIptcTags: object|undefined, embeddedExifThumbnail: object|undefined, exifCarriedGroups: object|undefined, readTagsPromise: Promise<object[]>|undefined}}
 *     `readTags`, the two embedded groups, `exifCarriedGroups` and
 *     `embeddedExifThumbnail` come from uncompressed chunks and are ready at
 *     once; the embedded groups and `exifCarriedGroups` are undefined when no
 *     uncompressed raw profile was parsed, and `embeddedExifThumbnail` is the
 *     first thumbnail with an image. `readTagsPromise` resolves to one result per
 *     compressed chunk, in chunk order, each with its own `exifCarriedGroups`, and
 *     its own `embeddedExifThumbnail` when it has one and no uncompressed chunk
 *     had one, and is undefined when none is read.
 */
function read(
    dataView,
    pngTextChunks,
    async,
    includeUnknown,
    computed = false,
    tagFilter = NOOP_TAG_FILTER,
    decompressConfig,
    valueBudget,
    getThumbnail,
    readCarriedGroups
) {
    const tags = {};
    let embeddedExifTags;
    let embeddedIptcTags;
    let embeddedExifThumbnail;
    let exifCarriedGroups;
    const uncompressedRawProfiles = [];
    const compressedChunks = [];

    for (let i = 0; i < pngTextChunks.length; i++) {
        const chunkOffset = pngTextChunks[i];
        const length = dataView.getUint32(chunkOffset + PNG_CHUNK_LENGTH_OFFSET);
        const type = getStringFromDataView(dataView, chunkOffset + PNG_CHUNK_TYPE_OFFSET, PNG_CHUNK_TYPE_SIZE);
        const textChunk = parseTextChunk(dataView, chunkOffset + PNG_CHUNK_DATA_OFFSET, length, type);
        if (!textChunk) {
            continue;
        }
        if (textChunk.compressionMethod === COMPRESSION_METHOD_NONE) {
            const tag = getUncompressedTag(textChunk);
            if (isRawProfileTag(tag)) {
                uncompressedRawProfiles.push(tag);
            } else if (tag.name && tagFilter.shouldParseGroup('png')) {
                setProperty(tags, getTagKey(tag.name), {
                    value: tag.value,
                    description: tag.description
                });
            }
        } else if (async && compressedChunks.length < MAX_COMPRESSED_TEXT_CHUNKS) {
            compressedChunks.push(textChunk);
        }
    }

    const hasIptcProfile = uncompressedRawProfiles.some((tag) => isIptcGroupTag(tag.name, tag.value))
        || compressedChunks.some(isCompressedIptcProfile);

    for (let i = 0; i < uncompressedRawProfiles.length; i++) {
        const rawProfileTags = getTagsFromTextTag(
            uncompressedRawProfiles[i],
            includeUnknown,
            computed,
            tagFilter,
            valueBudget,
            embeddedExifThumbnail ? undefined : getThumbnail,
            readCarriedGroups,
            false,
            hasIptcProfile
        );
        if (rawProfileTags.embeddedExifTags) {
            embeddedExifTags = objectAssign(embeddedExifTags || {}, rawProfileTags.embeddedExifTags);
        }
        if (rawProfileTags.exifCarriedGroups) {
            exifCarriedGroups = mergeCarriedGroups(exifCarriedGroups || {}, rawProfileTags.exifCarriedGroups);
        }
        if (rawProfileTags.embeddedExifThumbnail) {
            embeddedExifThumbnail = rawProfileTags.embeddedExifThumbnail;
        }
        if (rawProfileTags.embeddedIptcTags) {
            embeddedIptcTags = objectAssign(embeddedIptcTags || {}, rawProfileTags.embeddedIptcTags);
        }
    }

    const compressedThumbnailReader = embeddedExifThumbnail ? undefined : getThumbnail;
    const decompressionTasks = compressedChunks.map((textChunk) => () => decompressTextChunk(textChunk, decompressConfig)
        .then((tag) => getTagsFromTextTag(
            tag,
            includeUnknown,
            computed,
            tagFilter,
            valueBudget,
            compressedThumbnailReader,
            readCarriedGroups,
            true,
            hasIptcProfile
        )));

    return {
        readTags: tags,
        embeddedExifTags,
        embeddedIptcTags,
        embeddedExifThumbnail,
        exifCarriedGroups,
        readTagsPromise: decompressionTasks.length > 0 ? runTasksInOrder(decompressionTasks, MAX_DECOMPRESSIONS_IN_FLIGHT) : undefined
    };
}

// A compressed profile counts before its value can be checked.
function isCompressedIptcProfile({type, langChars, keywordChars}) {
    return getName(type, langChars, keywordChars).toLowerCase() === IPTC_PROFILE_NAME;
}

function mergeCarriedGroups(target, source) {
    const groupKeys = Object.keys(source);
    for (let i = 0; i < groupKeys.length; i++) {
        target[groupKeys[i]] = objectAssign(target[groupKeys[i]] || {}, source[groupKeys[i]]);
    }
    return target;
}

function parseTextChunk(dataView, offset, length, type) {
    const keywordChars = [];
    const langChars = [];
    let valueChars;
    let parsingState = STATE_KEYWORD;
    let compressionMethod = COMPRESSION_METHOD_NONE;
    const byteOffset = dataView.byteOffset || 0;
    const chunkEnd = Math.min(offset + length, dataView.byteLength);

    for (let i = 0; i < length && offset + i < dataView.byteLength; i++) {
        if (parsingState === STATE_COMPRESSION) {
            compressionMethod = getCompressionMethod({type, dataView, offset: offset + i, chunkEnd});
            if (type === TYPE_ITXT) {
                i += COMPRESSION_SECTION_ITXT_EXTRA_BYTE;
            }
            parsingState = moveToNextState(type, parsingState);
            continue;
        } else if (parsingState === STATE_TEXT) {
            const slice = dataView.buffer.slice(byteOffset + offset + i, byteOffset + offset + length);
            // On the Node Buffer wrapper, slice() returns a Buffer, which DataView
            // rejects. Uint8Array copies a Buffer and leaves an ArrayBuffer as is.
            valueChars = new DataView(new Uint8Array(slice).buffer);
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

    return {type, keywordChars, langChars, compressionMethod, valueChars};
}

function getUncompressedTag({type, keywordChars, langChars, valueChars}) {
    const decodedValueChars = decompress(valueChars, COMPRESSION_METHOD_NONE, getEncodingFromType(type), 'string');
    return constructTag(decodedValueChars, type, langChars, keywordChars);
}

function isRawProfileTag({name, value}) {
    return isExifGroupTag(name, value) || isIptcGroupTag(name, value);
}

function getTagsFromTextTag({name, value, description}, includeUnknown, computed, tagFilter, valueBudget, getThumbnail, readCarriedGroups, isDecompressed, hasIptcProfile) {
    try {
        if (Constants.USE_EXIF && isExifGroupTag(name, value)) {
            if (!tagFilter.shouldParseGroup('exif')) {
                return {};
            }
            const exifDataView = decodeRawData(value);
            if (isDecompressed) {
                addDecompressedValueAllowance(valueBudget, exifDataView.byteLength);
            }
            const {tags: embeddedExifTags, byteOrder} = Tags.read(
                exifDataView,
                EXIF_OFFSET,
                includeUnknown,
                computed,
                tagFilter,
                valueBudget
            );
            const result = {embeddedExifTags};
            if (readCarriedGroups) {
                result.exifCarriedGroups = readCarriedGroups(
                    exifDataView,
                    embeddedExifTags,
                    EXIF_OFFSET,
                    byteOrder,
                    valueBudget,
                    {decompressed: isDecompressed, hasIptcBlock: hasIptcProfile}
                );
            }
            if (embeddedExifTags['MakerNote']) {
                delete embeddedExifTags['MakerNote'].__offset;
            }
            const thumbnail = takeEmbeddedExifThumbnail(embeddedExifTags, exifDataView, EXIF_OFFSET, getThumbnail);
            if (thumbnail) {
                result.embeddedExifThumbnail = thumbnail;
            }
            return result;
        } else if (Constants.USE_IPTC && isIptcGroupTag(name, value)) {
            if (!tagFilter.shouldParseGroup('iptc')) {
                return {};
            }
            const iptcDataView = decodeRawData(value);
            if (isDecompressed) {
                addDecompressedIptcAllowance(valueBudget, iptcDataView.byteLength);
            }
            return {
                embeddedIptcTags: IptcTags.read(
                    iptcDataView,
                    0,
                    includeUnknown,
                    tagFilter,
                    valueBudget
                )
            };
        } else if (name && !isExifGroupTag(name, value) && !isIptcGroupTag(name, value)) {
            if (!tagFilter.shouldParseGroup('png')) {
                return {};
            }
            const readTags = {};
            setProperty(readTags, getTagKey(name), {
                value,
                description
            });
            return {readTags};
        }
    } catch (error) {
        // Ignore the broken tag.
    }
    return {};
}

function decompressTextChunk({type, keywordChars, langChars, compressionMethod, valueChars}, decompressConfig) {
    if (valueChars === undefined) {
        return Promise.resolve(constructPlaceholderTag(type, langChars, keywordChars));
    }
    return decompress(valueChars, compressionMethod, getEncodingFromType(type), 'string', decompressConfig)
        .then((decompressedValueChars) => constructTag(decompressedValueChars, type, langChars, keywordChars))
        .catch(() => constructPlaceholderTag(type, langChars, keywordChars));
}

function constructPlaceholderTag(type, langChars, keywordChars) {
    return constructTag('<text using unknown compression>', type, langChars, keywordChars);
}

function runTasksInOrder(tasks, limit) {
    const results = [];
    const workers = [];
    let nextIndex = 0;

    for (let i = 0; i < Math.min(limit, tasks.length); i++) {
        workers.push(runNext());
    }
    return Promise.all(workers).then(() => results);

    function runNext() {
        if (nextIndex >= tasks.length) {
            return Promise.resolve();
        }
        const index = nextIndex++;
        // The wrapper turns a synchronous throw from a task into a rejection
        // that Promise.all observes, instead of an exception out of read().
        return new Promise((resolve) => resolve(tasks[index]())).then((result) => {
            results[index] = result;
            return runNext();
        });
    }
}

function getCompressionMethod({type, dataView, offset, chunkEnd}) {
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

function getEncodingFromType(type) {
    if (type === TYPE_TEXT || type === TYPE_ZTXT) {
        return 'latin1';
    }
    return 'utf-8';
}

function constructTag(valueChars, type, langChars, keywordChars) {
    const value = getValue(valueChars);

    return {
        name: getName(type, langChars, keywordChars),
        value,
        description: type === TYPE_ITXT ? getDescription(valueChars) : value
    };
}

function getName(type, langChars, keywordChars) {
    const name = getStringValueFromArray(keywordChars);
    if (type === TYPE_TEXT || langChars.length === 0) {
        return name;
    }
    const lang = getStringValueFromArray(langChars);
    return `${name} (${lang})`;
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
    return name.toLowerCase() === 'raw profile type exif' && value.substring(1, 5) === 'exif';
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
