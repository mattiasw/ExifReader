/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from '../../test-utils.js';
import {objectAssign} from '../../../../src/utils.js';
import Thumbnail from '../../../../src/thumbnail.js';
import {createTagFilter, filterTagsForReturn} from '../../../../src/tag-filter.js';
import {buildTagsFromMergeBlocks, mergeBlock} from '../../../../src/loadview-pipeline.js';
import {thumbnail, getSelectedThumbnail} from '../../../../src/composable/groups/thumbnail.js';
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

    describe('building its block from the Exif tags', () => {
        const VIEW = getDataView('\x00'.repeat(16));

        it('should build a main block from the thumbnail IFD of the main Exif block', () => {
            const exif = getExif({carried: 'main', decompressed: false});

            expect(thumbnail.fromExif({}, exif)).to.deep.equal({kind: 'thumbnail', dataView: VIEW, tiffHeaderOffset: 6, ifd1Tags: IFD1_TAGS, decompressed: false, rank: 'main'});
        });

        it('should build an embedded block from the thumbnail IFD of any other Exif block', () => {
            for (const carried of ['rawProfile', 'brob']) {
                const exif = getExif({carried, decompressed: true});

                expect(thumbnail.fromExif({}, exif), carried).to.deep.equal({kind: 'thumbnail', dataView: VIEW, tiffHeaderOffset: 6, ifd1Tags: IFD1_TAGS, decompressed: true, rank: 'embedded'});
            }
        });

        it('should build no block without a thumbnail IFD', () => {
            expect(thumbnail.fromExif({}, getExif({carried: 'main', decompressed: false, thumbnailIfdTags: undefined}))).to.not.be.ok;
        });

        function getExif(overrides) {
            return objectAssign({view: VIEW, tiffHeaderOffset: 6, byteOrder: 'byte order', makerNoteOffset: undefined, thumbnailIfdTags: IFD1_TAGS}, overrides);
        }
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

    describe('the merge modes', () => {
        const MAIN_WITH_IMAGE = {type: 'image/jpeg', image: 'main'};
        const MAIN_WITHOUT_IMAGE = {Compression: {value: 1}};

        it('should remove an existing Thumbnail tag when there is no candidate', () => {
            const tags = buildThumbnailTags({candidates: [], tags: {Thumbnail: {value: 'existing'}}});

            expect(tags).to.not.have.property('Thumbnail');
            expect(tags).to.not.have.property('thumbnail');
        });

        it('should replace an existing Thumbnail and thumbnail tag with the selected thumbnail', () => {
            const tags = buildThumbnailTags({
                candidates: [getCandidate('main', MAIN_WITH_IMAGE)],
                tags: {Thumbnail: {value: 'existing'}, thumbnail: {value: 'existing'}},
            });

            expect(tags.thumbnail).to.equal(MAIN_WITH_IMAGE);
            expect(tags).to.not.have.property('Thumbnail');
        });

        it('should remove an existing thumbnail tag when there is no candidate', () => {
            const tags = buildThumbnailTags({candidates: [], tags: {thumbnail: {value: 'existing'}}});

            expect(tags).to.not.have.property('thumbnail');
        });

        it('should keep a main thumbnail without an image', () => {
            const tags = buildThumbnailTags({candidates: [getCandidate('main', MAIN_WITHOUT_IMAGE)]});

            expect(tags.thumbnail).to.equal(MAIN_WITHOUT_IMAGE);
        });

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should return an embedded thumbnail top level when there is no main one in ${mode} mode`, () => {
                const embedded = getEmbeddedThumbnail('raw');

                const tags = buildThumbnailTags({
                    candidates: [{slot: 'exif', mode: 'nested', blocks: [
                        {slot: 'exif', group: 'exif', mode: 'merge', tags: {Model: {value: 'model'}}},
                        getCandidate('embedded', embedded),
                    ]}],
                    expanded,
                });

                expect(tags.thumbnail).to.equal(embedded);
                expect(expanded ? tags.exif : tags).to.have.property('Model');
                if (expanded) {
                    expect(tags.exif).to.not.have.property('Thumbnail');
                }
            });
        }

        it('should return the main thumbnail when it has an image, over an embedded one', () => {
            const tags = buildThumbnailTags({candidates: [getCandidate('embedded', getEmbeddedThumbnail('raw')), getCandidate('main', MAIN_WITH_IMAGE)]});

            expect(tags.thumbnail).to.equal(MAIN_WITH_IMAGE);
        });

        it('should return an embedded thumbnail with an image over a main one without', () => {
            const embedded = getEmbeddedThumbnail('raw');

            const tags = buildThumbnailTags({candidates: [getCandidate('main', MAIN_WITHOUT_IMAGE), getCandidate('embedded', embedded)]});

            expect(tags.thumbnail).to.equal(embedded);
        });

        it('should return the main thumbnail without an image when no embedded one has an image', () => {
            const tags = buildThumbnailTags({candidates: [
                getCandidate('main', MAIN_WITHOUT_IMAGE),
                getCandidate('embedded', {type: 'image/jpeg'}),
                getCandidate('embedded', {Compression: {value: 6}}),
            ]});

            expect(tags.thumbnail).to.equal(MAIN_WITHOUT_IMAGE);
        });

        it('should never return an embedded thumbnail without an image', () => {
            const tags = buildThumbnailTags({candidates: [getCandidate('embedded', {type: 'image/jpeg'}), getCandidate('embedded', {Compression: {value: 6}})]});

            expect(tags).to.not.have.property('thumbnail');
        });

        it('should return the first embedded thumbnail with an image in merge order', () => {
            const firstWithImage = getEmbeddedThumbnail('first');

            const tags = buildThumbnailTags({candidates: [
                {slot: 'deferredPngText', mode: 'nested', blocks: [getCandidate('embedded', getEmbeddedThumbnail('deferred'))]},
                getCandidate('embedded', {type: 'image/jpeg'}),
                {slot: 'pngText', mode: 'nested', blocks: [getCandidate('embedded', firstWithImage), getCandidate('embedded', getEmbeddedThumbnail('second'))]},
            ]});

            expect(tags.thumbnail).to.equal(firstWithImage);
        });

        for (const [description, tagFilter] of [
            ['the thumbnail group is filtered out', createTagFilter({includeTags: {file: true}})],
            ['the Thumbnail tag is filtered out', createTagFilter({excludeTags: {thumbnail: ['Thumbnail']}})],
        ]) {
            it(`should return no thumbnail, and still remove an existing Thumbnail and thumbnail tag, when ${description}`, () => {
                const tags = buildThumbnailTags({
                    candidates: [getCandidate('main', MAIN_WITH_IMAGE)],
                    tagFilter,
                    tags: {Thumbnail: {value: 'existing'}, thumbnail: {value: 'existing'}},
                });

                expect(tags).to.not.have.property('Thumbnail');
                expect(tags).to.not.have.property('thumbnail');
            });
        }

        it('should take the candidates given to mergeBlock', () => {
            const thumbnails = [{rank: 'embedded', thumbnail: getEmbeddedThumbnail('raw')}];

            const tags = mergeBlock({
                block: {slot: 'thumbnail', mode: 'thumbnail'},
                parsedGroups: {},
                expanded: false,
                tagFilter: createTagFilter(),
                thumbnails,
                tags: {},
                modes: thumbnail.mergeModes,
                deps: {objectAssign, filterTagsForReturn},
            });

            expect(tags.thumbnail).to.equal(thumbnails[0].thumbnail);
        });

        function getEmbeddedThumbnail(image) {
            return {type: 'image/jpeg', image};
        }

        function getCandidate(rank, thumbnailTags) {
            return objectAssign({group: 'thumbnail', tags: thumbnailTags}, thumbnail.merge({rank}));
        }

        function buildThumbnailTags({candidates, expanded = false, tagFilter = createTagFilter(), tags = {}}) {
            return buildTagsFromMergeBlocks({
                mergeBlocks: candidates.concat([{slot: 'thumbnail', mode: 'thumbnail'}, {slot: 'file', group: 'file', mode: 'assign', tags}]),
                parsedGroups: {},
                expanded,
                tagFilter,
                dataView: {},
                fileType: undefined,
                modes: thumbnail.mergeModes,
                deps: {objectAssign, filterTagsForReturn},
            });
        }
    });

    describe('selecting the thumbnail', () => {
        const MAIN_WITH_IMAGE = {type: 'image/jpeg', image: 'main'};
        const MAIN_WITHOUT_IMAGE = {Compression: {value: 1}};
        const EMBEDDED_WITH_IMAGE = {type: 'image/jpeg', image: 'embedded'};

        it('should select nothing when the thumbnail group is filtered out', () => {
            const tagFilter = {shouldReturnGroup: (group) => group !== 'thumbnail', shouldReturnTag: () => true};
            const context = getSelectionContext([{rank: 'main', thumbnail: MAIN_WITH_IMAGE}], tagFilter);

            expect(getSelectedThumbnail(context)).to.equal(undefined);
        });

        it('should select nothing when the Thumbnail tag is filtered out', () => {
            const context = getSelectionContext([{rank: 'main', thumbnail: MAIN_WITH_IMAGE}], createTagFilter({excludeTags: {thumbnail: ['Thumbnail']}}));

            expect(getSelectedThumbnail(context)).to.equal(undefined);
        });

        it('should select the main thumbnail when it has an image', () => {
            const context = getSelectionContext([{rank: 'embedded', thumbnail: EMBEDDED_WITH_IMAGE}, {rank: 'main', thumbnail: MAIN_WITH_IMAGE}]);

            expect(getSelectedThumbnail(context)).to.equal(MAIN_WITH_IMAGE);
        });

        it('should select an embedded thumbnail with an image over a main one without', () => {
            const context = getSelectionContext([{rank: 'main', thumbnail: MAIN_WITHOUT_IMAGE}, {rank: 'embedded', thumbnail: EMBEDDED_WITH_IMAGE}]);

            expect(getSelectedThumbnail(context)).to.equal(EMBEDDED_WITH_IMAGE);
        });

        it('should select the main thumbnail without an image when no embedded one has an image', () => {
            const context = getSelectionContext([{rank: 'main', thumbnail: MAIN_WITHOUT_IMAGE}, {rank: 'embedded', thumbnail: {type: 'image/jpeg'}}]);

            expect(getSelectedThumbnail(context)).to.equal(MAIN_WITHOUT_IMAGE);
        });

        it('should select nothing when there is no candidate', () => {
            expect(getSelectedThumbnail(getSelectionContext([]))).to.equal(undefined);
        });

        function getSelectionContext(thumbnails, tagFilter = createTagFilter()) {
            return {thumbnails, tagFilter};
        }
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
