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

    const declaredPrefixes = getAllDeclaredNamespacePrefixes(xmlString);
    const usedPrefixes = getUsedNamespacePrefixes(xmlString);
    const missingPrefixes = usedPrefixes.filter((prefix) => declaredPrefixes.indexOf(prefix) === -1);
    if (missingPrefixes.length === 0) {
        return xmlString;
    }

    const namespaceDeclarations = createNamespaceDeclarations(missingPrefixes);
    return insertDeclarationsIntoRoot(xmlString, rootTagName, namespaceDeclarations);
}

function getAllDeclaredNamespacePrefixes(xmlContent) {
    const prefixes = [];
    const namespaceDeclarationRegex = /xmlns:([\w-]+)=["'][^"']+["']/g;
    let match;
    while ((match = namespaceDeclarationRegex.exec(xmlContent)) !== null) {
        if (prefixes.indexOf(match[1]) === -1) {
            prefixes.push(match[1]);
        }
    }
    return prefixes;
}

function getUsedNamespacePrefixes(xmlContent) {
    const prefixes = [];
    const prefixUsageRegex = /\b([A-Za-z_][A-Za-z0-9._-]*):[A-Za-z_][A-Za-z0-9._-]*\b/g;
    let match;
    while ((match = prefixUsageRegex.exec(xmlContent)) !== null) {
        const prefix = match[1];
        if (prefix === 'xmlns' || prefix === 'xml') {
            continue;
        }
        if (prefixes.indexOf(prefix) === -1) {
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
        const uri = KNOWN_NAMESPACE_URIS[prefix] || 'http://fallback.namespace/' + prefix;
        declarations.push(' xmlns:' + prefix + '="' + uri + '"');
    }
    return declarations.join('');
}

function insertDeclarationsIntoRoot(xmlString, rootTagName, declarations) {
    const rootTagPattern = new RegExp('<' + rootTagName + '([^>]*)>');
    return xmlString.replace(rootTagPattern, '<' + rootTagName + '$1' + declarations + '>');
}
