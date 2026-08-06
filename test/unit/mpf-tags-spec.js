/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getByteStringFromNumber} from './test-utils.js';
import MpfTags from '../../src/mpf-tags.js';
import {getStringValueFromArray, getBase64Image} from '../../src/utils.js';

const MP_ENTRY_VALUE_OFFSET = 26;

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

    it('should bound the total size of extracted images to a multiple of the buffer size', () => {
        const entryCount = 64;
        const entries = [];
        for (let i = 0; i < entryCount; i++) {
            entries.push({size: 0x7fffffff, offset: 0});
        }
        const dataView = buildMpfDataView(entries, getStringValueFromArray(Array(200).fill(0)));
        const bufferLength = dataView.buffer.byteLength;

        const tags = MpfTags.read(dataView, 0);

        expect(tags['Images'].length).to.equal(entryCount);
        let totalImageBytes = 0;
        for (let i = 0; i < tags['Images'].length; i++) {
            totalImageBytes += tags['Images'][i].image.byteLength;
        }
        expect(totalImageBytes).to.be.at.most(8 * bufferLength);
        expect(totalImageBytes).to.be.below(entryCount * bufferLength);
        // The budget saturates on the first entries (each declares the whole
        // file) and later entries get nothing, so the total does not grow with
        // the entry count.
        expect(tags['Images'][entryCount - 1].image.byteLength).to.equal(0);
    });

    it('should truncate, not empty, the image where the budget runs out mid-slice', () => {
        // Nine entries each declare the whole file. The first (offset forced to
        // 0) plus seven more at offset 10 exhaust the 8x budget partway through
        // the ninth, which must keep the bytes that still fit rather than being
        // dropped to empty.
        const OFFSET = 10;
        const bufferLength = 200;
        const entries = [{size: 0x7fffffff, offset: 0}];
        for (let i = 1; i < 9; i++) {
            entries.push({size: 0x7fffffff, offset: OFFSET});
        }
        const prefixLength = MP_ENTRY_VALUE_OFFSET + entries.length * 16;
        const trailing = getStringValueFromArray(Array(bufferLength - prefixLength).fill(0x41));
        const dataView = buildMpfDataView(entries, trailing);
        expect(dataView.buffer.byteLength).to.equal(bufferLength);

        const tags = MpfTags.read(dataView, 0);

        const consumedBeforeLast = bufferLength + 7 * (bufferLength - OFFSET);
        const expectedLastLength = 8 * bufferLength - consumedBeforeLast;
        expect(expectedLastLength).to.be.above(0);
        expect(expectedLastLength).to.be.below(bufferLength - OFFSET);
        expect(tags['Images'][8].image.byteLength).to.equal(expectedLastLength);
        expect(tags['Images'][8].image).to.deep.equal(dataView.buffer.slice(OFFSET, OFFSET + expectedLastLength));
    });

    it('should return each image untruncated for a legitimate file with disjoint sub-images', () => {
        const region0 = 100;
        const region1 = 60;
        const region2 = 40;
        const prefixLength = MP_ENTRY_VALUE_OFFSET + 3 * 16;
        const totalLength = prefixLength + region0 + region1 + region2;
        const entries = [
            {size: region0, offset: 0},
            {size: region1, offset: prefixLength + region0},
            {size: region2, offset: prefixLength + region0 + region1},
        ];
        const trailing = getStringValueFromArray(Array(region0 + region1 + region2).fill(0x41));
        const dataView = buildMpfDataView(entries, trailing);
        expect(dataView.buffer.byteLength).to.equal(totalLength);

        const tags = MpfTags.read(dataView, 0);

        expect(tags['Images'][0].image).to.deep.equal(dataView.buffer.slice(0, region0));
        expect(tags['Images'][1].image).to.deep.equal(dataView.buffer.slice(prefixLength + region0, prefixLength + region0 + region1));
        expect(tags['Images'][2].image).to.deep.equal(dataView.buffer.slice(prefixLength + region0 + region1, totalLength));
        for (let i = 0; i < 3; i++) {
            expect(tags['Images'][i].base64).to.equal(getBase64Image(tags['Images'][i].image));
        }
    });

    it('should give an empty image for a negative image size instead of a from-the-end slice', () => {
        const dataView = buildMpfDataView([{size: -1, offset: 0}], getStringValueFromArray(Array(100).fill(0x41)));

        const tags = MpfTags.read(dataView, 0);

        expect(tags['Images'][0].ImageSize.value).to.equal(-1);
        expect(tags['Images'][0].image.byteLength).to.equal(0);
        expect(tags['Images'][0].base64).to.equal('');
    });

    it('should clamp a negative image offset to the start of the buffer instead of a from-the-end slice', () => {
        const entries = [
            {size: 0, offset: 0},
            {size: 0x7fffffff, offset: -5},
        ];
        const dataView = buildMpfDataView(entries, getStringValueFromArray(Array(100).fill(0x41)));
        const bufferLength = dataView.buffer.byteLength;

        const tags = MpfTags.read(dataView, 0);

        expect(tags['Images'][1].ImageOffset.value).to.equal(-5);
        expect(tags['Images'][1].image).to.deep.equal(dataView.buffer.slice(0, bufferLength));
    });

    it('should not throw when the data is too short for the byte order marker', () => {
        // A truncated MPF segment can leave the data offset at (or past) the
        // end of the buffer. Reading the byte order there must not throw.
        const dataView = getDataView('\x00');
        expect(() => MpfTags.read(dataView, 1)).to.not.throw();
        expect(MpfTags.read(dataView, 1)).to.deep.equal({});
    });

    it('should not throw when the byte order marker is invalid', () => {
        // Enough bytes to read, but not a valid II/MM marker (e.g. a truncated
        // segment whose MPF identifier is followed by unrelated bytes).
        const dataView = getDataView('\xff\xff\xff\xff');
        expect(() => MpfTags.read(dataView, 0)).to.not.throw();
        expect(MpfTags.read(dataView, 0)).to.deep.equal({});
    });
});

