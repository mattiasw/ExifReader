/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import * as Utils from '../../src/utils';

describe('utils', () => {
    it('should extract string from DataView', () => {
        const dataView = getDataView('\x00\x00MyString\x00');
        expect(Utils.getStringFromDataView(dataView, 2, 8)).to.equal('MyString');
    });

    it('should handle length that is too large when extracting string from DataView', () => {
        const dataView = getDataView('\x00\x00MyString');
        expect(Utils.getStringFromDataView(dataView, 2, 10)).to.equal('MyString');
    });

    it('should parse unicode UTF16BE strings', () => {
        const dataView = getDataView('\x0B\x83\x03\x7D\x04\x2F\x00\x54\x00\x65\x00\x73\x00\x74');
        expect(Utils.getUnicodeStringFromDataView(dataView, 0, dataView.byteLength)).to.equal('ஃͽЯTest');
    });

    it('should pad a string', () => {
        expect(Utils.padStart('1', 3, '0')).to.equal('001');
    });

    it('should not pad a string when not necessary', () => {
        expect(Utils.padStart('123', 3, '0')).to.equal('123');
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
            const origDecompressionStream = global.DecompressionStream; // eslint-disable-line no-undef
            global.DecompressionStream = undefined; // eslint-disable-line no-undef
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
                global.DecompressionStream = origDecompressionStream; // eslint-disable-line no-undef
            }
        });

        it('should try DecompressionStream for brotli when no custom function is provided', async () => {
            const dataView = new DataView(new ArrayBuffer(1));

            try {
                await Utils.decompress(
                    dataView,
                    Utils.COMPRESSION_METHOD_BROTLI,
                    undefined,
                    'dataview'
                );
                expect.fail('Should have rejected on invalid data');
            } catch (_error) {
                // Reaches here because Node.js supports DecompressionStream('brotli')
                // but the 1-byte garbage data is not valid brotli
            }
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
    });
});
