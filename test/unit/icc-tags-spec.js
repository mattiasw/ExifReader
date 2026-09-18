/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import * as fs from 'fs';
import IccTags, {parseTags} from '../../src/icc-tags.js';
import ImageHeaderWebp from '../../src/image-header-webp.js';
import {findOffsets as findIsoBmffOffsets} from '../../src/image-header-iso-bmff.js';
import DataViewWrapper from '../../src/dataview.js';
import {getDataView, getByteStringFromNumber, swapProperties} from './test-utils.js';
import {COMPRESSION_METHOD_DEFLATE} from '../../src/utils.js';

const ICC_PROFILE_PATH = './test/unit/icc/sRGB2014.icc';
// Any value far larger than the crafted buffers works here. It is kept modest so
// that a regression allocates megabytes rather than gigabytes while failing.
const OVER_DECLARED_LENGTH = 1024 * 1024;

describe('icc-tags', () => {
    it('should return empty set if something throws', () => {
        expect(IccTags.read(undefined, [])).to.deep.equal({});
    });

    it('should not iterate mluc records when the record size cannot advance the read offset', () => {
        // The claimed record count must stay below the records cap so that
        // only the record size guard can reject the tag. If that guard is
        // removed the loop runs and the description becomes defined, which
        // fails the assertion below.
        const NUM_RECORDS = 100;
        const SIZE = 180;
        const data = new Uint8Array(SIZE);
        const dataView = new DataView(data.buffer);
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                data[offset + i] = string.charCodeAt(i);
            }
        };

        dataView.setUint32(0, SIZE); // Profile length.
        writeString(36, 'acsp'); // Profile signature.
        dataView.setUint32(128, 1); // Tag count.

        // Tag table entry: signature, offset to tag data, tag size.
        writeString(132, 'desc');
        dataView.setUint32(136, 144);
        dataView.setUint32(140, 36);

        // mluc tag with a record size that does not advance the read offset.
        writeString(144, 'mluc');
        dataView.setUint32(148, 0);
        dataView.setUint32(152, NUM_RECORDS);
        dataView.setUint32(156, 0);

        writeString(160, 'en');
        writeString(162, 'US');
        dataView.setUint32(164, 4);
        dataView.setUint32(168, 28);
        dataView.setUint16(172, 0x0048);
        dataView.setUint16(174, 0x0069);

        const tags = parseTags(dataView);

        // A record size of zero can never advance the read offset. The mluc
        // tag is rejected and only the already parsed header tags remain.
        expect(tags).to.have.nested.property('ICC Signature.value', 'acsp');
        expect(tags['ICC Description']).to.equal(undefined);
    });

    it('should preserve parsed header tags when an mluc tag claims more records than fit in the buffer', () => {
        const SIZE = 180;
        const data = new Uint8Array(SIZE);
        const dataView = new DataView(data.buffer);
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                data[offset + i] = string.charCodeAt(i);
            }
        };

        dataView.setUint32(0, SIZE);
        writeString(36, 'acsp');
        dataView.setUint32(128, 1);

        writeString(132, 'desc');
        dataView.setUint32(136, 144);
        dataView.setUint32(140, 36);

        // mluc tag with a record count that does not fit in the buffer.
        writeString(144, 'mluc');
        dataView.setUint32(148, 0);
        dataView.setUint32(152, 1000);
        dataView.setUint32(156, 12);

        writeString(160, 'en');
        writeString(162, 'US');
        dataView.setUint32(164, 0);
        dataView.setUint32(168, 0);

        const tags = parseTags(dataView);

        expect(tags).to.have.nested.property('ICC Signature.value', 'acsp');
    });

    it('should not read mluc text beyond the tag size when textLength is crafted', () => {
        const SIZE = 65536;
        const data = new Uint8Array(SIZE);
        const dataView = new DataView(data.buffer);
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                data[offset + i] = string.charCodeAt(i);
            }
        };

        dataView.setUint32(0, SIZE);
        writeString(36, 'acsp');
        dataView.setUint32(128, 1);

        writeString(132, 'desc');
        dataView.setUint32(136, 144);
        dataView.setUint32(140, 32); // Tag size: 16 header + 12 record + 4 text bytes.

        // mluc record claims a huge textLength but only 2 chars fit in the tag.
        writeString(144, 'mluc');
        dataView.setUint32(152, 1);
        dataView.setUint32(156, 12);
        writeString(160, 'en');
        writeString(162, 'US');
        dataView.setUint32(164, 0xffffffff);
        dataView.setUint32(168, 28);
        dataView.setUint16(172, 0x0048); // 'H'
        dataView.setUint16(174, 0x0069); // 'i'

        const tags = parseTags(dataView);

        expect(tags['ICC Description'].value).to.equal('Hi');
    });

    it('should bound total mluc text across overlapping records', () => {
        const NUM_RECORDS = 500;
        const SIZE = 12000;
        const data = new Uint8Array(SIZE);
        const dataView = new DataView(data.buffer);
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                data[offset + i] = string.charCodeAt(i);
            }
        };

        dataView.setUint32(0, SIZE);
        writeString(36, 'acsp');
        dataView.setUint32(128, 1);

        writeString(132, 'desc');
        dataView.setUint32(136, 144);
        dataView.setUint32(140, 11800); // Large tag size, close to the whole buffer.

        // Every record points its text at the record table with a huge length.
        writeString(144, 'mluc');
        dataView.setUint32(152, NUM_RECORDS);
        dataView.setUint32(156, 12);
        for (let recordNum = 0; recordNum < NUM_RECORDS; recordNum++) {
            const recordOffset = 160 + recordNum * 12;
            writeString(recordOffset, 'en');
            data[recordOffset + 2] = recordNum & 0xff; // Distinct country code so values are kept.
            data[recordOffset + 3] = (recordNum >> 8) & 0xff;
            dataView.setUint32(recordOffset + 4, 0xffffffff); // textLength.
            dataView.setUint32(recordOffset + 8, 16); // textOffset into the record table.
        }

        const tags = parseTags(dataView);

        let totalTextLength = 0;
        const value = tags['ICC Description'].value;
        for (const key of Object.keys(value)) {
            totalTextLength += value[key].length;
        }
        // Total decoded text is capped at the profile byte length (12000 bytes
        // => at most 6000 UTF-16 code units), so overlapping records cannot
        // blow up.
        expect(totalTextLength).to.be.at.most(6000);
    });

    it('should keep shared mluc strings for every record (no truncation)', () => {
        const SIZE = 200;
        const data = new Uint8Array(SIZE);
        const dataView = new DataView(data.buffer);
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                data[offset + i] = string.charCodeAt(i);
            }
        };

        dataView.setUint32(0, SIZE);
        writeString(36, 'acsp');
        dataView.setUint32(128, 1);

        writeString(132, 'desc');
        dataView.setUint32(136, 144);
        dataView.setUint32(140, 44); // 16 header + 24 records + 4 shared text bytes.

        // Two records point at the same 4-byte string, so the summed textLength
        // (8) exceeds the 4-byte storage area. Both must still decode in full.
        writeString(144, 'mluc');
        dataView.setUint32(152, 2);
        dataView.setUint32(156, 12);
        writeString(160, 'en');
        writeString(162, 'US');
        dataView.setUint32(164, 4); // textLength
        dataView.setUint32(168, 40); // textOffset (shared)
        writeString(172, 'sv');
        writeString(174, 'SE');
        dataView.setUint32(176, 4); // textLength
        dataView.setUint32(180, 40); // textOffset (same string)
        dataView.setUint16(184, 0x0048); // 'H'
        dataView.setUint16(186, 0x0069); // 'i'

        const tags = parseTags(dataView);

        expect(tags['ICC Description'].value).to.deep.equal({'en-US': 'Hi', 'sv-SE': 'Hi'});
    });

    it('should bound total text across text tags sharing one region', () => {
        const SIZE = 4096;
        const TEXT_OFFSET = 2600;
        const TEXT = 'a'.repeat(1000);
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(TEXT_OFFSET, 'text');
        profile.writeString(TEXT_OFFSET + 8, TEXT);
        const signatures = getSignatures('t', 200);
        for (const signature of signatures) {
            profile.addTagEntry(signature, TEXT_OFFSET, TEXT.length + 9);
        }

        const tags = parseTags(profile.dataView);

        expect(tags[signatures[0]].value).to.equal(TEXT);
        expect(getTotalTextLength(tags, signatures)).to.be.at.most(SIZE);
    });

    it('should decode a text tag up to its last character', () => {
        const SIZE = 300;
        const TEXT_OFFSET = 200;
        const TEXT = 'Copyright Example Co';
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(TEXT_OFFSET, 'text');
        profile.writeString(TEXT_OFFSET + 8, TEXT);
        // 4-byte type, 4 reserved bytes, then the ASCII string plus its NUL.
        profile.addTagEntry('t000', TEXT_OFFSET, 8 + TEXT.length + 1);

        const tags = parseTags(profile.dataView);

        expect(tags.t000.value).to.equal(TEXT);
    });

    it('should stop a text tag at its first NUL and ignore bytes after it', () => {
        const SIZE = 300;
        const TEXT_OFFSET = 200;
        const TEXT = 'Copyright Example Co';
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(TEXT_OFFSET, 'text');
        profile.writeString(TEXT_OFFSET + 8, TEXT);
        // The NUL terminator sits right after TEXT (zero-filled buffer); pad
        // the tag with garbage bytes past it.
        profile.writeString(TEXT_OFFSET + 8 + TEXT.length + 1, 'garbage');
        profile.addTagEntry('t000', TEXT_OFFSET, 8 + TEXT.length + 1 + 'garbage'.length);

        const tags = parseTags(profile.dataView);

        expect(tags.t000.value).to.equal(TEXT);
    });

    it('should return the available text when a text tag has no NUL terminator', () => {
        const SIZE = 300;
        const TEXT_OFFSET = 200;
        const TEXT = 'Copyright Example Co';
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(TEXT_OFFSET, 'text');
        profile.writeString(TEXT_OFFSET + 8, TEXT);
        // Fill the rest of the profile with a non-NUL byte, so the tag never
        // has a terminator and readBoundedString's clamp to the buffer end
        // is what stops the read.
        const tailStart = TEXT_OFFSET + 8 + TEXT.length;
        for (let i = tailStart; i < SIZE; i++) {
            profile.dataView.setUint8(i, 0x2e); // '.'
        }
        profile.addTagEntry('t000', TEXT_OFFSET, SIZE * 2);

        const tags = parseTags(profile.dataView);

        expect(tags.t000.value).to.equal(TEXT + '.'.repeat(SIZE - tailStart));
    });

    it('should read an unterminated text tag up to the end of its tag size', () => {
        const SIZE = 300;
        const TEXT_OFFSET = 200;
        const TEXT = 'Copyright Example Co';
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(TEXT_OFFSET, 'text');
        profile.writeString(TEXT_OFFSET + 8, TEXT + 'X');
        profile.addTagEntry('t000', TEXT_OFFSET, 8 + TEXT.length);

        const tags = parseTags(profile.dataView);

        expect(tags.t000.value).to.equal(TEXT);
    });

    it('should bound total text across desc tags sharing one region', () => {
        const SIZE = 4096;
        const TEXT_OFFSET = 2600;
        const TEXT = 'a'.repeat(1000);
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(TEXT_OFFSET, 'desc');
        profile.dataView.setUint32(TEXT_OFFSET + 8, TEXT.length + 1); // ASCII count including the NUL.
        profile.writeString(TEXT_OFFSET + 12, TEXT);
        const signatures = getSignatures('d', 200);
        for (const signature of signatures) {
            profile.addTagEntry(signature, TEXT_OFFSET, TEXT.length + 13);
        }

        const tags = parseTags(profile.dataView);

        expect(tags[signatures[0]].value).to.equal(TEXT);
        expect(getTotalTextLength(tags, signatures)).to.be.at.most(SIZE);
    });

    it('should let text tags use up the budget that later mluc and desc tags draw from', () => {
        // SIZE is 5 bytes above the round 4096 so that 4 x 1001 + 83 text
        // bytes (each spec-shaped text tag reads its trailing NUL too) still
        // leave 14 bytes of budget: 12 for the mluc record table and 2 for
        // one UTF-16 code unit of its text.
        const SIZE = 4101;
        const TEXT_OFFSET = 2000;
        const MLUC_OFFSET = 3100;
        const DESC_OFFSET = 3200;
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(TEXT_OFFSET, 'text');
        profile.writeString(TEXT_OFFSET + 8, 'a'.repeat(1000));
        for (const signature of getSignatures('t', 4)) {
            profile.addTagEntry(signature, TEXT_OFFSET, 1000 + 9);
        }
        profile.addTagEntry('t004', TEXT_OFFSET, 82 + 9);

        profile.writeString(MLUC_OFFSET, 'mluc');
        profile.dataView.setUint32(MLUC_OFFSET + 8, 1);
        profile.dataView.setUint32(MLUC_OFFSET + 12, 12);
        profile.writeString(MLUC_OFFSET + 16, 'enUS');
        profile.dataView.setUint32(MLUC_OFFSET + 20, 4);
        profile.dataView.setUint32(MLUC_OFFSET + 24, 28);
        profile.dataView.setUint16(MLUC_OFFSET + 28, 0x0048); // 'H'
        profile.dataView.setUint16(MLUC_OFFSET + 30, 0x0069); // 'i'
        profile.addTagEntry('m000', MLUC_OFFSET, 32);

        profile.writeString(DESC_OFFSET, 'desc');
        profile.dataView.setUint32(DESC_OFFSET + 8, 4);
        profile.writeString(DESC_OFFSET + 12, 'Hi!');
        profile.addTagEntry('d000', DESC_OFFSET, 20);

        const tags = parseTags(profile.dataView);

        expect(tags.t004.value).to.have.lengthOf(83);
        expect(tags.m000.value).to.equal('H');
        expect(tags.d000.value).to.equal('');
    });

    it('should let mluc text use up the budget that later text tags draw from', () => {
        const NUM_RECORDS = 500;
        const SIZE = 12000;
        const MLUC_OFFSET = 200;
        const TEXT_OFFSET = 11500;
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(MLUC_OFFSET, 'mluc');
        profile.dataView.setUint32(MLUC_OFFSET + 8, NUM_RECORDS);
        profile.dataView.setUint32(MLUC_OFFSET + 12, 12);
        for (let recordNum = 0; recordNum < NUM_RECORDS; recordNum++) {
            const recordOffset = MLUC_OFFSET + 16 + recordNum * 12;
            profile.writeString(recordOffset, getRecordCodes(recordNum));
            profile.dataView.setUint32(recordOffset + 4, 0xffffffff); // textLength.
            profile.dataView.setUint32(recordOffset + 8, 16); // textOffset into the record table.
        }
        profile.addTagEntry('m000', MLUC_OFFSET, 11000);

        profile.writeString(TEXT_OFFSET, 'text');
        profile.writeString(TEXT_OFFSET + 8, 'Hi');
        profile.addTagEntry('t000', TEXT_OFFSET, 2 + 9);

        const tags = parseTags(profile.dataView);

        expect(tags.t000.value).to.equal('');
    });

    it('should decode an mluc record table that uses up exactly the remaining budget', () => {
        const SIZE = 1000;
        const MLUC_OFFSET = 170;
        const TEXT_OFFSET = 200;
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(TEXT_OFFSET, 'text');
        profile.writeString(TEXT_OFFSET + 8, 'a'.repeat(500));
        // 500 + 488 text bytes leave exactly the 12 bytes of one mluc record.
        // +8 rather than the spec-shaped +9: the text tags here read exactly
        // 500 and 488 bytes of 'a', with no trailing NUL inside the window,
        // so the budget arithmetic below stays exact.
        profile.addTagEntry('t000', TEXT_OFFSET, 500 + 8);
        profile.addTagEntry('t001', TEXT_OFFSET, 488 + 8);
        profile.writeString(MLUC_OFFSET, 'mluc');
        profile.dataView.setUint32(MLUC_OFFSET + 8, 1);
        profile.dataView.setUint32(MLUC_OFFSET + 12, 12);
        profile.writeString(MLUC_OFFSET + 16, 'enUS');
        profile.addTagEntry('m000', MLUC_OFFSET, 28);

        const tags = parseTags(profile.dataView);

        expect(tags.m000.value).to.equal('');
    });

    it('should not truncate desc and text tags that together fill most of the profile', () => {
        const SIZE = 4096;
        const DESC_OFFSET = 200;
        const TEXT_OFFSET = 2100;
        const DESC_TEXT = 'd'.repeat(1800);
        const TEXT = 'b'.repeat(1900);
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(DESC_OFFSET, 'desc');
        profile.dataView.setUint32(DESC_OFFSET + 8, DESC_TEXT.length + 1);
        profile.writeString(DESC_OFFSET + 12, DESC_TEXT);
        profile.addTagEntry('d000', DESC_OFFSET, DESC_TEXT.length + 13);
        profile.writeString(TEXT_OFFSET, 'text');
        profile.writeString(TEXT_OFFSET + 8, TEXT);
        profile.addTagEntry('t000', TEXT_OFFSET, TEXT.length + 9);

        const tags = parseTags(profile.dataView);

        expect(tags.d000.value).to.equal(DESC_TEXT);
        expect(tags.t000.value).to.equal(TEXT);
    });

    it('should keep shared desc and text strings for every tag (no truncation)', () => {
        const SIZE = 300;
        const DESC_OFFSET = 200;
        const TEXT_OFFSET = 240;
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(DESC_OFFSET, 'desc');
        profile.dataView.setUint32(DESC_OFFSET + 8, 3);
        profile.writeString(DESC_OFFSET + 12, 'Hi');
        profile.addTagEntry('d000', DESC_OFFSET, 15);
        profile.addTagEntry('d001', DESC_OFFSET, 15);
        profile.writeString(TEXT_OFFSET, 'text');
        profile.writeString(TEXT_OFFSET + 8, 'Hi');
        profile.addTagEntry('t000', TEXT_OFFSET, 17);
        profile.addTagEntry('t001', TEXT_OFFSET, 17);

        const tags = parseTags(profile.dataView);

        expect([tags.d000.value, tags.d001.value, tags.t000.value, tags.t001.value])
            .to.deep.equal(['Hi', 'Hi', 'Hi', 'Hi']);
    });

    it('should only use up the budget for the text a tag actually decodes', () => {
        const SIZE = 4096;
        const HONEST_OFFSET = 200;
        const OVERSIZED_OFFSET = SIZE - 100;
        const HONEST_TEXT = 'c'.repeat(3000);
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(OVERSIZED_OFFSET, 'text');
        profile.writeString(OVERSIZED_OFFSET + 8, 'z'.repeat(92));
        profile.addTagEntry('t000', OVERSIZED_OFFSET, 0xffffffff);
        profile.writeString(HONEST_OFFSET, 'text');
        profile.writeString(HONEST_OFFSET + 8, HONEST_TEXT);
        profile.addTagEntry('t001', HONEST_OFFSET, HONEST_TEXT.length + 9);

        const tags = parseTags(profile.dataView);

        expect(tags.t000.value).to.equal('z'.repeat(92));
        expect(tags.t001.value).to.equal(HONEST_TEXT);
    });

    it('should not grow the budget from tags with a negative text length', () => {
        const SIZE = 8192;
        const TEXT_OFFSET = 4000;
        const TEXT = 'a'.repeat(1000);
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(TEXT_OFFSET, 'text');
        profile.writeString(TEXT_OFFSET + 8, TEXT);
        // A text tag size below 8 asks for a negative number of bytes.
        for (const signature of getSignatures('n', 300)) {
            profile.addTagEntry(signature, TEXT_OFFSET, 0);
        }
        const signatures = getSignatures('t', 20);
        for (const signature of signatures) {
            profile.addTagEntry(signature, TEXT_OFFSET, TEXT.length + 9);
        }

        const tags = parseTags(profile.dataView);

        expect(getTotalTextLength(tags, signatures)).to.be.at.most(SIZE);
    });

    it('should bound the mluc records decoded across tags sharing one mluc tag', () => {
        const NUM_RECORDS = 1000;
        const SIZE = 13000;
        const MLUC_OFFSET = 800;
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(MLUC_OFFSET, 'mluc');
        profile.dataView.setUint32(MLUC_OFFSET + 8, NUM_RECORDS);
        profile.dataView.setUint32(MLUC_OFFSET + 12, 12);
        for (let recordNum = 0; recordNum < NUM_RECORDS; recordNum++) {
            // Empty text at a distinct language-country key so every record is kept.
            profile.writeString(MLUC_OFFSET + 16 + recordNum * 12, getRecordCodes(recordNum));
        }
        const signatures = getSignatures('m', 50);
        for (const signature of signatures) {
            profile.addTagEntry(signature, MLUC_OFFSET, 16 + NUM_RECORDS * 12);
        }

        const tags = parseTags(profile.dataView);

        let totalRecords = 0;
        for (const signature of signatures) {
            if (tags[signature]) {
                totalRecords += Object.keys(tags[signature].value).length;
            }
        }
        expect(Object.keys(tags[signatures[0]].value)).to.have.lengthOf(NUM_RECORDS);
        // Every record costs at least 12 bytes of the profile-wide budget.
        expect(totalRecords).to.be.at.most(Math.floor(SIZE / 12));
    });

    it('should ignore tag table entries past the tag count cap', () => {
        // One above MAX_TAG_COUNT (1000) in src/icc-tags.js.
        const TAG_COUNT = 1001;
        const SIZE = 12400;
        const SIG_OFFSET = 12200;
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(SIG_OFFSET, 'sig ');
        profile.writeString(SIG_OFFSET + 8, 'abcd');
        for (let i = 0; i < TAG_COUNT; i++) {
            profile.addTagEntry(getRecordCodes(i), SIG_OFFSET, 12);
        }

        const tags = parseTags(profile.dataView);

        expect(tags[getRecordCodes(999)].value).to.equal('abcd');
        expect(tags[getRecordCodes(1000)]).to.equal(undefined);
    });

    it('should bound total decoded text by a constant, not only the profile size', () => {
        // Larger than MAX_DECODE_BYTES (1048576) in src/icc-tags.js.
        const SIZE = 1024 * 1024 + 128 * 1024;
        const TEXT_OFFSET = 1000;
        const TEXT = 'a'.repeat(64 * 1024);
        const profile = getCraftedIccProfile(SIZE);
        profile.writeString(TEXT_OFFSET, 'text');
        profile.writeString(TEXT_OFFSET + 8, TEXT);
        const signatures = getSignatures('t', 20);
        for (const signature of signatures) {
            // +8, not the spec-shaped +9: TEXT.length (64K) divides the
            // budget cap evenly, and no NUL falls inside the read window, so
            // the decoded total below stays an exact multiple.
            profile.addTagEntry(signature, TEXT_OFFSET, TEXT.length + 8);
        }

        const tags = parseTags(profile.dataView);

        expect(getTotalTextLength(tags, signatures)).to.equal(1024 * 1024);
    });

    it('should return the parsed header tags when the profile is truncated before the tag count', () => {
        const SIZE = 130; // >= 84 clears the "too short" guard, < 132 has no room for the tag count.
        const data = new Uint8Array(SIZE);
        const dataView = new DataView(data.buffer);
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                data[offset + i] = string.charCodeAt(i);
            }
        };

        dataView.setUint32(0, SIZE); // Profile length must match the byte length.
        writeString(36, 'acsp'); // Profile signature.

        const tags = parseTags(dataView);

        expect(tags).to.have.nested.property('ICC Signature.value', 'acsp');
    });

    it('should return the parsed header tags when there is no room for the tag table entry', () => {
        const SIZE = 140; // >= 132 so the tag count is readable, < 144 has no room for a 12-byte tag entry.
        const data = new Uint8Array(SIZE);
        const dataView = new DataView(data.buffer);
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                data[offset + i] = string.charCodeAt(i);
            }
        };

        dataView.setUint32(0, SIZE);
        writeString(36, 'acsp');
        dataView.setUint32(128, 1); // Tag count is 1, but the entry does not fit.

        const tags = parseTags(dataView);

        expect(tags).to.have.nested.property('ICC Signature.value', 'acsp');
    });

    it('should stop parsing when a tag offset points past the end of the profile', () => {
        const SIZE = 200;
        const data = new Uint8Array(SIZE);
        const dataView = new DataView(data.buffer);
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                data[offset + i] = string.charCodeAt(i);
            }
        };

        dataView.setUint32(0, SIZE);
        writeString(36, 'acsp');
        dataView.setUint32(128, 2); // Two tags.

        // Tag 0: its data offset points past the end of the buffer.
        writeString(132, 'cprt');
        dataView.setUint32(136, 1000); // tagOffset out of range.
        dataView.setUint32(140, 8); // tagSize.

        // Tag 1: a valid text tag that must not be reached once tag 0 is rejected.
        writeString(144, 'desc');
        dataView.setUint32(148, 160); // tagOffset (valid).
        dataView.setUint32(152, 20); // tagSize.
        writeString(160, 'text'); // Tag type.
        writeString(168, 'Hello'); // Text payload.

        const tags = parseTags(dataView);

        expect(tags).to.have.nested.property('ICC Signature.value', 'acsp');
        expect(tags['ICC Description']).to.equal(undefined);
    });

    it('should return the parsed header tags when an mluc record count exceeds the cap', () => {
        // One above MAX_MLUC_RECORDS.
        const NUM_RECORDS = 1001;
        const RECORD_SIZE = 12;
        // Make the buffer large enough to hold every record so the recordsSize
        // and decode budget guards pass and only the record count cap can
        // reject the tag.
        const SIZE = 160 + NUM_RECORDS * RECORD_SIZE + 100;
        const data = new Uint8Array(SIZE);
        const dataView = new DataView(data.buffer);
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                data[offset + i] = string.charCodeAt(i);
            }
        };

        dataView.setUint32(0, SIZE);
        writeString(36, 'acsp');
        dataView.setUint32(128, 1);

        writeString(132, 'desc');
        dataView.setUint32(136, 144);
        dataView.setUint32(140, SIZE - 144);

        writeString(144, 'mluc');
        dataView.setUint32(152, NUM_RECORDS);
        dataView.setUint32(156, RECORD_SIZE);

        const tags = parseTags(dataView);

        expect(tags).to.have.nested.property('ICC Signature.value', 'acsp');
        expect(tags['ICC Description']).to.equal(undefined);
    });

    it('should still parse an mluc tag with exactly the cap number of records', () => {
        // Exactly MAX_MLUC_RECORDS, so the tag must still be parsed.
        const NUM_RECORDS = 1000;
        const RECORD_SIZE = 12;
        const SIZE = 160 + NUM_RECORDS * RECORD_SIZE + 100;
        const data = new Uint8Array(SIZE);
        const dataView = new DataView(data.buffer);
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                data[offset + i] = string.charCodeAt(i);
            }
        };

        dataView.setUint32(0, SIZE);
        writeString(36, 'acsp');
        dataView.setUint32(128, 1);

        writeString(132, 'desc');
        dataView.setUint32(136, 144);
        dataView.setUint32(140, SIZE - 144);

        writeString(144, 'mluc');
        dataView.setUint32(152, NUM_RECORDS);
        dataView.setUint32(156, RECORD_SIZE);

        const tags = parseTags(dataView);

        expect(tags['ICC Description']).to.not.equal(undefined);
    });

    it('should slice the compressed profile relative to the DataView, not the underlying buffer', async () => {
        const bytes = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88];

        expect(await captureCompressedIccBytes(bytes, 0)).to.deep.equal(bytes);
        expect(await captureCompressedIccBytes(bytes, 5)).to.deep.equal(bytes);
    });

    describe('profile size bounds', () => {
        it('should not size the profile from a chunk length that exceeds the buffer', () => {
            const dataView = new DataView(new ArrayBuffer(200));
            const iccData = [{offset: 0, length: OVER_DECLARED_LENGTH, chunkNumber: 1, chunksTotal: 1}];

            const {requestedLengths, result} = readAndRecordAllocations(dataView, iccData);

            expect(requestedLengths).to.deep.equal([200]);
            expect(result).to.deep.equal({});
        });

        it('should stay bounded when a chunk offset is past the end of the buffer', () => {
            const dataView = new DataView(new ArrayBuffer(200));
            const iccData = [{offset: 300, length: 1000, chunkNumber: 1, chunksTotal: 1}];

            const {requestedLengths, result} = readAndRecordAllocations(dataView, iccData);

            expect(requestedLengths).to.deep.equal([200]);
            expect(result).to.deep.equal({});
        });

        it('should bound the total profile size, so the chunk count cannot amplify it', () => {
            const CHUNK_COUNT = 10;
            const dataView = new DataView(new ArrayBuffer(200));
            const iccData = [];
            for (let i = 0; i < CHUNK_COUNT; i++) {
                iccData.push({offset: 0, length: 200, chunkNumber: i + 1, chunksTotal: CHUNK_COUNT});
            }

            const {requestedLengths, result} = readAndRecordAllocations(dataView, iccData);

            expect(requestedLengths).to.deep.equal([200]);
            expect(result).to.deep.equal({});
        });

        it('should stay bounded in async mode, where the compressed path is not taken', () => {
            const dataView = new DataView(new ArrayBuffer(200));
            const iccData = [{offset: 0, length: OVER_DECLARED_LENGTH, chunkNumber: 1, chunksTotal: 1}];

            const {requestedLengths, result} = readAndRecordAllocations(dataView, iccData, true);

            expect(requestedLengths).to.deep.equal([200]);
            expect(result).to.deep.equal({});
        });

        it('should stay bounded when the data is a Buffer behind the DataView fallback', () => {
            // The fallback wrapper hands out a Node Buffer rather than an
            // ArrayBuffer, so the size bound has to hold for that shape too.
            const dataView = new DataViewWrapper(Buffer.alloc(200));
            const iccData = [{offset: 0, length: OVER_DECLARED_LENGTH, chunkNumber: 1, chunksTotal: 1}];

            const {requestedLengths, result} = readAndRecordAllocations(dataView, iccData);

            expect(requestedLengths).to.deep.equal([200]);
            expect(result).to.deep.equal({});
        });

        it('should stay bounded for a WebP ICCP chunk that over-declares its size', () => {
            const dataView = getOverDeclaringWebpDataView();
            const {iccChunks} = ImageHeaderWebp.findOffsets(dataView);
            expect(iccChunks[0].length).to.equal(OVER_DECLARED_LENGTH);

            const {requestedLengths, result} = readAndRecordAllocations(dataView, iccChunks);

            expect(requestedLengths).to.deep.equal([dataView.byteLength]);
            expect(result).to.deep.equal({});
        });

        it('should stay bounded for an ISO-BMFF colr box that over-declares its size', () => {
            const dataView = getOverDeclaringIsoBmffDataView();
            const {iccChunks} = findIsoBmffOffsets(dataView);
            expect(iccChunks[0].length).to.equal(OVER_DECLARED_LENGTH);

            const {requestedLengths, result} = readAndRecordAllocations(dataView, iccChunks);

            expect(requestedLengths).to.deep.equal([dataView.byteLength]);
            expect(result).to.deep.equal({});
        });

        it('should parse a chunk that extends past the end of the buffer', () => {
            // The chunk sits at a non-zero offset, so the declared length fits
            // inside the buffer while the offset plus that length does not.
            const PROFILE_OFFSET = 20;
            const TRAILING_BYTES = 4;
            const profile = getIccProfileBytes();
            const data = new Uint8Array(PROFILE_OFFSET + profile.length - TRAILING_BYTES);
            data.set(profile.subarray(0, profile.length - TRAILING_BYTES), PROFILE_OFFSET);

            const tags = IccTags.read(
                new DataView(data.buffer),
                [{offset: PROFILE_OFFSET, length: profile.length, chunkNumber: 1, chunksTotal: 1}]
            );

            expect(tags['ICC Description'].value).to.equal('sRGB2014');
        });

        it('should parse a profile whose tail is zero-filled in the buffer', () => {
            const PROFILE_OFFSET = 900;
            const PRESENT_BYTES = 2000;
            const profile = getIccProfileBytes();
            const data = new Uint8Array(4000);
            data.set(profile.subarray(0, PRESENT_BYTES), PROFILE_OFFSET);

            const tags = IccTags.read(
                new DataView(data.buffer),
                [{offset: PROFILE_OFFSET, length: profile.length, chunkNumber: 1, chunksTotal: 1}]
            );

            expect(tags['ICC Description'].value).to.equal('sRGB2014');
        });

        it('should return an empty set for a profile declaring more than the whole buffer', () => {
            // Padding out to the declared length is what the size bound prevents,
            // so this profile can no longer be completed and is rejected.
            const PRESENT_BYTES = 1000;
            const profile = getIccProfileBytes();
            const data = new Uint8Array(PRESENT_BYTES);
            data.set(profile.subarray(0, PRESENT_BYTES), 0);

            const tags = IccTags.read(
                new DataView(data.buffer),
                [{offset: 0, length: profile.length, chunkNumber: 1, chunksTotal: 1}]
            );

            expect(tags).to.deep.equal({});
        });

        it('should parse a profile split across multiple honest chunks', () => {
            const SPLIT_AT = 1500;
            const profile = getIccProfileBytes();
            const dataView = getIccProfileDataView();

            const tags = IccTags.read(dataView, [
                {offset: 0, length: SPLIT_AT, chunkNumber: 1, chunksTotal: 2},
                {offset: SPLIT_AT, length: profile.length - SPLIT_AT, chunkNumber: 2, chunksTotal: 2}
            ]);

            expect(tags).to.deep.equal(IccTags.read(dataView, [
                {offset: 0, length: profile.length, chunkNumber: 1, chunksTotal: 1}
            ]));
            expect(tags['ICC Description'].value).to.equal('sRGB2014');
        });

        it('should slice a chunk relative to the DataView when it has a non-zero byteOffset', () => {
            const profile = getIccProfileBytes();
            const dataView = getPaddedDataView(profile, 20);

            const tags = IccTags.read(
                dataView,
                [{offset: 0, length: profile.length, chunkNumber: 1, chunksTotal: 1}]
            );

            expect(tags['ICC Description'].value).to.equal('sRGB2014');
        });

        // icc-file-parsing.js parses this profile through parseTags directly.
        // This covers the same file through read()'s chunk assembly instead.
        it('should parse a valid single-chunk profile', () => {
            const dataView = getIccProfileDataView();

            const tags = IccTags.read(
                dataView,
                [{offset: 0, length: dataView.byteLength, chunkNumber: 1, chunksTotal: 1}]
            );

            expect(tags['ICC Description'].value).to.equal('sRGB2014');
        });

        it('should parse a profile passed as an array, as inlined TIFF ICC data is', () => {
            const profile = Array.from(getIccProfileBytes());

            const {requestedLengths, result} = readAndRecordAllocations(
                profile,
                [{offset: 0, length: profile.length, chunkNumber: 1, chunksTotal: 1}]
            );

            expect(requestedLengths).to.deep.equal([profile.length]);
            expect(result['ICC Description'].value).to.equal('sRGB2014');
        });
    });
});

