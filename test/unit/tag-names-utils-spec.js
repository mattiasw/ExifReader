/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getCharacterArray} from '../../src/utils.js';
import {getStringValue, getEncodedString} from '../../src/tag-names-utils.js';
import {swapProperties} from './test-utils.js';

describe('tag-names-utils', () => {
    let restoreFromCharCode;

    afterEach(() => {
        if (restoreFromCharCode) {
            restoreFromCharCode();
            restoreFromCharCode = undefined;
        }
    });

    it('should get string from character values', () => {
        expect(getStringValue([65, 66])).to.equal('AB');
    });

    it('should get correct ASCII encoded text', () => {
        const characterArray = getCharacterArray('ASCII\x00\x00\x00AB');
        expect(getEncodedString(characterArray)).to.equal('AB');
    });

    it('should get correct message about JIS encoded text', () => {
        const characterArray = getCharacterArray('JIS\x00\x00\x00\x00\x00XYZ');
        expect(getEncodedString(characterArray)).to.equal('[JIS encoded text]');
    });

    it('should get correct message about Unicode encoded text', () => {
        const characterArray = getCharacterArray('UNICODE\x00XYZ');
        expect(getEncodedString(characterArray)).to.equal('[Unicode encoded text]');
    });

    it('should decode text with undefined encoding as ASCII when it contains printable characters', () => {
        const characterArray = getCharacterArray('\x00\x00\x00\x00\x00\x00\x00\x00Created with GIMP');
        expect(getEncodedString(characterArray)).to.equal('Created with GIMP');
    });

    it('should return undefined encoding message when undefined encoding text has no printable content', () => {
        const characterArray = getCharacterArray('\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00');
        expect(getEncodedString(characterArray)).to.equal('[Undefined encoding]');
    });

    it('should convert long ASCII encoded text in chunks', () => {
        const text = getPrintableText(10000);
        const {result, calls} = getEncodedStringCountingFromCharCode(getCharacterArray('ASCII\x00\x00\x00' + text));
        expect(result).to.equal(text);
        expect(calls).to.be.at.most(10);
    });

    it('should convert long text with undefined encoding in chunks', () => {
        const text = getPrintableText(10000);
        const {result, calls} = getEncodedStringCountingFromCharCode(getCharacterArray('\x00'.repeat(8) + text));
        expect(result).to.equal(text);
        expect(calls).to.be.at.most(10);
    });

    it('should keep character codes wider than a byte in encoded text', () => {
        const value = getCharacterArray('ASCII\x00\x00\x00').concat([0x263a]);
        expect(getEncodedString(value)).to.equal('\u263a');
    });

    function getPrintableText(length) {
        let text = '';
        for (let i = 0; i < length; i++) {
            text += String.fromCharCode(0x20 + (i % 95));
        }
        return text;
    }

    function getEncodedStringCountingFromCharCode(value) {
        const originalFromCharCode = String.fromCharCode;
        let fromCharCodeCalls = 0;
        restoreFromCharCode = swapProperties(String, {
            fromCharCode(...charCodes) {
                fromCharCodeCalls++;
                return originalFromCharCode.apply(String, charCodes);
            }
        });
        const result = getEncodedString(value);
        return {result, calls: fromCharCodeCalls};
    }
});
