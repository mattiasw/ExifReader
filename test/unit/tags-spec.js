/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The private IFD readers are exercised through the public Tags.read by
// feeding it complete TIFF structures (header, byte-order marker, pointer
// tags). TagNames is injected by swapping properties on the shared
// default-export object.

import {expect} from 'chai';
import {getByteStringFromNumber, getDataView, swapProperties} from './test-utils.js';
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

    it('should share one decoded-value budget across the 0th and Exif IFDs', () => {
        // The 0th IFD uses up the budget before the Exif IFD pointer is
        // followed, so the Exif IFD's tag decodes to nothing while the in-slot
        // pointer itself stays intact.
        restoreTagNames = swapProperties(TagNames, {
            '0th': {
                0x4711: 'Huge0thTag',
                0x4713: 'BudgetUsingTag',
                0x8769: 'Exif IFD Pointer'
            },
            'exif': {0x4712: 'HugeSubIfdTag'}
        });
        const dataView = getTiffUsingUpTheBudgetBeforeSubIfd(0x8769);

        const {tags} = Tags.read(dataView, 0, false);

        expect(tags['Huge0thTag'].value).to.have.lengthOf(BUFFER_SIZE);
        expect(tags['Exif IFD Pointer'].value).to.equal(SUB_IFD_OFFSET);
        expect(tags['HugeSubIfdTag'].value).to.deep.equal([]);
    });

    it('should share one decoded-value budget across the 0th and GPS IFDs', () => {
        // The same sharing must hold for every sub-IFD the 0th IFD points to,
        // not only the Exif one.
        restoreTagNames = swapProperties(TagNames, {
            '0th': {
                0x4711: 'Huge0thTag',
                0x4713: 'BudgetUsingTag',
                0x8825: 'GPS Info IFD Pointer'
            },
            'gps': {0x4712: 'HugeSubIfdTag'}
        });
        const dataView = getTiffUsingUpTheBudgetBeforeSubIfd(0x8825);

        const {tags} = Tags.read(dataView, 0, false);

        expect(tags['Huge0thTag'].value).to.have.lengthOf(BUFFER_SIZE);
        expect(tags['HugeSubIfdTag'].value).to.deep.equal([]);
    });
});

const BUFFER_SIZE = 256;
// Enough extra fields, each claiming the whole buffer for its value, to use up
// a budget that is a multiple of the buffer size.
const BUDGET_USING_FIELDS = 16;
const NUMBER_OF_FIELDS = BUDGET_USING_FIELDS + 2; // The asserted tag and the pointer.
const SUB_IFD_OFFSET = 8 + 2 + NUMBER_OF_FIELDS * 12 + 4;

/**
 * Builds a TIFF whose 0th IFD uses up the shared decoded-value budget before
 * pointing at a sub-IFD whose only tag also claims the whole buffer. The first
 * field is read while the budget is untouched, so it decodes in full.
 */
function getTiffUsingUpTheBudgetBeforeSubIfd(pointerTagCode) {
    const wholeBufferCount = getByteStringFromNumber(BUFFER_SIZE, 4);
    let budgetUsingFields = '';
    for (let i = 0; i < BUDGET_USING_FIELDS; i++) {
        budgetUsingFields += '\x47\x13\x00\x01' + wholeBufferCount + '\x00\x00\x00\x00';
    }

    const beforeSubIfd = '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x08'
        + getByteStringFromNumber(NUMBER_OF_FIELDS, 2)
        + '\x47\x11\x00\x01' + wholeBufferCount + '\x00\x00\x00\x00'
        + budgetUsingFields
        + getByteStringFromNumber(pointerTagCode, 2) + '\x00\x04\x00\x00\x00\x01' + getByteStringFromNumber(SUB_IFD_OFFSET, 4)
        + '\x00\x00\x00\x00'; // Offset to next IFD.
    const subIfd = '\x00\x01' + '\x47\x12\x00\x01' + wholeBufferCount + '\x00\x00\x00\x00' + '\x00\x00\x00\x00';

    if (beforeSubIfd.length !== SUB_IFD_OFFSET) {
        throw new Error(`Sub-IFD lands at ${beforeSubIfd.length}, not ${SUB_IFD_OFFSET}.`);
    }

    return getDataView(
        beforeSubIfd + subIfd + '\x00'.repeat(BUFFER_SIZE - beforeSubIfd.length - subIfd.length)
    );
}
