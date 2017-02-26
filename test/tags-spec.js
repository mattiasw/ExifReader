import {expect} from 'chai';
import {getDataView} from './test-utils';
import Tags from '../src/tags';
import Types from '../src/types';
import ByteOrder from '../src/byte-order';

describe('tags', () => {
    const get0thIfdOffset = Tags.__get__('get0thIfdOffset');
    const splitNullSeparatedAsciiString = Tags.__get__('splitNullSeparatedAsciiString');
    const getTagValue = Tags.__get__('getTagValue');
    const readTag = Tags.__get__('readTag');
    const readIfd = Tags.__get__('readIfd');
    const read0thIfd = Tags.__get__('read0thIfd');
    const readExifIfd = Tags.__get__('readExifIfd');
    const readGpsIfd = Tags.__get__('readGpsIfd');
    const readInteroperabilityIfd = Tags.__get__('readInteroperabilityIfd');

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

    it('should be able to get little endian tag value', () => {
        const dataView = getDataView('\x42\x00\x00\x00');
        expect(getTagValue(dataView, 0, Types.tagTypes.LONG, 1, ByteOrder.LITTLE_ENDIAN)).to.equal(0x42);
    });

    it('should be able to get big endian tag value', () => {
        const dataView = getDataView('\x00\x00\x00\x42');
        expect(getTagValue(dataView, 0, Types.tagTypes.LONG, 1, ByteOrder.BIG_ENDIAN)).to.equal(0x42);
    });

    it('should be able to read a one-field IFD', () => {
        // Field count + field.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00');
        Tags.__set__('TagNames', {'0th': {0x4711: 'MyExifTag'}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag'].description).to.equal(0x42);
    });

    it('should be able to read a multi-field IFD', () => {
        // Field count + 1st field + 2nd field.
        const dataView = getDataView('\x00\x02' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x47\x12\x00\x01\x00\x00\x00\x01\x43\x00\x00\x00');
        Tags.__set__('TagNames', {
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
        // Field count + field.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00');
        Tags.__set__('TagNames', {'0th': {}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['undefined-18193'].description).to.equal(0x42);
        expect(tags['undefined-18193'].value).to.equal(0x42);
    });

    it('should be able to read short ASCII tag', () => {
        Tags.__set__('TagNames', {'0th': {0x4711: 'MyAsciiTag'}});
        const dataView = getDataView('\x47\x11\x00\x02\x00\x00\x00\x04\x41\x42\x43\x00');
        expect(readTag(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN).description).to.equal('ABC');
    });

    it('should be able to read long ASCII tag', () => {
        Tags.__set__('TagNames', {'0th': {0x4711: 'MyAsciiTag'}});
        const dataView = getDataView('\x47\x11\x00\x02\x00\x00\x00\x06\x00\x00\x00\x0c\x41\x42\x43\x44\x45\x00');
        expect(readTag(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN).description).to.equal('ABCDE');
    });

    it('should be able to handle tag with faulty type', () => {
        const dataView = getDataView('\x47\x11\x00\x08\x00\x00\x00\x00');
        expect(readTag(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN)).to.be.undefined;
    });

    it('should be able to handle an IFD with a faulty type tag', () => {
        // Field count + field.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x08\x00\x00\x00\x00');
        Tags.__set__('TagNames', {'0th': {0x4711: 'MyExifTag'}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag']).to.be.undefined;
    });

    it('should be able to read offsetted tag', () => {
        Tags.__set__('TagNames', {'0th': {0x4711: 'MyAsciiTag'}});
        const dataView = getDataView(
            '\x00\x00\x00\x00' + '\x00\x00'  // Padding to test offset.
            + '\x00\x01'  // Number of fields.
            + '\x47\x11\x00\x02\x00\x00\x00\x06\x00\x00\x00\x10\x41\x42\x43\x44\x45\x00');
        expect(readIfd(dataView, '0th', 4, 6, ByteOrder.BIG_ENDIAN)).to.deep.equal({
            MyAsciiTag: {
                value: ['ABCDE'],
                description: 'ABCDE'
            }
        });
    });

    it('should be able to read 0th IFD', () => {
        // Byte order + IFD offset + field count + field.
        const dataView = getDataView('\x00\x00\x4d\x4d' + '\x00\x00\x00\x08' + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00');
        Tags.__set__('TagNames', {'0th': {0x4711: 'MyExifTag'}});
        const tags = read0thIfd(dataView, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag'].description).to.equal(0x42);
    });

    it('should be able to read Exif IFD', () => {
        // Padding + field count + field.
        const dataView = getDataView('\x00\x00\x00\x00' + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00');
        let tags = {'Exif IFD Pointer': {value: 4}};
        Tags.__set__('TagNames', {'exif': {0x4711: 'MyExifTag'}});
        tags = readExifIfd(tags, dataView, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag'].description).to.equal(0x42);
    });

    it('should be able to read GPS IFD', () => {
        // Padding + field count + field.
        const dataView = getDataView('\x00\x00\x00\x00' + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00');
        let tags = {'GPS Info IFD Pointer': {value: 4}};
        Tags.__set__('TagNames', {'gps': {0x4711: 'MyExifTag'}});
        tags = readGpsIfd(tags, dataView, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag'].description).to.equal(0x42);
    });

    it('should be able to read Interoperability IFD', () => {
        // Padding + field count + field.
        const dataView = getDataView('\x00\x00\x00\x00' + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00');
        let tags = {'Interoperability IFD Pointer': {value: 4}};
        Tags.__set__('TagNames', {'interoperability': {0x4711: 'MyExifTag'}});
        tags = readInteroperabilityIfd(tags, dataView, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag'].description).to.equal(0x42);
    });
});