/**
 * Records every numeric Uint8Array allocation made during the read, by swapping
 * in a constructor that logs its length argument. Only `readIcc` sizes an array
 * from a number on this path, so a single entry is expected.
 *
 * Only the synchronous path is observed. The real constructor is restored as
 * soon as `read` returns, so for a compressed profile, which resolves later,
 * anything the promise allocates happens after the swap is undone.
 *
 * @param {DataView|Array} dataView - The data to read the ICC chunks from.
 * @param {Array<Object>} iccData - The ICC chunk descriptors.
 * @param {boolean=} async - Whether to read in async mode.
 * @returns {{requestedLengths: Array<number>, result: Object}} The recorded
 *     allocation sizes and the parsed tags.
 */
function readAndRecordAllocations(dataView, iccData, async) {
    const OriginalUint8Array = globalThis.Uint8Array;
    const requestedLengths = [];

    // Every argument is forwarded, so the recorder stays a drop-in for the real
    // constructor and the (buffer, byteOffset, length) form is not flattened
    // into a view over the whole buffer.
    function RecordingUint8Array(...args) {
        if (typeof args[0] === 'number') {
            requestedLengths.push(args[0]);
        }
        return new OriginalUint8Array(...args);
    }
    // The statics and the prototype are mirrored for the same reason. `from`
    // constructs through `this`, so an unbound copy would come back through the
    // recorder and log an allocation that never happened.
    RecordingUint8Array.from = OriginalUint8Array.from.bind(OriginalUint8Array);
    RecordingUint8Array.of = OriginalUint8Array.of.bind(OriginalUint8Array);
    RecordingUint8Array.prototype = OriginalUint8Array.prototype;

    const restore = swapProperties(globalThis, {Uint8Array: RecordingUint8Array});
    let result;
    try {
        result = IccTags.read(dataView, iccData, async);
    } finally {
        restore();
    }
    if (result && typeof result.then === 'function') {
        // The compressed path allocates after this returns, so the recording
        // would be empty and every length assertion would pass for nothing.
        throw new Error('readAndRecordAllocations cannot observe the compressed ICC path');
    }
    return {requestedLengths, result};
}

