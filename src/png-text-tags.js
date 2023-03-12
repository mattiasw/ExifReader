/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringValueFromArray} from './utils.js';
import {TYPE_TEXT, TYPE_ITXT} from './image-header-png.js';

export default {
    read
};

const STATE_KEYWORD = 'STATE_KEYWORD';
const STATE_COMPRESSION = 'STATE_COMPRESSION';
const STATE_LANG = 'STATE_LANG';
const STATE_TRANSLATED_KEYWORD = 'STATE_TRANSLATED_KEYWORD';
const STATE_TEXT = 'STATE_TEXT';
const COMPRESSION_SECTION_LENGTH = 2;

function read(dataView, pngTextChunks) {
    return pngTextChunks.reduce((tags, {offset, length, type}) => {
        const {name, value} = getNameAndValue(dataView, offset, length, type);
        if (name) {
            tags[name] = {
                value,
                description: value
            };
        }
        return tags;
    }, {});
}

function getNameAndValue(dataView, offset, length, type) {
    const keywordChars = [];
    const langChars = [];
    const translatedKeywordChars = [];
    const valueChars = [];
    let parsingState = STATE_KEYWORD;

    for (let i = 0; i < length && offset + i < dataView.byteLength; i++) {
        if (parsingState === STATE_COMPRESSION) {
            const compressionFlag = dataView.getUint8(offset + i);
            if (compressionFlag !== 0) {
                return {}; // We don't support compression.
            }
            i += COMPRESSION_SECTION_LENGTH;
            parsingState = moveToNextState(type, parsingState);
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
        } else {
            valueChars.push(byte);
        }
    }

    return {
        name: getName(type, langChars, keywordChars),
        value: getStringValueFromArray(valueChars)
    };
}

function moveToNextState(type, parsingState) {
    if (parsingState === STATE_KEYWORD && type === TYPE_ITXT) {
        return STATE_COMPRESSION;
    }
    if (parsingState === STATE_COMPRESSION) {
        return STATE_LANG;
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
