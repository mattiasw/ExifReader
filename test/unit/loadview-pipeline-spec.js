/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {objectAssign} from '../../src/utils.js';
import Constants from '../../src/constants.js';
import Thumbnail from '../../src/thumbnail.js';
import {swapProperties} from './test-utils.js';
import {
    addPngTextReadTagsToTagsAndGroups,
    applyMergeStep,
    buildTagsFromMergeSteps,
    mergeAssignGroup,
    mergeMergeGroup,
} from '../../src/loadview-pipeline.js';

const restoreFunctions = [];

describe('loadView pipeline module', function () {
    afterEach(function () {
        while (restoreFunctions.length > 0) {
            restoreFunctions.pop()();
        }
    });

    it('should merge assign groups in expanded mode', function () {
        const originalTags = {};
        const returnedTags = {MyTag: {value: 1}};

        const tags = mergeAssignGroup(
            originalTags,
            'exif',
            returnedTags,
            true,
            {objectAssign}
        );

        expect(tags).to.equal(originalTags);
        expect(tags.exif).to.equal(returnedTags);
    });

    it('should merge assign groups in flat mode', function () {
        const originalTags = {Existing: {value: 'a'}};
        const returnedTags = {Collision: {value: 'b'}};

        const tags = mergeAssignGroup(
            originalTags,
            'exif',
            returnedTags,
            false,
            {objectAssign}
        );

        expect(tags).to.not.equal(originalTags);
        expect(tags.Existing.value).to.equal('a');
        expect(tags.Collision.value).to.equal('b');
    });

    it('should merge merge-groups in expanded mode', function () {
        const originalTags = {exif: {A: {value: 1}}};

        const tags = mergeMergeGroup(
            originalTags,
            'exif',
            {B: {value: 2}},
            true,
            {objectAssign}
        );

        expect(tags).to.equal(originalTags);
        expect(tags.exif.A.value).to.equal(1);
        expect(tags.exif.B.value).to.equal(2);
    });

    it('should include embedded exif/iptc even when png is excluded', function () {
        const parsedGroups = {};
        const tagFilter = createTagFilter({
            returnGroups: {
                exif: true,
                iptc: true,
                png: false,
            },
        });

        const tags = addPngTextReadTagsToTagsAndGroups({
            readTags: {PngTag: {value: 'z'}},
            embeddedExifTags: {EmbeddedExif: {value: 'x'}},
            embeddedIptcTags: {EmbeddedIptc: {value: 'y'}},
            parsedGroups,
            expanded: false,
            tagFilter,
            tags: {},
            deps: createPipelineDeps(),
        });

        expect(tags.EmbeddedExif.value).to.equal('x');
        expect(tags.EmbeddedIptc.value).to.equal('y');
        expect(tags.PngTag).to.equal(undefined);
        expect(parsedGroups.exif.EmbeddedExif.value).to.equal('x');
        expect(parsedGroups.iptc.EmbeddedIptc.value).to.equal('y');
    });

    it('should merge PNG text tags named __exif and __iptc into the png group in expanded mode', function () {
        const readTags = getPngTextTagsWithSentinelNames();
        const parsedGroups = {};

        const tags = addPngTextReadTagsToTagsAndGroups({
            readTags,
            parsedGroups,
            expanded: true,
            tagFilter: createTagFilter({}),
            tags: {},
            deps: createPipelineDeps(),
        });

        expect(tags.exif).to.equal(undefined);
        expect(tags.iptc).to.equal(undefined);
        expect(parsedGroups.exif).to.equal(undefined);
        expect(parsedGroups.iptc).to.equal(undefined);
        expect(tags.png).to.deep.equal(getPngTextTagsWithSentinelNames());
        expect(readTags).to.deep.equal(getPngTextTagsWithSentinelNames());
    });

    it('should merge PNG text tags named __exif and __iptc into the top level in flat mode', function () {
        const readTags = getPngTextTagsWithSentinelNames();
        const parsedGroups = {};

        const tags = addPngTextReadTagsToTagsAndGroups({
            readTags,
            parsedGroups,
            expanded: false,
            tagFilter: createTagFilter({}),
            tags: {},
            deps: createPipelineDeps(),
        });

        expect(tags).to.deep.equal(getPngTextTagsWithSentinelNames());
        expect(parsedGroups.exif).to.equal(undefined);
        expect(parsedGroups.iptc).to.equal(undefined);
        expect(readTags).to.deep.equal(getPngTextTagsWithSentinelNames());
    });

    function getPngTextTagsWithSentinelNames() {
        return {
            __exif: {value: 'FROMFILE', description: 'FROMFILE'},
            __iptc: {value: 'FROMFILE', description: 'FROMFILE'},
        };
    }

    it('should not delete an existing Thumbnail tag if thumbnailIfdTags is missing', function () {
        const tagFilter = createTagFilter({
            returnGroups: {thumbnail: true},
            returnTags: {'thumbnail.Thumbnail': true},
        });

        const tags = applyMergeStep({
            step: {type: 'thumbnail'},
            deferredResults: {},
            parsedGroups: {},
            expanded: false,
            tagFilter,
            dataView: {},
            tiffHeaderOffset: undefined,
            fileType: undefined,
            thumbnailIfdTags: undefined,
            tags: {Thumbnail: {value: 'existing'}},
            deps: createPipelineDeps(),
        });

        expect(tags.Thumbnail.value).to.equal('existing');
    });

    it('should keep a Thumbnail tag without an image if there are thumbnail IFD tags', function () {
        const tagFilter = createTagFilter({
            returnGroups: {thumbnail: true},
            returnTags: {'thumbnail.Thumbnail': true},
        });
        const thumbnailIfdTags = {Compression: {value: 1}};
        const deps = createPipelineDeps();
        deps.Thumbnail = Thumbnail;

        const tags = applyMergeStep({
            step: {type: 'thumbnail'},
            deferredResults: {},
            parsedGroups: {},
            expanded: false,
            tagFilter,
            dataView: {},
            tiffHeaderOffset: 0,
            fileType: undefined,
            thumbnailIfdTags,
            tags: {},
            deps,
        });

        expect(tags.Thumbnail).to.deep.equal({Compression: {value: 1}});
    });

    it('should pass the filtered thumbnail IFD tags, not the raw ones, to Thumbnail.get', function () {
        const tagFilter = createTagFilter({
            returnGroups: {thumbnail: true},
            returnTags: {'thumbnail.Thumbnail': true},
        });
        const thumbnailIfdTags = {Compression: {value: 1}};
        const filteredThumbnailIfdTags = {Compression: {value: 1}, Filtered: true};
        const deps = createPipelineDeps();
        let filterArguments;
        let receivedThumbnailIfdTags;
        deps.filterTagsForParse = (...args) => {
            filterArguments = args;

            return filteredThumbnailIfdTags;
        };
        deps.Thumbnail = {
            get(view, parsedThumbnailIfdTags) {
                receivedThumbnailIfdTags = parsedThumbnailIfdTags;

                return undefined;
            },
        };

        applyMergeStep({
            step: {type: 'thumbnail'},
            deferredResults: {},
            parsedGroups: {},
            expanded: false,
            tagFilter,
            dataView: {},
            tiffHeaderOffset: 0,
            fileType: undefined,
            thumbnailIfdTags,
            tags: {},
            deps,
        });

        expect(filterArguments).to.deep.equal(['thumbnail', thumbnailIfdTags, tagFilter]);
        expect(receivedThumbnailIfdTags).to.equal(filteredThumbnailIfdTags);
    });

    it('should not return a Thumbnail tag for the thumbnail IFD of embedded PNG text Exif tags', function () {
        const parsedGroups = {};

        const tags = buildTagsFromMergeSteps({
            mergeSteps: [
                {type: 'processPngTextReadTagsDeferredList', deferredKey: 'pngText'},
                {type: 'thumbnail'},
            ],
            deferredResults: {
                pngText: [
                    {
                        embeddedExifTags: {
                            MyExifTag: {value: 42},
                            Thumbnail: {JPEGInterchangeFormat: {value: 272}},
                        },
                    },
                ],
            },
            parsedGroups,
            expanded: false,
            tagFilter: createTagFilter({}),
            dataView: {},
            tiffHeaderOffset: undefined,
            fileType: undefined,
            pngTextIsAsync: false,
            thumbnailIfdTags: undefined,
            deps: createPipelineDeps(),
        });

        expect(tags.MyExifTag.value).to.equal(42);
        expect(tags.Thumbnail).to.equal(undefined);
        expect(parsedGroups.exif.Thumbnail).to.deep.equal({JPEGInterchangeFormat: {value: 272}});
    });

    it('should keep a PNG text tag named Thumbnail when the thumbnail group is returned', function () {
        const tags = buildTagsFromMergeSteps({
            mergeSteps: [
                {type: 'processPngTextReadTagsDeferredList', deferredKey: 'pngText'},
                {type: 'thumbnail'},
            ],
            deferredResults: {
                pngText: [
                    {readTags: {Thumbnail: {value: 'my thumbnail note'}}},
                    {embeddedExifTags: {Thumbnail: {JPEGInterchangeFormat: {value: 272}}}},
                ],
            },
            parsedGroups: {},
            expanded: false,
            tagFilter: createTagFilter({}),
            dataView: {},
            tiffHeaderOffset: undefined,
            fileType: undefined,
            pngTextIsAsync: false,
            thumbnailIfdTags: undefined,
            deps: createPipelineDeps(),
        });

        expect(tags.Thumbnail.value).to.equal('my thumbnail note');
    });

    it('should apply the gps step when Exif tags are included', function () {
        swap(Constants, {USE_EXIF: true});

        const tags = applyGpsStep({MyGpsTag: {value: 1}});

        expect(tags.gps.MyGpsTag.value).to.equal(1);
    });

    it('should not apply the gps step when Exif tags have been excluded', function () {
        swap(Constants, {USE_EXIF: false});

        const tags = applyGpsStep({MyGpsTag: {value: 1}});

        expect(tags.gps).to.equal(undefined);
        expect(tags.MyTag.value).to.equal(42);
    });

    it('should apply the composite step when Exif tags are included', function () {
        swap(Constants, {USE_EXIF: true, USE_XMP: false});

        const tags = applyCompositeStep({MyCompositeTag: {value: 4711}});

        expect(tags.MyCompositeTag.value).to.equal(4711);
    });

    it('should apply the composite step when XMP tags are included', function () {
        swap(Constants, {USE_EXIF: false, USE_XMP: true});

        const tags = applyCompositeStep({MyCompositeTag: {value: 4711}});

        expect(tags.MyCompositeTag.value).to.equal(4711);
    });

    it('should not apply the composite step when Exif and XMP tags have been excluded', function () {
        swap(Constants, {USE_EXIF: false, USE_XMP: false});

        const tags = applyCompositeStep({MyCompositeTag: {value: 4711}});

        expect(tags.MyCompositeTag).to.equal(undefined);
        expect(tags.MyTag.value).to.equal(42);
    });

    it('should remove xmp._raw in flat mode', function () {
        const tagFilter = createTagFilter({returnGroups: {xmp: true}});

        const tags = applyMergeStep({
            step: {
                type: 'mergeXmpGroupAssign',
                parsedTags: {Collision: {value: 1}, _raw: '<xml/>'},
            },
            deferredResults: {},
            parsedGroups: {},
            expanded: false,
            tagFilter,
            dataView: {},
            tiffHeaderOffset: undefined,
            fileType: undefined,
            thumbnailIfdTags: undefined,
            tags: {},
            deps: createPipelineDeps(),
        });

        expect(tags.Collision.value).to.equal(1);
        expect(tags._raw).to.equal(undefined);
    });

    describe('metadataRange step', function () {
        it('should compute start, end, complete and blocks in expanded mode', function () {
            const blocks = [
                {type: 'exif', start: 2, end: 100},
                {type: 'xmp', start: 100, end: 200},
            ];

            const tags = applyMergeStep({
                step: {type: 'metadataRange', metadataBlocks: blocks},
                deferredResults: {},
                parsedGroups: {},
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 1024},
                tiffHeaderOffset: undefined,
                fileType: undefined,
                thumbnailIfdTags: undefined,
                tags: {},
                deps: createPipelineDeps(),
            });

            expect(tags.metadataRange).to.deep.equal({
                start: 2,
                end: 200,
                complete: true,
                blocks: [
                    {type: 'exif', start: 2, end: 100},
                    {type: 'xmp', start: 100, end: 200},
                ],
            });
        });

        it('should mark complete:false when the step carries metadataTruncated, even if all block ends fit', function () {
            const tags = applyMergeStep({
                step: {
                    type: 'metadataRange',
                    metadataBlocks: [{type: 'exif', start: 2, end: 100}],
                    metadataTruncated: true,
                },
                deferredResults: {},
                parsedGroups: {},
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 1024},
                tiffHeaderOffset: undefined,
                fileType: undefined,
                thumbnailIfdTags: undefined,
                tags: {},
                deps: createPipelineDeps(),
            });

            expect(tags.metadataRange.complete).to.equal(false);
            expect(tags.metadataRange.end).to.equal(100);
        });

        it('should mark complete:false when a block end exceeds dataView.byteLength', function () {
            const tags = applyMergeStep({
                step: {
                    type: 'metadataRange',
                    metadataBlocks: [
                        {type: 'exif', start: 2, end: 9999},
                    ],
                },
                deferredResults: {},
                parsedGroups: {},
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 1024},
                tiffHeaderOffset: undefined,
                fileType: undefined,
                thumbnailIfdTags: undefined,
                tags: {},
                deps: createPipelineDeps(),
            });

            expect(tags.metadataRange.end).to.equal(9999);
            expect(tags.metadataRange.complete).to.equal(false);
        });

        it('should not attach metadataRange in flat mode', function () {
            const tags = applyMergeStep({
                step: {
                    type: 'metadataRange',
                    metadataBlocks: [{type: 'exif', start: 0, end: 100}],
                },
                deferredResults: {},
                parsedGroups: {},
                expanded: false,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 1024},
                tiffHeaderOffset: undefined,
                fileType: undefined,
                thumbnailIfdTags: undefined,
                tags: {},
                deps: createPipelineDeps(),
            });

            expect(tags.metadataRange).to.equal(undefined);
        });

        it('should not attach metadataRange when there are no blocks', function () {
            const tags = applyMergeStep({
                step: {type: 'metadataRange', metadataBlocks: []},
                deferredResults: {},
                parsedGroups: {},
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 1024},
                tiffHeaderOffset: undefined,
                fileType: undefined,
                thumbnailIfdTags: undefined,
                tags: {},
                deps: createPipelineDeps(),
            });

            expect(tags.metadataRange).to.equal(undefined);
        });

        it('should sort blocks by start', function () {
            const tags = applyMergeStep({
                step: {
                    type: 'metadataRange',
                    metadataBlocks: [
                        {type: 'xmp', start: 100, end: 200},
                        {type: 'exif', start: 2, end: 100},
                    ],
                },
                deferredResults: {},
                parsedGroups: {},
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 1024},
                tiffHeaderOffset: undefined,
                fileType: undefined,
                thumbnailIfdTags: undefined,
                tags: {},
                deps: createPipelineDeps(),
            });

            expect(tags.metadataRange.blocks[0].type).to.equal('exif');
            expect(tags.metadataRange.blocks[1].type).to.equal('xmp');
        });

        it('should skip MPF entries with ImageSize 0 (degenerate zero-length block)', function () {
            const parsedGroups = {
                mpf: {
                    Images: [
                        {ImageOffset: {value: 0}, ImageSize: {value: 1000}},
                        {ImageOffset: {value: 5000}, ImageSize: {value: 0}},
                        {ImageOffset: {value: 8000}, ImageSize: {value: 500}},
                    ],
                },
            };

            const tags = applyMergeStep({
                step: {
                    type: 'metadataRange',
                    metadataBlocks: [{type: 'mpf', start: 2, end: 200}],
                },
                deferredResults: {},
                parsedGroups,
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 9000},
                tiffHeaderOffset: undefined,
                fileType: undefined,
                thumbnailIfdTags: undefined,
                tags: {},
                deps: createPipelineDeps(),
            });

            const mpfImageBlocks = tags.metadataRange.blocks.filter(
                (block) => block.type === 'mpfImage'
            );
            expect(mpfImageBlocks).to.deep.equal([
                {type: 'mpfImage', start: 8000, end: 8500},
            ]);
        });

        it('should skip malformed MPF Image entries without contaminating metadataRange', function () {
            const parsedGroups = {
                mpf: {
                    Images: [
                        {ImageOffset: {value: 0}, ImageSize: {value: 1000}},
                        // missing ImageOffset entirely
                        {ImageSize: {value: 500}},
                        // ImageOffset.value not a number
                        {ImageOffset: {value: undefined}, ImageSize: {value: 500}},
                        // ImageSize.value not a number
                        {ImageOffset: {value: 5000}, ImageSize: {value: undefined}},
                        // valid entry
                        {ImageOffset: {value: 5000}, ImageSize: {value: 1000}},
                    ],
                },
            };

            const tags = applyMergeStep({
                step: {
                    type: 'metadataRange',
                    metadataBlocks: [{type: 'mpf', start: 2, end: 200}],
                },
                deferredResults: {},
                parsedGroups,
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 8000},
                tiffHeaderOffset: undefined,
                fileType: undefined,
                thumbnailIfdTags: undefined,
                tags: {},
                deps: createPipelineDeps(),
            });

            const mpfImageBlocks = tags.metadataRange.blocks.filter(
                (block) => block.type === 'mpfImage'
            );
            expect(mpfImageBlocks).to.deep.equal([
                {type: 'mpfImage', start: 5000, end: 6000},
            ]);
            expect(tags.metadataRange.end).to.equal(6000);
            expect(Number.isFinite(tags.metadataRange.end)).to.equal(true);
            expect(Number.isFinite(tags.metadataRange.start)).to.equal(true);
        });

        it('should add mpfImage blocks from parsedGroups.mpf.Images', function () {
            const parsedGroups = {
                mpf: {
                    Images: [
                        // First MPF entry has ImageOffset === 0 (the primary
                        // image itself); skip it.
                        {ImageOffset: {value: 0}, ImageSize: {value: 1000}},
                        {ImageOffset: {value: 5000}, ImageSize: {value: 2000}},
                        {ImageOffset: {value: 8000}, ImageSize: {value: 500}},
                    ],
                },
            };

            const tags = applyMergeStep({
                step: {
                    type: 'metadataRange',
                    metadataBlocks: [
                        {type: 'mpf', start: 2, end: 200},
                    ],
                },
                deferredResults: {},
                parsedGroups,
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 9000},
                tiffHeaderOffset: undefined,
                fileType: undefined,
                thumbnailIfdTags: undefined,
                tags: {},
                deps: createPipelineDeps(),
            });

            expect(tags.metadataRange.end).to.equal(8500);
            const mpfImageBlocks = tags.metadataRange.blocks.filter(
                (block) => block.type === 'mpfImage'
            );
            expect(mpfImageBlocks).to.deep.equal([
                {type: 'mpfImage', start: 5000, end: 7000},
                {type: 'mpfImage', start: 8000, end: 8500},
            ]);
        });
    });

    it('should apply merge steps in order', function () {
        const tagFilter = createTagFilter({});

        const tags = buildTagsFromMergeSteps({
            mergeSteps: [
                {
                    type: 'mergeGroupAssign',
                    groupKey: 'file',
                    parsedTags: {Collision: {value: 'first'}},
                },
                {
                    type: 'mergeGroupAssign',
                    groupKey: 'exif',
                    parsedTags: {Collision: {value: 'second'}},
                },
            ],
            deferredResults: {},
            parsedGroups: {},
            expanded: false,
            tagFilter,
            dataView: {},
            tiffHeaderOffset: undefined,
            fileType: undefined,
            pngTextChunks: [],
            pngTextIsAsync: false,
            thumbnailIfdTags: undefined,
            deps: createPipelineDeps(),
        });

        expect(tags.Collision.value).to.equal('second');
    });
    describe('processPngTextReadTagsDeferredList step', function () {
        const MANY_ITEMS = 8000;
        const MERGE_BUDGET_MS = 200;

        it('should merge many deferred items in linear time in flat mode', function () {
            const items = getSingleTagItems(MANY_ITEMS);

            const start = performance.now();
            const {tags} = buildDeferredPngTextTags({items, expanded: false});
            const elapsed = performance.now() - start;

            expect(elapsed).to.be.below(MERGE_BUDGET_MS);
            expect(Object.keys(tags)).to.have.lengthOf(MANY_ITEMS);
            expect(tags[`k${MANY_ITEMS - 1}`].value).to.equal(MANY_ITEMS - 1);
        });

        it('should merge many deferred items in linear time in expanded mode', function () {
            const items = getSingleTagItems(MANY_ITEMS);

            const start = performance.now();
            const {tags} = buildDeferredPngTextTags({items, expanded: true});
            const elapsed = performance.now() - start;

            expect(elapsed).to.be.below(MERGE_BUDGET_MS);
            expect(Object.keys(tags.png)).to.have.lengthOf(MANY_ITEMS);
            expect(Object.keys(tags.pngText)).to.have.lengthOf(MANY_ITEMS);
        });

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should give the same result as one merge per item in ${mode} mode`, function () {
                expectSameAsOneMergePerItem({expanded});
            });

            it(`should give the same result as one merge per item with a tag filter in ${mode} mode`, function () {
                const deps = createPipelineDeps();
                deps.filterTagsForReturn = (groupKey, readTags) => {
                    if (groupKey !== 'exif') {
                        return readTags;
                    }
                    const returnedTags = objectAssign({}, readTags);
                    delete returnedTags.Model;
                    return returnedTags;
                };

                const {parsedGroups} = expectSameAsOneMergePerItem({expanded, deps});

                expect(parsedGroups.exif.Model.value).to.equal('exif model');
            });
        }

        it('should give the expected flat result for a mix of PNG, Exif and IPTC items', function () {
            const {tags, parsedGroups} = buildDeferredPngTextTags({
                items: getMixedItems(),
                expanded: false,
                stepsBefore: [{type: 'mergePngFile', parsedTags: {Width: {value: 100}}}],
            });

            expect(JSON.stringify(tags)).to.equal(JSON.stringify({
                Width: {value: 100},
                Software: {value: 'exif software'},
                Title: {value: 'title 2'},
                Make: {value: 'png make'},
                Headline: {value: 'headline 2'},
                Comment: {value: 'comment'},
                Model: {value: 'exif model'},
                Keywords: {value: 'keywords'},
            }));
            expect(JSON.stringify(parsedGroups.exif)).to.equal(JSON.stringify({
                Software: {value: 'exif software'},
                Make: {value: 'exif make 2'},
                Model: {value: 'exif model'},
                Thumbnail: {JPEGInterchangeFormat: {value: 272}},
            }));
            expect(JSON.stringify(parsedGroups.iptc)).to.equal(JSON.stringify({
                Headline: {value: 'headline 2'},
                Keywords: {value: 'keywords'},
            }));
        });

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should let a later duplicate keyword win in ${mode} mode`, function () {
                const {tags} = buildDeferredPngTextTags({
                    items: [{readTags: {MyTag: {value: 'first'}}}, {readTags: {MyTag: {value: 'second'}}}],
                    expanded,
                });

                expect((expanded ? tags.png : tags).MyTag.value).to.equal('second');
            });

            it(`should merge several Exif items in ${mode} mode`, function () {
                const {tags, parsedGroups} = buildDeferredPngTextTags({
                    items: [
                        {embeddedExifTags: {Make: {value: 'make 1'}, Model: {value: 'model'}}},
                        {embeddedExifTags: {Make: {value: 'make 2'}, Software: {value: 'software'}}},
                    ],
                    expanded,
                });

                const expectedExifTags = {
                    Make: {value: 'make 2'},
                    Model: {value: 'model'},
                    Software: {value: 'software'},
                };
                expect(parsedGroups.exif).to.deep.equal(expectedExifTags);
                if (expanded) {
                    expect(tags.exif).to.deep.equal(expectedExifTags);
                    expect(tags.exif).to.not.equal(parsedGroups.exif);
                } else {
                    expect(tags).to.deep.equal(expectedExifTags);
                }
            });
        }

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should merge several IPTC items in ${mode} mode`, function () {
                const {tags, parsedGroups} = buildDeferredPngTextTags({
                    items: [
                        {embeddedIptcTags: {Headline: {value: 'headline 1'}, Keywords: {value: 'keywords'}}},
                        {embeddedIptcTags: {Headline: {value: 'headline 2'}, Caption: {value: 'caption'}}},
                    ],
                    expanded,
                });

                const expectedIptcTags = {
                    Headline: {value: 'headline 2'},
                    Keywords: {value: 'keywords'},
                    Caption: {value: 'caption'},
                };
                expect(parsedGroups.iptc).to.deep.equal(expectedIptcTags);
                if (expanded) {
                    expect(tags.iptc).to.deep.equal(expectedIptcTags);
                    expect(tags.iptc).to.not.equal(parsedGroups.iptc);
                } else {
                    expect(tags).to.deep.equal(expectedIptcTags);
                }
            });
        }

        it('should let a later embedded Exif tag win over a PNG keyword of the same name in flat mode', function () {
            const {tags} = buildDeferredPngTextTags({
                items: [{readTags: {Software: {value: 'png software'}}}, {embeddedExifTags: {Software: {value: 'exif software'}}}],
                expanded: false,
            });

            expect(tags.Software.value).to.equal('exif software');
        });

        it('should let a later PNG keyword win over an embedded Exif tag of the same name in flat mode', function () {
            const {tags} = buildDeferredPngTextTags({
                items: [{embeddedExifTags: {Software: {value: 'exif software'}}}, {readTags: {Software: {value: 'png software'}}}],
                expanded: false,
            });

            expect(tags.Software.value).to.equal('png software');
        });

        it('should not mutate the PNG file tags from an earlier mergePngFile step', function () {
            const pngFileTags = {Width: {value: 100}};
            const pngFileTagsSnapshot = structuredClone(pngFileTags);

            const {tags} = buildDeferredPngTextTags({
                items: [{readTags: {MyTag: {value: 'text'}}}],
                expanded: true,
                stepsBefore: [{type: 'mergePngFile', parsedTags: pngFileTags}],
            });

            expect(pngFileTags).to.deep.equal(pngFileTagsSnapshot);
            expect(tags.pngFile).to.deep.equal({Width: {value: 100}});
            expect(tags.png).to.deep.equal({Width: {value: 100}, MyTag: {value: 'text'}});
        });

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should not mutate the synchronous PNG text tags in ${mode} mode`, function () {
                const syncReadTags = {SyncTag: {value: 'sync'}};
                const syncReadTagsSnapshot = structuredClone(syncReadTags);

                const {tags} = buildDeferredPngTextTags({
                    items: [{readTags: {MyTag: {value: 'text'}}}, {embeddedExifTags: {Make: {value: 'make'}}}],
                    expanded,
                    stepsBefore: [{type: 'processPngTextReadTags', readTags: syncReadTags}],
                });

                expect(syncReadTags).to.deep.equal(syncReadTagsSnapshot);
                expect(expanded ? tags.png : tags).to.include.keys('SyncTag', 'MyTag');
            });
        }

        it('should not mutate an existing parsed Exif group', function () {
            const parsedExifTags = {Make: {value: 'make 1'}};
            const parsedGroups = {exif: parsedExifTags};

            buildDeferredPngTextTags({
                items: [{embeddedExifTags: {Model: {value: 'model'}}}],
                expanded: true,
                parsedGroups,
            });

            expect(parsedExifTags).to.deep.equal({Make: {value: 'make 1'}});
            expect(parsedGroups.exif).to.deep.equal({Make: {value: 'make 1'}, Model: {value: 'model'}});
        });

        function getSingleTagItems(count) {
            return Array.from({length: count}, (_, index) => ({readTags: {[`k${index}`]: {value: index}}}));
        }

        function getMixedItems() {
            return [
                {readTags: {Software: {value: 'png software'}, Title: {value: 'title 1'}}},
                {embeddedExifTags: {Software: {value: 'exif software'}, Make: {value: 'exif make 1'}}},
                {embeddedIptcTags: {Headline: {value: 'headline 1'}}},
                {},
                {readTags: {Title: {value: 'title 2'}, Comment: {value: 'comment'}}},
                {embeddedExifTags: {Make: {value: 'exif make 2'}, Model: {value: 'exif model'}, Thumbnail: {JPEGInterchangeFormat: {value: 272}}}},
                {readTags: {Make: {value: 'png make'}}},
                {embeddedIptcTags: {Headline: {value: 'headline 2'}, Keywords: {value: 'keywords'}}},
            ];
        }

        function expectSameAsOneMergePerItem({expanded, deps = createPipelineDeps()}) {
            const stepsBefore = [{type: 'mergePngFile', parsedTags: {Width: {value: 100}}}];
            const actual = buildDeferredPngTextTags({items: getMixedItems(), expanded, deps, stepsBefore});
            const expected = buildPngTextTagsOneMergePerItem({items: getMixedItems(), expanded, deps, stepsBefore});

            expect(JSON.stringify(actual.tags)).to.equal(JSON.stringify(expected.tags));
            expect(JSON.stringify(actual.parsedGroups)).to.equal(JSON.stringify(expected.parsedGroups));

            return actual;
        }

        function buildPngTextTagsOneMergePerItem({items, expanded, deps, stepsBefore}) {
            const {tags: tagsBefore, parsedGroups} = buildPngTextTags({steps: stepsBefore, expanded, deps});
            const tagFilter = createTagFilter({});
            const tags = items.reduce((mergedTags, item) => addPngTextReadTagsToTagsAndGroups({
                readTags: item.readTags || {},
                embeddedExifTags: item.embeddedExifTags,
                embeddedIptcTags: item.embeddedIptcTags,
                parsedGroups,
                expanded,
                tagFilter,
                tags: mergedTags,
                deps,
            }), tagsBefore);
            return {tags, parsedGroups};
        }

        function buildDeferredPngTextTags({items, expanded, deps, parsedGroups, stepsBefore = []}) {
            return buildPngTextTags({
                steps: stepsBefore.concat([{type: 'processPngTextReadTagsDeferredList', deferredKey: 'pngText'}]),
                deferredResults: {pngText: items},
                expanded,
                deps,
                parsedGroups,
            });
        }

        function buildPngTextTags({steps, deferredResults = {}, expanded, deps = createPipelineDeps(), parsedGroups = {}}) {
            const tags = buildTagsFromMergeSteps({
                mergeSteps: steps,
                deferredResults,
                parsedGroups,
                expanded,
                tagFilter: createTagFilter({}),
                dataView: {},
                tiffHeaderOffset: undefined,
                fileType: undefined,
                pngTextChunks: [],
                pngTextIsAsync: false,
                thumbnailIfdTags: undefined,
                deps,
            });
            return {tags, parsedGroups};
        }
    });
});