function getOverDeclaringWebpDataView() {
    // The payload bytes are what make the chunk visible at all. findOffsets only
    // enters its loop while a chunk header plus one more byte fits in the view.
    const payload = '\x00'.repeat(8);
    const body = 'WEBP' + 'ICCP' + getUint32LeString(OVER_DECLARED_LENGTH) + payload;
    return getDataView('RIFF' + getUint32LeString(body.length) + body);
}

function getUint32LeString(number) {
    return getByteStringFromNumber(number, 4).split('').reverse().join('');
}

function getOverDeclaringIsoBmffDataView() {
    // Any payload works, it just stands in for the start of a profile that the
    // colr box claims is much larger.
    const profileStart = '\x00'.repeat(60);
    const colr = getIsoBmffBox('colr', 'prof' + getByteStringFromNumber(OVER_DECLARED_LENGTH, 4) + profileStart);
    return getDataView(
        getIsoBmffBox('ftyp', 'heic' + getByteStringFromNumber(0, 4) + 'heic')
        + getIsoBmffBox('meta', '\x00\x00\x00\x00' + getIsoBmffBox('iprp', getIsoBmffBox('ipco', colr)))
    );
}

function getIsoBmffBox(type, content) {
    return getByteStringFromNumber(content.length + 8, 4) + type + content;
}

