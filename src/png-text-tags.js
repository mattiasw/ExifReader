/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Specification: http://www.libpng.org/pub/png/spec/1.2/

import {getStringValueFromArray, getStringFromDataView} from './utils.js';
import TagDecoder from './tag-decoder.js';
import {TYPE_TEXT, TYPE_ITXT, TYPE_ZTXT} from './image-header-png.js';

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
const COMPRESSION_METHOD_NONE = undefined;
const COMPRESSION_METHOD_DEFLATE = 0;

function read(dataView, pngTextChunks, async) {
    const tags = {};
    const tagsPromises = [];
    for (let i = 0; i < pngTextChunks.length; i++) {
        const {offset, length, type} = pngTextChunks[i];
        const nameAndValue = getNameAndValue(dataView, offset, length, type, async);
        if (nameAndValue instanceof Promise) {
            tagsPromises.push(nameAndValue.then(({name, value, description}) => {
                if (name) {
                    return {
                        [name]: {
                            value,
                            description
                        }
                    };
                }
                return {};
            }));
        } else {
            const {name, value, description} = nameAndValue;
            if (name) {
                tags[name] = {
                    value,
                    description
                };
            }
        }
    }

    return {
        readTags: tags,
        readTagsPromise: tagsPromises.length > 0 ? Promise.all(tagsPromises) : undefined
    };
}

function getNameAndValue(dataView, offset, length, type, async) {
    const keywordChars = [];
    const langChars = [];
    const translatedKeywordChars = [];
    let valueChars;
    let parsingState = STATE_KEYWORD;
    let compressionMethod = COMPRESSION_METHOD_NONE;

    for (let i = 0; i < length && offset + i < dataView.byteLength; i++) {
        if (parsingState === STATE_COMPRESSION) {
            compressionMethod = getCompressionMethod({type, dataView, offset: offset + i});
            if (type === TYPE_ITXT) {
                i += COMPRESSION_SECTION_ITXT_EXTRA_BYTE;
            }
            parsingState = moveToNextState(type, parsingState);
            continue;
        } else if (parsingState === STATE_TEXT) {
            valueChars = new DataView(dataView.buffer.slice(offset + i, offset + length));
            break;
        }
        const byte = dataView.getUint8(offset + i);
        if (byte === 0) {
            parsingState = moveToNextState(type, parsingState);
        } else if (parsingState === STATE_KEYWORD) {
            keywordChars.push(byte);
        } else if (parsingState === STATE_LANG) {
            langChars.push(byte);
        } else if (parsingState === STATE_TRANSLATED_KEYWORD) {
            translatedKeywordChars.push(byte);
        }
    }

    if (compressionMethod !== COMPRESSION_METHOD_NONE && !async) {
        return {};
    }
    const decompressedValueChars = getDecompressedValueChars(valueChars, compressionMethod);
    if (decompressedValueChars instanceof Promise) {
        return decompressedValueChars.then((_decompressedValueChars) => constructTag(_decompressedValueChars, type, langChars, keywordChars));
    }
    return constructTag(decompressedValueChars, type, langChars, keywordChars);
}

function getCompressionMethod({type, dataView, offset}) {
    if (type === TYPE_ITXT) {
        if (dataView.getUint8(offset) === COMPRESSION_FLAG_COMPRESSED) {
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

function getDecompressedValueChars(valueChars, compressionMethod) {
    if (compressionMethod === COMPRESSION_METHOD_DEFLATE) {
        if (typeof DecompressionStream === 'function') {
            const decompressionStream = new DecompressionStream('deflate');
            const decompressedStream = new Blob([valueChars]).stream().pipeThrough(decompressionStream);
            return new Response(decompressedStream).text();
        }
    }
    if (compressionMethod !== undefined) {
        return Promise.resolve('<text using unknown compression>'.split(''));
    }
    return valueChars;
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
