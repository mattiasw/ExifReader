/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {hasSubstringAt, skipPast} from './xmp-namespaces.js';

const WHITESPACE_CHARACTERS = ' \t\r\n';
const NAME_END_CHARACTERS = ' \t\r\n/><="\'';

/**
 * Tells whether the elements of an XML string are nested deeper than a bound,
 * in linear time. Malformed markup may be counted deeper than @xmldom/xmldom
 * 0.9.12 builds it, never shallower.
 *
 * @param {string} xmlString
 * @param {number} maxDepth The deepest allowed element, the root being 1.
 * @returns {boolean} True as soon as an element is nested deeper than maxDepth.
 */
export function exceedsElementDepth(xmlString, maxDepth) {
    let depth = 0;
    let index = xmlString.indexOf('<');
    while (index !== -1) {
        if (hasSubstringAt(xmlString, '<!--', index)) {
            index = skipPast(xmlString, index + 4, '-->');
        } else if (hasSubstringAt(xmlString, '<![CDATA[', index)) {
            index = skipPast(xmlString, index + 9, ']]>');
        } else if (hasSubstringAt(xmlString, '<?', index)) {
            index = skipPast(xmlString, index + 2, '?>');
        } else if (hasSubstringAt(xmlString, '<!', index)) {
            index = skipDeclaration(xmlString, index + 2);
        } else if (hasSubstringAt(xmlString, '</', index)) {
            depth = Math.max(depth - 1, 0);
            // xmldom ends an end tag at its first >, whatever comes between.
            index = skipPast(xmlString, index + 2, '>');
        } else {
            if (depth + 1 > maxDepth) {
                return true;
            }
            if (!isSelfClosingTag(xmlString, index + 1)) {
                depth++;
            }
            index++;
        }
        index = xmlString.indexOf('<', index);
    }
    return false;
}

// Stopping at [ lets the main loop read the declarations of a DOCTYPE internal
// subset one by one.
function skipDeclaration(xmlString, fromIndex) {
    for (let index = fromIndex; index < xmlString.length; index++) {
        const character = xmlString.charAt(index);
        if (character === '"' || character === '\'') {
            index = xmlString.indexOf(character, index + 1);
            if (index === -1) {
                return xmlString.length;
            }
        } else if (character === '>' || character === '[') {
            return index + 1;
        }
    }
    return xmlString.length;
}

// A start tag cannot hold a <, so every search in it stops at the next <, which
// keeps the scan linear. Only a well-formed tag is read as self-closing: some
// parsers keep a malformed one open, so reading it as open can only count deeper.
function isSelfClosingTag(xmlString, nameIndex) {
    const nextTagIndex = xmlString.indexOf('<', nameIndex);
    const limit = nextTagIndex === -1 ? xmlString.length : nextTagIndex;
    let index = skipName(xmlString, nameIndex, limit);
    if (index === nameIndex) {
        return false;
    }
    for (;;) {
        const attributeIndex = skipWhitespace(xmlString, index, limit);
        if (hasSubstringAt(xmlString, '/>', attributeIndex)) {
            return true;
        }
        if (attributeIndex === index) {
            return false;
        }
        index = skipAttribute(xmlString, attributeIndex, limit);
        if (index === -1) {
            return false;
        }
    }
}

function skipName(xmlString, fromIndex, limit) {
    let index = fromIndex;
    while (index < limit && NAME_END_CHARACTERS.indexOf(xmlString.charAt(index)) === -1) {
        index++;
    }
    return index;
}

function skipWhitespace(xmlString, fromIndex, limit) {
    let index = fromIndex;
    while (index < limit && WHITESPACE_CHARACTERS.indexOf(xmlString.charAt(index)) !== -1) {
        index++;
    }
    return index;
}

// Only a quoted value is well-formed.
function skipAttribute(xmlString, nameIndex, limit) {
    const nameEndIndex = skipName(xmlString, nameIndex, limit);
    if (nameEndIndex === nameIndex) {
        return -1;
    }
    const equalsIndex = skipWhitespace(xmlString, nameEndIndex, limit);
    if (xmlString.charAt(equalsIndex) !== '=') {
        return -1;
    }
    const quoteIndex = skipWhitespace(xmlString, equalsIndex + 1, limit);
    const quote = xmlString.charAt(quoteIndex);
    if (quote !== '"' && quote !== '\'') {
        return -1;
    }
    for (let index = quoteIndex + 1; index < limit; index++) {
        if (xmlString.charAt(index) === quote) {
            return index + 1;
        }
    }
    return -1;
}
