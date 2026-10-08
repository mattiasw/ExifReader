/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Specification: http://www.libpng.org/pub/png/spec/1.2/

import {getStringValueFromArray, getStringFromDataView, decompress, setProperty, COMPRESSION_METHOD_NONE} from './utils.js';
import TagDecoder from './tag-decoder.js';
import {TYPE_TEXT, TYPE_ITXT, TYPE_ZTXT} from './image-header-png.js';
import Tags from './tags.js';
import IptcTags from './iptc-tags.js';
import Constants from './constants.js';
import {NOOP_TAG_FILTER} from './tag-filter.js';

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
// Our own bound: BCP 47 sets no maximum, but real tags are far shorter.
const MAX_LANGUAGE_TAG_LENGTH = 79;

function read(
    dataView,
    pngTextChunks,
    async,
    includeUnknown,
    computed = false,
    tagFilter = NOOP_TAG_FILTER,
    decompressConfig,
    valueBudget
) {
    const tags = {};
    const decompressionTasks = [];

    for (let i = 0; i < pngTextChunks.length; i++) {
        const {offset, length, type} = pngTextChunks[i];
        const textChunk = parseTextChunk(dataView, offset, length, type);
        if (!textChunk) {
            continue;
        }
        if (textChunk.compressionMethod === COMPRESSION_METHOD_NONE) {
            const {name, value, description} = getUncompressedTag(textChunk);
            if (name && tagFilter.shouldParseGroup('png')) {
                setProperty(tags, name, {
                    value,
                    description
                });
            }
        } else if (async && decompressionTasks.length < MAX_COMPRESSED_TEXT_CHUNKS) {
            decompressionTasks.push(() => decompressTextChunk(textChunk, decompressConfig)
                .then((tag) => getTagsFromDecompressedTag(tag, includeUnknown, computed, tagFilter, valueBudget)));
        }
    }

    return {
        readTags: tags,
        readTagsPromise: decompressionTasks.length > 0 ? runTasksInOrder(decompressionTasks, MAX_DECOMPRESSIONS_IN_FLIGHT) : undefined
    };
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

function getTagsFromDecompressedTag({name, value, description}, includeUnknown, computed, tagFilter, valueBudget) {
    try {
        if (Constants.USE_EXIF && isExifGroupTag(name, value)) {
            if (!tagFilter.shouldParseGroup('exif')) {
                return {};
            }
            return {
                embeddedExifTags: Tags.read(
                    decodeRawData(value),
                    EXIF_OFFSET,
                    includeUnknown,
                    computed,
                    tagFilter,
                    valueBudget
                ).tags
            };
        } else if (Constants.USE_IPTC && isIptcGroupTag(name, value)) {
            if (!tagFilter.shouldParseGroup('iptc')) {
                return {};
            }
            return {
                embeddedIptcTags: IptcTags.read(
                    decodeRawData(value),
                    0,
                    includeUnknown,
                    tagFilter
                )
            };
        } else if (name && !isExifGroupTag(name, value) && !isIptcGroupTag(name, value)) {
            if (!tagFilter.shouldParseGroup('png')) {
                return {};
            }
            const readTags = {};
            setProperty(readTags, name, {
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
    return name.toLowerCase() === 'raw profile type iptc' && value.substring(1, 5) === 'iptc';
}

function decodeRawData(value) {
    const parts = value.match(/\n(exif|iptc)\n\s*\d+\n([\s\S]*)$/);
    return hexToDataView(parts[2].replace(/\n/g, ''));
}

function hexToDataView(hex) {
    const dataView = new DataView(new ArrayBuffer(hex.length / 2));
    for (let i = 0; i < hex.length; i += 2) {
        dataView.setUint8(i / 2, parseInt(hex.substring(i, i + 2), 16));
    }
    return dataView;
}