function createPipelineDeps() {
    return {
        objectAssign,
        hasPngTextData() {
            return false;
        },
        filterTagsForParse(groupKey, readTags) {
            void groupKey;

            return readTags;
        },
        filterTagsForReturn(groupKey, readTags) {
            void groupKey;

            return readTags;
        },
        getGpsGroupFromExifTags() {
            return undefined;
        },
        Composite: {
            get() {
                return undefined;
            },
        },
        Thumbnail: {
            get() {
                return undefined;
            },
        },
    };
}

function createTagFilter({returnGroups = {}, returnTags = {}} = {}) {
    return {
        isActive: false,
        shouldReturnGroup(groupKey) {
            if (returnGroups[groupKey] === undefined) {
                return true;
            }

            return returnGroups[groupKey];
        },
        shouldReturnTag(groupKey, tagName) {
            const key = `${groupKey}.${tagName}`;
            if (returnTags[key] === undefined) {
                return true;
            }

            return returnTags[key];
        },
    };
}

function swap(target, replacement) {
    restoreFunctions.push(swapProperties(target, replacement));
}

function applyGpsStep(gpsGroup) {
    const deps = createPipelineDeps();
    deps.getGpsGroupFromExifTags = () => gpsGroup;

    return applyMergeStep({
        step: {type: 'gps'},
        deferredResults: {},
        parsedGroups: {exif: {SomeExifTag: {value: 42}}},
        expanded: true,
        tagFilter: createTagFilter({}),
        dataView: {},
        tiffHeaderOffset: undefined,
        fileType: undefined,
        thumbnailIfdTags: undefined,
        tags: {MyTag: {value: 42}},
        deps,
    });
}

function applyCompositeStep(compositeTags) {
    const deps = createPipelineDeps();
    deps.Composite = {
        get() {
            return compositeTags;
        },
    };

    return applyMergeStep({
        step: {type: 'composite'},
        deferredResults: {},
        parsedGroups: {},
        expanded: false,
        tagFilter: createTagFilter({}),
        dataView: {},
        tiffHeaderOffset: undefined,
        fileType: undefined,
        thumbnailIfdTags: undefined,
        tags: {MyTag: {value: 42}},
        deps,
    });
}
