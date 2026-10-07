/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {decodeUtf8ByteString, getStringFromDataView, objectAssign, setProperty, tryDecodeUtf8ByteString} from './utils.js';
import XmpTagNames from './xmp-tag-names.js';
import DOMParser from './dom-parser.js';
import TextDecoder from './text-decoder.js';
import {isMissingNamespaceError, addMissingNamespaces} from './xmp-namespaces.js';

export default {
    read
};

// Node names differ between parsers (#cdata-section vs #cdatasection), so
// nodes are told apart by their DOM nodeType.
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;
const PROCESSING_INSTRUCTION_NODE = 7;
const COMMENT_NODE = 8;

const PACKET_TRAILER_START = '<?xpacket end="';
const PACKET_TRAILER_END = '"?>';

// Each nested value repeats the descriptions of everything below it, so the
// description text grows with the square of the nesting depth.
const MAX_NESTING_DEPTH = 32;

// Parsing is synchronous and oneLevelDeeper always restores the counter, so
// one counter serves every read.
let nestingDepth = 0;

class ParseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ParseError';
    }
}

function read(dataView, chunks, domParser) {
    const tags = {};

    if (typeof dataView === 'string') {
        readTags(tags, dataView, domParser);
        return tags;
    }

    const [standardXmp, extendedXmp] = extractCompleteChunks(dataView, chunks);

    const hasStandardTags = readTags(tags, standardXmp, domParser);

    if (extendedXmp) {
        const hasExtendedTags = readTags(tags, extendedXmp, domParser);

        if (!hasStandardTags && !hasExtendedTags) {
            // Some writers are not spec-compliant in that they split an XMP
            // metadata tree over both the standard XMP block and the extended
            // XMP block. If we failed parsing both of the XMPs in the regular
            // way, we try to combine them to see if that works better.
            delete tags._raw;
            readTags(tags, combineChunks(dataView, chunks), domParser);
        }
    }

    return tags;
}

// The first chunk is always the regular XMP document. Then there is something
// called extended XMP. The extended XMP is also a single XMP document but it
// can be divided into multiple chunks that need to be combined into one.
function extractCompleteChunks(dataView, chunks) {
    if (chunks.length === 0) {
        return [];
    }

    const completeChunks = [combineChunks(dataView, chunks.slice(0, 1))];
    if (chunks.length > 1) {
        completeChunks.push(combineChunks(dataView, chunks.slice(1)));
    }

    return completeChunks;
}

function combineChunks(dataView, chunks) {
    const slices = chunks.map((chunk) => getBoundedChunkBytes(dataView, chunk));
    const totalLength = slices.reduce((size, slice) => size + slice.length, 0);
    const combinedChunks = new Uint8Array(totalLength);
    let offset = 0;

    for (let i = 0; i < slices.length; i++) {
        combinedChunks.set(slices[i], offset);
        offset += slices[i].length;
    }

    return new DataView(combinedChunks.buffer);
}

// A chunk length comes verbatim from the image and is not trusted. Bound it to
// the bytes actually present so a crafted length cannot force a huge allocation.
function getBoundedChunkBytes(dataView, chunk) {
    // The bound is the view's own extent, not the buffer's, since the slice
    // starts at the view's byteOffset.
    const bufferLength = dataView.byteLength;
    const byteOffset = dataView.byteOffset || 0;
    const start = Math.min(Math.max(chunk.dataOffset, 0), bufferLength);
    const end = Math.min(start + Math.max(chunk.length, 0), bufferLength);
    return new Uint8Array(dataView.buffer.slice(byteOffset + start, byteOffset + end));
}

function readTags(tags, chunkDataView, domParser) {
    try {
        const {doc, raw, decodeValue} = getDocument(chunkDataView, domParser);
        tags._raw = (tags._raw || '') + raw;
        const rdf = getRDF(doc);

        const xmpTags = {};
        parseXMPObject(convertToObject(rdf, true, decodeValue), xmpTags, Object.create(null));
        objectAssign(tags, xmpTags);
        return true;
    } catch (error) {
        return false;
    }
}

