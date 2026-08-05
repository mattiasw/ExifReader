/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The private helpers (readTag, getTagValue, splitNullSeparatedAsciiString)
// are exercised through the exported readIfd by feeding it crafted IFD bytes
// (field count + 12-byte fields + offset to next IFD). TagNames is injected
// by swapping properties on the shared default-export object.

import {expect} from 'chai';
import {getByteStringFromNumber, getDataView, swapProperties} from './test-utils.js';
import TagNames from '../../src/tag-names.js';
import {readIfd, get0thIfdOffset, getValueBudget} from '../../src/tags-helpers.js';
import ByteOrder from '../../src/byte-order.js';

describe('tags-helpers', () => {
    let restoreTagNames;

    afterEach(() => {
        if (restoreTagNames) {
            restoreTagNames();
            restoreTagNames = undefined;
        }
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

    it('should return undefined when TIFF data is truncated before IFD offset', () => {
        // Only byte order bytes (MM), no TIFF ID or IFD offset - simulates truncated EXIF
        const dataView = getDataView('\x4d\x4d');
        const byteOrder = ByteOrder.getByteOrder(dataView, 0);
        expect(get0thIfdOffset(dataView, 0, byteOrder)).to.be.undefined;
    });

    it('should be able to get 0th IFD offset', () => {
        const dataView = getDataView('\x00\x00\x00\x00\x00\x2a\x47\x11\x48\x12');
        const tiffHeaderOffset = 2;
        expect(get0thIfdOffset(dataView, tiffHeaderOffset, ByteOrder.BIG_ENDIAN)).to.equal(tiffHeaderOffset + 0x47114812);
    });

    it('should split null separated ASCII strings', () => {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyAsciiTag'}});
        // Field count + offsetted ASCII field + offset to next IFD + value "ab\0cd\0" at offset 0x12.
        const dataView = getDataView(
            '\x00\x01'
            + '\x47\x11\x00\x02\x00\x00\x00\x06\x00\x00\x00\x12'
            + '\x00\x00\x00\x00'
            + 'ab\x00cd\x00'
        );
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyAsciiTag'].value).to.deep.equal(['ab', 'cd']);
    });

    it('should be able to get ASCII tag value of length 1', () => {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyAsciiTag'}});
        // A single-character ASCII value stays an array instead of being unwrapped.
        const dataView = getDataView('\x01\x00' + '\x11\x47\x02\x00\x01\x00\x00\x00\x41\x00\x00\x00' + '\x00\x00\x00\x00');
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.LITTLE_ENDIAN);
        expect(tags['MyAsciiTag'].value).to.deep.equal(['A']);
    });

    it('should be able to get little endian tag value', () => {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyExifTag'}});
        // Field count + LONG field + offset to next IFD, all little endian.
        const dataView = getDataView('\x01\x00' + '\x11\x47\x04\x00\x01\x00\x00\x00\x42\x00\x00\x00' + '\x00\x00\x00\x00');
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.LITTLE_ENDIAN);
        expect(tags['MyExifTag'].value).to.equal(0x42);
    });

    it('should be able to get big endian tag value', () => {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyExifTag'}});
        // Field count + LONG field + offset to next IFD.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x04\x00\x00\x00\x01\x00\x00\x00\x42' + '\x00\x00\x00\x00');
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag'].value).to.equal(0x42);
    });

    it('should be able to read a one-field IFD', () => {
        // Field count + field + offset to next IFD.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00');
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyExifTag'}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag'].id).to.equal(0x4711);
        expect(tags['MyExifTag'].description).to.equal(0x42);
        expect(tags['MyExifTag'].__offset).to.be.undefined;
    });

    it('should be able to read a one-field IFD and pass on the offset for MakerNote', () => {
        // Field count + field + offset to next IFD.
        const dataView = getDataView('\x00\x01' + '\x92\x7c\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00');
        restoreTagNames = swapProperties(TagNames, {'0th': {0x927c: 'MakerNote'}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MakerNote'].__offset).to.equal(0xa);
    });

    it('should be able to read a multi-field IFD', () => {
        // Field count + 1st field + 2nd field + offset to next IFD.
        const dataView = getDataView('\x00\x02' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x47\x12\x00\x01\x00\x00\x00\x01\x43\x00\x00\x00' + '\x00\x00\x00\x00');
        restoreTagNames = swapProperties(TagNames, {
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
        restoreTagNames = swapProperties(TagNames, {'0th': {}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, true);
        expect(tags['undefined-18193'].id).to.equal(0x4711);
        expect(tags['undefined-18193'].description).to.equal(0x42);
        expect(tags['undefined-18193'].value).to.equal(0x42);
    });

    it('should ignore undefined IFDs', () => {
        // Field count + field + offset to next IFD.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00');
        restoreTagNames = swapProperties(TagNames, {'0th': {}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, false);
        expect(tags).to.deep.equal({});
    });

    it('should be able to read short ASCII tag', () => {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyAsciiTag'}});
        // Field count + in-slot ASCII field "ABC\0" + offset to next IFD.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x02\x00\x00\x00\x04\x41\x42\x43\x00' + '\x00\x00\x00\x00');
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyAsciiTag'].description).to.equal('ABC');
    });

    it('should be able to read long ASCII tag', () => {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyAsciiTag'}});
        // Field count + offsetted ASCII field + offset to next IFD + value "ABCDE\0" at offset 0x12.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x02\x00\x00\x00\x06\x00\x00\x00\x12' + '\x00\x00\x00\x00' + '\x41\x42\x43\x44\x45\x00');
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyAsciiTag'].description).to.equal('ABCDE');
    });

    it('should be able to read encoded ASCII tag', () => {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyAsciiTag'}});
        // Field count + in-slot ASCII field with UTF-8 encoded bytes + offset to next IFD.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x02\x00\x00\x00\x04\x41\xc3\xba\x43' + '\x00\x00\x00\x00');
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyAsciiTag'].description).to.equal('AúC');
    });

    it('should be able to read RATIONAL tag', () => {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyRationalTag'}});
        // Field count + offsetted RATIONAL field + offset to next IFD + value 9/2 at offset 0x12.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x05\x00\x00\x00\x01\x00\x00\x00\x12' + '\x00\x00\x00\x00' + '\x00\x00\x00\x09\x00\x00\x00\x02');
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyRationalTag'].description).to.equal('4.5');
    });

    it('should be able to read SRATIONAL tag', () => {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MySrationalTag'}});
        // Field count + offsetted SRATIONAL field + offset to next IFD + value -9/2 at offset 0x12.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x0a\x00\x00\x00\x01\x00\x00\x00\x12' + '\x00\x00\x00\x00' + '\xff\xff\xff\xf7\x00\x00\x00\x02');
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MySrationalTag'].description).to.equal('-4.5');
    });

    it('should be able to handle tag with faulty type', () => {
        // Type 0x08 has no known size so the tag is dropped even when unknown tags are included.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x08\x00\x00\x00\x01\x00\x00\x00\x00');
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, true);
        expect(tags).to.deep.equal({});
    });

    it('should be able to handle an IFD with a faulty type tag', () => {
        // Field count + field.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x08\x00\x00\x00\x00');
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyExifTag'}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag']).to.be.undefined;
    });

    it('should be able to read offsetted tag', () => {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyAsciiTag'}});
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
        restoreTagNames = swapProperties(TagNames, {'0th': {0x927c: 'MakerNote'}});
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
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyAsciiTag'}});
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
        restoreTagNames = swapProperties(TagNames, {
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

    it('should add a computed value for an ASCII tag when enabled', function () {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyAsciiTag'}});
        const dataView = getDataView(
            '\x00\x01' // Number of fields.
            + '\x47\x11\x00\x02\x00\x00\x00\x04\x41\x42\x43\x00' // Field: ASCII "ABC\0".
            + '\x00\x00\x00\x00' // Offset to next IFD.
        );

        const tags = readIfd(
            dataView,
            '0th',
            0,
            0,
            ByteOrder.BIG_ENDIAN,
            false,
            true
        );

        expect(tags['MyAsciiTag']).to.deep.equal({
            id: 0x4711,
            value: ['ABC'],
            description: 'ABC',
            computed: 'ABC',
        });
    });

    it('should add a computed value for a multi-value ASCII tag when enabled', function () {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyAsciiTag'}});
        const dataView = getDataView(
            '\x00\x01' // Number of fields.
            + '\x47\x11\x00\x02\x00\x00\x00\x06\x00\x00\x00\x12' // Field: ASCII offset.
            + '\x00\x00\x00\x00' // Offset to next IFD.
            + 'ab\x00cd\x00' // Value at offset 0x12.
        );

        const tags = readIfd(
            dataView,
            '0th',
            0,
            0,
            ByteOrder.BIG_ENDIAN,
            false,
            true
        );

        expect(tags['MyAsciiTag']).to.deep.equal({
            id: 0x4711,
            value: ['ab', 'cd'],
            description: 'ab, cd',
            computed: ['ab', 'cd'],
        });
    });

    it('should add a computed value for a RATIONAL tag when enabled', function () {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyRationalTag'}});
        const dataView = getDataView(
            '\x00\x01' // Number of fields.
            + '\x47\x11\x00\x05\x00\x00\x00\x01\x00\x00\x00\x12' // Field: RATIONAL offset.
            + '\x00\x00\x00\x00' // Offset to next IFD.
            + '\x00\x00\x00\x09\x00\x00\x00\x02' // Value at offset 0x12: 9/2.
        );

        const tags = readIfd(
            dataView,
            '0th',
            0,
            0,
            ByteOrder.BIG_ENDIAN,
            false,
            true
        );

        expect(tags['MyRationalTag']).to.deep.equal({
            id: 0x4711,
            value: [9, 2],
            description: '4.5',
            computed: 4.5,
        });
    });

    it('should add computed values for arrays of RATIONAL values when enabled', function () {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyRationalTag'}});
        const dataView = getDataView(
            '\x00\x01' // Number of fields.
            + '\x47\x11\x00\x05\x00\x00\x00\x02\x00\x00\x00\x12' // Field: RATIONAL offset.
            + '\x00\x00\x00\x00' // Offset to next IFD.
            + '\x00\x00\x00\x09\x00\x00\x00\x02' // Value at offset 0x12: 9/2.
            + '\x00\x00\x00\x01\x00\x00\x00\x00' // Value at offset 0x1a: 1/0.
        );

        const tags = readIfd(
            dataView,
            '0th',
            0,
            0,
            ByteOrder.BIG_ENDIAN,
            false,
            true
        );

        expect(tags['MyRationalTag']).to.deep.equal({
            id: 0x4711,
            value: [[9, 2], [1, 0]],
            description: 'NaN',
            computed: [4.5, null],
        });
    });

    it('should not truncate any value of a normal IFD with non-overlapping values', () => {
        restoreTagNames = swapProperties(TagNames, {
            '0th': {
                0x4711: 'MyShortTag',
                0x4712: 'MyAsciiTag',
                0x4713: 'MyRationalTag'
            }
        });
        // Field count + in-slot SHORT + offsetted ASCII at 0x2a + offsetted
        // RATIONAL at 0x30 + offset to next IFD; the two offsetted values are
        // disjoint and fill the buffer's tail completely.
        const dataView = getDataView(
            '\x00\x03'
            + '\x47\x11\x00\x03\x00\x00\x00\x01\x00\x42\x00\x00'
            + '\x47\x12\x00\x02\x00\x00\x00\x06\x00\x00\x00\x2a'
            + '\x47\x13\x00\x05\x00\x00\x00\x01\x00\x00\x00\x30'
            + '\x00\x00\x00\x00'
            + 'ABCDE\x00'
            + '\x00\x00\x00\x09\x00\x00\x00\x02'
        );
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyShortTag'].value).to.equal(0x42);
        expect(tags['MyAsciiTag'].value).to.deep.equal(['ABCDE']);
        expect(tags['MyAsciiTag'].description).to.equal('ABCDE');
        expect(tags['MyRationalTag'].value).to.deep.equal([9, 2]);
        expect(tags['MyRationalTag'].description).to.equal('4.5');
    });

    it('should bound the total decoded value size across an IFD\'s tags to the input size', () => {
        restoreTagNames = swapProperties(TagNames, {
            '0th': {
                0x4711: 'HugeTag0',
                0x4712: 'HugeTag1',
                0x4713: 'HugeTag2',
                0x4714: 'HugeTag3'
            }
        });
        // Four BYTE fields, each declaring a count as large as the whole
        // buffer and all pointing at offset 0, so their declared sizes
        // overlap the same bytes and sum to four times the input size.
        const byteLength = 64;
        const hugeCount = getByteStringFromNumber(byteLength, 4);
        const dataView = getDataView(
            '\x00\x04'
            + '\x47\x11\x00\x01' + hugeCount + '\x00\x00\x00\x00'
            + '\x47\x12\x00\x01' + hugeCount + '\x00\x00\x00\x00'
            + '\x47\x13\x00\x01' + hugeCount + '\x00\x00\x00\x00'
            + '\x47\x14\x00\x01' + hugeCount + '\x00\x00\x00\x00'
            + '\x00\x00\x00\x00'
            + '\x00'.repeat(10)
        );
        expect(dataView.byteLength).to.equal(byteLength);
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, false, false, undefined, 'exif', {remaining: byteLength});
        // The fields are all of BYTE type, so one decoded element is one byte.
        const totalDecodedBytes = ['HugeTag0', 'HugeTag1', 'HugeTag2', 'HugeTag3']
            .map((name) => (Array.isArray(tags[name].value) ? tags[name].value.length : 1))
            .reduce((sum, length) => sum + length, 0);
        expect(totalDecodedBytes).to.be.at.most(byteLength);
        expect(tags['HugeTag0'].value).to.have.lengthOf(byteLength);
        for (const name of ['HugeTag1', 'HugeTag2', 'HugeTag3']) {
            expect(tags[name].value).to.deep.equal([]);
            expect(tags[name].description).to.equal('');
        }
    });

    it('should never truncate a tag value to a single element', () => {
        restoreTagNames = swapProperties(TagNames, {
            '0th': {
                0x4711: 'HugeTagA',
                0x4712: 'HugeTagB'
            }
        });
        // The first field drains the budget down to a single byte; naively
        // clamping the second field to one element would make it a scalar
        // through the single-value unwrapping.
        const byteLength = 64;
        const dataView = getDataView(
            '\x00\x02'
            + '\x47\x11\x00\x01' + getByteStringFromNumber(byteLength - 1, 4) + '\x00\x00\x00\x00'
            + '\x47\x12\x00\x01' + getByteStringFromNumber(byteLength, 4) + '\x00\x00\x00\x00'
            + '\x00\x00\x00\x00'
            + '\x00'.repeat(34)
        );
        expect(dataView.byteLength).to.equal(byteLength);
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, false, false, undefined, 'exif', {remaining: byteLength});
        expect(tags['HugeTagA'].value).to.have.lengthOf(byteLength - 1);
        expect(tags['HugeTagB'].value).to.deep.equal([]);
    });

    it('should not clamp in-slot values even when the budget is exhausted', () => {
        restoreTagNames = swapProperties(TagNames, {
            '0th': {
                0x4711: 'HugeTag',
                0x8769: 'Exif IFD Pointer'
            }
        });
        // Pointer-style tags store their value inside the 12-byte field
        // itself; they must survive intact after a huge tag drains the
        // budget, or sub-IFD offsets would be corrupted.
        const byteLength = 64;
        const dataView = getDataView(
            '\x00\x02'
            + '\x47\x11\x00\x01' + getByteStringFromNumber(byteLength, 4) + '\x00\x00\x00\x00'
            + '\x87\x69\x00\x04\x00\x00\x00\x01\x00\x00\x00\x42'
            + '\x00\x00\x00\x00'
            + '\x00'.repeat(34)
        );
        expect(dataView.byteLength).to.equal(byteLength);
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, false, false, undefined, 'exif', {remaining: byteLength});
        expect(tags['HugeTag'].value).to.have.lengthOf(byteLength);
        expect(tags['Exif IFD Pointer'].value).to.equal(0x42);
    });

    it('should share the decoded-value budget with the thumbnail IFD', () => {
        restoreTagNames = swapProperties(TagNames, {
            '0th': {0x4711: 'Huge0thTag'},
            '1st': {0x4712: 'Huge1stTag'}
        });
        // 0th IFD with a budget-draining tag, then an offset to a 1st IFD at
        // 0x12 whose tag declares the same huge count over the same bytes.
        const byteLength = 64;
        const hugeCount = getByteStringFromNumber(byteLength, 4);
        const dataView = getDataView(
            '\x00\x01'
            + '\x47\x11\x00\x01' + hugeCount + '\x00\x00\x00\x00'
            + '\x00\x00\x00\x12'
            + '\x00\x01'
            + '\x47\x12\x00\x01' + hugeCount + '\x00\x00\x00\x00'
            + '\x00\x00\x00\x00'
            + '\x00'.repeat(28)
        );
        expect(dataView.byteLength).to.equal(byteLength);
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, false, false, undefined, 'exif', {remaining: byteLength});
        expect(tags['Huge0thTag'].value).to.have.lengthOf(byteLength);
        expect(tags['Thumbnail']['Huge1stTag'].value).to.deep.equal([]);
    });

    it('should give a buffer a budget that is larger than the buffer itself', () => {
        // Tags may legitimately point at overlapping parts of a buffer, so the
        // values may add up to more than there are bytes to decode them from.
        const dataView = getDataView('\x00'.repeat(64));
        expect(getValueBudget(dataView).remaining).to.be.above(dataView.byteLength);
    });

    it('should give each caller that omits the budget a fresh one', () => {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'HugeTag'}});
        // The single field declares as many bytes as the whole buffer, so a
        // budget kept between the two reads would truncate the second one.
        const byteLength = 64;
        const dataView = getDataView(
            '\x00\x01'
            + '\x47\x11\x00\x01' + getByteStringFromNumber(byteLength, 4) + '\x00\x00\x00\x00'
            + '\x00\x00\x00\x00'
            + '\x00'.repeat(46)
        );
        expect(dataView.byteLength).to.equal(byteLength);
        const budget = {remaining: byteLength};
        const firstTags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, false, false, undefined, 'exif', budget);
        const sharedBudgetTags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, false, false, undefined, 'exif', budget);
        const ownBudgetTags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(firstTags['HugeTag'].value).to.have.lengthOf(byteLength);
        expect(sharedBudgetTags['HugeTag'].value).to.deep.equal([]);
        expect(ownBudgetTags['HugeTag'].value).to.have.lengthOf(byteLength);
    });

    it('should not debit the budget for values that fail the bounds check', () => {
        restoreTagNames = swapProperties(TagNames, {
            '0th': {
                0x4711: 'FaultyTag',
                0x4712: 'MyByteTag'
            }
        });
        // The first field declares a huge count at an out-of-bounds offset
        // and becomes '<faulty value>' without decoding; the second field's
        // value spans the whole buffer tail and must still decode in full.
        const byteLength = 64;
        const dataView = getDataView(
            '\x00\x02'
            + '\x47\x11\x00\x01' + getByteStringFromNumber(byteLength, 4) + '\x00\x00\x03\xe8'
            + '\x47\x12\x00\x01' + getByteStringFromNumber(34, 4) + '\x00\x00\x00\x1e'
            + '\x00\x00\x00\x00'
            + '\x00'.repeat(34)
        );
        expect(dataView.byteLength).to.equal(byteLength);
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, false, false, undefined, 'exif', {remaining: byteLength});
        expect(tags['FaultyTag'].value).to.equal('<faulty value>');
        expect(tags['MyByteTag'].value).to.have.lengthOf(34);
    });

    it('should decode as much of a value as the remaining budget allows', () => {
        restoreTagNames = swapProperties(TagNames, {
            '0th': {
                0x4711: 'MyByteTag',
                0x4712: 'PartiallyDecodedTag'
            }
        });
        // The first field spends all but 20 bytes of the budget, so the second
        // field decodes the 20 elements that are left of its declared 40.
        const byteLength = 64;
        const dataView = getDataView(
            '\x00\x02'
            + '\x47\x11\x00\x01' + getByteStringFromNumber(byteLength - 20, 4) + '\x00\x00\x00\x00'
            + '\x47\x12\x00\x01' + getByteStringFromNumber(40, 4) + '\x00\x00\x00\x18'
            + '\x00\x00\x00\x00'
            + '\x00'.repeat(34)
        );
        expect(dataView.byteLength).to.equal(byteLength);
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, false, false, undefined, 'exif', {remaining: byteLength});
        expect(tags['MyByteTag'].value).to.have.lengthOf(byteLength - 20);
        expect(tags['PartiallyDecodedTag'].value).to.have.lengthOf(20);
    });

    it('should not debit the budget for tags it skips before decoding them', () => {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4712: 'MyByteTag'}});
        // The first field is an unknown tag with a huge count. It is skipped
        // before its value is decoded, so it must leave the budget untouched
        // for the known tag that follows.
        const byteLength = 64;
        const dataView = getDataView(
            '\x00\x02'
            + '\x47\x11\x00\x01' + getByteStringFromNumber(byteLength, 4) + '\x00\x00\x00\x00'
            + '\x47\x12\x00\x01' + getByteStringFromNumber(34, 4) + '\x00\x00\x00\x1e'
            + '\x00\x00\x00\x00'
            + '\x00'.repeat(34)
        );
        expect(dataView.byteLength).to.equal(byteLength);
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, false, false, undefined, 'exif', {remaining: byteLength});
        expect(tags['undefined-18193']).to.be.undefined;
        expect(tags['MyByteTag'].value).to.have.lengthOf(34);
    });
});
