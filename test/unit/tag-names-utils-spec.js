/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getCharacterArray} from '../../src/utils.js';
import {getStringValue, getEncodedString, getVersionString, getTableDescription} from '../../src/tag-names-utils.js';
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
        const {result, calls} = getResultCountingFromCharCode(getEncodedString, getCharacterArray('ASCII\x00\x00\x00' + text));
        expect(result).to.equal(text);
        expect(calls).to.be.at.most(10);
    });

    it('should convert long text with undefined encoding in chunks', () => {
        const text = getPrintableText(10000);
        const {result, calls} = getResultCountingFromCharCode(getEncodedString, getCharacterArray('\x00'.repeat(8) + text));
        expect(result).to.equal(text);
        expect(calls).to.be.at.most(10);
    });

    it('should keep character codes wider than a byte in encoded text', () => {
        const value = getCharacterArray('ASCII\x00\x00\x00').concat([0x263a]);
        expect(getEncodedString(value)).to.equal('\u263a');
    });

    it('should get version string from character values', () => {
        expect(getVersionString([0x30, 0x32, 0x32, 0x30])).to.equal('0220');
    });

    it('should get version string from a value of strings', () => {
        expect(getVersionString(['0220'])).to.equal('0220');
        expect(getVersionString(['0100'])).to.equal('0100');
    });

    it('should get version string from a value of strings with a hole before the string', () => {
        const value = [];
        value[1] = '0230';
        expect(getVersionString(value)).to.equal('0230');
    });

    it('should keep the strings of a NUL-separated version value apart', () => {
        expect(getVersionString(['02', '20'])).to.equal('02, 20');
    });

    it('should convert a long version value in chunks', () => {
        const text = getPrintableText(10000);
        const {result, calls} = getResultCountingFromCharCode(getVersionString, getCharacterArray(text));
        expect(result).to.equal(text);
        expect(calls).to.be.at.most(10);
    });

    describe('getTableDescription', () => {
        const table = {1: 'One', 2: 'Two'};

        it('should describe an own key given as a number, a string or a one-element array', () => {
            expect(getTableDescription(table, 1)).to.equal('One');
            expect(getTableDescription(table, '1')).to.equal('One');
            expect(getTableDescription(table, [1])).to.equal('One');
            expect(getTableDescription(table, ['1'])).to.equal('One');
        });

        it('should describe an own string key given as a string or a one-element array', () => {
            expect(getTableDescription({C: 'Confidential'}, 'C')).to.equal('Confidential');
            expect(getTableDescription({C: 'Confidential'}, ['C'])).to.equal('Confidential');
        });

        it('should describe a value that is not a key as unknown', () => {
            expect(getTableDescription(table, 3)).to.equal('Unknown');
            expect(getTableDescription(table, ['3'])).to.equal('Unknown');
        });

        it('should describe a value named after an Object.prototype member as unknown', () => {
            for (const value of ['constructor', '__proto__', 'toString', 'hasOwnProperty', ['constructor'], ['__proto__']]) {
                expect(getTableDescription(table, value), String(value)).to.equal('Unknown');
            }
        });

        it('should describe a falsy own key', () => {
            expect(getTableDescription({0: 'Zero'}, 0)).to.equal('Zero');
            expect(getTableDescription({0: 'Zero'}, -0)).to.equal('Zero');
        });
    });

    function getPrintableText(length) {
        let text = '';
        for (let i = 0; i < length; i++) {
            text += String.fromCharCode(0x20 + (i % 95));
        }
        return text;
    }

    function getResultCountingFromCharCode(convert, value) {
        const originalFromCharCode = String.fromCharCode;
        let fromCharCodeCalls = 0;
        restoreFromCharCode = swapProperties(String, {
            fromCharCode(...charCodes) {
                fromCharCodeCalls++;
                return originalFromCharCode.apply(String, charCodes);
            }
        });
        const result = convert(value);
        return {result, calls: fromCharCodeCalls};
    }
});
