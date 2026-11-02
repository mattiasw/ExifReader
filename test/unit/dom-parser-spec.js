/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {createRequire} from 'node:module';
import {expect} from 'chai';
import DOMParserModule from '../../src/dom-parser.js';
import NodeRequire from '../../src/node-require.js';
import {swapProperties} from './test-utils.js';

const XMLDOM = '@xmldom/xmldom';
const XMLDOM_PACKAGE_JSON = '@xmldom/xmldom/package.json';
const NO_PARSER_WARNING = 'Warning: DOMParser is not available. It is needed to be able to parse XMP tags.';
const UNREADABLE_VERSION_WARNING = 'Warning: XMP tags are skipped because the version of the @xmldom/xmldom that was found could not be read. ExifReader needs 0.9.12 or later, or a parser passed in the domParser option.';

describe('dom-parser', function () {
    let originalNonWebpackRequire;
    let restore;

    beforeEach(() => {
        restore = () => undefined;
        originalNonWebpackRequire = global.__non_webpack_require__;
        global.__non_webpack_require__ = createRequire(import.meta.url);
        this.originalDOMParser = global.DOMParser;
        if (typeof global.DOMParser !== 'undefined') {
            delete global.DOMParser;
        }
    });

    afterEach(() => {
        global.__non_webpack_require__ = originalNonWebpackRequire;
        global.DOMParser = this.originalDOMParser;
        restore();
    });

    function stubXmldom({version, packageJson = {version}, xmldom = {DOMParser: MockDOMParser, onErrorStopParsing}}) {
        const requested = [];
        restore = swapProperties(NodeRequire, {
            optionalPackage(name) {
                requested.push(name);
                if (name === XMLDOM) {
                    return xmldom;
                }
                if (name === XMLDOM_PACKAGE_JSON) {
                    return packageJson;
                }
                return undefined;
            }
        });
        return requested;
    }

    it('should return DOMParser if it is globally defined', () => {
        global.DOMParser = MockDOMParser;
        const result = DOMParserModule.get();
        expect(result.parser instanceof MockDOMParser).to.equal(true);
        expect(result.warning).to.be.undefined;
    });

    it('should return a passed in parser without reading the xmldom version', () => {
        const requested = stubXmldom({version: '0.8.15'});
        const domParser = {parseFromString: () => undefined};
        const result = DOMParserModule.get(domParser);
        expect(result.parser).to.equal(domParser);
        expect(result.warning).to.be.undefined;
        expect(requested).to.deep.equal([]);
    });

    it('should return DOMParser from the XMLDOM module if available', () => {
        const {parser, warning} = DOMParserModule.get();
        expect(typeof parser.parseFromString('<tag>content</tag>', 'application/xml')).to.equal('object');
        expect(warning).to.be.undefined;
    });

    it('should build the XMLDOM parser so that it stops on errors', () => {
        stubXmldom({version: '0.9.12'});
        const {parser, warning} = DOMParserModule.get();
        expect(parser instanceof MockDOMParser).to.equal(true);
        expect(parser.options).to.deep.equal({onError: onErrorStopParsing});
        expect(warning).to.be.undefined;
    });

    ['0.9.13', '0.10.0', '1.0.0', '0.9.12+build.1', '0.9.13-beta.1'].forEach((version) => {
        it(`should accept XMLDOM version ${version}`, () => {
            stubXmldom({version});
            const {parser, warning} = DOMParserModule.get();
            expect(parser instanceof MockDOMParser).to.equal(true);
            expect(warning).to.be.undefined;
        });
    });

    it('should refuse an XMLDOM older than 0.9.12 with a warning naming its version', () => {
        stubXmldom({version: '0.8.15'});
        expect(DOMParserModule.get()).to.deep.equal({
            parser: undefined,
            warning: 'Warning: XMP tags are skipped because the @xmldom/xmldom that was found is version 0.8.15. ExifReader needs 0.9.12 or later, or a parser passed in the domParser option.'
        });
    });

    ['0.9.11', '0.9.12-beta.1', '0.8.99'].forEach((version) => {
        it(`should refuse XMLDOM version ${version}`, () => {
            stubXmldom({version});
            const {parser, warning} = DOMParserModule.get();
            expect(parser).to.be.undefined;
            expect(warning).to.include(`is version ${version}.`);
            expect(warning).to.include('0.9.12 or later');
            expect(warning).to.include('domParser');
        });
    });

    it('should refuse an XMLDOM whose package.json could not be loaded', () => {
        stubXmldom({packageJson: null});
        expect(DOMParserModule.get()).to.deep.equal({parser: undefined, warning: UNREADABLE_VERSION_WARNING});
    });

    const unreadablePackageJsons = {
        'has no version': {},
        'has a number as version': {version: 912},
        'has a version that is not a version number': {version: 'abc'},
        'has a version with a leading v': {version: 'v0.9.12'}
    };
    Object.keys(unreadablePackageJsons).forEach((description) => {
        it(`should refuse an XMLDOM whose package.json ${description}`, () => {
            stubXmldom({packageJson: unreadablePackageJsons[description]});
            const {parser, warning} = DOMParserModule.get();
            expect(parser).to.be.undefined;
            expect(warning).to.include('could not be read');
            expect(warning).to.include('0.9.12 or later');
        });
    });

    it('should refuse the XMLDOM module when its package.json is not exported', () => {
        const realRequire = createRequire(import.meta.url);
        global.__non_webpack_require__ = (name) => {
            if (name === XMLDOM_PACKAGE_JSON) {
                const error = new Error('Package subpath ./package.json is not defined by exports');
                error.code = 'ERR_PACKAGE_PATH_NOT_EXPORTED';
                throw error;
            }
            return realRequire(name);
        };
        expect(DOMParserModule.get()).to.deep.equal({parser: undefined, warning: UNREADABLE_VERSION_WARNING});
    });

    it('should give the generic warning when the XMLDOM DOMParser cannot be built', () => {
        stubXmldom({
            version: '0.9.12',
            xmldom: {
                DOMParser: class {
                    constructor() {
                        throw new Error();
                    }
                }
            }
        });
        expect(DOMParserModule.get()).to.deep.equal({parser: undefined, warning: NO_PARSER_WARNING});
    });

    it('should give the generic warning if DOMParser was not available', () => {
        global.__non_webpack_require__ = function () {
            throw new Error();
        };
        expect(DOMParserModule.get()).to.deep.equal({parser: undefined, warning: NO_PARSER_WARNING});
    });
});

function onErrorStopParsing() {
    return undefined;
}

class MockDOMParser {
    constructor(options) {
        this.options = options;
    }
}
