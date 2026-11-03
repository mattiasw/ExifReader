/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {swapProperties} from './test-utils.js';
import {getBase64Image} from '../../src/base64-image.js';

describe('getBase64Image', () => {
    const RealBuffer = Buffer;
    const realBtoa = globalThis.btoa;
    const ALL_BYTES = Uint8Array.from({length: 256}, (_, i) => i);
    const ALL_BYTES_BASE64 = RealBuffer.from(ALL_BYTES).toString('base64');

    it('should encode an ArrayBuffer and a Uint8Array', () => {
        expect(getBase64Image(ALL_BYTES.buffer.slice(0))).to.equal(ALL_BYTES_BASE64);
        expect(getBase64Image(ALL_BYTES)).to.equal(ALL_BYTES_BASE64);
    });

    it('should use Buffer rather than btoa when both exist', () => {
        let calls = 0;
        const restore = swapProperties(globalThis, {
            btoa(data) {
                calls++;
                return realBtoa(data);
            }
        });
        let result;

        try {
            result = getBase64Image(ALL_BYTES.buffer.slice(0));
        } finally {
            restore();
        }
        expect(result).to.equal(ALL_BYTES_BASE64);
        expect(calls).to.equal(0);
    });

    it('should use btoa when Buffer.from is the one inherited from Uint8Array', () => {
        class InheritedFromBuffer extends Uint8Array {}
        const restore = swapProperties(globalThis, {Buffer: InheritedFromBuffer});
        let result;

        try {
            result = getBase64Image(ALL_BYTES.buffer.slice(0));
        } finally {
            restore();
        }
        expect(result).to.equal(ALL_BYTES_BASE64);
    });

    it('should convert to a binary string in chunks, not one call per byte, without Buffer', () => {
        const bytes = new Uint8Array(8192 + 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = i & 0xff;
        }
        const expected = RealBuffer.from(bytes).toString('base64');
        const originalFromCharCode = String.fromCharCode;
        let calls = 0;
        const restoreString = swapProperties(String, {
            fromCharCode(...charCodes) {
                calls++;
                return originalFromCharCode.apply(String, charCodes);
            }
        });
        const restoreGlobal = swapProperties(globalThis, {Buffer: undefined});
        let result;

        try {
            result = getBase64Image(bytes.buffer);
        } finally {
            restoreGlobal();
            restoreString();
        }
        expect(result).to.equal(expected);
        expect(calls).to.equal(2);
    });

    it('should read a string as Latin-1 through btoa', () => {
        expect(getBase64Image('\xff')).to.equal('/w==');
    });

    it('should fall back to a Buffer without from when btoa does not exist', () => {
        function LegacyBuffer(data) {
            return RealBuffer.from(data);
        }
        const restore = swapProperties(globalThis, {btoa: undefined, Buffer: LegacyBuffer});
        let result;

        try {
            result = getBase64Image(ALL_BYTES.buffer.slice(0));
        } finally {
            restore();
        }
        expect(result).to.equal(ALL_BYTES_BASE64);
    });

    it('should return undefined when neither btoa nor Buffer exist', () => {
        const restore = swapProperties(globalThis, {btoa: undefined, Buffer: undefined});
        let result;

        try {
            result = getBase64Image(ALL_BYTES.buffer.slice(0));
        } finally {
            restore();
        }
        expect(result).to.equal(undefined);
    });
});
