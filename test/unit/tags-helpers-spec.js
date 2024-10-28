/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {__RewireAPI__ as TagsHelpersRewireAPI} from '../../src/tags-helpers';
import {getDataView} from './test-utils';
import TagsHelpers from '../../src/tags-helpers';
import {readIfd, get0thIfdOffset} from '../../src/tags-helpers';
import Types from '../../src/types';
import ByteOrder from '../../src/byte-order';

describe('tags-helpers', () => {
    const splitNullSeparatedAsciiString = TagsHelpers.__get__('splitNullSeparatedAsciiString');
    const getTagValue = TagsHelpers.__get__('getTagValue');
    const readTag = TagsHelpers.__get__('readTag');

    afterEach(() => {
        TagsHelpersRewireAPI.__ResetDependency__('TagNames');
    });

    it('should correctly read offset of 0th IFD for little endian data', () => {
        const dataView = getDataView('\x49\x49\x00\x2a\x08\x00\x00\x00');
        const byteOrder = ByteOrder.getByteOrder(dataView, 0);
        expect(get0thIfdOffset(dataView, 0, byteOrder)).to.equal(8);
    });

    it('should correctly read offset of 0th IFD for big endian data', () => {
        const dataView = getDataView('\x4d\x4d\x00\x2a\x00\x00\x00\x08');
        const byteOrder = ByteOrder.getByteOrder(dataView, 0);
        expect(get0thIfdOffset(dataView, 0, byteOrder)).to.equal(8);
    });

    it('should be able to get 0th IFD offset', () => {
        const dataView = getDataView('\x00\x00\x00\x00\x00\x2a\x47\x11\x48\x12');
        const tiffHeaderOffset = 2;
        expect(get0thIfdOffset(dataView, tiffHeaderOffset, ByteOrder.BIG_ENDIAN)).to.equal(tiffHeaderOffset + 0x47114812);
    });

    it('should split null separated ASCII strings', () => {
        expect(splitNullSeparatedAsciiString('ab\x00cd\x00')).to.deep.equal(['ab', 'cd']);
    });

    it('should be able to get ASCII tag value of length 1', () => {
        const dataView = getDataView('\x00');
        expect(getTagValue(dataView, 0, Types.tagTypes.ASCII, 1, ByteOrder.LITTLE_ENDIAN)).to.deep.equal(['\x00']);
    });

    it('should be able to get little endian tag value', () => {
        const dataView = getDataView('\x42\x00\x00\x00');
        expect(getTagValue(dataView, 0, Types.tagTypes.LONG, 1, ByteOrder.LITTLE_ENDIAN)).to.equal(0x42);
    });

    it('should be able to get big endian tag value', () => {
        const dataView = getDataView('\x00\x00\x00\x42');
        expect(getTagValue(dataView, 0, Types.tagTypes.LONG, 1, ByteOrder.BIG_ENDIAN)).to.equal(0x42);
    });

    it('should be able to read a one-field IFD', () => {
        // Field count + field + offset to next IFD.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00');
        TagsHelpers.__set__('TagNames', {'0th': {0x4711: 'MyExifTag'}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag'].id).to.equal(0x4711);
        expect(tags['MyExifTag'].description).to.equal(0x42);
        expect(tags['MyExifTag'].__offset).to.be.undefined;
    });

    it('should be able to read a one-field IFD and pass on the offset for MakerNote', () => {
        // Field count + field + offset to next IFD.
        const dataView = getDataView('\x00\x01' + '\x92\x7c\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00');
        TagsHelpers.__set__('TagNames', {'0th': {0x927c: 'MakerNote'}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MakerNote'].__offset).to.equal(0xa);
    });

    it('should be able to read a multi-field IFD', () => {
        // Field count + 1st field + 2nd field + offset to next IFD.
        const dataView = getDataView('\x00\x02' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x47\x12\x00\x01\x00\x00\x00\x01\x43\x00\x00\x00' + '\x00\x00\x00\x00');
        TagsHelpers.__set__('TagNames', {
            '0th': {
                0x4711: 'MyExifTag0',
                0x4712: 'MyExifTag1'
            }
        });
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag0'].description).to.equal(0x42);
        expect(tags['MyExifTag1'].description).to.equal(0x43);
    });

    it('should be able to read an undefined IFD', () => {
        // Field count + field + offset to next IFD.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00');
        TagsHelpers.__set__('TagNames', {'0th': {}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, true);
        expect(tags['undefined-18193'].id).to.equal(0x4711);
        expect(tags['undefined-18193'].description).to.equal(0x42);
        expect(tags['undefined-18193'].value).to.equal(0x42);
    });

    it('should ignore undefined IFDs', () => {
        // Field count + field + offset to next IFD.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00');
        TagsHelpers.__set__('TagNames', {'0th': {}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, false);
        expect(tags).to.deep.equal({});
    });

    it('should be able to read short ASCII tag', () => {
        TagsHelpers.__set__('TagNames', {'0th': {0x4711: 'MyAsciiTag'}});
        const dataView = getDataView('\x47\x11\x00\x02\x00\x00\x00\x04\x41\x42\x43\x00');
        expect(readTag(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN).description).to.equal('ABC');
    });

    it('should be able to read long ASCII tag', () => {
        TagsHelpers.__set__('TagNames', {'0th': {0x4711: 'MyAsciiTag'}});
        const dataView = getDataView('\x47\x11\x00\x02\x00\x00\x00\x06\x00\x00\x00\x0c\x41\x42\x43\x44\x45\x00');
        expect(readTag(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN).description).to.equal('ABCDE');
    });

    it('should be able to read encoded ASCII tag', () => {
        TagsHelpers.__set__('TagNames', {'0th': {0x4711: 'MyAsciiTag'}});
        const dataView = getDataView('\x47\x11\x00\x02\x00\x00\x00\x04\x41\xc3\xba\x43\x00');
        expect(readTag(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN).description).to.equal('AúC');
    });

    it('should be able to read RATIONAL tag', () => {
        TagsHelpers.__set__('TagNames', {'0th': {0x4711: 'MyRationalTag'}});
        const dataView = getDataView('\x47\x11' + '\x00\x05' + '\x00\x00\x00\x01' + '\x00\x00\x00\x0c' + '\x00\x00\x00\x09\x00\x00\x00\x02');
        expect(readTag(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN).description).to.equal('4.5');
    });

    it('should be able to read SRATIONAL tag', () => {
        TagsHelpers.__set__('TagNames', {'0th': {0x4711: 'MySrationalTag'}});
        const dataView = getDataView('\x47\x11' + '\x00\x0a' + '\x00\x00\x00\x01' + '\x00\x00\x00\x0c' + '\xff\xff\xff\xf7\x00\x00\x00\x02');
        expect(readTag(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN).description).to.equal('-4.5');
    });

    it('should be able to handle tag with faulty type', () => {
        const dataView = getDataView('\x47\x11\x00\x08\x00\x00\x00\x00');
        expect(readTag(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN)).to.be.undefined;
    });

    it('should be able to handle an IFD with a faulty type tag', () => {
        // Field count + field.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x08\x00\x00\x00\x00');
        TagsHelpers.__set__('TagNames', {'0th': {0x4711: 'MyExifTag'}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag']).to.be.undefined;
    });

    it('should be able to read offsetted tag', () => {
        TagsHelpers.__set__('TagNames', {'0th': {0x4711: 'MyAsciiTag'}});
        const dataView = getDataView(
            '\x00\x00\x00\x00' + '\x00\x00' // Padding to test offset.
            + '\x00\x01' // Number of fields.
            + '\x47\x11\x00\x02\x00\x00\x00\x06\x00\x00\x00\x14'
            + '\x00\x00\x00\x00' // Offset to next IFD.
            + '\x41\x42\x43\x44\x45\x00' // Value.
        );
        expect(readIfd(dataView, '0th', 4, 6, ByteOrder.BIG_ENDIAN)).to.deep.equal({
            MyAsciiTag: {
                id: 0x4711,
                value: ['ABCDE'],
                description: 'ABCDE'
            }
        });
    });

    it('should pass on the offset for the MakerNote tag', () => {
        TagsHelpers.__set__('TagNames', {'0th': {0x927c: 'MakerNote'}});
        const dataView = getDataView(
            '\x00\x00\x00\x00' + '\x00\x00' // Padding to test offset.
            + '\x00\x01' // Number of fields.
            + '\x92\x7c\x00\x02\x00\x00\x00\x06\x00\x00\x00\x14'
            + '\x00\x00\x00\x00' // Offset to next IFD.
            + '\x41\x42\x43\x44\x45\x00' // Value.
        );
        expect(readIfd(dataView, '0th', 4, 6, ByteOrder.BIG_ENDIAN)).to.deep.equal({
            MakerNote: {
                id: 0x927c,
                value: ['ABCDE'],
                description: 'ABCDE',
                __offset: 0x14
            }
        });
    });

    it('should be able to handle tag with faulty offset (too large)', () => {
        TagsHelpers.__set__('TagNames', {'0th': {0x4711: 'MyAsciiTag'}});
        const dataView = getDataView(
            '\x00\x00\x00\x00' + '\x00\x00' // Padding to test offset.
            + '\x00\x01' // Number of fields.
            + '\x47\x11\x00\x02'
            + '\x00\x00\x00\x07' // Too large number of tag items.
            + '\x00\x00\x00\x14' // Offset.
            + '\x00\x00\x00\x00' // Offset to next IFD.
            + '\x41\x42\x43\x44\x45\x00'
        );
        expect(readIfd(dataView, '0th', 4, 6, ByteOrder.BIG_ENDIAN)).to.deep.equal({
            MyAsciiTag: {
                id: 0x4711,
                value: ['<faulty value>'],
                description: '<faulty value>'
            }
        });
    });

    it('should be able to handle when IFD content is missing', () => {
        const dataView = getDataView('\x00\x00\x00\x00');
        expect(readIfd(dataView, '0th', 0, 4, ByteOrder.BIG_ENDIAN)).to.deep.equal({});
    });

    it('should be able to handle when specified number of fields in IFD is wrong', () => {
        const dataView = getDataView(
            '\x00\x00\x00\x00'
            + '\x00\x01' // Number of fields.
        );
        expect(readIfd(dataView, '0th', 0, 4, ByteOrder.BIG_ENDIAN)).to.deep.equal({});
    });

    it('should be able to handle description function that throws, e.g. because it receives a faulty tag value', () => {
        const dataView = getDataView(
            '\x00\x00\x4d\x4d' // Byte order
            + '\x00\x00\x00\x08' // IFD offset
            + '\x00\x01' // Field count
            + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' // Field
        );
        TagsHelpers.__set__('TagNames', {
            '0th': {
                0x4711: {
                    name: 'MyExifTag',
                    description() {
                        throw new Error();
                    }
                }
            }
        });
        const tags = readIfd(dataView, '0th', 0, get0thIfdOffset(dataView, 0, ByteOrder.BIG_ENDIAN), ByteOrder.BIG_ENDIAN);
        expect(tags).to.deep.equal({
            MyExifTag: {
                id: 0x4711,
                value: 0x42,
                description: 0x42
            }
        });
    });
});
