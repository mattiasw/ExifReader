export function isMissingNamespaceError(error) {
    const missingNamespaceStrings = [
        // @xmldom/xmldom
        'prefix is non-null and namespace is null',
        // Firefox
        'prefix not bound to a namespace', // en
        'prefix inte bundet till en namnrymd', // sv
        // Chrome
        /Namespace prefix .+ is not defined/
    ];

    for (let i = 0; i < missingNamespaceStrings.length; i++) {
        const regexp = new RegExp(missingNamespaceStrings[i]);
        if (regexp.test(error.message)) {
            return true;
        }
    }

    return false;
}

// This should fix most missing namespace errors, but it's not a complete solution.
export function addMissingNamespaces(xmlString) {
    const rootTagStartIndex = findRootTagStartIndex(xmlString);
    if (rootTagStartIndex === -1) {
        return xmlString;
    }
    const {insertionIndex, attributeValueSpans} = scanStartTag(xmlString, rootTagStartIndex + 1);
    if (insertionIndex === -1) {
        return xmlString;
    }

    const declaredPrefixLookup = getDeclaredNamespacePrefixLookup(xmlString, rootTagStartIndex, insertionIndex, attributeValueSpans);
    const usedPrefixes = getUsedNamespacePrefixes(xmlString);
    const missingPrefixes = usedPrefixes.filter((prefix) => declaredPrefixLookup[prefix] === undefined);
    if (missingPrefixes.length === 0) {
        return xmlString;
    }

    const namespaceDeclarations = createNamespaceDeclarations(missingPrefixes);
    return xmlString.slice(0, insertionIndex) + namespaceDeclarations + xmlString.slice(insertionIndex);
}

function findRootTagStartIndex(xmlString) {
    let index = 0;
    while (index < xmlString.length) {
        index = xmlString.indexOf('<', index);
        if (index === -1) {
            return -1;
        }
        if (/[A-Za-z_]/.test(xmlString.charAt(index + 1))) {
            return index;
        }
        if (hasSubstringAt(xmlString, '<!--', index)) {
            index = skipPast(xmlString, index + '<!--'.length, '-->');
        } else if (hasSubstringAt(xmlString, '<![CDATA[', index)) {
            index = skipPast(xmlString, index + '<![CDATA['.length, ']]>');
        } else if (xmlString.charAt(index + 1) === '?') {
            index = skipPast(xmlString, index + '<?'.length, '?>');
        } else {
            index++;
        }
    }
    return -1;
}

// Each attribute value span covers the value's content, excluding the quotes.
function scanStartTag(xmlString, fromIndex) {
    const attributeValueSpans = [];
    let quoteCharacter;
    let valueStartIndex;
    for (let i = fromIndex; i < xmlString.length; i++) {
        const character = xmlString.charAt(i);
        if (quoteCharacter !== undefined) {
            if (character === quoteCharacter) {
                attributeValueSpans.push({start: valueStartIndex, end: i});
                quoteCharacter = undefined;
            }
        } else if (character === '"' || character === '\'') {
            quoteCharacter = character;
            valueStartIndex = i + 1;
        } else if (character === '>') {
            if (xmlString.charAt(i - 1) === '/') {
                return {insertionIndex: i - 1, attributeValueSpans};
            }
            return {insertionIndex: i, attributeValueSpans};
        }
    }
    return {insertionIndex: -1, attributeValueSpans};
}

function hasSubstringAt(xmlString, substring, index) {
    return xmlString.slice(index, index + substring.length) === substring;
}

function skipPast(xmlString, fromIndex, endMarker) {
    const endIndex = xmlString.indexOf(endMarker, fromIndex);
    if (endIndex === -1) {
        return xmlString.length;
    }
    return endIndex + endMarker.length;
}

