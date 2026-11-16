/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from '../../test-utils.js';
import Thumbnail from '../../../../src/thumbnail.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {thumbnail} from '../../../../src/composable/groups/thumbnail.js';
import {getContext, recordCalls} from '../test-context.js';

describe('composable/groups/thumbnail', () => {
    const restores = [];
    const IFD1_TAGS = {JPEGInterchangeFormat: {value: 10}, JPEGInterchangeFormatLength: {value: 100}};

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should merge as a thumbnail candidate of the block\'s rank', () => {
        expect(thumbnail.merge({rank: 'main'})).to.deep.equal({slot: 'thumbnail', mode: 'thumbnailCandidate', rank: 'main'});
        expect(thumbnail.merge({rank: 'embedded'})).to.deep.equal({slot: 'thumbnail', mode: 'thumbnailCandidate', rank: 'embedded'});
    });

    it('should read the main block\'s thumbnail even without an image', () => {
        const getBase64Image = () => 'b64';
        const gets = swapThumbnailGet(() => ({type: 'tiff'}));
        const ctx = getContext({getBase64Image});
        const block = getBlock({rank: 'main'});

        expect(thumbnail.read(block, ctx)).to.deep.equal({tags: {type: 'tiff'}});
        expect(gets).to.deep.equal([[block.dataView, IFD1_TAGS, 6, getBase64Image]]);
        expect(ctx.hasEmbeddedThumbnailImage).to.not.be.ok;
    });

    it('should filter the IFD1 tags before reading the thumbnail', () => {
        const gets = swapThumbnailGet(() => ({}));
        const tagFilter = createTagFilter({excludeTags: {thumbnail: ['JPEGInterchangeFormatLength']}});

        thumbnail.read(getBlock({rank: 'main'}), getContext({tagFilter}));

        expect(gets[0][1]).to.deep.equal({JPEGInterchangeFormat: {value: 10}});
    });

    it('should read nothing when the Thumbnail tag is not returned', () => {
        const gets = swapThumbnailGet(() => ({}));
        const tagFilter = createTagFilter({excludeTags: {thumbnail: ['Thumbnail']}});

        expect(thumbnail.read(getBlock({rank: 'main'}), getContext({tagFilter}))).to.equal(undefined);
        expect(gets).to.have.lengthOf(0);
    });

    describe('an embedded thumbnail', () => {
        it('should be a candidate with an image, counted against the copy bound', () => {
            swapThumbnailGet(() => ({image: 'image'}));
            const ctx = getContext();

            expect(thumbnail.read(getBlock({rank: 'embedded'}), ctx)).to.deep.equal({tags: {image: 'image'}});
            expect(ctx.copiedThumbnailSize).to.equal(100);
            expect(ctx.hasEmbeddedThumbnailImage).to.equal(true);
        });

        it('should not be a candidate without an image', () => {
            swapThumbnailGet(() => ({}));
            const ctx = getContext();

            expect(thumbnail.read(getBlock({rank: 'embedded'}), ctx)).to.equal(undefined);
            expect(ctx.copiedThumbnailSize || 0).to.equal(0);
        });

        it('should not be a candidate once an uncompressed block gave one', () => {
            const gets = swapThumbnailGet(() => ({image: 'image'}));
            const ctx = getContext();
            ctx.hasEmbeddedThumbnailImage = true;

            expect(thumbnail.read(getBlock({rank: 'embedded'}), ctx)).to.equal(undefined);
            expect(gets).to.have.lengthOf(0);
        });

        it('should let every decompressed block try', () => {
            swapThumbnailGet(() => ({image: 'image'}));
            const ctx = getContext();

            expect(thumbnail.read(getBlock({rank: 'embedded', decompressed: true}), ctx)).to.not.equal(undefined);
            expect(ctx.hasEmbeddedThumbnailImage).to.not.be.ok;
            expect(thumbnail.read(getBlock({rank: 'embedded', decompressed: true}), ctx)).to.not.equal(undefined);
            expect(ctx.copiedThumbnailSize).to.equal(200);
        });

        it('should not be a candidate past the copy bound or without a numeric length', () => {
            const gets = swapThumbnailGet(() => ({image: 'image'}));
            const ctx = getContext();
            const room = 2 * 16 + 64 * 1024;

            expect(thumbnail.read(getBlock({rank: 'embedded', length: room + 1}), ctx)).to.equal(undefined);
            expect(thumbnail.read(getBlock({rank: 'embedded', length: 'many'}), ctx)).to.equal(undefined);
            expect(thumbnail.read(getBlock({rank: 'embedded', ifd1Tags: {JPEGInterchangeFormat: {value: 10}}}), ctx)).to.equal(undefined);
            expect(gets).to.have.lengthOf(0);
            expect(thumbnail.read(getBlock({rank: 'embedded', length: room}), ctx)).to.not.equal(undefined);
        });

        it('should bound the embedded thumbnails by 2 times the file size plus 64 KiB', () => {
            swapThumbnailGet(() => ({image: 'image'}));
            const bound = 2 * 1000 + 64 * 1024;

            expect(thumbnail.read(getBlock({rank: 'embedded', length: bound + 1}), getContext({dataView: getDataView('\x00'.repeat(1000))}))).to.equal(undefined);
            expect(thumbnail.read(getBlock({rank: 'embedded', length: bound}), getContext({dataView: getDataView('\x00'.repeat(1000))}))).to.not.equal(undefined);
        });

        it('should bound the decompressed blocks\' thumbnails together', () => {
            swapThumbnailGet(() => ({image: 'image'}));
            const ctx = getContext({dataView: getDataView('\x00'.repeat(1000))});
            const bound = 2 * 1000 + 64 * 1024;

            expect(thumbnail.read(getBlock({rank: 'embedded', decompressed: true, length: bound - 10}), ctx)).to.not.equal(undefined);
            expect(thumbnail.read(getBlock({rank: 'embedded', decompressed: true, length: 11}), ctx)).to.equal(undefined);
            expect(thumbnail.read(getBlock({rank: 'embedded', decompressed: true, length: 10}), ctx)).to.not.equal(undefined);
            expect(ctx.copiedThumbnailSize).to.equal(bound);
        });

        it('should accept an empty thumbnail without drawing on the bound', () => {
            swapThumbnailGet(() => ({image: 'image'}));
            const ctx = getContext();

            expect(thumbnail.read(getBlock({rank: 'embedded', decompressed: true, length: 0}), ctx)).to.not.equal(undefined);
            expect(ctx.copiedThumbnailSize).to.equal(0);
        });

        for (const length of [-1, 1.5, NaN, Infinity, null, '5']) {
            it(`should not be a candidate with a length of ${describeValue(length)}`, () => {
                const gets = swapThumbnailGet(() => ({image: 'image'}));
                const ctx = getContext();

                expect(thumbnail.read(getBlock({rank: 'embedded', length}), ctx)).to.equal(undefined);
                expect(gets).to.have.lengthOf(0);
                expect(ctx.copiedThumbnailSize).to.equal(undefined);
            });
        }

        it('should not be a candidate when the file size is NaN', () => {
            const gets = swapThumbnailGet(() => ({image: 'image'}));

            expect(thumbnail.read(getBlock({rank: 'embedded'}), getContext({dataView: {byteLength: NaN}}))).to.equal(undefined);
            expect(gets).to.have.lengthOf(0);
        });

        it('should give each load the whole bound', () => {
            swapThumbnailGet(() => ({image: 'image'}));
            const bound = 2 * 16 + 64 * 1024;

            expect(thumbnail.read(getBlock({rank: 'embedded', decompressed: true, length: bound}), getContext())).to.not.equal(undefined);
            expect(thumbnail.read(getBlock({rank: 'embedded', decompressed: true, length: bound}), getContext())).to.not.equal(undefined);
        });
    });

    function getBlock({rank, decompressed = false, length = 100, ifd1Tags = undefined}) {
        return {
            kind: 'thumbnail',
            dataView: {},
            tiffHeaderOffset: 6,
            ifd1Tags: ifd1Tags || {JPEGInterchangeFormat: {value: 10}, JPEGInterchangeFormatLength: {value: length}},
            decompressed,
            rank,
        };
    }

    function swapThumbnailGet(result) {
        const {calls, restore} = recordCalls(Thumbnail, 'get', result);
        restores.push(restore);
        return calls;
    }

    function describeValue(value) {
        return typeof value === 'string' ? `the string '${value}'` : String(value);
    }
});
