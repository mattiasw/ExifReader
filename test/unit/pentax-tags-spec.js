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