function getDocument(chunkDataView, _domParser) {
    const domParser = DOMParser.get(_domParser);
    if (!domParser) {
        console.warn('Warning: DOMParser is not available. It is needed to be able to parse XMP tags.'); // eslint-disable-line no-console
        throw new Error();
    }

    const {xmlString, decodeValue} = decodeXmlSource(chunkDataView);
    const doc = parseFromString(domParser, trimXmlSource(xmlString));

    return {
        doc,
        raw: xmlString,
        decodeValue
    };
}

// The packet has to be decoded before it is parsed. When it is parsed one
// character per byte, the UTF-8 encoding of e.g. Å (0xC3 0x85) contains a lone
// U+0085, which xmldom turns into a line feed before parsing (an XML 1.1 line
// ending). That corrupts element text, and attribute value normalization then
// makes it a space. XMP is UTF-8 by specification, but some writers store a
// single-byte encoding. Such a packet is parsed one character per byte and
// each value is decoded on its own afterwards where it is valid UTF-8.
function decodeXmlSource(source) {
    if (typeof source === 'string') {
        return decodeByteString(source);
    }
    const Decoder = TextDecoder.get();
    if (Decoder !== undefined) {
        try {
            return {
                xmlString: new Decoder('utf-8', {fatal: true}).decode(source),
                decodeValue: keepValue
            };
        } catch (error) {
            // Not valid UTF-8.
        }
    }
    return decodeByteString(getStringFromDataView(source, 0, source.byteLength));
}

function decodeByteString(byteString) {
    const decoded = tryDecodeUtf8ByteString(byteString);
    if (decoded !== undefined) {
        return {xmlString: decoded, decodeValue: keepValue};
    }
    return {xmlString: byteString, decodeValue: decodeUtf8ByteString};
}

function keepValue(value) {
    return value;
}

function trimXmlSource(xmlSource) {
    return trimAfterPacketTrailer(xmlSource.replace(/^.+(<\?xpacket begin)/, '$1'));
}

// Gives the same result as the former /(<\?xpacket end=".*"\?>).+$/ in linear
// time: only text after a trailer on the last line is cut off.
function trimAfterPacketTrailer(xmlSource) {
    const lastLineStart = Math.max(
        xmlSource.lastIndexOf('\n'),
        xmlSource.lastIndexOf('\r'),
        xmlSource.lastIndexOf('\u2028'),
        xmlSource.lastIndexOf('\u2029')
    ) + 1;
    const trailerStart = xmlSource.indexOf(PACKET_TRAILER_START, lastLineStart);
    if (trailerStart === -1) {
        return xmlSource;
    }
    const trailerEnd = xmlSource.lastIndexOf(PACKET_TRAILER_END, xmlSource.length - PACKET_TRAILER_END.length - 1);
    if (trailerEnd < trailerStart + PACKET_TRAILER_START.length) {
        return xmlSource;
    }
    return xmlSource.slice(0, trailerEnd + PACKET_TRAILER_END.length);
}

function parseFromString(domParser, xmlString, isRetry = false) {
    try {
        const doc = domParser.parseFromString(xmlString, 'application/xml');
        const errors = doc.getElementsByTagName('parsererror');
        if (errors.length > 0) {
            throw new ParseError(errors[0].textContent);
        }
        return doc;
    } catch (error) {
        if (error.name === 'ParseError' && isMissingNamespaceError(error) && !isRetry) {
            // Retry once after trying to fix the invalid XML.
            return parseFromString(domParser, addMissingNamespaces(xmlString), true);
        }
        throw error;
    }
}

