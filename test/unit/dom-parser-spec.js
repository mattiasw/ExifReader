/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import DOMParserModule from '../../src/dom-parser';

describe('dom-parser', function () {
    beforeEach(() => {
        this.originalDOMParser = global.DOMParser;
        if (typeof global.DOMParser !== undefined) {
            delete global.DOMParser;
        }
        this.originalEval = global.eval;
    });

    afterEach(() => {
        global.DOMParser = this.originalDOMParser;
        global.eval = this.originalEval;
    });

    it('should return DOMParser if it is globally defined', () => {
        global.DOMParser = 'The DOMParser object.';
        expect(DOMParserModule.get()).to.equal(global.DOMParser);
    });

    it('should return DOMParser from the XMLDOM module if available', () => {
        const Parser = DOMParserModule.get();
        expect(typeof new Parser().parseFromString('<tag>content</tag>', 'application/xml')).to.equal('object');
    });

    it('should return undefined if DOMParser was not available', () => {
        global.eval = function () {
            throw new Error();
        };
        const Parser = DOMParserModule.get();
        expect(Parser).to.be.undefined;
    });
});
