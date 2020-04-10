/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getArrayBuffer} from './test-utils';
import Thumbnail from '../../src/thumbnail';

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
});