function getRDF(node) {
    const childNodes = node.childNodes;

    for (let i = 0; i < childNodes.length; i++) {
        if (childNodes[i].tagName === 'x:xmpmeta') {
            return getRDF(childNodes[i]);
        }
        if (childNodes[i].tagName === 'rdf:RDF') {
            return childNodes[i];
        }
    }

    throw new Error();
}

function convertToObject(node, isTopNode, decodeValue) {
    const childNodes = getChildNodes(node);

    if (hasTextOnlyContent(childNodes)) {
        if (isTopNode) {
            return {};
        }
        return decodeValue(getTextValue(childNodes));
    }

    return getElementsFromNodes(childNodes, decodeValue);
}

function getChildNodes(node) {
    const childNodes = node.childNodes;
    const nodes = [];

    for (let i = 0; i < childNodes.length; i++) {
        if (!isCommentOrProcessingInstruction(childNodes[i])) {
            nodes.push(childNodes[i]);
        }
    }

    return nodes;
}

function isCommentOrProcessingInstruction(node) {
    return node.nodeType === COMMENT_NODE || node.nodeType === PROCESSING_INSTRUCTION_NODE;
}

function hasTextOnlyContent(nodes) {
    return nodes.length > 0 && nodes.every(isText);
}

function isText(node) {
    return node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE;
}

// linkedom splits text at every entity or character reference, and a CDATA
// section is a node of its own, so the text of an element can span several nodes.
function getTextValue(nodes) {
    return nodes.map((node) => node.nodeValue).join('');
}

// The elements object must not have a prototype. The element names come from
// the image, so an element named e.g. constructor would be found among the
// inherited properties, and one named __proto__ would replace the prototype.
function getElementsFromNodes(nodes, decodeValue) {
    const elements = Object.create(null);

    nodes.forEach((node) => {
        if (isElement(node)) {
            const nodeElement = getElementFromNode(node, decodeValue);

            if (elements[node.nodeName] !== undefined) {
                if (!Array.isArray(elements[node.nodeName])) {
                    elements[node.nodeName] = [elements[node.nodeName]];
                }
                elements[node.nodeName].push(nodeElement);
            } else {
                elements[node.nodeName] = nodeElement;
            }
        }
    });

    return elements;
}

function isElement(node) {
    return node.nodeType === ELEMENT_NODE;
}

function getElementFromNode(node, decodeValue) {
    return {
        attributes: getAttributes(node, decodeValue),
        value: convertToObject(node, false, decodeValue)
    };
}

function getAttributes(element, decodeValue) {
    const elementAttributes = element.attributes;
    const attributes = {};

    for (let i = 0; i < elementAttributes.length; i++) {
        setProperty(attributes, elementAttributes[i].nodeName, decodeValue(elementAttributes[i].value));
    }

    return attributes;
}

function parseXMPObject(xmpObject, tags, plainDescriptions) {
    for (const nodeName in xmpObject) {
        let nodes = xmpObject[nodeName];

        if (!Array.isArray(nodes)) {
            nodes = [nodes];
        }

        nodes.forEach((node) => {
            parseNodeAttributesAsTags(node.attributes, tags, plainDescriptions);
            if (typeof node.value === 'object') {
                parseNodeChildrenAsTags(node.value, tags, plainDescriptions);
            }
        });
    }
}

function parseNodeAttributesAsTags(attributes, tags, plainDescriptions) {
    for (const name in attributes) {
        try {
            if (isTagAttribute(name)) {
                setParsedTag(tags, plainDescriptions, getLocalName(name), createParsedTag(attributes[name], attributes[name], {}, name));
            }
        } catch (error) {
            // Keep going and try to parse the rest of the tags.
        }
    }
}

function isTagAttribute(name) {
    return (name !== 'rdf:parseType') && (!isNamespaceDefinition(name));
}

function isNamespaceDefinition(name) {
    return name.split(':')[0] === 'xmlns';
}

