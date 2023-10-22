/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import DOMParserModule from '../../src/dom-parser';

describe('dom-parser', function () {
    let originalNonWebpackRequire;

    beforeEach(() => {
        originalNonWebpackRequire = global.__non_webpack_require__;
        global.__non_webpack_require__ = require;
        this.originalDOMParser = global.DOMParser;
        if (typeof global.DOMParser !== 'undefined') {
            delete global.DOMParser;
        }
    });

    afterEach(() => {
        global.__non_webpack_require__ = originalNonWebpackRequire;
        global.DOMParser = this.originalDOMParser;
    });

    it('should return DOMParser if it is globally defined', () => {
        global.DOMParser = MockDOMParser;
        expect(DOMParserModule.get() instanceof MockDOMParser).to.equal(true);
    });

    it('should return DOMParser from the XMLDOM module if available', () => {
        const parser = DOMParserModule.get();
        expect(typeof parser.parseFromString('<tag>content</tag>', 'application/xml')).to.equal('object');
    });

    it('should return undefined if DOMParser was not available', () => {
        global.__non_webpack_require__ = function () {
            throw new Error();
        };
        const parser = DOMParserModule.get();
        expect(parser).to.be.undefined;
    });
});

class MockDOMParser {}
