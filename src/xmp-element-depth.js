/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {hasSubstringAt, skipPast} from './xmp-namespaces.js';

const WHITESPACE_CHARACTERS = ' \t\r\n';
const NAME_END_CHARACTERS = ' \t\r\n/><="\'';

/**
 * Tells whether an XML string has elements nested deeper than a bound or more
 * markup nodes than a bound, in linear time. The nodes are elements, attributes
 * (namespace declarations included), comments, processing instructions, CDATA
 * sections and <! declarations together; text is not counted. Malformed markup
 * may be counted deeper and with more nodes than @xmldom/xmldom 0.9.12 builds,
 * never shallower or with fewer.
 *
 * @param {string} xmlString
 * @param {number} maxDepth The deepest allowed element, the root being 1.
 * @param {number} [maxNodes] The most markup nodes allowed.
 * @returns {boolean} True as soon as an element is nested deeper than maxDepth
 * or the markup nodes are more than maxNodes.
 */
export function exceedsMarkupBounds(xmlString, maxDepth, maxNodes = Infinity) {
    let depth = 0;
    let nodeCount = 0;
    let index = xmlString.indexOf('<');
    while (index !== -1) {
        if (hasSubstringAt(xmlString, '<!--', index)) {
            nodeCount++;
            index = skipPast(xmlString, index + 4, '-->');
        } else if (hasSubstringAt(xmlString, '<![CDATA[', index)) {
            nodeCount++;
            index = skipPast(xmlString, index + 9, ']]>');
        } else if (hasSubstringAt(xmlString, '<?', index)) {
            nodeCount++;
            index = skipPast(xmlString, index + 2, '?>');
        } else if (hasSubstringAt(xmlString, '<!', index)) {
            nodeCount++;
            index = skipDeclaration(xmlString, index + 2);
        } else if (hasSubstringAt(xmlString, '</', index)) {
            depth = Math.max(depth - 1, 0);
            // xmldom ends an end tag at its first >, whatever comes between.
            index = skipPast(xmlString, index + 2, '>');
        } else {
            if (depth + 1 > maxDepth) {
                return true;
            }
            const nextTagIndex = xmlString.indexOf('<', index + 1);
            const limit = nextTagIndex === -1 ? xmlString.length : nextTagIndex;
            if (!isSelfClosingTag(xmlString, index + 1, limit)) {
                depth++;
            }
            nodeCount += 1 + countAttributes(xmlString, index + 1, limit);
            index++;
        }
        if (nodeCount > maxNodes) {
            return true;
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
function isSelfClosingTag(xmlString, nameIndex, limit) {
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

const TAG = 0;
const ATTRIBUTE_NAME = 1;
const SPACE_AFTER_ATTRIBUTE_NAME = 2;
const EQUALS = 3;
const UNQUOTED_VALUE = 4;
const ATTRIBUTE_END = 5;
const TAG_SPACE = 6;
const TAG_CLOSE = 7;

// Follows the start tag state machine of xmldom 0.9.12 (parseElementStartPart)
// so that no attribute it builds goes uncounted. Every way out before > is
// either the end of the tag or an error that makes xmldom drop the element.
function countAttributes(xmlString, nameIndex, limit) {
    let state = TAG;
    let count = 0;
    for (let index = nameIndex; index < limit; index++) {
        const character = xmlString.charAt(index);
        if (character === '=') {
            if (state !== ATTRIBUTE_NAME && state !== SPACE_AFTER_ATTRIBUTE_NAME) {
                return count;
            }
            state = EQUALS;
        } else if (character === '"' || character === '\'') {
            if (state === EQUALS || state === ATTRIBUTE_NAME) {
                const quoteIndex = xmlString.indexOf(character, index + 1);
                if (quoteIndex === -1 || quoteIndex >= limit) {
                    return count;
                }
                index = quoteIndex;
            } else if (state !== UNQUOTED_VALUE) {
                return count;
            }
            count++;
            state = ATTRIBUTE_END;
        } else if (character === '/') {
            if (state === EQUALS) {
                return count;
            }
            if (state === TAG || state === ATTRIBUTE_END || state === TAG_SPACE) {
                state = TAG_CLOSE;
            }
        } else if (character === '>') {
            return isAttributePending(state) ? count + 1 : count;
        } else if (isXmldomWhitespace(character)) {
            if (state === UNQUOTED_VALUE) {
                count++;
            }
            if (state === TAG || state === UNQUOTED_VALUE || state === ATTRIBUTE_END) {
                state = TAG_SPACE;
            } else if (state === ATTRIBUTE_NAME) {
                state = SPACE_AFTER_ATTRIBUTE_NAME;
            }
        } else {
            if (state === TAG_CLOSE) {
                return count;
            }
            if (state === SPACE_AFTER_ATTRIBUTE_NAME) {
                count++;
            }
            if (state === SPACE_AFTER_ATTRIBUTE_NAME || state === ATTRIBUTE_END || state === TAG_SPACE) {
                state = ATTRIBUTE_NAME;
            } else if (state === EQUALS) {
                state = UNQUOTED_VALUE;
            }
        }
    }
    return isAttributePending(state) ? count + 1 : count;
}

function isAttributePending(state) {
    return state === ATTRIBUTE_NAME || state === SPACE_AFTER_ATTRIBUTE_NAME || state === UNQUOTED_VALUE;
}

// Exactly xmldom's whitespace: every character up to a space, \u0080, and the
// line ends its normalizeLineEndings turns into \n. Adding or removing any
// character lets attributes go uncounted.
function isXmldomWhitespace(character) {
    return character <= ' '
        || character === '\u0080'
        || character === '\u0085'
        || character === '\u2028'
        || character === '\u2029';
}