// The lookup must not have a prototype. The prefixes come from the image, so a
// prefix named e.g. __proto__ or constructor would otherwise be found among the
// inherited properties and be treated as declared.
function getDeclaredNamespacePrefixLookup(xmlContent, rootTagStartIndex, insertionIndex, attributeValueSpans) {
    const prefixes = Object.create(null);
    // Must not miss a name getUsedNamespacePrefixes finds: one missed on the
    // root element is redeclared there, and the retry fails on the duplicate.
    // XML allows whitespace on either side of the equals sign (Eq ::= S? '=' S?).
    const namespaceDeclarationRegex = /xmlns:([A-Za-z_][A-Za-z0-9._-]*)\s*=\s*["']([^"']*)["']/g;
    let match;
    // The spans and the matches are both in document order, so one forward
    // pointer finds the span that could hold each match.
    let spanIndex = 0;
    while ((match = namespaceDeclarationRegex.exec(xmlContent)) !== null) {
        while (spanIndex < attributeValueSpans.length && attributeValueSpans[spanIndex].end <= match.index) {
            spanIndex++;
        }
        if (spanIndex < attributeValueSpans.length && attributeValueSpans[spanIndex].start <= match.index) {
            // Text inside a quoted attribute value is not an attribute, so it
            // declares nothing to the XML parser either, and skipping it
            // cannot cause the duplicate. Resuming at the value's end keeps a
            // match inside it from consuming the declaration that follows.
            namespaceDeclarationRegex.lastIndex = attributeValueSpans[spanIndex].end;
            continue;
        }
        // An empty URI (illegal in Namespaces 1.0, an undeclaration in 1.1)
        // counts only in the root start tag, the one element a duplicate can
        // land on. Elsewhere it has to stay missing, so that the repair still
        // declares the prefix on the root and binds the usages it can.
        if (match[2] !== '' || isInRootStartTag(match.index, rootTagStartIndex, insertionIndex)) {
            prefixes[match[1]] = true;
        }
    }
    return prefixes;
}

function isInRootStartTag(index, rootTagStartIndex, insertionIndex) {
    return index > rootTagStartIndex && index < insertionIndex;
}

function getUsedNamespacePrefixes(xmlContent) {
    const prefixes = [];
    const seenPrefixes = Object.create(null); // Must not have a prototype, the prefixes come from the image.
    // The token must start the string or follow a consumed delimiter, i.e. a
    // character that cannot be part of a prefix. A word boundary must not be
    // used here: with \b, each letter following a dot or dash in a long
    // colon-free run of prefix-like characters ("a.a.a...") starts a match
    // attempt that reads the rest of the run, which makes the scan quadratic.
    // (Lookbehind would read better but is not supported by the oldest
    // targeted runtimes.)
    const prefixUsageRegex = /(?:^|[^A-Za-z0-9._-])([A-Za-z_][A-Za-z0-9._-]*):[A-Za-z_][A-Za-z0-9._-]*/g;
    let match;
    while ((match = prefixUsageRegex.exec(xmlContent)) !== null) {
        const prefix = match[1];
        if (prefix === 'xmlns' || prefix === 'xml') {
            continue;
        }
        if (seenPrefixes[prefix] === undefined) {
            seenPrefixes[prefix] = true;
            prefixes.push(prefix);
        }
    }
    return prefixes;
}

const KNOWN_NAMESPACE_URIS = {
    xmp: 'http://ns.adobe.com/xap/1.0/',
    tiff: 'http://ns.adobe.com/tiff/1.0/',
    exif: 'http://ns.adobe.com/exif/1.0/',
    dc: 'http://purl.org/dc/elements/1.1/',
    xmpMM: 'http://ns.adobe.com/xap/1.0/mm/',
    stEvt: 'http://ns.adobe.com/xap/1.0/sType/ResourceEvent#',
    stRef: 'http://ns.adobe.com/xap/1.0/sType/ResourceRef#',
    photoshop: 'http://ns.adobe.com/photoshop/1.0/'
};

function createNamespaceDeclarations(prefixes) {
    const declarations = [];
    for (let i = 0; i < prefixes.length; i++) {
        const prefix = prefixes[i];
        declarations.push(' xmlns:' + prefix + '="' + getNamespaceUri(prefix) + '"');
    }
    return declarations.join('');
}

function getNamespaceUri(prefix) {
    if (Object.prototype.hasOwnProperty.call(KNOWN_NAMESPACE_URIS, prefix)) {
        return KNOWN_NAMESPACE_URIS[prefix];
    }
    return 'http://fallback.namespace/' + prefix;
}
