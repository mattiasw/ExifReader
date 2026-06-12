/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The Canon maker note parsing is exercised with real little-endian IFD
// structures so that the real readIfd resolves tags against the real Canon
// tag dictionary.

import {expect} from 'chai';
import {getDataView} from './test-utils.js';
import ByteOrder from '../../src/byte-order.js';
import CanonTags from '../../src/canon-tags.js';

const TIFF_HEADER_OFFSET = 42;
const OFFSET = 4711;
const IFD_OFFSET = TIFF_HEADER_OFFSET + OFFSET;
const CAMERA_SETTINGS_TAG_ID = 0x0001;
const SHOT_INFO_TAG_ID = 0x0004;
const LENS_MODEL_TAG_ID = 0x0095;
const TYPE_ASCII = 2;
const TYPE_SHORT = 3;

describe('canon-tags', () => {
    it('should be able to handle when there are no tags in a Canon IFD', () => {
        const dataView = getCanonDataView([]);

        const tags = CanonTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, ByteOrder.LITTLE_ENDIAN, false);

        expect(tags).to.deep.equal({});
    });

    it('should be able to handle when there is shot info but no tags in a Canon IFD', () => {
        // The value array is too short to reach the AutoRotate position.
        const dataView = getCanonDataView([getShotInfoField({}, 4)]);

        const tags = CanonTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, ByteOrder.LITTLE_ENDIAN, false);

        expect(tags).to.deep.equal({});
        expect(tags['ShotInfo']).to.be.undefined;
    });

    it('should be able to read AutoRotate=0 from shot info from a Canon IFD', () => {
        const dataView = getCanonDataView([getShotInfoField({[CanonTags.SHOT_INFO_AUTO_ROTATE]: 0})]);

        const tags = CanonTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, ByteOrder.LITTLE_ENDIAN, false);

        expect(tags['AutoRotate'].value).to.equal(0);
        expect(tags['AutoRotate'].description).to.equal('None');
        expect(tags['ShotInfo']).to.be.undefined;
    });

    it('should be able to read AutoRotate=1 from shot info from a Canon IFD', () => {
        const dataView = getCanonDataView([getShotInfoField({[CanonTags.SHOT_INFO_AUTO_ROTATE]: 1})]);

        const tags = CanonTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, ByteOrder.LITTLE_ENDIAN, false);

        expect(tags['AutoRotate'].value).to.equal(1);
        expect(tags['AutoRotate'].description).to.equal('Rotate 90 CW');
    });

    it('should be able to read AutoRotate=2 from shot info from a Canon IFD', () => {
        const dataView = getCanonDataView([getShotInfoField({[CanonTags.SHOT_INFO_AUTO_ROTATE]: 2})]);

        const tags = CanonTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, ByteOrder.LITTLE_ENDIAN, false);

        expect(tags['AutoRotate'].value).to.equal(2);
        expect(tags['AutoRotate'].description).to.equal('Rotate 180');
    });

    it('should be able to read AutoRotate=3 from shot info from a Canon IFD', () => {
        const dataView = getCanonDataView([getShotInfoField({[CanonTags.SHOT_INFO_AUTO_ROTATE]: 3})]);

        const tags = CanonTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, ByteOrder.LITTLE_ENDIAN, false);

        expect(tags['AutoRotate'].value).to.equal(3);
        expect(tags['AutoRotate'].description).to.equal('Rotate 270 CW');
    });

    it('should be able to handle unknown AutoRotate value from shot info from a Canon IFD', () => {
        const dataView = getCanonDataView([getShotInfoField({[CanonTags.SHOT_INFO_AUTO_ROTATE]: 42})]);

        const tags = CanonTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, ByteOrder.LITTLE_ENDIAN, false);

        expect(tags['AutoRotate'].value).to.equal(42);
        expect(tags['AutoRotate'].description).to.equal('Unknown');
    });

    it('should be able to handle when there is camera settings but no lens type in a Canon IFD', () => {
        // The value array is too short to reach the LensType position.
        const dataView = getCanonDataView([getCameraSettingsField({}, 4)]);

        const tags = CanonTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, ByteOrder.LITTLE_ENDIAN, false);

        expect(tags).to.deep.equal({});
        expect(tags['CameraSettings']).to.be.undefined;
    });

    it('should be able to read LensType from camera settings from a Canon IFD', () => {
        const dataView = getCanonDataView([
            getCameraSettingsField({[CanonTags.CAMERA_SETTINGS_LENS_TYPE]: 61182})
        ]);

        const tags = CanonTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, ByteOrder.LITTLE_ENDIAN, false);

        expect(tags['LensType'].value).to.equal(61182);
        expect(tags['LensType'].description).to.equal('61182');
        expect(tags['CameraSettings']).to.be.undefined;
    });

    it('should keep direct LensModel when camera settings are parsed', () => {
        const dataView = getCanonDataView([
            getLensModelField('RF24-105mm F4 L IS USM'),
            getCameraSettingsField({[CanonTags.CAMERA_SETTINGS_LENS_TYPE]: 61182})
        ]);

        const tags = CanonTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, ByteOrder.LITTLE_ENDIAN, false);

        expect(tags['LensModel'].value).to.deep.equal(['RF24-105mm F4 L IS USM']);
        expect(tags['LensModel'].description).to.equal('RF24-105mm F4 L IS USM');
        expect(tags['LensType'].value).to.equal(61182);
    });

    it('should keep LensType shape in computed mode', () => {
        const dataView = getCanonDataView([
            getCameraSettingsField({[CanonTags.CAMERA_SETTINGS_LENS_TYPE]: 61182})
        ]);

        const tags = CanonTags.read(dataView, TIFF_HEADER_OFFSET, OFFSET, ByteOrder.LITTLE_ENDIAN, false, true);

        expect(tags['LensType'].value).to.equal(61182);
        expect(tags['LensType'].description).to.equal('61182');
    });
});

function getCanonDataView(fields) {
    const valueAreaOffset = IFD_OFFSET + 2 + fields.length * 12 + 4;
    let ifd = getUint16(fields.length);
    let valueArea = '';

    for (const field of fields) {
        ifd += getUint16(field.id) + getUint16(field.type) + getUint32(field.count);
        if (field.data.length <= 4) {
            ifd += field.data + '\x00'.repeat(4 - field.data.length);
        } else {
            ifd += getUint32(valueAreaOffset + valueArea.length - TIFF_HEADER_OFFSET);
            valueArea += field.data;
        }
    }

    ifd += getUint32(0); // Offset to next IFD.

    return getDataView('\x00'.repeat(IFD_OFFSET) + ifd + valueArea);
}

function getShotInfoField(config, size = 34) {
    return getShortValuesField(SHOT_INFO_TAG_ID, getValues(config, size));
}

function getCameraSettingsField(config, size = 53) {
    return getShortValuesField(CAMERA_SETTINGS_TAG_ID, getValues(config, size));
}

function getLensModelField(text) {
    const value = text + '\x00';
    return {id: LENS_MODEL_TAG_ID, type: TYPE_ASCII, count: value.length, data: value};
}

function getValues(config, size) {
    const values = Array(size).fill(0);
    values[0] = size; // First position is size.

    for (const key in config) {
        values[key] = config[key];
    }

    return values;
}

function getShortValuesField(id, values) {
    return {id, type: TYPE_SHORT, count: values.length, data: values.map((value) => getUint16(value)).join('')};
}

function getUint16(value) {
    return String.fromCharCode(value & 0xff, (value >> 8) & 0xff);
}

function getUint32(value) {
    return String.fromCharCode(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);
}
