/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import IccTags, {parseTags, __RewireAPI__ as IccTagsRewireAPI} from '../../src/icc-tags';

describe('icc-tags', () => {
    it('should return empty set if something throws', () => {
        expect(IccTags.read(undefined, [])).to.deep.equal({});
    });

    it('should not iterate mluc records when the record size cannot advance the read offset', () => {
        const NUM_RECORDS = 100000;
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

        let recordReadCount = 0;
        IccTagsRewireAPI.__Rewire__('getUnicodeStringFromDataView', () => {
            recordReadCount += 1;
            return '';
        });

        try {
            parseTags(dataView);
        } finally {
            IccTagsRewireAPI.__ResetDependency__('getUnicodeStringFromDataView');
        }

        expect(recordReadCount).to.be.at.most(1);
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
        const NUM_RECORDS = 100000;
        const RECORD_SIZE = 12;
        // Make the buffer large enough to hold every record so the recordsSize
        // guard passes and only the record count cap can reject the tag.
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
});
