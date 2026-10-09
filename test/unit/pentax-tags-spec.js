/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The Pentax maker note parsing is exercised with real IFD structures so
// that the real readIfd resolves tags against the real Pentax tag
// dictionary.

import {expect} from 'chai';
import {getDataView} from './test-utils.js';
import ByteOrder from '../../src/byte-order.js';
import PentaxTags from '../../src/pentax-tags.js';

const TIFF_HEADER_OFFSET = 2;
const OFFSET = 4;
const DATAVIEW_PADDING = '000000';
const BIG_ENDIAN_STRING = String.fromCharCode(ByteOrder.BIG_ENDIAN & 0xff, ByteOrder.BIG_ENDIAN >> 8);
const LITTLE_ENDIAN_STRING = String.fromCharCode(ByteOrder.LITTLE_ENDIAN & 0xff, ByteOrder.LITTLE_ENDIAN >> 8);
const PENTAX_MODEL_ID_TAG_ID = 0x0005;
const LEVEL_INFO_TAG_ID = 0x022b;
const UNKNOWN_TAG_ID = 0x7fff;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_UNDEFINED = 7;

describe('pentax-tags', () => {
    it('should be able to handle when there are no tags in a Pentax IFD', () => {
        const dataView = getPentaxDataView([]);

        const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

        expect(tags).to.deep.equal({});
    });

    it('should be able to parse tags', () => {
        const dataView = getPentaxDataView([
            getShortField(PENTAX_MODEL_ID_TAG_ID, 42),
            // An unknown tag id that is excluded since includeUnknown is false.
            getShortField(0x4711, 1)
        ]);

        const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

        expect(tags).to.deep.equal({PentaxModelID: {id: PENTAX_MODEL_ID_TAG_ID, value: 42, description: 42}});
    });

    it('should not throw when the byte order marker is out of bounds', () => {
        // A malformed MakerNote offset can push the byte-order read past the
        // end of the buffer. Reading it must not throw out of the parse.
        const dataView = getDataView('PENTAX \x00');
        expect(() => PentaxTags.read(dataView, 0, 4, false)).to.not.throw();
        expect(PentaxTags.read(dataView, 0, 4, false)).to.deep.equal({});
    });

    it('should not throw when the byte order marker is invalid', () => {
        // Enough bytes to read, but not a valid II/MM marker.
        const dataView = getDataView('PENTAX \x00\xff\xff');
        expect(() => PentaxTags.read(dataView, 0, 0, false)).to.not.throw();
        expect(PentaxTags.read(dataView, 0, 0, false)).to.deep.equal({});
    });

    it('should decode an out-of-slot value empty when the passed budget is used up', () => {
        const dataView = getPentaxDataView([getUndefinedField(LEVEL_INFO_TAG_ID, [1, 2, 3, 4, 5, 6, 7])]);

        const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false, false, undefined, {remaining: 0, ifdEntriesRemaining: 1000});

        expect(tags['LevelInfo'].value).to.deep.equal([]);
    });

    it('should draw out-of-slot values from a passed decoded-value budget', () => {
        const levelInfoBytes = [1, 2, 3, 4, 5, 6, 7];
        const dataView = getPentaxDataView([getUndefinedField(LEVEL_INFO_TAG_ID, levelInfoBytes)]);
        const valueBudget = {remaining: 100, ifdEntriesRemaining: 1000};

        const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false, false, undefined, valueBudget);

        expect(tags['LevelInfo'].value).to.deep.equal(levelInfoBytes);
        expect(valueBudget.remaining).to.equal(100 - levelInfoBytes.length);
    });

    it('should not return the internal offset on LevelInfo when there is no model ID', () => {
        const dataView = getPentaxDataView([getUndefinedField(LEVEL_INFO_TAG_ID, [1, 2, 3, 4, 5, 6, 7])]);

        const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET);

        expect(tags['LevelInfo']).to.not.have.property('__offset');
        expect(tags['LevelInfo'].value).to.deep.equal([1, 2, 3, 4, 5, 6, 7]);
    });

    it('should not return the internal offset on LevelInfo for a camera other than the K-3 III', () => {
        const dataView = getPentaxDataView([
            getLongField(PENTAX_MODEL_ID_TAG_ID, 42),
            getUndefinedField(LEVEL_INFO_TAG_ID, [1, 2, 3, 4, 5, 6, 7])
        ]);

        const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET);

        expect(tags['PentaxModelID'].value).to.equal(42);
        expect(tags['LevelInfo']).to.not.have.property('__offset');
        expect(tags['LevelInfo'].value).to.deep.equal([1, 2, 3, 4, 5, 6, 7]);
    });

    describe('K3 III level info', function () {
        describe('CameraOrientation', function () {
            it('should read CameraOrientation=0', function () {
                const dataView = getLevelInfoDataView({
                    [PentaxTags.LIK3III.CAMERA_ORIENTATION]: 0
                });

                const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(0);
                expect(tags['CameraOrientation'].description).to.equal(
                    'Horizontal (normal)'
                );
            });

            it('should read CameraOrientation=1', function () {
                const dataView = getLevelInfoDataView({
                    [PentaxTags.LIK3III.CAMERA_ORIENTATION]: 1
                });

                const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(1);
                expect(tags['CameraOrientation'].description).to.equal('Rotate 270 CW');
            });

            it('should read CameraOrientation=2', function () {
                const dataView = getLevelInfoDataView({
                    [PentaxTags.LIK3III.CAMERA_ORIENTATION]: 2
                });

                const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(2);
                expect(tags['CameraOrientation'].description).to.equal('Rotate 180');
            });

            it('should read CameraOrientation=3', function () {
                const dataView = getLevelInfoDataView({
                    [PentaxTags.LIK3III.CAMERA_ORIENTATION]: 3
                });

                const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(3);
                expect(tags['CameraOrientation'].description).to.equal('Rotate 90 CW');
            });

            it('should read CameraOrientation=4', function () {
                const dataView = getLevelInfoDataView({
                    [PentaxTags.LIK3III.CAMERA_ORIENTATION]: 4
                });

                const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(4);
                expect(tags['CameraOrientation'].description).to.equal('Upwards');
            });

            it('should read CameraOrientation=5', function () {
                const dataView = getLevelInfoDataView({
                    [PentaxTags.LIK3III.CAMERA_ORIENTATION]: 5
                });

                const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(5);
                expect(tags['CameraOrientation'].description).to.equal('Downwards');
            });

            it('should handle unknown CameraOrientation value', function () {
                const dataView = getLevelInfoDataView({
                    [PentaxTags.LIK3III.CAMERA_ORIENTATION]: 42
                });

                const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(42);
                expect(tags['CameraOrientation'].description).to.equal('Unknown');
            });
        });

        it('should read RollAngle', function () {
            // Using little endian for testing.
            const dataView = getLevelInfoDataView({
                [PentaxTags.LIK3III.ROLL_ANGLE]: 42,
                [PentaxTags.LIK3III.ROLL_ANGLE + 1]: 0
            }, true);

            const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

            expect(tags['RollAngle'].value).to.equal(42);
            expect(tags['RollAngle'].description).to.equal('-21');
        });

        it('should read PitchAngle', function () {
            const dataView = getLevelInfoDataView({
                [PentaxTags.LIK3III.PITCH_ANGLE]: 0,
                [PentaxTags.LIK3III.PITCH_ANGLE + 1]: 42
            });

            const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

            expect(tags['PitchAngle'].value).to.equal(42);
            expect(tags['PitchAngle'].description).to.equal('-21');
        });

        it('should read CameraOrientation from a LevelInfo stored in its value slot', function () {
            const dataView = getPentaxDataView([
                getLongField(PENTAX_MODEL_ID_TAG_ID, PentaxTags.MODEL_ID.K3_III),
                getUndefinedField(LEVEL_INFO_TAG_ID, [0, 3, 0, 0])
            ]);

            const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

            expect(tags['CameraOrientation'].value).to.equal(3);
            expect(tags['CameraOrientation'].description).to.equal('Rotate 90 CW');
        });

        it('should not read RollAngle or PitchAngle from the bytes after a 4-byte LevelInfo in its value slot', function () {
            const dataView = getPentaxDataView([
                getUndefinedField(LEVEL_INFO_TAG_ID, [0, 3, 0, 0]),
                getLongField(PENTAX_MODEL_ID_TAG_ID, PentaxTags.MODEL_ID.K3_III)
            ]);

            const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

            expect(tags['CameraOrientation'].value).to.equal(3);
            expect(tags).to.not.have.property('RollAngle');
            expect(tags).to.not.have.property('PitchAngle');
            expect(tags).to.not.have.property('LevelInfo');
        });

        it('should not read any field from a 1-byte LevelInfo', function () {
            const dataView = getPentaxDataView([
                {id: LEVEL_INFO_TAG_ID, type: TYPE_UNDEFINED, count: 1, data: '\x00\x03\x00\x00'},
                getLongField(PENTAX_MODEL_ID_TAG_ID, PentaxTags.MODEL_ID.K3_III)
            ]);

            const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

            expect(tags['PentaxModelID'].value).to.equal(PentaxTags.MODEL_ID.K3_III);
            expect(tags).to.not.have.property('CameraOrientation');
            expect(tags).to.not.have.property('RollAngle');
            expect(tags).to.not.have.property('PitchAngle');
            expect(tags).to.not.have.property('LevelInfo');
        });

        it('should read only CameraOrientation from a 2-byte LevelInfo', function () {
            const dataView = getPentaxDataView([
                getUndefinedField(LEVEL_INFO_TAG_ID, [0, 3]),
                getLongField(PENTAX_MODEL_ID_TAG_ID, PentaxTags.MODEL_ID.K3_III)
            ]);

            const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

            expect(tags['CameraOrientation'].value).to.equal(3);
            expect(tags).to.not.have.property('RollAngle');
            expect(tags).to.not.have.property('PitchAngle');
        });

        for (const levelInfoBytes of [[0, 3, 0, 0, 42], [0, 3, 0, 0, 42, 0]]) {
            it(`should not read PitchAngle from the bytes after a ${levelInfoBytes.length}-byte LevelInfo`, function () {
                const dataView = getPentaxDataView([
                    getLongField(PENTAX_MODEL_ID_TAG_ID, PentaxTags.MODEL_ID.K3_III),
                    getUndefinedField(LEVEL_INFO_TAG_ID, levelInfoBytes),
                    getUndefinedField(UNKNOWN_TAG_ID, [7, 7, 7, 7, 7])
                ]);

                const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(3);
                expect(tags['RollAngle'].value).to.equal(42);
                expect(tags['RollAngle'].description).to.equal('-21');
                expect(tags).to.not.have.property('PitchAngle');
            });
        }

        it('should not read any field from a LevelInfo whose value lies outside the file', function () {
            const dataView = getPentaxDataView([
                getLongField(PENTAX_MODEL_ID_TAG_ID, PentaxTags.MODEL_ID.K3_III),
                {id: LEVEL_INFO_TAG_ID, type: TYPE_UNDEFINED, count: 7, data: getUint32(0xffff)}
            ]);

            const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false);

            expect(tags['PentaxModelID'].value).to.equal(PentaxTags.MODEL_ID.K3_III);
            expect(tags).to.not.have.property('CameraOrientation');
            expect(tags).to.not.have.property('RollAngle');
            expect(tags).to.not.have.property('PitchAngle');
            expect(tags).to.not.have.property('LevelInfo');
        });

        it('should not read any field from a LevelInfo the decoded-value budget left empty', function () {
            const dataView = getPentaxDataView([
                getLongField(PENTAX_MODEL_ID_TAG_ID, PentaxTags.MODEL_ID.K3_III),
                getUndefinedField(LEVEL_INFO_TAG_ID, [0, 3, 0, 0, 42, 0, 42])
            ]);

            const tags = PentaxTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, false, false, undefined, {remaining: 0, ifdEntriesRemaining: 1000});

            expect(tags).to.not.have.property('CameraOrientation');
            expect(tags).to.not.have.property('RollAngle');
            expect(tags).to.not.have.property('PitchAngle');
            expect(tags).to.not.have.property('LevelInfo');
        });

        function getLevelInfoDataView(levelInfoTags, littleEndian = false) {
            const levelInfoBytes = Array(7).fill(0);

            for (const key in levelInfoTags) {
                levelInfoBytes[key] = levelInfoTags[key];
            }

            return getPentaxDataView([
                getLongField(PENTAX_MODEL_ID_TAG_ID, PentaxTags.MODEL_ID.K3_III, littleEndian),
                getUndefinedField(LEVEL_INFO_TAG_ID, levelInfoBytes)
            ], littleEndian);
        }
    });
});

