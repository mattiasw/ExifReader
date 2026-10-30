/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import NodeRequire from './node-require.js';

// The XMP depth and markup node limits are checked the way @xmldom/xmldom 0.9.12 reads markup.
const MIN_XMLDOM_VERSION = [0, 9, 12];
const NO_PARSER_WARNING = 'Warning: DOMParser is not available. It is needed to be able to parse XMP tags.';
const XMLDOM_REMEDY = 'ExifReader needs 0.9.12 or later, or a parser passed in the domParser option.';
const UNREADABLE_VERSION_WARNING = 'Warning: XMP tags are skipped because the version of the @xmldom/xmldom that was found could not be read. ' + XMLDOM_REMEDY;

export default {
    get
};

/**
 * Finds the DOM parser to read XMP with: the one passed in, a global DOMParser,
 * or an @xmldom/xmldom of version 0.9.12 or later.
 *
 * @param {Object} [domParser] A parser passed in by the caller.
 * @returns {{parser: (Object|undefined), warning: (string|undefined)}} The
 *          parser, or no parser and the warning that says why.
 */
function get(domParser) {
    if (domParser) {
        return {parser: domParser};
    }

    if (typeof DOMParser !== 'undefined') {
        return {parser: new DOMParser()};
    }

    return getXmldomParser();
}

function getXmldomParser() {
    try {
        const {DOMParser, onErrorStopParsing} = NodeRequire.optionalPackage('@xmldom/xmldom');
        const warning = getXmldomVersionWarning(readXmldomVersion());
        if (warning) {
            return {parser: undefined, warning};
        }
        return {parser: new DOMParser({onError: onErrorStopParsing})};
    } catch (error) {
        return {parser: undefined, warning: NO_PARSER_WARNING};
    }
}

function readXmldomVersion() {
    const packageJson = NodeRequire.optionalPackage('@xmldom/xmldom/package.json');
    return packageJson ? packageJson.version : undefined;
}

function getXmldomVersionWarning(version) {
    const match = typeof version === 'string' ? /^(\d+)\.(\d+)\.(\d+)(-?)/.exec(version) : null;
    if (!match) {
        return UNREADABLE_VERSION_WARNING;
    }
    if (isOlderThanMinimum(match)) {
        return `Warning: XMP tags are skipped because the @xmldom/xmldom that was found is version ${version}. ${XMLDOM_REMEDY}`;
    }
    return undefined;
}

// A prerelease of the minimum version (0.9.12-beta.1) comes before it.
function isOlderThanMinimum(match) {
    for (let i = 0; i < MIN_XMLDOM_VERSION.length; i++) {
        const part = Number(match[i + 1]);
        if (part !== MIN_XMLDOM_VERSION[i]) {
            return part < MIN_XMLDOM_VERSION[i];
        }
    }
    return match[4] === '-';
}
