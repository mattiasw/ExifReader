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