function getIccProfileBytes() {
    return new Uint8Array(fs.readFileSync(ICC_PROFILE_PATH));
}

function getIccProfileDataView() {
    return new DataView(getIccProfileBytes().buffer);
}

function getPaddedDataView(bytes, pad) {
    const buffer = new ArrayBuffer(pad + bytes.length);
    const view = new Uint8Array(buffer);
    view.fill(0x99, 0, pad);
    view.set(bytes, pad);
    return new DataView(buffer, pad);
}

/**
 * Reads a single compressed ICC chunk through a custom deflate callback that
 * records the raw bytes it is handed, instead of actually decompressing them.
 * This observes exactly what `readCompressedIcc` sliced out of the DataView,
 * independent of whether the sliced bytes happen to decode into a valid
 * profile afterwards.
 *
 * @param {Array<number>} bytes - The bytes to place at the chunk's declared
 * offset.
 * @param {number} pad - How many marker bytes to place before the DataView's
 * own byteOffset.
 * @returns {Promise<Array<number>>} The bytes the deflate callback observed.
 */
function captureCompressedIccBytes(bytes, pad) {
    const dataView = getPaddedDataView(new Uint8Array(bytes), pad);
    const iccData = [{offset: 0, length: bytes.length, chunkNumber: 1, chunksTotal: 1, compressionMethod: COMPRESSION_METHOD_DEFLATE}];
    let captured;
    const decompressConfig = {
        deflate: (uint8) => {
            captured = Array.from(uint8);
            return new Uint8Array(0);
        }
    };

    return IccTags.read(dataView, iccData, true, decompressConfig).then(() => captured);
}

