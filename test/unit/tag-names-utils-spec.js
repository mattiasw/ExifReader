/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getStringValue, getEncodedString, getCharacterArray} from '../../src/tag-names-utils';

describe('tag-names-utils', () => {
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

    it('should get correct message about text with undefined encoding', () => {
        const characterArray = getCharacterArray('\x00\x00\x00\x00\x00\x00\x00\x00XYZ');
        expect(getEncodedString(characterArray)).to.equal('[Undefined encoding]');
    });
});