function setParsedTag(tags, plainDescriptions, name, parsedTag) {
    setProperty(tags, name, parsedTag.tag);
    setProperty(plainDescriptions, name, parsedTag.plainDescription);
}

function getLocalName(name) {
    if (/^MicrosoftPhoto(_\d+_)?:Rating$/i.test(name)) {
        return 'RatingPercent';
    }
    return name.split(':')[1];
}

// A parent describes its members without their description functions, so
// each parsed tag carries that plain description next to the tag itself.
function createParsedTag(value, plainDescription, attributes, name) {
    return {
        tag: {
            value,
            attributes,
            description: getDescription(value, plainDescription, name)
        },
        plainDescription
    };
}

function getDescription(value, plainDescription, name) {
    if (!hasTagNameFunction(name) || isObject(value)) {
        return plainDescription;
    }
    if (Array.isArray(value)) {
        // A description is a string, so a description function written for
        // a plain value is ignored when it throws on a list or returns
        // something other than a string.
        try {
            const description = XmpTagNames[name](value, plainDescription);
            if (typeof description === 'string') {
                return description;
            }
        } catch (error) {
            // Fall back to the descriptions of the items.
        }
        return plainDescription;
    }
    try {
        return XmpTagNames[name](value);
    } catch (error) {
        return value;
    }
}

// The name comes from the image, so an inherited property of the tag name table
// must not be mistaken for a description function.
function hasTagNameFunction(name) {
    return Object.prototype.hasOwnProperty.call(XmpTagNames, name) && (typeof XmpTagNames[name] === 'function');
}

function isObject(value) {
    return (typeof value === 'object') && !Array.isArray(value);
}

function parseNodeChildrenAsTags(children, tags, plainDescriptions) {
    oneLevelDeeper(() => {
        for (const name in children) {
            try {
                if (!isNamespaceDefinition(name)) {
                    setParsedTag(tags, plainDescriptions, getLocalName(name), parseNodeAsTag(children[name], name));
                }
            } catch (error) {
                // Keep going and try to parse the rest of the tags.
            }
        }
    });
}

function oneLevelDeeper(callback) {
    nestingDepth++;
    try {
        if (nestingDepth > MAX_NESTING_DEPTH) {
            // Lands in the catch of the nearest parseNodeChildrenAsTags, which
            // drops the tag.
            throw new ParseError(`XMP value nested deeper than ${MAX_NESTING_DEPTH} levels.`);
        }
        return callback();
    } finally {
        nestingDepth--;
    }
}

function parseNodeAsTag(node, name) {
    if (isDuplicateTag(node)) {
        return parseNodeAsDuplicateTag(node, name);
    }
    if (isEmptyResourceTag(node)) {
        return {tag: {value: '', attributes: {}, description: ''}, plainDescription: ''};
    }
    if (hasNestedSimpleRdfDescription(node)) {
        return parseNodeAsSimpleRdfDescription(node, name);
    }
    if (hasNestedStructureRdfDescription(node)) {
        return parseNodeAsStructureRdfDescription(node, name);
    }
    if (isCompactStructure(node)) {
        return parseNodeAsCompactStructure(node, name);
    }
    if (isArray(node)) {
        return parseNodeAsArray(node, name);
    }
    return parseNodeAsSimpleValue(node, name);
}

function isEmptyResourceTag(node) {
    return (node.attributes['rdf:parseType'] === 'Resource')
        && (typeof node.value === 'string')
        && (node.value.trim() === '');
}

function isDuplicateTag(node) {
    return Array.isArray(node);
}

function parseNodeAsDuplicateTag(node, name) {
    return parseNodeAsSimpleValue(node[node.length - 1], name);
}

function hasNestedSimpleRdfDescription(node) {
    return ((node.attributes['rdf:parseType'] === 'Resource') && (node.value['rdf:value'] !== undefined))
        || ((node.value['rdf:Description'] !== undefined) && (node.value['rdf:Description'].value['rdf:value'] !== undefined));
}

