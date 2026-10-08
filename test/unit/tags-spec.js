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

    [
        {tagBytes: '\x87\x69', code: 0x8769, name: 'Exif IFD Pointer'},
        {tagBytes: '\x88\x25', code: 0x8825, name: 'GPS Info IFD Pointer'},
        {tagBytes: '\xa0\x05', code: 0xa005, name: 'Interoperability IFD Pointer'}
    ].forEach(({tagBytes, code, name}) => {
        it(`should keep the 0th IFD tags when the ${name} is a negative SLONG`, () => {
            const dataView = getDataView(
                '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x08'
                + '\x00\x02' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00'
                + tagBytes + '\x00\x09\x00\x00\x00\x01\xff\xff\xec\x78' + '\x00\x00\x00\x00'
            );
            restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyExifTag', [code]: name}});

            const {tags} = Tags.read(dataView, 0, false);

            expect(tags['MyExifTag'].value).to.equal(0x42);
            expect(tags[name].value).to.equal(-5000);
        });
    });

    it('should not follow a negative pointer to an IFD before the TIFF header', () => {
        const dataView = getDataView(
            // An IFD at absolute offset 0, then padding.
            '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00' + '\x00\x00'
            // TIFF header at offset 20 + 0th IFD holding an SLONG Exif IFD pointer of -20.
            + '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x08'
            + '\x00\x01' + '\x87\x69\x00\x09\x00\x00\x00\x01\xff\xff\xff\xec' + '\x00\x00\x00\x00'
        );
        restoreTagNames = swapProperties(TagNames, {
            '0th': {0x8769: 'Exif IFD Pointer'},
            'exif': {0x4711: 'MyExifTag'}
        });

        const {tags} = Tags.read(dataView, 20, false);

        expect(tags['MyExifTag']).to.be.undefined;
        expect(tags['Exif IFD Pointer'].value).to.equal(-20);
    });

    it('should not follow a pointer whose value is an array', () => {
        const dataView = getDataView(
            // TIFF header + 0th IFD holding a tag and an Exif IFD pointer that is a SHORT with count 2.
            '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x08'
            + '\x00\x02' + '\x47\x12\x00\x01\x00\x00\x00\x01\x43\x00\x00\x00'
            + '\x87\x69\x00\x03\x00\x00\x00\x02\x00\x26\x00\x00' + '\x00\x00\x00\x00'
            // Exif IFD at offset 38, the first element of the pointer array.
            + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00'
        );
        restoreTagNames = swapProperties(TagNames, {
            '0th': {0x4712: 'MyZerothTag', 0x8769: 'Exif IFD Pointer'},
            'exif': {0x4711: 'MyExifTag'}
        });

        const {tags} = Tags.read(dataView, 0, false);

        expect(tags['MyZerothTag'].value).to.equal(0x43);
        expect(tags['Exif IFD Pointer'].value).to.deep.equal([38, 0]);
        expect(tags['MyExifTag']).to.be.undefined;
    });

    it('should not follow a pointer with count 0', () => {
        // The pointer decodes to [], so the IFD offset would become the string
        // '0': a field count at offset 0 and a tag at offsets '02', '022' and
        // '028', where bytes 22-28 parse as a BYTE field with the value 0x42.
        const ifdBytes = '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x20'
            + '\x00'.repeat(14) + '\x00\x01\x00\x00\x00\x01\x42' + '\x00'.repeat(3)
            + '\x00\x01' + '\x87\x69\x00\x04\x00\x00\x00\x00\x00\x00\x00\x00' + '\x00\x00\x00\x00';
        const dataView = getDataView(ifdBytes + '\x00'.repeat(256 - ifdBytes.length));
        restoreTagNames = swapProperties(TagNames, {
            '0th': {0x8769: 'Exif IFD Pointer'},
            'exif': {0x002a: 'MyExifTag'}
        });

        const {tags} = Tags.read(dataView, 0, false);

        expect(tags['MyExifTag']).to.be.undefined;
        expect(tags['Exif IFD Pointer'].value).to.deep.equal([]);
    });

    it('should keep the 0th IFD tags and the pointer when the pointer is past the end', () => {
        const dataView = getDataView(
            '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x08'
            + '\x00\x02' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00'
            + '\x87\x69\x00\x04\x00\x00\x00\x01\x00\x01\x86\xa0' + '\x00\x00\x00\x00'
        );
        restoreTagNames = swapProperties(TagNames, {
            '0th': {0x4711: 'MyZerothTag', 0x8769: 'Exif IFD Pointer'},
            'exif': {0x4711: 'MyExifTag'}
        });

        const {tags} = Tags.read(dataView, 0, false);

        expect(tags['MyZerothTag'].value).to.equal(0x42);
        expect(tags['Exif IFD Pointer'].value).to.equal(100000);
        expect(tags['MyExifTag']).to.be.undefined;
    });

    it('should not follow a pointer into the TIFF header', () => {
        // Read as an IFD at offset 0, the header gives a field count of 0x4d4d,
        // and the entry at offset 14 parses as a BYTE field with tag 0.
        const dataView = getDataView(
            '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x08'
            + '\x00\x01' + '\x88\x25\x00\x04\x00\x00\x00\x01\x00\x00\x00\x00' + '\x00\x00\x00\x00'
        );
        restoreTagNames = swapProperties(TagNames, {
            '0th': {0x8825: 'GPS Info IFD Pointer'},
            'gps': {0x0000: 'MyGpsTag'}
        });

        const {tags} = Tags.read(dataView, 0, false);

        expect(tags['MyGpsTag']).to.be.undefined;
        expect(tags['GPS Info IFD Pointer'].value).to.equal(0);
    });

    it('should read a sub-IFD that starts right after the TIFF header', () => {
        const dataView = getDataView(
            // TIFF header pointing at a 0th IFD at offset 26, after the Exif IFD at offset 8.
            '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x1a'
            + '\x00\x01' + '\x47\x11\x00\x01\x00\x00\x00\x01\x42\x00\x00\x00' + '\x00\x00\x00\x00'
            + '\x00\x01' + '\x87\x69\x00\x04\x00\x00\x00\x01\x00\x00\x00\x08' + '\x00\x00\x00\x00'
        );
        restoreTagNames = swapProperties(TagNames, {
            '0th': {0x8769: 'Exif IFD Pointer'},
            'exif': {0x4711: 'MyExifTag'}
        });

        const {tags} = Tags.read(dataView, 0, false);

        expect(tags['MyExifTag'].value).to.equal(0x42);
    });

    it('should not read the TIFF header as the 0th IFD', () => {
        // Read as an IFD at offset 0, the header gives a field count of 0x4d4d,
        // and the entry at offset 14 parses as an ASCII Make tag.
        const dataView = getDataView(
            '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x00'
            + '\x00'.repeat(6) + '\x01\x0f\x00\x02\x00\x00\x00\x04XYZ\x00'
        );
        restoreTagNames = swapProperties(TagNames, {'0th': {0x010f: 'Make'}});

        const {tags} = Tags.read(dataView, 0, false);

        expect(tags).to.deep.equal({});
    });

    it('should not read the TIFF header as the thumbnail IFD', () => {
        // Read as an IFD at offset 2, the header gives a field count of 0x002a,
        // and the entry at offset 16 parses as an ASCII Make tag.
        const dataView = getDataView(
            '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x08'
            + '\x00\x00' + '\x00\x00\x00\x02'
            + '\x00\x00' + '\x01\x0f\x00\x02\x00\x00\x00\x04QRS\x00' + '\x00'.repeat(20)
        );
        restoreTagNames = swapProperties(TagNames, {'1st': {0x010f: 'Make'}});

        const {tags} = Tags.read(dataView, 0, false);

        expect(tags).to.not.have.property('Thumbnail');
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

    it('should draw out-of-slot values from a passed decoded-value budget', () => {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyExifTag'}});
        const valueBudget = {remaining: 100, ifdEntriesRemaining: 1000};

        const {tags} = Tags.read(getTiffWithOneOutOfSlotValue(), 0, false, false, undefined, valueBudget);

        expect(tags['MyExifTag'].value).to.have.lengthOf(OUT_OF_SLOT_VALUE_SIZE);
        expect(valueBudget.remaining).to.equal(100 - OUT_OF_SLOT_VALUE_SIZE);
    });

    it('should decode an out-of-slot value empty when the passed budget is used up', () => {
        restoreTagNames = swapProperties(TagNames, {'0th': {0x4711: 'MyExifTag'}});

        const {tags} = Tags.read(getTiffWithOneOutOfSlotValue(), 0, false, false, undefined, {remaining: 0, ifdEntriesRemaining: 1000});

        expect(tags['MyExifTag'].value).to.deep.equal([]);
    });

    it('should share one IFD entry count across the 0th IFD and the sub-IFDs it points to', () => {
        let calls = 0;
        const countedTag = {name: 'CountedTag', description: (value) => {
            calls++;
            return value;
        }};
        restoreTagNames = swapProperties(TagNames, {
            '0th': {
                0x4711: countedTag,
                0x8769: 'Exif IFD Pointer',
                0x8825: 'GPS Info IFD Pointer'
            },
            'exif': {0x4711: countedTag},
            'gps': {0x4711: countedTag}
        });
        const numberOfFields = 10;
        const valueBudget = {remaining: 1000, ifdEntriesRemaining: 15};

        Tags.read(getTiffWithSubIfdPointersToItself(numberOfFields), 0, false, false, undefined, valueBudget);

        // The 0th IFD alone reads numberOfFields - 2 counted tags, so more
        // calls than that show the Exif IFD read drew from the same count.
        expect(calls).to.be.above(numberOfFields - 2);
        expect(calls).to.be.at.most(15);
        expect(valueBudget.ifdEntriesRemaining).to.equal(0);
    });
});

