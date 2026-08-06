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
    const rootTagMatch = xmlString.match(/<([A-Za-z_][A-Za-z0-9._-]*)([^>]*)>/);
    if (!rootTagMatch) {
        return xmlString;
    }
    const rootTagName = rootTagMatch[1];

    const declaredPrefixLookup = getDeclaredNamespacePrefixLookup(xmlString);
    const usedPrefixes = getUsedNamespacePrefixes(xmlString);
    const missingPrefixes = usedPrefixes.filter((prefix) => declaredPrefixLookup[prefix] === undefined);
    if (missingPrefixes.length === 0) {
        return xmlString;
    }

    const namespaceDeclarations = createNamespaceDeclarations(missingPrefixes);
    return insertDeclarationsIntoRoot(xmlString, rootTagName, namespaceDeclarations);
}

// The lookup must not have a prototype. The prefixes come from the image, so a
// prefix named e.g. __proto__ or constructor would otherwise be found among the
// inherited properties and be treated as declared.
function getDeclaredNamespacePrefixLookup(xmlContent) {
    const prefixes = Object.create(null);
    const namespaceDeclarationRegex = /xmlns:([\w-]+)=["'][^"']+["']/g;
    let match;
    while ((match = namespaceDeclarationRegex.exec(xmlContent)) !== null) {
        prefixes[match[1]] = true;
    }
    return prefixes;
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

function insertDeclarationsIntoRoot(xmlString, rootTagName, declarations) {
    const rootTagPattern = new RegExp('<' + rootTagName + '([^>]*)>');
    return xmlString.replace(rootTagPattern, '<' + rootTagName + '$1' + declarations + '>');
}