function parseNodeAsSimpleRdfDescription(node, name) {
    const attributes = parseNodeAttributes(node);

    if (node.value['rdf:Description'] !== undefined) {
        node = node.value['rdf:Description'];
    }

    objectAssign(attributes, parseNodeAttributes(node), parseNodeChildrenAsAttributes(node));

    const {value, plainDescription} = parseRdfValue(node);

    return createParsedTag(value, plainDescription, attributes, name);
}

function parseNodeAttributes(node) {
    const attributes = {};

    for (const name in node.attributes) {
        if ((name !== 'rdf:parseType') && (name !== 'rdf:resource') && (!isNamespaceDefinition(name))) {
            setProperty(attributes, getLocalName(name), node.attributes[name]);
        }
    }

    return attributes;
}

function parseNodeChildrenAsAttributes(node) {
    const attributes = {};

    if (typeof node.value !== 'object') {
        return attributes;
    }

    for (const name in node.value) {
        if ((name !== 'rdf:value') && (!isNamespaceDefinition(name))) {
            setProperty(attributes, getLocalName(name), node.value[name].value);
        }
    }

    return attributes;
}

function parseRdfValue(node) {
    const rdfValueNode = getLastNode(node.value['rdf:value']);
    const uri = getURIValue(rdfValueNode);
    if (uri) {
        return {value: uri, plainDescription: uri};
    }
    return parseRdfValueContent(rdfValueNode);
}

// Repeated elements are collected into an array, and the last one wins, which
// is how a repeated tag is handled too.
function getLastNode(node) {
    if (isDuplicateTag(node)) {
        return node[node.length - 1];
    }
    return node;
}

// An rdf:value element stands in for the tag element, so a list inside it is
// the value of the tag rather than a tag of its own.
function parseRdfValueContent(rdfValueNode) {
    if (isArray(rdfValueNode)) {
        // Lists nested in rdf:value elements never pass parseNodeChildrenAsTags, so each one is a level.
        return oneLevelDeeper(() => parseArrayItems(rdfValueNode));
    }
    if (typeof rdfValueNode.value === 'object') {
        // The child names come from the image, so a child named __proto__ must
        // not be able to replace this object's prototype.
        const tags = Object.create(null);
        const plainDescriptions = Object.create(null);
        parseNodeChildrenAsTags(rdfValueNode.value, tags, plainDescriptions);
        return {value: tags, plainDescription: getDescriptionOfObject(tags, plainDescriptions)};
    }
    return {value: rdfValueNode.value, plainDescription: rdfValueNode.value};
}

function getDescriptionOfObject(tags, plainDescriptions) {
    const descriptions = [];

    for (const key in tags) {
        descriptions.push(`${getClearTextKey(key)}: ${plainDescriptions[key]}`);
    }

    return descriptions.join('; ');
}

function getClearTextKey(key) {
    if (key === 'CiAdrCity') {
        return 'CreatorCity';
    }
    if (key === 'CiAdrCtry') {
        return 'CreatorCountry';
    }
    if (key === 'CiAdrExtadr') {
        return 'CreatorAddress';
    }
    if (key === 'CiAdrPcode') {
        return 'CreatorPostalCode';
    }
    if (key === 'CiAdrRegion') {
        return 'CreatorRegion';
    }
    if (key === 'CiEmailWork') {
        return 'CreatorWorkEmail';
    }
    if (key === 'CiTelWork') {
        return 'CreatorWorkPhone';
    }
    if (key === 'CiUrlWork') {
        return 'CreatorWorkUrl';
    }
    return key;
}

function hasNestedStructureRdfDescription(node) {
    return (node.attributes['rdf:parseType'] === 'Resource')
        || ((node.value['rdf:Description'] !== undefined) && (node.value['rdf:Description'].value['rdf:value'] === undefined));
}