// A TIFF whose 0th IFD starts with Exif and GPS IFD pointers back at itself,
// followed by in-slot SHORT fields of tag 0x4711.
function getTiffWithSubIfdPointersToItself(numberOfFields) {
    const IFD0_OFFSET = 8;
    let fields = '\x87\x69\x00\x04\x00\x00\x00\x01' + getByteStringFromNumber(IFD0_OFFSET, 4)
        + '\x88\x25\x00\x04\x00\x00\x00\x01' + getByteStringFromNumber(IFD0_OFFSET, 4);
    for (let i = 2; i < numberOfFields; i++) {
        fields += '\x47\x11\x00\x03\x00\x00\x00\x01\x00\x2a\x00\x00';
    }
    return getDataView(
        '\x4d\x4d\x00\x2a' + getByteStringFromNumber(IFD0_OFFSET, 4)
        + getByteStringFromNumber(numberOfFields, 2)
        + fields
        + '\x00\x00\x00\x00'
    );
}

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

const OUT_OF_SLOT_VALUE_SIZE = 8;

function getTiffWithOneOutOfSlotValue() {
    const valueOffset = 8 + 2 + 12 + 4;
    return getDataView(
        '\x4d\x4d\x00\x2a' + '\x00\x00\x00\x08'
        + '\x00\x01'
        + '\x47\x11\x00\x01' + getByteStringFromNumber(OUT_OF_SLOT_VALUE_SIZE, 4) + getByteStringFromNumber(valueOffset, 4)
        + '\x00\x00\x00\x00'
        + '\x42'.repeat(OUT_OF_SLOT_VALUE_SIZE)
    );
}