// A big-endian MPF block with a single MPEntry tag (0xb002, type UNDEFINED)
// whose value holds `entries.length` 16-byte records. The TIFF header (4) plus
// the IFD offset field (4) plus the IFD itself (field count 2 + one 12-byte
// field + 4-byte next-IFD pointer = 18) put the MPEntry value at offset 26
// (MP_ENTRY_VALUE_OFFSET). Reading with `dataOffset` 0 makes getImageOffset
// return each entry's raw offset (or 0 for the first entry). Optional
// `trailing` bytes extend the buffer.
function buildMpfDataView(entries, trailing = '') {
    const entriesBytes = entries.map(buildMpEntry).join('');
    const ifd =
        '\x00\x01' // Field count
        + '\xb0\x02' // Tag (MPEntry)
        + '\x00\x07' // Tag type (UNDEFINED)
        + getByteStringFromNumber(entries.length * 16, 4) // Count
        + getByteStringFromNumber(MP_ENTRY_VALUE_OFFSET, 4) // Value offset
        + '\x00\x00\x00\x00'; // Next IFD
    const header =
        '\x4d\x4d\x00\x2a' // Byte order (big-endian) + magic
        + '\x00\x00\x00\x08' // IFD offset
        + ifd;
    return getDataView(header + entriesBytes + trailing);
}

function buildMpEntry(entry) {
    return getByteStringFromNumber((entry.attributes || 0) >>> 0, 4)
        + getByteStringFromNumber((entry.size || 0) >>> 0, 4)
        + getByteStringFromNumber((entry.offset || 0) >>> 0, 4)
        + getByteStringFromNumber((entry.dependent1 || 0) >>> 0, 2)
        + getByteStringFromNumber((entry.dependent2 || 0) >>> 0, 2);
}
