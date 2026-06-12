/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The private IFD readers are exercised through the public Tags.read by
// feeding it complete TIFF structures (header, byte-order marker, pointer
// tags). TagNames is injected by swapping properties on the shared
// default-export object.

import {expect} from 'chai';
import {getDataView, swapProperties} from './test-utils.js';
import TagNames from '../../src/tag-names.js';
import Tags from '../../src/tags.js';
import ByteOrder from '../../src/byte-order.js';

describe('tags', () => {
    let restoreTagNames;

    afterEach(() => {
        restoreTagNames();
    });

    it('should be able to read 0th IFD', () => {
        // TIFF header (byte order + magic + IFD offset) + field count + field + offset to next IFD.
        const dataView = getDataView(
            '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x08'
            + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00'
        );
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyExifTag'}});

        const {tags, byteOrder} = Tags.read(dataView, 0, false);

        expect(byteOrder).to.equal(ByteOrder.BIG_ENDIAN);
        expect(tags['MyExifTag'].description).to.equal(0x42);
    });

    it('should be able to read 1st IFD (thumbnail) following 0th IFD', () => {
        const dataView = getDataView(
            // TIFF header + field count + field + offset to next IFD.
            '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x08'
            + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x1c'
            // Padding.
            + '\x01\x02'
            // Field count + field + offset to next IFD.
            + '\x00\x01' + '\x48\x12\x00\x01\x00\x00\x00\x01\x43\x00\x00\x00' + '\x00\x00\x00\x00'
        );
        restoreTagNames = swapProperties(TagNames, {
            '0th': {
                0x4711: 'MyExifTag1'
            },
            '1st': {
                0x4812: 'MyExifTag2'
            }
        });

        const {tags} = Tags.read(dataView, 0, false);

        expect(tags['MyExifTag1'].description).to.equal(0x42);
        expect(tags['Thumbnail']['MyExifTag2'].description).to.equal(0x43);
    });

    it('should be able to read Exif IFD through the 0th IFD pointer', () => {
        const dataView = getDataView(
            // TIFF header + 0th IFD holding an Exif IFD pointer to offset 26.
            '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x08'
            + '\x00\x01' + '\x87\x69\x00\x04\x00\x00\x00\x01\x00\x00\x00\x1a' + '\x00\x00\x00\x00'
            // Exif IFD: field count + field + offset to next IFD.
            + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00'
        );
        restoreTagNames = swapProperties(TagNames, {
            '0th': {0x8769: 'Exif IFD Pointer'},
            'exif': {0x4711: 'MyExifTag'}
        });

        const {tags} = Tags.read(dataView, 0, false);

        expect(tags['MyExifTag'].description).to.equal(0x42);
    });

    it('should be able to read GPS IFD through the 0th IFD pointer', () => {
        const dataView = getDataView(
            '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x08'
            + '\x00\x01' + '\x88\x25\x00\x04\x00\x00\x00\x01\x00\x00\x00\x1a' + '\x00\x00\x00\x00'
            + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00'
        );
        restoreTagNames = swapProperties(TagNames, {
            '0th': {0x8825: 'GPS Info IFD Pointer'},
            'gps': {0x4711: 'MyExifTag'}
        });

        const {tags} = Tags.read(dataView, 0, false);

        expect(tags['MyExifTag'].description).to.equal(0x42);
    });

    it('should be able to read Interoperability IFD through the Exif IFD pointer', () => {
        const dataView = getDataView(
            '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x08'
            + '\x00\x01' + '\xa0\x05\x00\x04\x00\x00\x00\x01\x00\x00\x00\x1a' + '\x00\x00\x00\x00'
            + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00'
        );
        restoreTagNames = swapProperties(TagNames, {
            '0th': {0xa005: 'Interoperability IFD Pointer'},
            'interoperability': {0x4711: 'MyExifTag'}
        });

        const {tags} = Tags.read(dataView, 0, false);

        expect(tags['MyExifTag'].description).to.equal(0x42);
    });
});