function getCraftedIccProfile(size) {
    const data = new Uint8Array(size);
    const dataView = new DataView(data.buffer);
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            data[offset + i] = string.charCodeAt(i);
        }
    };
    let tagCount = 0;
    const addTagEntry = (signature, tagOffset, tagSize) => {
        const entryOffset = 132 + tagCount * 12;
        writeString(entryOffset, signature);
        dataView.setUint32(entryOffset + 4, tagOffset);
        dataView.setUint32(entryOffset + 8, tagSize);
        tagCount++;
        dataView.setUint32(128, tagCount);
    };

    dataView.setUint32(0, size);
    writeString(36, 'acsp');
    return {dataView, writeString, addTagEntry};
}

function getSignatures(prefix, count) {
    const signatures = [];
    for (let i = 0; i < count; i++) {
        signatures.push(prefix + String(i).padStart(3, '0'));
    }
    return signatures;
}

function getTotalTextLength(tags, signatures) {
    return signatures.reduce((total, signature) => total + tags[signature].value.length, 0);
}

function getRecordCodes(recordNum) {
    const letter = (index) => String.fromCharCode(65 + (index % 26));
    return letter(recordNum) + letter(Math.floor(recordNum / 26)) + letter(Math.floor(recordNum / 676)) + 'X';
}
