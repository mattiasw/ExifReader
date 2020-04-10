/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import DataView from '../../src/dataview';

describe('dataview', () => {
    it('throws if the passed buffer is missing methods', () => {
        const exceptionMessage = /DataView: Passed buffer type is unsupported./;
        expect(() => new DataView()).to.throw(exceptionMessage);
        expect(() => new DataView({})).to.throw(exceptionMessage);
        expect(() => new DataView([])).to.throw(exceptionMessage);
    });

    it('should have byteLength property', () => {
        const data = [0, 0, 0];
        expect((new DataView(Buffer.from(data))).byteLength).to.equal(data.length);
    });

    it('should get 8 bit value', () => {
        expect((new DataView(Buffer.from([0xf2]))).getUint8(0)).to.equal(0xf2);
    });

    it('should get 16 bit big endian value', () => {
        expect((new DataView(Buffer.from([0x47, 0x11]))).getUint16(0, false)).to.equal(0x4711);
    });

    it('should get 16 bit little endian value', () => {
        expect((new DataView(Buffer.from([0x47, 0x11]))).getUint16(0, true)).to.equal(0x1147);
    });

    it('should get 32 bit big endian value', () => {
        expect((new DataView(Buffer.from([0x47, 0x11, 0x48, 0x12]))).getUint32(0, false)).to.equal(0x47114812);
    });

    it('should get 32 bit little endian value', () => {
        expect((new DataView(Buffer.from([0x47, 0x11, 0x48, 0x12]))).getUint32(0, true)).to.equal(0x12481147);
    });

    it('should get signed 32 bit big endian value', () => {
        expect((new DataView(Buffer.from([0xf7, 0x11, 0x48, 0x12]))).getInt32(0, false)).to.equal(-0x8eeb7ee);
    });

    it('should get signed 32 bit little endian value', () => {
        expect((new DataView(Buffer.from([0x47, 0x11, 0x48, 0xf2]))).getInt32(0, true)).to.equal(-0xdB7eeb9);
    });
});
