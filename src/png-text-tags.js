/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Specification: http://www.libpng.org/pub/png/spec/1.2/

import {getStringValueFromArray, getStringFromDataView, decompress, COMPRESSION_METHOD_NONE} from './utils.js';
import TagDecoder from './tag-decoder.js';
import {TYPE_TEXT, TYPE_ITXT, TYPE_ZTXT} from './image-header-png.js';
import Tags from './tags.js';
import IptcTags from './iptc-tags.js';
import Constants from './constants.js';

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

function read(dataView, pngTextChunks, async, includeUnknown) {
    const tags = {};
    const tagsPromises = [];
    for (let i = 0; i < pngTextChunks.length; i++) {
        const {offset, length, type} = pngTextChunks[i];
        const nameAndValue = getNameAndValue(dataView, offset, length, type, async);
        if (nameAndValue instanceof Promise) {
            tagsPromises.push(nameAndValue.then(({name, value, description}) => {
                try {
                    if (Constants.USE_EXIF && isExifGroupTag(name, value)) {
                        return {
                            __exif: Tags.read(decodeRawData(value), EXIF_OFFSET, includeUnknown).tags
                        };
                    } else if (Constants.USE_IPTC && isIptcGroupTag(name, value)) {
                        return {
                            __iptc: IptcTags.read(decodeRawData(value), 0, includeUnknown)
                        };
                    } else if (name && !isExifGroupTag(name, value) && !isIptcGroupTag(name, value)) {
                        return {
                            [name]: {
                                value,
                                description
                            }
                        };
                    }
                } catch (error) {
                    // Ignore the broken tag.
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
    const decompressedValueChars = decompress(valueChars, compressionMethod, getEncodingFromType(type));
    if (decompressedValueChars instanceof Promise) {
        return decompressedValueChars
            .then((_decompressedValueChars) => constructTag(_decompressedValueChars, type, langChars, keywordChars))
            .catch(() => constructTag('<text using unknown compression>'.split(''), type, langChars, keywordChars));
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
