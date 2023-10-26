/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getByteStringFromNumber} from './test-utils';
import MpfTags from '../../src/mpf-tags';
import {getStringValueFromArray, getBase64Image} from '../../src/utils';

describe('mpf-tags', () => {
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

        const tags = MpfTags.read(dataView, PREFIX_PADDING_SIZE);

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
