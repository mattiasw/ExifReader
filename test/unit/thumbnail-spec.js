/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getArrayBuffer} from './test-utils.js';
import Thumbnail from '../../src/thumbnail.js';
import DataViewWrapper from '../../src/dataview.js';

const OFFSET_TEST_VALUE = 4;
const COMPRESSION_JPEG = 6;

describe('thumbnail', () => {
    it('should extract JPEG thumbnail', () => {
        const thumbnailTags = {
            Compression: {value: COMPRESSION_JPEG},
            JPEGInterchangeFormat: {value: 2},
            JPEGInterchangeFormatLength: {value: 6}
        };
        const image = '\x47\x11\x48\x12\x49\x13';
        const dataView = getDataView('\x00\x00\x00\x00\x00\x01' + image + '\x02\x03');

        expect(Thumbnail.get(dataView, thumbnailTags, OFFSET_TEST_VALUE)).to.deep.equal({
            type: 'image/jpeg',
            image: getArrayBuffer(image),
            ...thumbnailTags
        });
    });

    it('should extract JPEG thumbnail with undefined compression', () => {
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: 2},
            JPEGInterchangeFormatLength: {value: 6}
        };
        const image = '\x47\x11\x48\x12\x49\x13';
        const dataView = getDataView('\x00\x00\x00\x00\x00\x01' + image + '\x02\x03');

        expect(Thumbnail.get(dataView, thumbnailTags, OFFSET_TEST_VALUE)).to.deep.equal({
            type: 'image/jpeg',
            image: getArrayBuffer(image),
            ...thumbnailTags
        });
    });

    it('should add a base64 property for the thumbnail', () => {
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: 2},
            JPEGInterchangeFormatLength: {value: 6}
        };
        const image = '\x47\x11\x48\x12\x49\x13';
        const dataView = getDataView('\x00\x00\x00\x00\x00\x01' + image);

        expect(Thumbnail.get(dataView, thumbnailTags, OFFSET_TEST_VALUE)).to.deep.equal({
            type: 'image/jpeg',
            image: getArrayBuffer(image),
            base64: Buffer.from(image).toString('base64'),
            ...thumbnailTags
        });
    });

    it('should abort for undefined tags', () => {
        expect(Thumbnail.get(getDataView(''), undefined, OFFSET_TEST_VALUE)).to.be.undefined;
    });

    it('should abort for empty tags', () => {
        expect(Thumbnail.get(getDataView(''), {}, OFFSET_TEST_VALUE)).to.deep.equal({});
    });

    it('should abort for unknown compression type', () => {
        const thumbnailTags = {
            Compression: {value: 42},
            JPEGInterchangeFormat: {value: 2},
            JPEGInterchangeFormatLength: {value: 6}
        };

        expect(Thumbnail.get(getDataView(''), thumbnailTags, OFFSET_TEST_VALUE)).to.deep.equal(thumbnailTags);
    });

    it('should extract the thumbnail relative to the DataView when it has a non-zero byteOffset', () => {
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: 2},
            JPEGInterchangeFormatLength: {value: 6}
        };
        const image = '\x47\x11\x48\x12\x49\x13';
        const content = '\x00\x00\x00\x00\x00\x01' + image + '\x02\x03';
        const dataView = getPaddedDataView(content, 5);

        const result = Thumbnail.get(dataView, thumbnailTags, OFFSET_TEST_VALUE);

        expect(Array.from(new Uint8Array(result.image))).to.deep.equal(Array.from(getArrayBuffer(image)));
    });

    it('should extract the thumbnail when the data is a Buffer behind the DataView fallback', () => {
        // The fallback wrapper has no byteOffset property, so the offset the
        // slice is based on has to hold up for that shape too.
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: 2},
            JPEGInterchangeFormatLength: {value: 6}
        };
        const image = '\x47\x11\x48\x12\x49\x13';
        const dataView = new DataViewWrapper(Buffer.from('\x00\x00\x00\x00\x00\x01' + image + '\x02\x03', 'binary'));

        const result = Thumbnail.get(dataView, thumbnailTags, OFFSET_TEST_VALUE);

        expect(Array.from(new Uint8Array(result.image))).to.deep.equal(Array.from(getArrayBuffer(image)));
    });
});

function getPaddedDataView(content, pad) {
    const buffer = new ArrayBuffer(pad + content.length);
    const view = new Uint8Array(buffer);
    view.fill(0x99, 0, pad);
    for (let i = 0; i < content.length; i++) {
        view[pad + i] = content.charCodeAt(i);
    }
    return new DataView(buffer, pad);
}
