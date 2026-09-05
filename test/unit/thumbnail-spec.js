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

    it('should not extract a thumbnail for a negative offset', () => {
        // A thumbnail IFD can declare the offset with a signed type, and
        // ArrayBuffer.prototype.slice reads a negative start relative to the
        // end of the buffer, which lands in the unrelated second half here.
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: -20},
            JPEGInterchangeFormatLength: {value: 8}
        };
        const dataView = getDataView('\x00'.repeat(16) + '\xaa'.repeat(16));

        expectNoThumbnail(dataView, thumbnailTags, OFFSET_TEST_VALUE);
    });

    it('should not extract a thumbnail when the length runs past the end of the data', () => {
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: 2},
            JPEGInterchangeFormatLength: {value: 9}
        };
        const dataView = getDataView('\x00\x00\x00\x00\x00\x01\x47\x11\x48\x12\x49\x13\x02\x03');

        expectNoThumbnail(dataView, thumbnailTags, OFFSET_TEST_VALUE);
    });

    it('should not extract a thumbnail when the offset is at the end of the data', () => {
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: 10},
            JPEGInterchangeFormatLength: {value: 1}
        };
        const dataView = getDataView('\x00\x00\x00\x00\x00\x01\x47\x11\x48\x12\x49\x13\x02\x03');

        expectNoThumbnail(dataView, thumbnailTags, OFFSET_TEST_VALUE);
    });

    it('should extract a thumbnail that ends exactly at the end of the data', () => {
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: 2},
            JPEGInterchangeFormatLength: {value: 8}
        };
        const image = '\x47\x11\x48\x12\x49\x13\x02\x03';
        const dataView = getDataView('\x00\x00\x00\x00\x00\x01' + image);

        const result = Thumbnail.get(dataView, thumbnailTags, OFFSET_TEST_VALUE);

        expect(result.type).to.equal('image/jpeg');
        expect(Array.from(new Uint8Array(result.image))).to.deep.equal(Array.from(getArrayBuffer(image)));
    });

    it('should bound the thumbnail by the DataView and not by the whole buffer', () => {
        // The declared range ends past the DataView but inside the buffer it is
        // a window into, so a bound taken from the buffer would let it through.
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: 2},
            JPEGInterchangeFormatLength: {value: 10}
        };
        const content = '\x00\x00\x00\x00\x00\x01\x47\x11\x48\x12\x49\x13\x02\x03';
        const dataView = getPaddedDataView(content, 5, 8);

        expectNoThumbnail(dataView, thumbnailTags, OFFSET_TEST_VALUE);
    });

    it('should not extract a thumbnail that starts before the DataView', () => {
        // The start is negative for the DataView but not for the buffer, so a
        // check made after adding the byteOffset would let it through and read
        // the padding in front of the DataView.
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: -7},
            JPEGInterchangeFormatLength: {value: 4}
        };
        const content = '\x00\x00\x00\x00\x00\x01\x47\x11\x48\x12\x49\x13\x02\x03';
        const dataView = getPaddedDataView(content, 5, 8);

        expectNoThumbnail(dataView, thumbnailTags, OFFSET_TEST_VALUE);
    });

    it('should not extract a thumbnail for an offset that is not a number', () => {
        // A tag count of 0 makes the value an empty array, which is truthy.
        // Both additions then concatenate instead of adding, and the data is
        // long enough that the resulting "46" would pass for a range inside it.
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: []},
            JPEGInterchangeFormatLength: {value: 6}
        };
        const dataView = getDataView('\x11'.repeat(50));

        expectNoThumbnail(dataView, thumbnailTags, OFFSET_TEST_VALUE);
    });

    it('should not extract a thumbnail for a faulty offset value', () => {
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: '<faulty value>'},
            JPEGInterchangeFormatLength: {value: 6}
        };
        const dataView = getDataView('\x00\x00\x00\x00\x00\x01\x47\x11\x48\x12\x49\x13\x02\x03');

        expectNoThumbnail(dataView, thumbnailTags, OFFSET_TEST_VALUE);
    });

    it('should not extract a thumbnail for a length that is not a number', () => {
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: 2},
            JPEGInterchangeFormatLength: {value: []}
        };
        const dataView = getDataView('\x00\x00\x00\x00\x00\x01\x47\x11\x48\x12\x49\x13\x02\x03');

        expectNoThumbnail(dataView, thumbnailTags, OFFSET_TEST_VALUE);
    });

    it('should not extract a thumbnail for a negative length', () => {
        // The length can be declared with a signed type too, and a negative one
        // puts the end of the slice before its start, which comes out empty.
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: 2},
            JPEGInterchangeFormatLength: {value: -6}
        };
        const dataView = getDataView('\x00\x00\x00\x00\x00\x01\x47\x11\x48\x12\x49\x13\x02\x03');

        expectNoThumbnail(dataView, thumbnailTags, OFFSET_TEST_VALUE);
    });

    it('should not extract a thumbnail for a fractional length', () => {
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: 2},
            JPEGInterchangeFormatLength: {value: 6.5}
        };
        const dataView = getDataView('\x00\x00\x00\x00\x00\x01\x47\x11\x48\x12\x49\x13\x02\x03');

        expectNoThumbnail(dataView, thumbnailTags, OFFSET_TEST_VALUE);
    });

    it('should not extract a thumbnail for a fractional offset', () => {
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: 2.5},
            JPEGInterchangeFormatLength: {value: 6}
        };
        const dataView = getDataView('\x00\x00\x00\x00\x00\x01\x47\x11\x48\x12\x49\x13\x02\x03');

        expectNoThumbnail(dataView, thumbnailTags, OFFSET_TEST_VALUE);
    });

    it('should not extract a thumbnail past the end of the data behind the DataView fallback', () => {
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: 2},
            JPEGInterchangeFormatLength: {value: 9}
        };
        const dataView = new DataViewWrapper(Buffer.from('\x00\x00\x00\x00\x00\x01\x47\x11\x48\x12\x49\x13\x02\x03', 'binary'));

        expectNoThumbnail(dataView, thumbnailTags, OFFSET_TEST_VALUE);
    });

    it('should extract a thumbnail for a negative offset that resolves inside the data', () => {
        const thumbnailTags = {
            JPEGInterchangeFormat: {value: -4},
            JPEGInterchangeFormatLength: {value: 6}
        };
        const image = '\x47\x11\x48\x12\x49\x13';
        const dataView = getDataView('\x00\x00\x00\x00\x00\x01' + image + '\x02\x03');

        const result = Thumbnail.get(dataView, thumbnailTags, 10);

        expect(result.type).to.equal('image/jpeg');
        expect(Array.from(new Uint8Array(result.image))).to.deep.equal(Array.from(getArrayBuffer(image)));
    });
});

function expectNoThumbnail(dataView, thumbnailTags, tiffHeaderOffset) {
    const keysBefore = Object.keys(thumbnailTags);

    const result = Thumbnail.get(dataView, thumbnailTags, tiffHeaderOffset);

    expect(result.image).to.be.undefined;
    expect(result.base64).to.be.undefined;
    expect(result.type).to.be.undefined;
    expect(Object.keys(result)).to.deep.equal(keysBefore);
}

function getPaddedDataView(content, pad, trailer = 0) {
    const buffer = new ArrayBuffer(pad + content.length + trailer);
    const view = new Uint8Array(buffer);
    view.fill(0x99, 0, pad);
    for (let i = 0; i < content.length; i++) {
        view[pad + i] = content.charCodeAt(i);
    }
    view.fill(0xaa, pad + content.length, buffer.byteLength);
    return new DataView(buffer, pad, content.length);
}
