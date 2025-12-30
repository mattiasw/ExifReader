/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import {__RewireAPI__ as PentaxTagsRewireAPI} from '../../src/pentax-tags';
import ByteOrder from '../../src/byte-order';
import {IFD_TYPE_PENTAX} from '../../src/tag-names.js';
import PentaxTags from '../../src/pentax-tags';

const TIFF_HEADER_OFFSET = 2;
const OFFSET = 4;
const DATAVIEW_PADDING = '000000';
const BIG_ENDIAN_STRING = String.fromCharCode(ByteOrder.BIG_ENDIAN & 0xff, ByteOrder.BIG_ENDIAN >> 8);
const LITTLE_ENDIAN_STRING = String.fromCharCode(ByteOrder.LITTLE_ENDIAN & 0xff, ByteOrder.LITTLE_ENDIAN >> 8);
const DATAVIEW_BASE = DATAVIEW_PADDING + 'PENTAX \x00' + BIG_ENDIAN_STRING;
const DATAVIEW_BASE_LITTLE_ENDIAN = DATAVIEW_PADDING + 'PENTAX \x00' + LITTLE_ENDIAN_STRING;

describe('pentax-tags', () => {
    const mockDataView = getDataView(DATAVIEW_BASE);

    afterEach(() => {
        PentaxTagsRewireAPI.__ResetDependency__('readIfd');
    });

    it('should be able to handle when there are no tags in a Pentax IFD', () => {
        rewirePentaxReadIfd({});

        const tags = PentaxTags.read(mockDataView, TIFF_HEADER_OFFSET, OFFSET, false);

        expect(tags).to.deep.equal({});
    });

    it('should be able to parse tags', () => {
        const pentaxTags = {MyTag: {value: 42}};
        rewirePentaxReadIfd(pentaxTags);

        const tags = PentaxTags.read(mockDataView, TIFF_HEADER_OFFSET, OFFSET, false);

        expect(tags).to.deep.equal(pentaxTags);
    });

    describe('K3 III level info', function () {
        describe('CameraOrientation', function () {
            it('should read CameraOrientation=0', function () {
                const {levelInfo, levelInfoDataView} = getLevelInfo({
                    [PentaxTags.LIK3III.CAMERA_ORIENTATION]: 0
                });
                rewirePentaxReadIfd({
                    PentaxModelID: {value: PentaxTags.MODEL_ID.K3_III},
                    LevelInfo: levelInfo
                });

                const tags = PentaxTags.read(levelInfoDataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(0);
                expect(tags['CameraOrientation'].description).to.equal(
                    'Horizontal (normal)'
                );
            });

            it('should read CameraOrientation=1', function () {
                const {levelInfo, levelInfoDataView} = getLevelInfo({
                    [PentaxTags.LIK3III.CAMERA_ORIENTATION]: 1
                });
                rewirePentaxReadIfd({
                    PentaxModelID: {value: PentaxTags.MODEL_ID.K3_III},
                    LevelInfo: levelInfo
                });

                const tags = PentaxTags.read(levelInfoDataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(1);
                expect(tags['CameraOrientation'].description).to.equal('Rotate 270 CW');
            });

            it('should read CameraOrientation=2', function () {
                const {levelInfo, levelInfoDataView} = getLevelInfo({
                    [PentaxTags.LIK3III.CAMERA_ORIENTATION]: 2
                });
                rewirePentaxReadIfd({
                    PentaxModelID: {value: PentaxTags.MODEL_ID.K3_III},
                    LevelInfo: levelInfo
                });

                const tags = PentaxTags.read(levelInfoDataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(2);
                expect(tags['CameraOrientation'].description).to.equal('Rotate 180');
            });

            it('should read CameraOrientation=3', function () {
                const {levelInfo, levelInfoDataView} = getLevelInfo({
                    [PentaxTags.LIK3III.CAMERA_ORIENTATION]: 3
                });
                rewirePentaxReadIfd({
                    PentaxModelID: {value: PentaxTags.MODEL_ID.K3_III},
                    LevelInfo: levelInfo
                });

                const tags = PentaxTags.read(levelInfoDataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(3);
                expect(tags['CameraOrientation'].description).to.equal('Rotate 90 CW');
            });

            it('should read CameraOrientation=4', function () {
                const {levelInfo, levelInfoDataView} = getLevelInfo({
                    [PentaxTags.LIK3III.CAMERA_ORIENTATION]: 4
                });
                rewirePentaxReadIfd({
                    PentaxModelID: {value: PentaxTags.MODEL_ID.K3_III},
                    LevelInfo: levelInfo
                });

                const tags = PentaxTags.read(levelInfoDataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(4);
                expect(tags['CameraOrientation'].description).to.equal('Upwards');
            });

            it('should read CameraOrientation=5', function () {
                const {levelInfo, levelInfoDataView} = getLevelInfo({
                    [PentaxTags.LIK3III.CAMERA_ORIENTATION]: 5
                });
                rewirePentaxReadIfd({
                    PentaxModelID: {value: PentaxTags.MODEL_ID.K3_III},
                    LevelInfo: levelInfo
                });

                const tags = PentaxTags.read(levelInfoDataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(5);
                expect(tags['CameraOrientation'].description).to.equal('Downwards');
            });

            it('should handle unknown CameraOrientation value', function () {
                const {levelInfo, levelInfoDataView} = getLevelInfo({
                    [PentaxTags.LIK3III.CAMERA_ORIENTATION]: 42
                });
                rewirePentaxReadIfd({
                    PentaxModelID: {value: PentaxTags.MODEL_ID.K3_III},
                    LevelInfo: levelInfo
                });

                const tags = PentaxTags.read(levelInfoDataView, TIFF_HEADER_OFFSET, OFFSET, false);

                expect(tags['CameraOrientation'].value).to.equal(42);
                expect(tags['CameraOrientation'].description).to.equal('Unknown');
            });
        });

        it('should read RollAngle', function () {
            // Using little endian for testing.
            const {levelInfo, levelInfoDataView} = getLevelInfo({
                [PentaxTags.LIK3III.ROLL_ANGLE]: 42,
                [PentaxTags.LIK3III.ROLL_ANGLE + 1]: 0
            }, true);
            rewirePentaxReadIfd({
                PentaxModelID: {value: PentaxTags.MODEL_ID.K3_III},
                LevelInfo: levelInfo
            }, true);

            const tags = PentaxTags.read(levelInfoDataView, TIFF_HEADER_OFFSET, OFFSET, false);

            expect(tags['RollAngle'].value).to.equal(42);
            expect(tags['RollAngle'].description).to.equal('-21');
        });

        it('should read PitchAngle', function () {
            const {levelInfo, levelInfoDataView} = getLevelInfo({
                [PentaxTags.LIK3III.PITCH_ANGLE]: 0,
                [PentaxTags.LIK3III.PITCH_ANGLE + 1]: 42
            });
            rewirePentaxReadIfd({
                PentaxModelID: {value: PentaxTags.MODEL_ID.K3_III},
                LevelInfo: levelInfo
            });

            const tags = PentaxTags.read(levelInfoDataView, TIFF_HEADER_OFFSET, OFFSET, false);

            expect(tags['PitchAngle'].value).to.equal(42);
            expect(tags['PitchAngle'].description).to.equal('-21');
        });

        function getLevelInfo(levelInfoTags, littleEndian = false) {
            const levelInfo = getLevelInfoK3IIIData(levelInfoTags);

            const DATAVIEW_BASE_WITH_PADDING = (littleEndian ? DATAVIEW_BASE_LITTLE_ENDIAN : DATAVIEW_BASE) + '\x00\x00';
            const DATAVIEW_CONTENT = DATAVIEW_BASE_WITH_PADDING + levelInfo.value.map((char) => String.fromCharCode(char)).join('');

            const levelInfoDataView = getDataView(DATAVIEW_CONTENT);

            levelInfo.__offset = DATAVIEW_BASE_WITH_PADDING.length - DATAVIEW_PADDING.length;

            return {levelInfo, levelInfoDataView};
        }

        function getLevelInfoK3IIIData(config) {
            const data = Array(7).fill('\x00');

            for (const key in config) {
                data[key] = config[key];
            }

            return {
                value: data,
            };
        }
    });
});

function rewirePentaxReadIfd(tags, littleEndian = false) {
    PentaxTagsRewireAPI.__Rewire__('readIfd', (_dataView, ifdType, originOffset, offset, byteOrder, includeUnknown, computed) => {
        expect(ifdType).to.equal(IFD_TYPE_PENTAX);
        expect(originOffset).to.equal(TIFF_HEADER_OFFSET + OFFSET);
        expect(offset).to.equal(TIFF_HEADER_OFFSET + OFFSET + PentaxTags.PENTAX_IFD_OFFSET);
        expect(byteOrder).to.equal(littleEndian ? ByteOrder.LITTLE_ENDIAN : ByteOrder.BIG_ENDIAN);
        expect(includeUnknown).to.equal(false);
        expect(computed).to.equal(false);

        return tags;
    });
}
