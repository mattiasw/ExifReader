/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Specification: http://www.libpng.org/pub/png/spec/1.2/

import {getStringFromDataView, decompress, getCompressionMethod, setProperty, getTagKey, objectAssign, COMPRESSION_METHOD_NONE, getHexDigitValue} from './utils.js';
import TagDecoder from './tag-decoder.js';
import {TYPE_TEXT, TYPE_ITXT, TYPE_ZTXT, EXIF_PROFILE_NAME, IPTC_PROFILE_NAME} from './image-header-png.js';
import {NOOP_TAG_FILTER} from './tag-filter.js';
import {addDecompressedValueAllowance, addDecompressedIptcAllowance, takeEmbeddedExifThumbnail} from './tags-helpers.js';

export default {
    read
};

const EXIF_OFFSET = 6;
const MAX_COMPRESSED_TEXT_CHUNKS = 255;
const MAX_DECOMPRESSIONS_IN_FLIGHT = 4;

/**
 * @param {Array<Object>} textBlocks The PNG finder's text-chunk blocks, in chunk order:
 *     `{kind, compression?, text: {chunkType, name, valueOffset, valueLength}}`.
 *     A block whose `text.name` is undefined (a keyword or language tag over
 *     79 bytes) is skipped.
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
 * @param {{exif?: function(DataView, number, boolean, boolean, object, object): {tags: object, byteOrder: number}, iptc?: function(DataView, number, boolean, object, object): object}} [rawProfileReaders]
 *     Read the decoded `Raw profile type exif` and `Raw profile type iptc`
 *     profiles: `exif(dataView, tiffHeaderOffset, includeUnknown, computed,
 *     tagFilter, valueBudget)` as Tags.read and `iptc(dataView, offset,
 *     includeUnknown, tagFilter, valueBudget)` as IptcTags.read. A profile
 *     whose reader is missing is neither decoded nor read.
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
    textBlocks,
    async,
    includeUnknown,
    computed = false,
    tagFilter = NOOP_TAG_FILTER,
    decompressConfig,
    valueBudget,
    getThumbnail,
    readCarriedGroups,
    rawProfileReaders = {}
) {
    const tags = {};
    let embeddedExifTags;
    let embeddedIptcTags;
    let embeddedExifThumbnail;
    let exifCarriedGroups;
    const uncompressedRawProfiles = [];
    const compressedChunks = [];

    for (let i = 0; i < textBlocks.length; i++) {
        const block = textBlocks[i];
        if (block.text.name === undefined) {
            continue;
        }
        if (block.compression === undefined) {
            const tag = getUncompressedTag(dataView, block.text);
            if (isRawProfileTag(tag)) {
                uncompressedRawProfiles.push(tag);
            } else if (tag.name && tagFilter.shouldParseGroup('png')) {
                setProperty(tags, getTagKey(tag.name), {
                    value: tag.value,
                    description: tag.description
                });
            }
        } else if (async && compressedChunks.length < MAX_COMPRESSED_TEXT_CHUNKS) {
            compressedChunks.push(block);
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
            hasIptcProfile,
            rawProfileReaders
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
    const decompressionTasks = compressedChunks.map((block) => () => decompressTextChunk(dataView, block, decompressConfig)
        .then((tag) => getTagsFromTextTag(
            tag,
            includeUnknown,
            computed,
            tagFilter,
            valueBudget,
            compressedThumbnailReader,
            readCarriedGroups,
            true,
            hasIptcProfile,
            rawProfileReaders
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
function isCompressedIptcProfile(block) {
    return block.kind === 'iptc';
}

function mergeCarriedGroups(target, source) {
    const groupKeys = Object.keys(source);
    for (let i = 0; i < groupKeys.length; i++) {
        target[groupKeys[i]] = objectAssign(target[groupKeys[i]] || {}, source[groupKeys[i]]);
    }
    return target;
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

function isRawProfileTag({name, value}) {
    return isExifGroupTag(name, value) || isIptcGroupTag(name, value);
}

function getTagsFromTextTag({name, value, description}, includeUnknown, computed, tagFilter, valueBudget, getThumbnail, readCarriedGroups, isDecompressed, hasIptcProfile, rawProfileReaders) {
    try {
        if (isExifGroupTag(name, value)) {
            if (!rawProfileReaders.exif || !tagFilter.shouldParseGroup('exif')) {
                return {};
            }
            const exifDataView = decodeRawData(value);
            if (isDecompressed) {
                addDecompressedValueAllowance(valueBudget, exifDataView.byteLength);
            }
            const {tags: embeddedExifTags, byteOrder} = rawProfileReaders.exif(
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
        } else if (isIptcGroupTag(name, value)) {
            if (!rawProfileReaders.iptc || !tagFilter.shouldParseGroup('iptc')) {
                return {};
            }
            const iptcDataView = decodeRawData(value);
            if (isDecompressed) {
                addDecompressedIptcAllowance(valueBudget, iptcDataView.byteLength);
            }
            return {
                embeddedIptcTags: rawProfileReaders.iptc(
                    iptcDataView,
                    0,
                    includeUnknown,
                    tagFilter,
                    valueBudget
                )
            };
        } else if (name) {
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

function decompressTextChunk(dataView, {compression, text}, decompressConfig) {
    const valueView = getValueView(dataView, text);
    if (valueView === undefined) {
        return Promise.resolve(constructPlaceholderTag(text));
    }
    return decompress(valueView, getCompressionMethod(compression), getEncodingFromType(text.chunkType), 'string', decompressConfig)
        .then((decompressedValueChars) => constructTag(decompressedValueChars, text.chunkType, text.name))
        .catch(() => constructPlaceholderTag(text));
}

function constructPlaceholderTag({chunkType, name}) {
    return constructTag('<text using unknown compression>', chunkType, name);
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
