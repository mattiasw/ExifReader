/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getArrayBuffer} from './test-utils';
import {getCharacterArray} from '../../src/utils';
import TagDecoder from '../../src/tag-decoder';

const TAG_VALUE_STRING = 'abcÅÄÖáéí';

describe('tag-decoder', () => {
    it('should decode ASCII string', () => {
        TagDecoder.__set__('TextDecoder', {
            get() {
                return undefined;
            }
        });
        const tagValue = getCharacterArray(TAG_VALUE_STRING);

        expect(TagDecoder.decode(undefined, tagValue)).to.equal(TAG_VALUE_STRING);
    });

    it('should decode non-ASCII string', () => {
        TagDecoder.__set__('TextDecoder', {
            get() {
                return function (encoding) {
                    this.decode = function (data) {
                        return {
                            encoding,
                            data
                        };
                    };
                };
            }
        });
        const tagValue = getCharacterArray(TAG_VALUE_STRING);

        const {encoding, data} = TagDecoder.decode('UTF-8', tagValue);

        expect(encoding).to.equal('UTF-8');
        expect(Array.from(data)).to.deep.equal(Array.from(getArrayBuffer(TAG_VALUE_STRING)));
    });

    it('should still try to use value for non-ASCII string if decoding is not possible', () => {
        TagDecoder.__set__('TextDecoder', {
            get() {
                return function () {
                    throw new Error();
                };
            }
        });
        const tagValue = getCharacterArray(TAG_VALUE_STRING);

        expect(TagDecoder.decode('UTF-8', tagValue)).to.equal(TAG_VALUE_STRING);
    });

    it('should decode UTF-8 when value is a string', () => {
        TagDecoder.__set__('TextDecoder', {
            get() {
                return undefined;
            }
        });
        const text = 'My emoji value: 🏔️✨';
        const bytes = new TextEncoder().encode(text);
        const rawString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

        expect(TagDecoder.decode('UTF-8', rawString)).to.equal(text);
    });
});