function parseNodeAsStructureRdfDescription(node, name) {
    const value = {};
    const plainDescriptions = Object.create(null);
    const attributes = {};

    if (node.value['rdf:Description'] !== undefined) {
        parseNodeAttributesAsTags(node.value['rdf:Description'].attributes, value, plainDescriptions);
        objectAssign(attributes, parseNodeAttributes(node));
        node = node.value['rdf:Description'];
    }

    if (typeof node.value === 'object') {
        parseNodeChildrenAsTags(node.value, value, plainDescriptions);
    }

    return createParsedTag(value, getDescriptionOfObject(value, plainDescriptions), attributes, name);
}

function isCompactStructure(node) {
    return isEmptyValue(node.value)
        && (node.attributes['xml:lang'] === undefined)
        && (node.attributes['rdf:resource'] === undefined);
}

// A text-only element has a string value; enumerating it would visit every character.
function isEmptyValue(value) {
    if (typeof value === 'string') {
        return value === '';
    }
    return Object.keys(value).length === 0;
}

function parseNodeAsCompactStructure(node, name) {
    const value = {};
    const plainDescriptions = Object.create(null);

    parseNodeAttributesAsTags(node.attributes, value, plainDescriptions);

    return createParsedTag(value, getDescriptionOfObject(value, plainDescriptions), {}, name);
}

function isArray(node) {
    return getArrayChild(node.value) !== undefined;
}

function getArrayChild(value) {
    return getLastNode(value['rdf:Bag'] || value['rdf:Seq'] || value['rdf:Alt']);
}

function parseNodeAsArray(node, name) {
    const attributes = parseNodeAttributes(node);
    const {value, plainDescription} = parseArrayItems(node);

    return createParsedTag(value, plainDescription, attributes, name);
}

function parseArrayItems(node) {
    let items = getArrayChild(node.value).value['rdf:li'];
    const value = [];
    const itemDescriptions = [];

    if (items === undefined) {
        items = [];
    } else if (!Array.isArray(items)) {
        items = [items];
    }

    items.forEach((item) => {
        const parsedItem = parseArrayValue(item);
        value.push(parsedItem.value);
        itemDescriptions.push(parsedItem.plainDescription);
    });

    return {value, plainDescription: itemDescriptions.join(', ')};
}

function parseArrayValue(item) {
    if (hasNestedSimpleRdfDescription(item)) {
        return getParsedTagAsItem(parseNodeAsSimpleRdfDescription(item));
    }
    if (hasNestedStructureRdfDescription(item)) {
        return getParsedStructureAsItem(parseNodeAsStructureRdfDescription(item));
    }
    if (isCompactStructure(item)) {
        return getParsedStructureAsItem(parseNodeAsCompactStructure(item));
    }

    return getParsedTagAsItem(parseNodeAsSimpleValue(item));
}

function getParsedTagAsItem(parsedTag) {
    return {value: parsedTag.tag, plainDescription: parsedTag.plainDescription};
}

function getParsedStructureAsItem(parsedStructure) {
    return {value: parsedStructure.tag.value, plainDescription: parsedStructure.plainDescription};
}

function parseNodeAsSimpleValue(node, name) {
    const {value, plainDescription} = parseSimpleValue(node);
    return createParsedTag(value, plainDescription, parseNodeAttributes(node), name);
}

function parseSimpleValue(node) {
    const uri = getURIValue(node);
    if (uri) {
        return {value: uri, plainDescription: uri};
    }
    if (typeof node.value === 'string') {
        return {value: node.value, plainDescription: node.value};
    }
    const tags = {};
    const plainDescriptions = Object.create(null);
    parseXMPObject(node.value, tags, plainDescriptions);
    return {value: tags, plainDescription: getDescriptionOfObject(tags, plainDescriptions)};
}

function getURIValue(node) {
    return node.attributes && node.attributes['rdf:resource'];
}
