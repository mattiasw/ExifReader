/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getConsoleWarnSpy, swapProperties} from './test-utils.js';
import * as Utils from '../../src/utils.js';

const originalDecodeUriComponent = globalThis.decodeURIComponent;

describe('utils', () => {
    it('should extract string from DataView', () => {
        const dataView = getDataView('\x00\x00MyString\x00');
        expect(Utils.getStringFromDataView(dataView, 2, 8)).to.equal('MyString');
    });

    it('should handle length that is too large when extracting string from DataView', () => {
        const dataView = getDataView('\x00\x00MyString');
        expect(Utils.getStringFromDataView(dataView, 2, 10)).to.equal('MyString');
    });

    describe('getNullTerminatedStringFromDataView', () => {
        it('should stop at the NUL', () => {
            const dataView = getDataView('\x00\x00MyString\x00rest');
            expect(Utils.getNullTerminatedStringFromDataView(dataView, 2, 16)).to.equal('MyString');
        });

        it('should stop at the end when no NUL comes before it', () => {
            const dataView = getDataView('\x00\x00MyString\x00');
            expect(Utils.getNullTerminatedStringFromDataView(dataView, 2, 4)).to.equal('My');
        });

        it('should clamp an end past the buffer to the buffer end', () => {
            const dataView = getDataView('\x00\x00MyString');
            expect(Utils.getNullTerminatedStringFromDataView(dataView, 2, 100)).to.equal('MyString');
        });

        it('should default to the buffer end when the end is omitted', () => {
            const dataView = getDataView('\x00\x00MyString');
            expect(Utils.getNullTerminatedStringFromDataView(dataView, 2)).to.equal('MyString');
        });

        it('should return an empty string when the end is at or before the offset', () => {
            const dataView = getDataView('\x00\x00MyString');
            expect(Utils.getNullTerminatedStringFromDataView(dataView, 2, 2)).to.equal('');
            expect(Utils.getNullTerminatedStringFromDataView(dataView, 4, 2)).to.equal('');
        });
    });

    it('should decode a byte string as UTF-8', () => {
        expect(Utils.decodeUtf8ByteString('A\xc3\xbaC \xe5\x85\xac\xe5\x9b\xad')).to.equal('AúC 公园');
    });

    it('should keep a byte string that is not valid UTF-8 as it is', () => {
        expect(Utils.decodeUtf8ByteString('abc\xc5\xc4\xd6')).to.equal('abc\xc5\xc4\xd6');
    });

    it('should decode a byte string as UTF-8 or give undefined when it is not valid UTF-8', () => {
        expect(Utils.tryDecodeUtf8ByteString('A\xc3\xbaC')).to.equal('AúC');
        expect(Utils.tryDecodeUtf8ByteString('abc\xc5\xc4\xd6')).to.equal(undefined);
    });

    describe('getByteString', () => {
        it('should convert a byte range to a string in chunks, not one call per byte', () => {
            const bytes = new Uint8Array(8192 + 2);
            for (let i = 0; i < bytes.length; i++) {
                bytes[i] = 0x41 + (i % 26);
            }
            const expected = Array.from(bytes.subarray(1), (byte) => String.fromCharCode(byte)).join('');
            const originalFromCharCode = String.fromCharCode;
            let calls = 0;
            const restore = swapProperties(String, {
                fromCharCode(...charCodes) {
                    calls++;
                    return originalFromCharCode.apply(String, charCodes);
                }
            });

            try {
                expect(Utils.getByteString(bytes, 1, bytes.length)).to.equal(expected);
            } finally {
                restore();
            }
            expect(calls).to.equal(2);
        });
    });

    describe('getBase64Image', () => {
        const RealBuffer = Buffer;
        const realBtoa = globalThis.btoa;
        const ALL_BYTES = Uint8Array.from({length: 256}, (_, i) => i);
        const ALL_BYTES_BASE64 = RealBuffer.from(ALL_BYTES).toString('base64');

        it('should encode an ArrayBuffer and a Uint8Array', () => {
            expect(Utils.getBase64Image(ALL_BYTES.buffer.slice(0))).to.equal(ALL_BYTES_BASE64);
            expect(Utils.getBase64Image(ALL_BYTES)).to.equal(ALL_BYTES_BASE64);
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
                result = Utils.getBase64Image(ALL_BYTES.buffer.slice(0));
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
                result = Utils.getBase64Image(ALL_BYTES.buffer.slice(0));
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
                result = Utils.getBase64Image(bytes.buffer);
            } finally {
                restoreGlobal();
                restoreString();
            }
            expect(result).to.equal(expected);
            expect(calls).to.equal(2);
        });

        it('should read a string as Latin-1 through btoa', () => {
            expect(Utils.getBase64Image('\xff')).to.equal('/w==');
        });

        it('should fall back to a Buffer without from when btoa does not exist', () => {
            function LegacyBuffer(data) {
                return RealBuffer.from(data);
            }
            const restore = swapProperties(globalThis, {btoa: undefined, Buffer: LegacyBuffer});
            let result;

            try {
                result = Utils.getBase64Image(ALL_BYTES.buffer.slice(0));
            } finally {
                restore();
            }
            expect(result).to.equal(ALL_BYTES_BASE64);
        });

        it('should return undefined when neither btoa nor Buffer exist', () => {
            const restore = swapProperties(globalThis, {btoa: undefined, Buffer: undefined});
            let result;

            try {
                result = Utils.getBase64Image(ALL_BYTES.buffer.slice(0));
            } finally {
                restore();
            }
            expect(result).to.equal(undefined);
        });
    });

    describe('dataUriToBuffer', () => {
        const ALL_BYTES = Array.from({length: 256}, (_, i) => i);
        const ALL_BYTES_BASE64 = Buffer.from(ALL_BYTES).toString('base64');
        const ALL_BYTES_ESCAPED = ALL_BYTES.map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join('');

        function decodeWithAndWithoutBuffer(dataUri) {
            const withBuffer = Utils.dataUriToBuffer(dataUri);
            const restore = swapProperties(globalThis, {Buffer: undefined});
            let withoutBuffer;
            try {
                withoutBuffer = Utils.dataUriToBuffer(dataUri);
            } finally {
                restore();
            }
            expect(withBuffer).to.be.an.instanceof(ArrayBuffer);
            expect(withoutBuffer).to.be.an.instanceof(ArrayBuffer);
            return [Array.from(new Uint8Array(withBuffer)), Array.from(new Uint8Array(withoutBuffer))];
        }

        function expectBothWays(dataUri, bytes) {
            const [withBuffer, withoutBuffer] = decodeWithAndWithoutBuffer(dataUri);
            expect(withBuffer, 'with Buffer').to.deep.equal(bytes);
            expect(withoutBuffer, 'without Buffer').to.deep.equal(bytes);
        }

        function charCodes(string) {
            return Array.from(string, (char) => char.charCodeAt(0));
        }

        it('should decode the payload as base64 when the header says so', () => {
            const buffer = Utils.dataUriToBuffer('data:image/jpeg;base64,YWJj');

            expect(Array.from(new Uint8Array(buffer))).to.deep.equal([0x61, 0x62, 0x63]);
        });

        it('should URL-decode a payload that contains ";base64" after the header', () => {
            const buffer = Utils.dataUriToBuffer('data:,foo;base64,bar');

            expect(Array.from(new Uint8Array(buffer))).to.deep.equal(Array.from('foo;base64,bar', (char) => char.charCodeAt(0)));
        });

        it('should decode a base64 payload without a per-byte Uint8Array.from callback', () => {
            const restore = swapProperties(Uint8Array, {
                from() {
                    throw new Error('Uint8Array.from');
                }
            });

            let buffer;
            try {
                buffer = Utils.dataUriToBuffer(`data:image/jpeg;base64,${ALL_BYTES_BASE64}`);
            } finally {
                restore();
            }
            expect(buffer).to.be.an.instanceof(ArrayBuffer);
            expect(Array.from(new Uint8Array(buffer))).to.deep.equal(ALL_BYTES);
        });

        it('should URL-decode a payload without Buffer or a per-byte Uint8Array.from callback', () => {
            const restore = swapProperties(globalThis, {
                Buffer: undefined
            });
            const restoreFrom = swapProperties(Uint8Array, {
                from() {
                    throw new Error('Uint8Array.from');
                }
            });

            let utf8Buffer;
            let allBytesBuffer;
            try {
                utf8Buffer = Utils.dataUriToBuffer('data:,a%20b%E2%82%AC');
                allBytesBuffer = Utils.dataUriToBuffer(`data:,${ALL_BYTES_ESCAPED}`);
            } finally {
                restoreFrom();
                restore();
            }
            expect(utf8Buffer).to.be.an.instanceof(ArrayBuffer);
            expect(Array.from(new Uint8Array(utf8Buffer))).to.deep.equal([0x61, 0x20, 0x62, 0xe2, 0x82, 0xac]);
            expect(allBytesBuffer).to.be.an.instanceof(ArrayBuffer);
            expect(Array.from(new Uint8Array(allBytesBuffer))).to.deep.equal(ALL_BYTES);
        });

        it('should throw InvalidCharacterError for an invalid base64 payload', () => {
            expect(() => Utils.dataUriToBuffer('data:image/jpeg;base64,!!!!')).to.throw().with.property('name', 'InvalidCharacterError');
        });

        it('should decode a percent escape of every byte value in upper and lower case', () => {
            expectBothWays(`data:,${ALL_BYTES_ESCAPED}`, ALL_BYTES);
            expectBothWays(`data:,${ALL_BYTES_ESCAPED.toLowerCase()}`, ALL_BYTES);
        });

        it('should keep a malformed percent escape as text', () => {
            expectBothWays('data:,%', [0x25]);
            expectBothWays('data:,a%2', [0x61, 0x25, 0x32]);
            expectBothWays('data:,%%41', [0x25, 0x41]);
            expectBothWays('data:,%G1', [0x25, 0x47, 0x31]);
        });

        it('should keep a percent sign followed by a sign, a space or a non-hex digit as text', () => {
            expectBothWays('data:,%+1%-1% 1%4G', charCodes('%+1%-1% 1%4G'));
        });

        it('should decode a percent escape that ends the payload', () => {
            expectBothWays('data:,a%41', [0x61, 0x41]);
        });

        it('should decode an empty payload to an empty ArrayBuffer', () => {
            expectBothWays('data:,', []);
        });

        it('should UTF-8 encode literal non-ASCII characters in the payload', () => {
            expectBothWays('data:,é', [0xc3, 0xa9]);
            expectBothWays('data:,\u{1F600}', [0xf0, 0x9f, 0x98, 0x80]);
            expectBothWays('data:,a%FFé\u{1F600}', [0x61, 0xff, 0xc3, 0xa9, 0xf0, 0x9f, 0x98, 0x80]);
            expectBothWays('data:,\u0080', [0xc2, 0x80]);
            expectBothWays('data:,\uffff', [0xef, 0xbf, 0xbf]);
        });

        it('should throw URIError for a lone surrogate in the payload', () => {
            expect(() => Utils.dataUriToBuffer('data:,\ud800')).to.throw(URIError);
        });

        it('should not UTF-8 encode an ASCII payload', () => {
            const restore = swapProperties(globalThis, {
                encodeURIComponent() {
                    throw new Error('encodeURIComponent');
                }
            });

            let buffer;
            try {
                buffer = Utils.dataUriToBuffer('data:,a%20b');
            } finally {
                restore();
            }
            expect(Array.from(new Uint8Array(buffer))).to.deep.equal([0x61, 0x20, 0x62]);
        });

        describe('with a percent-encoded base64 payload', () => {
            const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
            const PNG_SIGNATURE_URI = 'data:image/png;base64,iVBORw0KGgo%3D';
            const RealBuffer = globalThis.Buffer;

            function decodeWithBufferFrom(dataUri) {
                const restore = swapProperties(globalThis, {atob: undefined});
                try {
                    return Utils.dataUriToBuffer(dataUri);
                } finally {
                    restore();
                }
            }

            function decodeWithLegacyBuffer(dataUri) {
                function LegacyBuffer(data, encoding) {
                    return RealBuffer.from(data, encoding);
                }
                const restore = swapProperties(globalThis, {atob: undefined, Buffer: LegacyBuffer});
                try {
                    return Utils.dataUriToBuffer(dataUri);
                } finally {
                    restore();
                }
            }

            it('should percent-decode the payload before decoding it as base64', () => {
                const buffer = Utils.dataUriToBuffer(PNG_SIGNATURE_URI);

                expect(buffer).to.be.an.instanceof(ArrayBuffer);
                expect(Array.from(new Uint8Array(buffer))).to.deep.equal(PNG_SIGNATURE);
            });

            it('should percent-decode the payload without atob', () => {
                const buffer = decodeWithBufferFrom(PNG_SIGNATURE_URI);

                expect(RealBuffer.isBuffer(buffer)).to.equal(true);
                expect(Array.from(buffer)).to.deep.equal(PNG_SIGNATURE);
            });

            it('should percent-decode the payload with a Buffer that has no Buffer.from', () => {
                const buffer = decodeWithLegacyBuffer(PNG_SIGNATURE_URI);

                expect(RealBuffer.isBuffer(buffer)).to.equal(true);
                expect(Array.from(buffer)).to.deep.equal(PNG_SIGNATURE);
            });

            it('should decode escaped base64 symbols in upper and lower case', () => {
                const upperCaseUri = `data:image/jpeg;base64,${ALL_BYTES_BASE64.replace(/\+/g, '%2B').replace(/\//g, '%2F').replace(/=/g, '%3D')}`;
                const lowerCaseUri = upperCaseUri.replace(/%2B/g, '%2b').replace(/%2F/g, '%2f').replace(/%3D/g, '%3d');

                expect(Array.from(new Uint8Array(Utils.dataUriToBuffer(upperCaseUri)))).to.deep.equal(ALL_BYTES);
                expect(Array.from(new Uint8Array(Utils.dataUriToBuffer(lowerCaseUri)))).to.deep.equal(ALL_BYTES);
                expect(Array.from(decodeWithBufferFrom(upperCaseUri))).to.deep.equal(ALL_BYTES);
                expect(Array.from(decodeWithLegacyBuffer(lowerCaseUri))).to.deep.equal(ALL_BYTES);
            });

            it('should decode a payload where every character is escaped', () => {
                const buffer = Utils.dataUriToBuffer('data:image/jpeg;base64,%59%57%4A%6A');

                expect(Array.from(new Uint8Array(buffer))).to.deep.equal([0x61, 0x62, 0x63]);
            });

            it('should throw InvalidCharacterError when the percent-decoded payload is not base64', () => {
                expect(() => Utils.dataUriToBuffer('data:image/jpeg;base64,YWJj%FF')).to.throw().with.property('name', 'InvalidCharacterError');
                expect(() => Utils.dataUriToBuffer('data:image/jpeg;base64,YWJj%')).to.throw().with.property('name', 'InvalidCharacterError');
                expect(() => Utils.dataUriToBuffer('data:image/jpeg;base64,YW%G1')).to.throw().with.property('name', 'InvalidCharacterError');
            });

            it('should throw InvalidCharacterError, not URIError, for a payload with a percent sign and a lone surrogate', () => {
                expect(() => Utils.dataUriToBuffer('data:image/png;base64,YWJj%3D\ud800')).to.throw().with.property('name', 'InvalidCharacterError');
            });

            it('should return undefined without atob and Buffer for a payload with a percent sign and a lone surrogate', () => {
                const restore = swapProperties(globalThis, {atob: undefined, Buffer: undefined});
                let result = null;
                try {
                    result = Utils.dataUriToBuffer('data:image/png;base64,YWJj%3D\ud800');
                } finally {
                    restore();
                }
                expect(result).to.equal(undefined);
            });

            it('should not percent-decode a payload without a percent sign', () => {
                const restore = swapProperties(String, {
                    fromCharCode() {
                        throw new Error('String.fromCharCode');
                    }
                });

                let buffer;
                try {
                    buffer = Utils.dataUriToBuffer(`data:image/jpeg;base64,${ALL_BYTES_BASE64}`);
                } finally {
                    restore();
                }
                expect(Array.from(new Uint8Array(buffer))).to.deep.equal(ALL_BYTES);
            });
        });
    });

    describe('tryDecodeUtf8ByteString', () => {
        const BOUNDARY_BYTES = [0x00, 0x7f, 0x80, 0x8f, 0x90, 0x9f, 0xa0, 0xbf, 0xc0, 0xff];
        let restore;
        let restoreStackTraceLimit;

        afterEach(() => {
            if (restore) {
                restore();
                restore = undefined;
            }
            if (restoreStackTraceLimit) {
                restoreStackTraceLimit();
                restoreStackTraceLimit = undefined;
            }
        });

        it('should not call decodeURIComponent for ASCII or invalid input', () => {
            const spy = swapDecodeUriComponentForSpy();

            expect(Utils.tryDecodeUtf8ByteString('\xff')).to.equal(undefined);
            expect(Utils.tryDecodeUtf8ByteString('abc\xc5\xc4\xd6')).to.equal(undefined);
            expect(Utils.tryDecodeUtf8ByteString('abc%41\x00\x7f')).to.equal('abc%41\x00\x7f');
            expect(spy.calls).to.equal(0);

            expect(Utils.tryDecodeUtf8ByteString('A\xc3\xbaC')).to.equal('AúC');
            expect(spy.calls).to.equal(1);
        });

        it('should reject overlong forms', () => {
            expect(Utils.tryDecodeUtf8ByteString('\xc0\x80')).to.equal(undefined);
            expect(Utils.tryDecodeUtf8ByteString('\xe0\x80\x80')).to.equal(undefined);
            expect(Utils.tryDecodeUtf8ByteString('\xf0\x80\x80\x80')).to.equal(undefined);
        });

        it('should reject surrogates and code points above U+10FFFF', () => {
            expect(Utils.tryDecodeUtf8ByteString('\xed\xa0\x80')).to.equal(undefined);
            expect(Utils.tryDecodeUtf8ByteString('\xf4\x90\x80\x80')).to.equal(undefined);
        });

        it('should reject cut-off sequences and stray continuation bytes', () => {
            expect(Utils.tryDecodeUtf8ByteString('\xe2\x82')).to.equal(undefined);
            expect(Utils.tryDecodeUtf8ByteString('\xe2\x82a')).to.equal(undefined);
            expect(Utils.tryDecodeUtf8ByteString('\xc3\xba\xba')).to.equal(undefined);
        });

        it('should decode the boundary code points that are valid', () => {
            expect(Utils.tryDecodeUtf8ByteString('\xed\x9f\xbf')).to.equal('\ud7ff');
            expect(Utils.tryDecodeUtf8ByteString('\xee\x80\x80')).to.equal('\ue000');
            expect(Utils.tryDecodeUtf8ByteString('\xef\xbf\xbf')).to.equal('\uffff');
            expect(Utils.tryDecodeUtf8ByteString('\xf4\x8f\xbf\xbf')).to.equal('\udbff\udfff');
        });

        it('should decode an empty string to an empty string', () => {
            expect(Utils.tryDecodeUtf8ByteString('')).to.equal('');
        });

        it('should match decodeURIComponent(escape()) and only call it for valid non-ASCII input', () => {
            const spy = swapDecodeUriComponentForSpy();
            // Capturing the stack of each URIError the reference throws is most of its cost.
            restoreStackTraceLimit = swapProperties(Error, {stackTraceLimit: 0});
            const mismatches = [];

            for (const input of getEquivalenceInputs()) {
                const expected = decodeWithUriFunctions(input);
                spy.calls = 0;
                const actual = Utils.tryDecodeUtf8ByteString(input);
                const mayCallDecode = expected !== undefined && !isAscii(input);
                if (actual !== expected || (spy.calls > 0 && !mayCallDecode)) {
                    if (mismatches.length < 20) {
                        mismatches.push(input.split('').map((character) => character.charCodeAt(0)));
                    }
                }
            }
            restoreStackTraceLimit();
            restoreStackTraceLimit = undefined;

            expect(mismatches).to.deep.equal([]);
        });

        function swapDecodeUriComponentForSpy() {
            const spy = {calls: 0};
            restore = swapProperties(globalThis, {
                decodeURIComponent(string) {
                    spy.calls++;
                    return originalDecodeUriComponent(string);
                }
            });
            return spy;
        }

        function getEquivalenceInputs() {
            const inputs = ['\u0100', '\u20ac', '\ufffd', '\ud800'];
            for (let first = 0; first <= 0xff; first++) {
                inputs.push(String.fromCharCode(first));
                for (let second = 0; second <= 0xff; second++) {
                    inputs.push(String.fromCharCode(first, second));
                }
            }
            for (let lead = 0xe0; lead <= 0xef; lead++) {
                for (let second = 0; second <= 0xff; second++) {
                    for (const third of BOUNDARY_BYTES) {
                        inputs.push(String.fromCharCode(lead, second, third));
                    }
                }
            }
            for (let lead = 0xf0; lead <= 0xf7; lead++) {
                for (const second of BOUNDARY_BYTES) {
                    for (const third of BOUNDARY_BYTES) {
                        for (const fourth of BOUNDARY_BYTES) {
                            inputs.push(String.fromCharCode(lead, second, third, fourth));
                        }
                    }
                }
            }
            for (const sequence of ['\xe2\x82\xac', '\xed\x9f\xbf', '\xf0\x9f\x98\x80', '\xf4\x8f\xbf\xbf']) {
                for (let cutLength = 1; cutLength < sequence.length; cutLength++) {
                    const cut = sequence.slice(0, cutLength);
                    inputs.push('a' + cut, cut + 'a');
                }
            }
            for (const byte of BOUNDARY_BYTES) {
                inputs.push('\xc3\xba' + String.fromCharCode(byte), '\xc3\xba' + String.fromCharCode(byte) + 'a');
            }
            return inputs;
        }

        function decodeWithUriFunctions(string) {
            try {
                return originalDecodeUriComponent(escape(string));
            } catch (error) {
                return undefined;
            }
        }

        function isAscii(string) {
            return string.split('').every((character) => character.charCodeAt(0) < 0x80);
        }
    });

    it('should parse unicode UTF16BE strings', () => {
        const dataView = getDataView('\x0B\x83\x03\x7D\x04\x2F\x00\x54\x00\x65\x00\x73\x00\x74');
        expect(Utils.getUnicodeStringFromDataView(dataView, 0, dataView.byteLength)).to.equal('ஃͽЯTest');
    });

    it('should not read past the end of the DataView for an odd-length unicode region', () => {
        // Two full UTF-16BE code units ("Te") followed by a single trailing
        // byte. Reading up to byteLength must not attempt a 2-byte read on the
        // final odd byte (which would throw a RangeError).
        const dataView = getDataView('\x00\x54\x00\x65\x00');
        expect(() => Utils.getUnicodeStringFromDataView(dataView, 0, dataView.byteLength)).to.not.throw();
        expect(Utils.getUnicodeStringFromDataView(dataView, 0, dataView.byteLength)).to.equal('Te');
    });

    it('should not read past the requested length for an odd unicode length', () => {
        // The buffer is large enough, but the requested length ends on an odd
        // byte; the reader must not consume the byte belonging to the next region.
        const dataView = getDataView('\x00\x54\x00\x65\xFF\xFF');
        expect(Utils.getUnicodeStringFromDataView(dataView, 0, 5)).to.equal('Te');
    });

    it('should pad a string', () => {
        expect(Utils.padStart('1', 3, '0')).to.equal('001');
    });

    it('should not pad a string when not necessary', () => {
        expect(Utils.padStart('123', 3, '0')).to.equal('123');
    });

    it('should return a string unchanged when it is wider than the pad length', () => {
        expect(Utils.padStart('123', 2, '0')).to.equal('123');
        expect(Utils.padStart('12345', 3, '0')).to.equal('12345');
    });

    it('should parse binary float', () => {
        expect(Utils.parseFloatRadix('0.101', 2)).to.equal(0.625);
        expect(Utils.parseFloatRadix('0.0011', 2)).to.equal(0.1875);
        expect(Utils.parseFloatRadix('-011', 2)).to.equal(-3);
        expect(Utils.parseFloatRadix('-1100.0011', 2)).to.equal(-12.1875);
    });

    it('should repeat a string', () => {
        expect(Utils.strRepeat('a', 3)).to.equal('aaa');
        expect(Utils.strRepeat('a', 0)).to.equal('');
        expect(Utils.strRepeat('a', 1)).to.equal('a');
        expect(Utils.strRepeat('ab', 2)).to.equal('abab');
    });

    it('should fallback to byte string when TextDecoder fails', () => {
        const dataView = getDataView('MyText');
        const result = Utils.decompress(
            dataView,
            undefined,
            'invalid-encoding'
        );
        expect(result).to.equal('MyText');
    });

    it('should fall back to a byte string in chunks when TextDecoder is missing', () => {
        const OFFSET = 7;
        const length = 8192 * 2 + 300;
        const backing = new Uint8Array(OFFSET + length + 5).fill(0x2a);
        for (let i = 0; i < length; i++) {
            backing[OFFSET + i] = i % 256;
        }
        const dataView = new DataView(backing.buffer, OFFSET, length);
        let expected = '';
        for (let i = 0; i < length; i++) {
            expected += String.fromCharCode(backing[OFFSET + i]);
        }
        const originalFromCharCode = String.fromCharCode;
        let calls = 0;
        const restoreGlobal = swapProperties(globalThis, {TextDecoder: undefined});
        const restoreString = swapProperties(String, {
            fromCharCode(...charCodes) {
                calls++;
                return originalFromCharCode.apply(String, charCodes);
            }
        });

        let result;
        try {
            result = Utils.decompress(dataView, undefined, 'latin1');
        } finally {
            restoreString();
            restoreGlobal();
        }
        expect(result).to.equal(expected);
        expect(calls).to.equal(3);
    });

    describe('brotli decompression', () => {
        it('should use custom brotli function and return DataView', async () => {
            const inputData = new Uint8Array([1, 2, 3]);
            const decompressedData = new Uint8Array([4, 5, 6, 7]);
            const dataView = new DataView(inputData.buffer);
            let receivedData;
            const brotliFn = (data) => {
                receivedData = data;
                return Promise.resolve(decompressedData);
            };

            const result = await Utils.decompress(
                dataView,
                Utils.COMPRESSION_METHOD_BROTLI,
                undefined,
                'dataview',
                {brotli: brotliFn}
            );

            expect(receivedData).to.deep.equal(inputData);
            expect(result).to.be.instanceOf(DataView);
            expect(new Uint8Array(result.buffer, result.byteOffset, result.byteLength))
                .to.deep.equal(decompressedData);
        });

        it('should use custom brotli function and return string', async () => {
            const textBytes = new TextEncoder().encode('Hello Brotli');
            const dataView = new DataView(new ArrayBuffer(1));
            const brotliFn = () => Promise.resolve(textBytes);

            const result = await Utils.decompress(
                dataView,
                Utils.COMPRESSION_METHOD_BROTLI,
                'utf-8',
                'string',
                {brotli: brotliFn}
            );

            expect(result).to.equal('Hello Brotli');
        });

        it('should accept ArrayBuffer from custom brotli function', async () => {
            const decompressedData = new Uint8Array([10, 20, 30]);
            const dataView = new DataView(new ArrayBuffer(1));
            const brotliFn = () => Promise.resolve(decompressedData.buffer);

            const result = await Utils.decompress(
                dataView,
                Utils.COMPRESSION_METHOD_BROTLI,
                undefined,
                'dataview',
                {brotli: brotliFn}
            );

            expect(result).to.be.instanceOf(DataView);
            expect(result.byteLength).to.equal(3);
        });

        it('should accept sync return from custom brotli function', async () => {
            const decompressedData = new Uint8Array([10, 20]);
            const dataView = new DataView(new ArrayBuffer(1));
            const brotliFn = () => decompressedData;

            const result = await Utils.decompress(
                dataView,
                Utils.COMPRESSION_METHOD_BROTLI,
                undefined,
                'dataview',
                {brotli: brotliFn}
            );

            expect(result).to.be.instanceOf(DataView);
            expect(result.byteLength).to.equal(2);
        });

        it('should reject when no brotli decompressor is available and DecompressionStream does not support brotli', async () => {
            const origDecompressionStream = global.DecompressionStream;
            global.DecompressionStream = undefined;
            try {
                const dataView = new DataView(new ArrayBuffer(1));
                await Utils.decompress(
                    dataView,
                    Utils.COMPRESSION_METHOD_BROTLI,
                    undefined,
                    'dataview'
                );
                expect.fail('Should have rejected');
            } catch (error) {
                expect(error).to.include('not supported');
            } finally {
                global.DecompressionStream = origDecompressionStream;
            }
        });

        it('should try DecompressionStream for brotli when no custom function is provided', async () => {
            const dataView = new DataView(new ArrayBuffer(1));

            // Node.js supports DecompressionStream('brotli'), but the 1-byte
            // garbage data is not valid brotli.
            await Utils.decompress(
                dataView,
                Utils.COMPRESSION_METHOD_BROTLI,
                undefined,
                'dataview'
            ).then(
                () => expect.fail('Should have rejected on invalid data'),
                (error) => expect(String(error)).to.not.include('not supported')
            );
        });

        it('should use custom deflate function when provided', async () => {
            const decompressedText = new TextEncoder().encode('Deflated text');
            const dataView = new DataView(new ArrayBuffer(1));
            const deflateFn = () => Promise.resolve(decompressedText);

            const result = await Utils.decompress(
                dataView,
                Utils.COMPRESSION_METHOD_DEFLATE,
                'utf-8',
                'string',
                {deflate: deflateFn}
            );

            expect(result).to.equal('Deflated text');
        });

        it('should call a custom function before returning, since its input is a view onto the caller\'s buffer', async () => {
            const dataView = new DataView(new Uint8Array([1, 2, 3, 4]).buffer);
            let receivedBytes;
            const deflateFn = (bytes) => {
                receivedBytes = Array.from(bytes);
                return bytes;
            };

            const promise = Utils.decompress(
                dataView,
                Utils.COMPRESSION_METHOD_DEFLATE,
                'latin1',
                'string',
                {deflate: deflateFn}
            );
            new Uint8Array(dataView.buffer).fill(0);

            expect(receivedBytes).to.deep.equal([1, 2, 3, 4]);
            await promise;
        });

        it('should handle DataView with non-zero byteOffset for custom function', async () => {
            const buffer = new ArrayBuffer(10);
            const fullView = new Uint8Array(buffer);
            fullView.set([0, 0, 0, 1, 2, 3, 0, 0, 0, 0]);
            const dataView = new DataView(buffer, 3, 3);
            let receivedData;
            const brotliFn = (data) => {
                receivedData = data;
                return new Uint8Array([99]);
            };

            await Utils.decompress(
                dataView,
                Utils.COMPRESSION_METHOD_BROTLI,
                undefined,
                'dataview',
                {brotli: brotliFn}
            );

            expect(Array.from(receivedData)).to.deep.equal([1, 2, 3]);
        });

        it('should not expose bytes outside a windowed typed array returned by a custom function', async () => {
            const pool = new Uint8Array([9, 9, 9, 1, 2, 3, 8, 8, 8, 8]);
            const brotliFn = () => new Uint8Array(pool.buffer, 3, 3);

            const result = await Utils.decompress(
                new DataView(new ArrayBuffer(1)),
                Utils.COMPRESSION_METHOD_BROTLI,
                undefined,
                'dataview',
                {brotli: brotliFn}
            );

            expect(result.byteOffset).to.equal(0);
            expect(result.buffer.byteLength).to.equal(result.byteLength);
            expect(Array.from(new Uint8Array(result.buffer))).to.deep.equal([1, 2, 3]);
        });

        it('should not expose bytes outside a windowed DataView returned by a custom function', async () => {
            const pool = new Uint8Array([9, 9, 9, 1, 2, 3, 8, 8, 8, 8]);
            const brotliFn = () => new DataView(pool.buffer, 3, 3);

            const result = await Utils.decompress(
                new DataView(new ArrayBuffer(1)),
                Utils.COMPRESSION_METHOD_BROTLI,
                undefined,
                'dataview',
                {brotli: brotliFn}
            );

            expect(result.byteOffset).to.equal(0);
            expect(result.buffer.byteLength).to.equal(result.byteLength);
            expect(Array.from(new Uint8Array(result.buffer))).to.deep.equal([1, 2, 3]);
        });

        it('should not expose bytes after a window that starts at offset zero', async () => {
            const pool = new Uint8Array([1, 2, 3, 8, 8, 8, 8]);
            const brotliFn = () => new Uint8Array(pool.buffer, 0, 3);

            const result = await Utils.decompress(
                new DataView(new ArrayBuffer(1)),
                Utils.COMPRESSION_METHOD_BROTLI,
                undefined,
                'dataview',
                {brotli: brotliFn}
            );

            expect(result.buffer.byteLength).to.equal(result.byteLength);
            expect(Array.from(new Uint8Array(result.buffer))).to.deep.equal([1, 2, 3]);
        });

        it('should not copy a typed array that covers its whole buffer', async () => {
            const bytes = new Uint8Array([1, 2, 3]);
            const brotliFn = () => bytes;

            const result = await Utils.decompress(
                new DataView(new ArrayBuffer(1)),
                Utils.COMPRESSION_METHOD_BROTLI,
                undefined,
                'dataview',
                {brotli: brotliFn}
            );

            expect(result.buffer).to.equal(bytes.buffer);
            expect(Array.from(new Uint8Array(result.buffer))).to.deep.equal([1, 2, 3]);
        });

        it('should keep a whole ArrayBuffer returned by a custom function', async () => {
            const buffer = new Uint8Array([1, 2, 3]).buffer;
            const brotliFn = () => buffer;

            const result = await Utils.decompress(
                new DataView(new ArrayBuffer(1)),
                Utils.COMPRESSION_METHOD_BROTLI,
                undefined,
                'dataview',
                {brotli: brotliFn}
            );

            expect(result.buffer).to.equal(buffer);
            expect(Array.from(new Uint8Array(result.buffer))).to.deep.equal([1, 2, 3]);
        });
    });

    describe('custom decompression function failures', () => {
        it('should reject without calling the custom function when there is no data', async () => {
            let calls = 0;
            const deflateFn = (data) => {
                calls++;
                return data;
            };

            let promise;
            expect(() => {
                promise = Utils.decompress(
                    undefined,
                    Utils.COMPRESSION_METHOD_DEFLATE,
                    'latin1',
                    'string',
                    {deflate: deflateFn}
                );
            }).to.not.throw();

            await promise.then(
                () => expect.fail('resolved'),
                (error) => expect(error).to.be.instanceOf(TypeError)
            );
            expect(calls).to.equal(0);
        });

        it('should reject when a custom deflate function throws synchronously', async () => {
            const error = new Error('Broken deflate.');
            const deflateFn = () => {
                throw error;
            };

            let promise;
            expect(() => {
                promise = Utils.decompress(
                    new DataView(new ArrayBuffer(1)),
                    Utils.COMPRESSION_METHOD_DEFLATE,
                    'latin1',
                    'string',
                    {deflate: deflateFn}
                );
            }).to.not.throw();

            await promise.then(
                () => expect.fail('resolved'),
                (rejection) => expect(rejection).to.equal(error)
            );
        });

        it('should reject when a custom brotli function throws synchronously', async () => {
            const error = new Error('Broken brotli.');
            const brotliFn = () => {
                throw error;
            };

            let promise;
            expect(() => {
                promise = Utils.decompress(
                    new DataView(new ArrayBuffer(1)),
                    Utils.COMPRESSION_METHOD_BROTLI,
                    undefined,
                    'dataview',
                    {brotli: brotliFn}
                );
            }).to.not.throw();

            await promise.then(
                () => expect.fail('resolved'),
                (rejection) => expect(rejection).to.equal(error)
            );
        });

        for (const compressionMethod of [1, 255]) {
            it(`should reject numeric compression method ${compressionMethod} without calling a custom function`, async () => {
                const calledTypes = [];
                const getRecorder = (decompressType) => (data) => {
                    calledTypes.push(decompressType);
                    return data;
                };

                const error = await Utils.decompress(
                    new DataView(new ArrayBuffer(1)),
                    compressionMethod,
                    'latin1',
                    'string',
                    {brotli: getRecorder('brotli'), deflate: getRecorder('deflate'), undefined: getRecorder('undefined')}
                ).then(() => expect.fail('resolved'), (rejection) => rejection);

                expect(error).to.equal(`Unknown compression method ${compressionMethod}.`);
                expect(calledTypes).to.deep.equal([]);
            });
        }
    });

    describe('decompression bounds', () => {
        let warnSpy;

        beforeEach(() => {
            warnSpy = getConsoleWarnSpy();
        });

        afterEach(() => {
            warnSpy.reset();
        });

        it('should not let a tiny deflate payload expand to an unbounded output', async () => {
            // A buffer of zeros is highly compressible, so the deflate output is
            // many orders of magnitude smaller than the original. The decompress
            // path must not blindly materialize the full expansion in memory.
            const decompressedSize = 1 * 1024 * 1024;
            const input = new Uint8Array(decompressedSize);
            const compressedStream = new Blob([input]).stream().pipeThrough(
                new CompressionStream('deflate')
            );
            const compressed = await new Response(compressedStream).arrayBuffer();

            expect(compressed.byteLength).to.be.lessThan(decompressedSize / 100);

            let result;
            try {
                result = await Utils.decompress(
                    new DataView(compressed),
                    Utils.COMPRESSION_METHOD_DEFLATE,
                    'latin1',
                    'dataview',
                    {maxDecompressedSize: 64 * 1024}
                );
            } catch (_error) {
                expect(warnSpy.hasWarned).to.equal(true);
                return;
            }
            expect.fail(
                `A ${compressed.byteLength}-byte deflate payload was allowed to expand to `
                + `${result.byteLength} bytes; the decompressed output should be bounded.`
            );
        });

        it('should reject custom decompressor result that exceeds the configured limit', async () => {
            const dataView = new DataView(new ArrayBuffer(1));
            const oversized = new Uint8Array(64);
            const deflateFn = () => oversized;

            try {
                await Utils.decompress(
                    dataView,
                    Utils.COMPRESSION_METHOD_DEFLATE,
                    undefined,
                    'dataview',
                    {deflate: deflateFn, maxDecompressedSize: 32}
                );
                expect.fail('Decompression should have been rejected for exceeding the configured limit.');
            } catch (_error) {
                expect(warnSpy.hasWarned).to.equal(true);
            }
        });

        it('should allow decompressed output up to the configured limit', async () => {
            const decompressedSize = 4 * 1024;
            const input = new Uint8Array(decompressedSize);
            const compressedStream = new Blob([input]).stream().pipeThrough(
                new CompressionStream('deflate')
            );
            const compressed = await new Response(compressedStream).arrayBuffer();

            const result = await Utils.decompress(
                new DataView(compressed),
                Utils.COMPRESSION_METHOD_DEFLATE,
                'latin1',
                'dataview',
                {maxDecompressedSize: decompressedSize}
            );

            expect(result.byteLength).to.equal(decompressedSize);
            expect(warnSpy.hasWarned).to.equal(false);
        });

        describe('total budget', () => {
            it('should copy the caller\'s config and add a budget with the configured limit', () => {
                const brotli = () => undefined;
                const deflate = () => undefined;
                const config = {brotli, deflate, maxDecompressedSize: 4711};

                const result = Utils.withDecompressBudget(config);

                expect(result).to.not.equal(config);
                expect(result.brotli).to.equal(brotli);
                expect(result.deflate).to.equal(deflate);
                expect(result.maxDecompressedSize).to.equal(4711);
                expect(result.budget.remaining).to.equal(4711);
                expect(Object.keys(config)).to.deep.equal(['brotli', 'deflate', 'maxDecompressedSize']);
            });

            it('should use the default limit without a config', () => {
                const result = Utils.withDecompressBudget(undefined);

                expect(result.budget.remaining).to.equal(Utils.DEFAULT_MAX_DECOMPRESSED_SIZE);
            });

            it('should reject a streamed block once the shared total is exceeded', async () => {
                const config = Utils.withDecompressBudget({maxDecompressedSize: 6 * 1024});
                const compressed = await compressDeflate(new Uint8Array(4 * 1024));

                const first = await decompressDeflate(compressed, config);
                const secondError = await getRejection(decompressDeflate(compressed, config));

                expect(first.byteLength).to.equal(4 * 1024);
                expect(secondError).to.match(/total size of 6144 bytes/);
                expect(warnSpy.hasWarned).to.equal(true);
            });

            it('should skip a later streamed block without decompressing it once the total is exceeded', async () => {
                const config = Utils.withDecompressBudget({maxDecompressedSize: 6 * 1024});
                const compressed = await compressDeflate(new Uint8Array(4 * 1024));
                const tiny = await compressDeflate(new Uint8Array(1));
                await decompressDeflate(compressed, config);
                await getRejection(decompressDeflate(compressed, config));

                const OriginalDecompressionStream = globalThis.DecompressionStream;
                let constructed = 0;
                const restore = swapProperties(globalThis, {
                    DecompressionStream: class extends OriginalDecompressionStream {
                        constructor(format) {
                            super(format);
                            constructed++;
                        }
                    }
                });
                try {
                    const error = await getRejection(decompressDeflate(tiny, config));

                    expect(error).to.match(/total size/);
                    expect(constructed).to.equal(0);
                } finally {
                    restore();
                }
            });

            it('should reject a custom function result once the shared total is exceeded', async () => {
                const config = Utils.withDecompressBudget({
                    deflate: () => new Uint8Array(100),
                    maxDecompressedSize: 150
                });
                const dataView = new DataView(new ArrayBuffer(1));

                const first = await decompressDeflate(dataView.buffer, config);
                const secondError = await getRejection(decompressDeflate(dataView.buffer, config));

                expect(first.byteLength).to.equal(100);
                expect(secondError).to.match(/total size of 150 bytes/);
                expect(warnSpy.hasWarned).to.equal(true);
            });

            it('should accept custom function results that use up the total exactly, and an empty one after them', async () => {
                const sizes = [75, 75, 0];
                let calls = 0;
                const config = Utils.withDecompressBudget({
                    deflate: () => new Uint8Array(sizes[calls++]),
                    maxDecompressedSize: 150
                });
                const buffer = new ArrayBuffer(1);

                const results = [
                    await decompressDeflate(buffer, config),
                    await decompressDeflate(buffer, config),
                    await decompressDeflate(buffer, config)
                ];

                expect(results.map((result) => result.byteLength)).to.deep.equal([75, 75, 0]);
                expect(calls).to.equal(3);
                expect(warnSpy.hasWarned).to.equal(false);
            });

            it('should not call the custom function for a later block once the total is exceeded', async () => {
                const sizes = [100, 100, 1];
                let calls = 0;
                const config = Utils.withDecompressBudget({
                    deflate: () => new Uint8Array(sizes[calls++]),
                    maxDecompressedSize: 150
                });
                const buffer = new ArrayBuffer(1);
                await decompressDeflate(buffer, config);
                await getRejection(decompressDeflate(buffer, config));

                const error = await getRejection(decompressDeflate(buffer, config));

                expect(error).to.match(/total size of 150 bytes/);
                expect(calls).to.equal(2);
            });

            it('should warn only once per budget', async () => {
                const config = Utils.withDecompressBudget({
                    deflate: () => new Uint8Array(100),
                    maxDecompressedSize: 150
                });
                const buffer = new ArrayBuffer(1);
                let warnCount = 0;
                const restore = swapProperties(console, {warn: () => {
                    warnCount++;
                }});
                try {
                    await decompressDeflate(buffer, config);
                    await getRejection(decompressDeflate(buffer, config));
                    await getRejection(decompressDeflate(buffer, config));
                } finally {
                    restore();
                }

                expect(warnCount).to.equal(1);
            });

            function decompressDeflate(buffer, config) {
                return Utils.decompress(
                    new DataView(buffer),
                    Utils.COMPRESSION_METHOD_DEFLATE,
                    'latin1',
                    'dataview',
                    config
                );
            }

            function compressDeflate(input) {
                const compressedStream = new Blob([input]).stream().pipeThrough(
                    new CompressionStream('deflate')
                );
                return new Response(compressedStream).arrayBuffer();
            }

            function getRejection(promise) {
                return promise.then(
                    () => expect.fail('Decompression should have been rejected.'),
                    (error) => error
                );
            }
        });
    });

    describe('pushMetadataBlock', () => {
        it('should push a typed block when tracking is active', () => {
            const metadataBlocks = [];
            Utils.pushMetadataBlock(metadataBlocks, 'exif', 12, 34);
            expect(metadataBlocks).to.deep.equal([{type: 'exif', start: 12, end: 34}]);
        });

        it('should do nothing when there is no block array', () => {
            expect(() => Utils.pushMetadataBlock(undefined, 'exif', 12, 34)).to.not.throw();
        });

        it('should not push a block without a type', () => {
            const metadataBlocks = [];
            Utils.pushMetadataBlock(metadataBlocks, undefined, 12, 34);
            expect(metadataBlocks).to.deep.equal([]);
        });
    });

    describe('setProperty', () => {
        it('should set a regular property', () => {
            const object = {};
            Utils.setProperty(object, 'MyKey', 4711);
            expect(object).to.deep.equal({MyKey: 4711});
        });

        it('should keep a property named __proto__ under its own name', () => {
            const object = {};
            Utils.setProperty(object, '__proto__', {MyKey: 4711});
            expect(Object.keys(object)).to.deep.equal(['__proto__']);
            expect(Object.getPrototypeOf(object)).to.equal(Object.prototype);
        });

        it('should not let a property named __proto__ add inherited properties', () => {
            const object = {};
            Utils.setProperty(object, '__proto__', {MyKey: 4711});
            expect(object.MyKey).to.be.undefined;
        });
    });

    describe('getTagKey', () => {
        it('should keep an ordinary name', () => {
            expect(Utils.getTagKey('MyTag')).to.equal('MyTag');
        });

        it('should keep __proto__ under its own name', () => {
            expect(Utils.getTagKey('__proto__')).to.equal('__proto__');
        });

        it('should keep a name that is not an Object.prototype property', () => {
            expect(Utils.getTagKey('then')).to.equal('then');
            expect(Utils.getTagKey('HasOwnProperty')).to.equal('HasOwnProperty');
        });

        it('should append _ to the name of an Object.prototype method', () => {
            expect(Utils.getTagKey('hasOwnProperty')).to.equal('hasOwnProperty_');
            expect(Utils.getTagKey('toString')).to.equal('toString_');
            expect(Utils.getTagKey('valueOf')).to.equal('valueOf_');
            expect(Utils.getTagKey('constructor')).to.equal('constructor_');
        });

        it('should append _ to the name of a property added to Object.prototype at runtime', () => {
            Object.defineProperty(Object.prototype, 'myPolyfill', {value: () => 4711, configurable: true, writable: true});
            try {
                expect(Utils.getTagKey('myPolyfill')).to.equal('myPolyfill_');
            } finally {
                delete Object.prototype.myPolyfill;
            }
        });
    });

    describe('objectAssign', () => {
        it('should copy properties from all sources', () => {
            expect(Utils.objectAssign({a: 1}, {b: 2}, {c: 3})).to.deep.equal({a: 1, b: 2, c: 3});
        });

        it('should copy a property named __proto__ without replacing the prototype', () => {
            const source = {};
            Utils.setProperty(source, '__proto__', {MyKey: 4711});
            const target = Utils.objectAssign({}, source);
            expect(Object.keys(target)).to.deep.equal(['__proto__']);
            expect(Object.getPrototypeOf(target)).to.equal(Object.prototype);
            expect(target.MyKey).to.be.undefined;
        });
    });
});