function getPentaxDataView(fields, littleEndian = false) {
    const base = DATAVIEW_PADDING + 'PENTAX \x00' + (littleEndian ? LITTLE_ENDIAN_STRING : BIG_ENDIAN_STRING);
    const valueAreaOffset = base.length + 2 + fields.length * 12 + 4;
    let ifd = getUint16(fields.length, littleEndian);
    let valueArea = '';

    for (const field of fields) {
        ifd += getUint16(field.id, littleEndian) + getUint16(field.type, littleEndian) + getUint32(field.count, littleEndian);
        if (field.data.length <= 4) {
            ifd += field.data + '\x00'.repeat(4 - field.data.length);
        } else {
            // Pentax tag offsets are relative to the start of the maker note.
            ifd += getUint32(valueAreaOffset + valueArea.length - (TIFF_HEADER_OFFSET + OFFSET), littleEndian);
            valueArea += field.data;
        }
    }

    ifd += getUint32(0, littleEndian); // Offset to next IFD.

    return getDataView(base + ifd + valueArea);
}

function getShortField(id, value, littleEndian = false) {
    return {id, type: TYPE_SHORT, count: 1, data: getUint16(value, littleEndian)};
}

function getLongField(id, value, littleEndian = false) {
    return {id, type: TYPE_LONG, count: 1, data: getUint32(value, littleEndian)};
}

function getUndefinedField(id, bytes) {
    return {id, type: TYPE_UNDEFINED, count: bytes.length, data: bytes.map((byte) => String.fromCharCode(byte)).join('')};
}

function getUint16(value, littleEndian) {
    return getByteString([(value >> 8) & 0xff, value & 0xff], littleEndian);
}

function getUint32(value, littleEndian) {
    return getByteString([(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff], littleEndian);
}

function getByteString(bytes, littleEndian) {
    if (littleEndian) {
        bytes.reverse();
    }
    return String.fromCharCode(...bytes);
}
