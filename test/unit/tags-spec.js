/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {__RewireAPI__ as TagsHelpersRewireAPI} from '../../src/tags-helpers';
import {getDataView} from './test-utils';
import Tags from '../../src/tags';
import TagsHelpers from '../../src/tags-helpers';
import ByteOrder from '../../src/byte-order';

describe('tags', () => {
    const read0thIfd = Tags.__get__('read0thIfd');
    const readExifIfd = Tags.__get__('readExifIfd');
    const readGpsIfd = Tags.__get__('readGpsIfd');
    const readInteroperabilityIfd = Tags.__get__('readInteroperabilityIfd');

    afterEach(() => {
        TagsHelpersRewireAPI.__ResetDependency__('TagNames');
    });

    it('should be able to read 0th IFD', () => {
        // Byte order + IFD offset + field count + field.
        const dataView = getDataView('\x00\x00\x4d\x4d' + '\x00\x00\x00\x08' + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00');
        TagsHelpers.__set__('TagNames', {'0th': {0x4711: 'MyExifTag'}});
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
        TagsHelpers.__set__(
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
        TagsHelpers.__set__('TagNames', {'exif': {0x4711: 'MyExifTag'}});
        tags = readExifIfd(tags, dataView, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag'].description).to.equal(0x42);
    });

    it('should be able to read GPS IFD', () => {
        // Padding + field count + field.
        const dataView = getDataView('\x00\x00\x00\x00' + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00');
        let tags = {'GPS Info IFD Pointer': {value: 4}};
        TagsHelpers.__set__('TagNames', {'gps': {0x4711: 'MyExifTag'}});
        tags = readGpsIfd(tags, dataView, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag'].description).to.equal(0x42);
    });

    it('should be able to read Interoperability IFD', () => {
        // Padding + field count + field.
        const dataView = getDataView('\x00\x00\x00\x00' + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00');
        let tags = {'Interoperability IFD Pointer': {value: 4}};
        TagsHelpers.__set__('TagNames', {'interoperability': {0x4711: 'MyExifTag'}});
        tags = readInteroperabilityIfd(tags, dataView, 0, ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag'].description).to.equal(0x42);
    });
});
