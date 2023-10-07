/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {__RewireAPI__ as TagsRewireAPI} from '../../src/tags';
import {getDataView, getByteStringFromNumber} from './test-utils';
import Tags from '../../src/tags';
import Types from '../../src/types';
import ByteOrder from '../../src/byte-order';
import {getStringValueFromArray, getBase64Image} from '../../src/utils';

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

    afterEach(() => {
        TagsRewireAPI.__ResetDependency__('TagNames');
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
        Tags.__set__('TagNames', {'0th': {0x4711: 'MyExifTag'}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag'].id).to.equal(0x4711);
        expect(tags['MyExifTag'].description).to.equal(0x42);
    });

    it('should be able to read a multi-field IFD', () => {
        // Field count + 1st field + 2nd field + offset to next IFD.
        const dataView = getDataView('\x00\x02' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x47\x12\x00\x01\x00\x00\x00\x01\x43\x00\x00\x00' + '\x00\x00\x00\x00');
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
        // Field count + field + offset to next IFD.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00');
        Tags.__set__('TagNames', {'0th': {}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, true);
        expect(tags['undefined-18193'].id).to.equal(0x4711);
        expect(tags['undefined-18193'].description).to.equal(0x42);
        expect(tags['undefined-18193'].value).to.equal(0x42);
    });

    it('should ignore undefined IFDs', () => {
        // Field count + field + offset to next IFD.
        const dataView = getDataView('\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00');
        Tags.__set__('TagNames', {'0th': {}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN, false);
        expect(tags).to.deep.equal({});
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

    it('should be able to read encoded ASCII tag', () => {
        Tags.__set__('TagNames', {'0th': {0x4711: 'MyAsciiTag'}});
        const dataView = getDataView('\x47\x11\x00\x02\x00\x00\x00\x04\x41\xc3\xba\x43\x00');
        expect(readTag(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN).description).to.equal('AúC');
    });

    it('should be able to read RATIONAL tag', () => {
        Tags.__set__('TagNames', {'0th': {0x4711: 'MyRationalTag'}});
        const dataView = getDataView('\x47\x11' + '\x00\x05' + '\x00\x00\x00\x01' + '\x00\x00\x00\x0c' + '\x00\x00\x00\x09\x00\x00\x00\x02');
        expect(readTag(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN).description).to.equal('4.5');
    });

    it('should be able to read SRATIONAL tag', () => {
        Tags.__set__('TagNames', {'0th': {0x4711: 'MySrationalTag'}});
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
        Tags.__set__('TagNames', {'0th': {0x4711: 'MyExifTag'}});
        const tags = readIfd(dataView, '0th', 0, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag']).to.be.undefined;
    });

    it('should be able to read offsetted tag', () => {
        Tags.__set__('TagNames', {'0th': {0x4711: 'MyAsciiTag'}});
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

    it('should be able to handle tag with faulty offset (too large)', () => {
        Tags.__set__('TagNames', {'0th': {0x4711: 'MyAsciiTag'}});
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
        // Byte order + IFD offset + field count + field.
        const dataView = getDataView('\x00\x00\x4d\x4d' + '\x00\x00\x00\x08' + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00');
        Tags.__set__('TagNames', {
            '0th': {
                0x4711: {
                    name: 'MyExifTag',
                    description() {
                        throw new Error();
                    }
                }
            }
        });
        const tags = read0thIfd(dataView, 0, ByteOrder.BIG_ENDIAN);
        expect(tags).to.deep.equal({
            MyExifTag: {
                id: 0x4711,
                value: 0x42,
                description: 0x42
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

    it('should be able to read 1st IFD (thumbnail) following 0th IFD', () => {
        const dataView = getDataView(
            // Byte order + IFD offset + field count + field + offset to next IFD.
            '\x00\x00\x4d\x4d' + '\x00\x00\x00\x08' + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x1c'
            // Padding.
            + '\x01\x02'
            // Field count + field + offset to next IFD.
            + '\x00\x01' + '\x48\x12\x00\x01\x00\x00\x00\x01\x43\x00\x00\x00' + '\x00\x00\x00\x00'
        );
        Tags.__set__(
            'TagNames',
            {
                '0th': {
                    0x4711: 'MyExifTag1'
                },
                '1st': {
                    0x4812: 'MyExifTag2'
                }
            }
        );

        const tags = read0thIfd(dataView, 0, ByteOrder.BIG_ENDIAN);

        expect(tags['MyExifTag1'].description).to.equal(0x42);
        expect(tags['Thumbnail']['MyExifTag2'].description).to.equal(0x43);
    });

    it('should be able to read Exif IFD', () => {
        // Padding + field count + field + offset to next IFD + padding for fake IFD.
        // Next IFD should be ignored when coming from other IFD than 0th.
        const dataView = getDataView('\x00\x00\x00\x00' + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x04' + '\x01\x02');
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

    it('should be able to read an MPF IFD with two images', () => {
        const PREFIX_PADDING_SIZE = 2;
        const dataViewBytes =
            '\x00\x00' // Prefix padding
            + '\x4d\x4d\x00\x2a' // Byte order (big-endian)
            + '\x00\x00\x00\x08' // IFD offset
            + '\x00\x02' // Field count

            + '\xb0\x01' // Tag (NumberOfImages)
            + '\x00\x04' // Tag type (LONG)
            + '\x00\x00\x00\x01' // Count
            + '\x00\x00\x00\x02' // Value

            + '\xb0\x02' // Tag (MPEntry)
            + '\x00\x07' // Tag type (UNDEFINED)
            + '\x00\x00\x00\x20' // Count
            + '\x00\x00\x00\x22' // Value

            // Entry #1
            // Individual Image Attribute
            + getByteStringFromNumber(
                (0b010 << 29) // Image Flags (Dependent Child)
                | (0b00 << 27) // Reserved
                | (0b000 << 24) // Image Data Format (JPEG)
                | 0x20003, // Type (Multi-Frame Image (Multi-Angle))
                4
            )
            // Individual Image Size
            + '\x00\x01\x02\x03'
            // Individual Image Data Offset
            + '\x00\x00\x00\x00' // Always NULL for First Individual Image
            // Dependent Image 1 Entry Number
            + '\x00\x00'
            // Dependent Image 2 Entry Number
            + '\x00\x00'

            // Entry #2
            // Individual Image Attribute
            + getByteStringFromNumber(
                (0b001 << 29) // Image Flags (Representative Image)
                + (0b00 << 27) // Reserved
                + (0b000 << 24) // Image Data Format (JPEG)
                + 0x10001, // Type (Large Thumbnail (VGA equivalent))
                4
            )
            // Individual Image Size
            + '\x00\x01\x02\x04'
            // Individual Image Data Offset
            + 'DAOF' // To be replaced with real value, needs to be same length (4 bytes)
            // Dependent Image 1 Entry Number
            + '\x00\x00'
            // Dependent Image 2 Entry Number
            + '\x00\x00'
            + 'SOME PADDING';
        const image2 = getStringValueFromArray(Array(0x010204).fill(48));
        const dataView = getDataView(
            dataViewBytes.replace(
                'DAOF',
                getByteStringFromNumber(dataViewBytes.length - PREFIX_PADDING_SIZE, 4)
            )
            + image2 // Image #2 (#1 is the original file, starting at offset 0)
        );

        const tags = Tags.readMpf(dataView, PREFIX_PADDING_SIZE);

        expect(tags['NumberOfImages'].description).to.equal(2);
        expect(tags['Images'].length).to.equal(2);

        // The image buffers have to be removed before deeply checking equality, otherwise it hangs.
        expect(tags['Images'][0].image).to.deep.equal(dataView.buffer.slice(0, 0x00010203));
        expect(tags['Images'][0].base64).to.equal(getBase64Image(tags['Images'][0].image));
        expect(tags['Images'][1].image).to.deep.equal(getDataView(image2).buffer);
        expect(tags['Images'][1].base64).to.equal(getBase64Image(tags['Images'][1].image));
        delete tags['Images'][0].image;
        delete tags['Images'][0].base64;
        delete tags['Images'][1].image;
        delete tags['Images'][1].base64;

        expect(tags['Images']).to.deep.equal([
            {
                ImageFlags: {
                    value: [0, 1, 0],
                    description: 'Dependent Child Image'
                },
                ImageFormat: {
                    value: 0,
                    description: 'JPEG'
                },
                ImageType: {
                    value: 0x20003,
                    description: 'Multi-Frame Image (Multi-Angle)'
                },
                ImageSize: {
                    value: 0x00010203,
                    description: '' + 0x00010203
                },
                ImageOffset: {
                    value: 0,
                    description: '0'
                },
                DependentImage1EntryNumber: {
                    value: 0,
                    description: '0'
                },
                DependentImage2EntryNumber: {
                    value: 0,
                    description: '0'
                },
            },
            {
                ImageFlags: {
                    value: [0, 0, 1],
                    description: 'Representative Image'
                },
                ImageFormat: {
                    value: 0,
                    description: 'JPEG'
                },
                ImageType: {
                    value: 0x10001,
                    description: 'Large Thumbnail (VGA equivalent)'
                },
                ImageSize: {
                    value: 0x00010204,
                    description: '' + 0x00010204
                },
                ImageOffset: {
                    value: dataViewBytes.length, // No PREFIX_PADDING_SIZE to align with MP Endian field.
                    description: '' + dataViewBytes.length
                },
                DependentImage1EntryNumber: {
                    value: 0,
                    description: '0'
                },
                DependentImage2EntryNumber: {
                    value: 0,
                    description: '0'
                },
            }
        ]);
    });
});
