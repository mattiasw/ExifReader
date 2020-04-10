/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import Types from '../../src/types';
import ByteOrder from '../../src/byte-order';

describe('types', () => {
    it('should be able to read a byte', () => {
        const dataView = getDataView('\x42');
        expect(Types.getByteAt(dataView, 0)).to.equal(0x42);
    });

    it('should be able to read an ASCII text', () => {
        const dataView = getDataView('String\x00');
        expect(Types.getAsciiAt(dataView, 0)).to.equal('S'.charCodeAt(0));
    });

    it('should be able to read a little endian short', () => {
        const dataView = getDataView('\x11\x47');
        const byteOrder = ByteOrder.LITTLE_ENDIAN;
        expect(Types.getShortAt(dataView, 0, byteOrder)).to.equal(0x4711);
    });

    it('should be able to read a big endian short', () => {
        const dataView = getDataView('\x47\x11');
        const byteOrder = ByteOrder.BIG_ENDIAN;
        expect(Types.getShortAt(dataView, 0, byteOrder)).to.equal(0x4711);
    });

    it('should be able to read a little endian long', () => {
        const dataView = getDataView('\x45\x44\x43\x42');
        const byteOrder = ByteOrder.LITTLE_ENDIAN;
        expect(Types.getLongAt(dataView, 0, byteOrder)).to.equal(0x42434445);
    });

    it('should be able to read a big endian long', () => {
        const dataView = getDataView('\x42\x43\x44\x45');
        const byteOrder = ByteOrder.BIG_ENDIAN;
        expect(Types.getLongAt(dataView, 0, byteOrder)).to.equal(0x42434445);
    });

    it('should be able to read a little endian rational', () => {
        const dataView = getDataView('\x45\x44\x43\x42\x49\x48\x47\x46');
        const byteOrder = ByteOrder.LITTLE_ENDIAN;
        expect(Types.getRationalAt(dataView, 0, byteOrder)).to.deep.equal([0x42434445, 0x46474849]);
    });

    it('should be able to read a big endian rational', () => {
        const dataView = getDataView('\x42\x43\x44\x45\x46\x47\x48\x49');
        const byteOrder = ByteOrder.BIG_ENDIAN;
        expect(Types.getRationalAt(dataView, 0, byteOrder)).to.deep.equal([0x42434445, 0x46474849]);
    });

    it('should be able to read an undefined', () => {
        const dataView = getDataView('\x42');
        expect(Types.getUndefinedAt(dataView, 0)).to.equal(0x42);
    });

    it('should be able to read a little endian slong', () => {
        const dataView = getDataView('\xbe\xff\xff\xff');
        const byteOrder = ByteOrder.LITTLE_ENDIAN;
        expect(Types.getSlongAt(dataView, 0, byteOrder)).to.equal(-0x42);
    });

    it('should be able to read a big endian slong', () => {
        const dataView = getDataView('\xff\xff\xff\xbe');
        const byteOrder = ByteOrder.BIG_ENDIAN;
        expect(Types.getSlongAt(dataView, 0, byteOrder)).to.equal(-0x42);
    });

    it('should be able to read a little endian srational', () => {
        const dataView = getDataView('\xbe\xff\xff\xff\x49\x48\x47\x46');
        const byteOrder = ByteOrder.LITTLE_ENDIAN;
        expect(Types.getSrationalAt(dataView, 0, byteOrder)).to.deep.equal([-0x42, 0x46474849]);
    });

    it('should be able to read a big endian srational', () => {
        const dataView = getDataView('\xff\xff\xff\xbe\x46\x47\x48\x49');
        const byteOrder = ByteOrder.BIG_ENDIAN;
        expect(Types.getSrationalAt(dataView, 0, byteOrder)).to.deep.equal([-0x42, 0x46474849]);
    });

    it('should be able to read a little endian IFD pointer', () => {
        const dataView = getDataView('\x45\x44\x43\x42');
        const byteOrder = ByteOrder.LITTLE_ENDIAN;
        expect(Types.getIfdPointerAt(dataView, 0, byteOrder)).to.equal(0x42434445);
    });

    it('should be able to read a big endian IFD pointer', () => {
        const dataView = getDataView('\x42\x43\x44\x45');
        const byteOrder = ByteOrder.BIG_ENDIAN;
        expect(Types.getIfdPointerAt(dataView, 0, byteOrder)).to.equal(0x42434445);
    });

    it('should be able to get ASCII value', () => {
        const string = 'String\x00';
        const stringValues = string.split('').map((character) => character.charCodeAt(0));
        expect(Types.getAsciiValue(stringValues).join('')).to.equal(string);
    });

    it('should throw when trying to get unknown type size', () => {
        expect(() => Types.getTypeSize('UNKNOWN_TYPE')).to.throw(/No such type found./);
    });

    it('should report correct type sizes', () => {
        expect(Types.getTypeSize('BYTE')).to.equal(1);
        expect(Types.getTypeSize('ASCII')).to.equal(1);
        expect(Types.getTypeSize('SHORT')).to.equal(2);
        expect(Types.getTypeSize('LONG')).to.equal(4);
        expect(Types.getTypeSize('RATIONAL')).to.equal(8);
        expect(Types.getTypeSize('UNDEFINED')).to.equal(1);
        expect(Types.getTypeSize('SLONG')).to.equal(4);
        expect(Types.getTypeSize('SRATIONAL')).to.equal(8);
        expect(Types.getTypeSize('IFD')).to.equal(4);
    });
});
