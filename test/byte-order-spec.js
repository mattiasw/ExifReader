/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import ByteOrder from '../src/byte-order';
import ImageHeader from '../src/image-header';

describe('byte order', () => {
    it('should find byte order data', () => {
        const dataView = getDataView('\xff\xd8\xff\xe100Exif\x00\x00\x49\x49');
        const {tiffHeaderOffset} = ImageHeader.parseAppMarkers(dataView);
        expect(ByteOrder.getByteOrder(dataView, tiffHeaderOffset)).to.equal(ByteOrder.LITTLE_ENDIAN);
    });

    it('should set correct byte order for litte endian data', () => {
        const dataView = getDataView('\x49\x49');
        expect(ByteOrder.getByteOrder(dataView, 0)).to.equal(ByteOrder.LITTLE_ENDIAN);
    });

    it('should set correct byte order for big endian data', () => {
        const dataView = getDataView('\x4d\x4d');
        expect(ByteOrder.getByteOrder(dataView, 0)).to.equal(ByteOrder.BIG_ENDIAN);
    });

    it('should not allow illegal byte order value', () => {
        const dataView = getDataView('\x00\x00');
        expect(() => ByteOrder.getByteOrder(dataView, 0)).to.throw(/Illegal byte order value. Faulty image./);
    });
});
