/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import TextDecoderModule from '../src/text-decoder';

describe('text-decoder', function () {
    beforeEach(() => {
        this.originalTextDecoder = global.TextDecoder;
        if (typeof global.TextDecoder !== undefined) {
            delete global.TextDecoder;
        }
    });

    afterEach(() => {
        global.TextDecoder = this.originalTextDecoder;
    });

    it('should return TextDecoder if it is globally defined', () => {
        global.TextDecoder = 'The TextDecoder object.';
        expect(TextDecoderModule.get()).to.equal(global.TextDecoder);
    });

    it('should return undefined if TextDecoder was not available', () => {
        if (typeof global.TextDecoder !== undefined) {
            delete global.TextDecoder;
        }
        const Decoder = TextDecoderModule.get();
        expect(Decoder).to.be.undefined;
    });
});
