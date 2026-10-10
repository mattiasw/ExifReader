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

    it('should remove an existing Thumbnail tag if thumbnailIfdTags is missing', function () {
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

        expect(tags).to.not.have.property('Thumbnail');
    });

    it('should remove an existing Thumbnail tag if Thumbnail.get returns nothing for the thumbnail IFD tags', function () {
        const tags = applyMergeStep({
            step: {type: 'thumbnail'},
            deferredResults: {},
            parsedGroups: {},
            expanded: false,
            tagFilter: createTagFilter({}),
            dataView: {},
            tiffHeaderOffset: 0,
            fileType: undefined,
            thumbnailIfdTags: {Compression: {value: 1}},
            tags: {Thumbnail: {value: 'from file data'}},
            deps: createPipelineDeps(),
        });

        expect(tags).to.not.have.property('Thumbnail');
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

    it('should not return a PNG text tag named Thumbnail when there is no thumbnail IFD', function () {
        const tags = buildTagsFromMergeSteps({
            mergeSteps: [
                {type: 'processPngTextReadTagsDeferredList', deferredKey: 'pngText'},
                {type: 'thumbnail'},
            ],
            deferredResults: {
                pngText: [
                    {readTags: {Thumbnail: {value: 'my thumbnail note'}}},
                    {embeddedExifTags: {Model: {value: 'model'}}, embeddedExifThumbnail: {JPEGInterchangeFormat: {value: 272}}},
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

        expect(tags).to.not.have.property('Thumbnail');
    });

    describe('thumbnail step with raw profile thumbnails', function () {
        const MAIN_WITH_IMAGE = {type: 'image/jpeg', image: 'main'};
        const MAIN_WITHOUT_IMAGE = {Compression: {value: 1}};

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should return a raw profile thumbnail top level, not as an Exif tag, when there is no main thumbnail in ${mode} mode`, function () {
                const rawThumbnail = getRawThumbnail('raw');
                const parsedGroups = {};

                const tags = buildThumbnailTags({
                    steps: [getSyncStep({embeddedExifThumbnail: rawThumbnail})],
                    expanded,
                    parsedGroups,
                });

                expect(tags.Thumbnail).to.equal(rawThumbnail);
                expect(expanded ? tags.exif : tags).to.have.property('Model');
                if (expanded) {
                    expect(tags.exif).to.not.have.property('Thumbnail');
                }
                expect(parsedGroups.exif).to.deep.equal({Model: {value: 'model'}});
            });

            it(`should return the raw profile thumbnail of a deferred item top level, not as an Exif tag, in ${mode} mode`, function () {
                const rawThumbnail = getRawThumbnail('raw');
                const parsedGroups = {};

                const tags = buildThumbnailTags({
                    steps: [getDeferredStep()],
                    deferredResults: {pngText: [{embeddedExifTags: {Model: {value: 'model'}}, embeddedExifThumbnail: rawThumbnail}]},
                    expanded,
                    parsedGroups,
                });

                expect(tags.Thumbnail).to.equal(rawThumbnail);
                if (expanded) {
                    expect(tags.exif).to.deep.equal({Model: {value: 'model'}});
                }
                expect(parsedGroups.exif).to.deep.equal({Model: {value: 'model'}});
            });
        }

        it('should return the main thumbnail when it has an image, over a raw profile thumbnail', function () {
            const tags = buildThumbnailTags({
                steps: [getSyncStep({embeddedExifThumbnail: getRawThumbnail('raw')})],
                mainThumbnail: MAIN_WITH_IMAGE,
            });

            expect(tags.Thumbnail).to.equal(MAIN_WITH_IMAGE);
        });

        it('should return a raw profile thumbnail with an image over a main thumbnail without one', function () {
            const rawThumbnail = getRawThumbnail('raw');

            const tags = buildThumbnailTags({
                steps: [getSyncStep({embeddedExifThumbnail: rawThumbnail})],
                mainThumbnail: MAIN_WITHOUT_IMAGE,
            });

            expect(tags.Thumbnail).to.equal(rawThumbnail);
        });

        it('should return the main thumbnail without an image when no raw profile thumbnail has one', function () {
            const tags = buildThumbnailTags({
                steps: [getSyncStep({embeddedExifThumbnail: {type: 'image/jpeg'}}), getDeferredStep()],
                deferredResults: {pngText: [{embeddedExifThumbnail: {Compression: {value: 6}}}]},
                mainThumbnail: MAIN_WITHOUT_IMAGE,
            });

            expect(tags.Thumbnail).to.equal(MAIN_WITHOUT_IMAGE);
        });

        it('should never return a raw profile thumbnail without an image', function () {
            const tags = buildThumbnailTags({
                steps: [getSyncStep({embeddedExifThumbnail: {type: 'image/jpeg'}}), getDeferredStep()],
                deferredResults: {pngText: [{embeddedExifThumbnail: {Compression: {value: 6}}}]},
            });

            expect(tags).to.not.have.property('Thumbnail');
        });

        it('should return the raw profile thumbnail of the synchronous step over a deferred one', function () {
            const syncThumbnail = getRawThumbnail('sync');

            const tags = buildThumbnailTags({
                steps: [getSyncStep({embeddedExifThumbnail: syncThumbnail}), getDeferredStep()],
                deferredResults: {pngText: [{embeddedExifThumbnail: getRawThumbnail('deferred')}]},
            });

            expect(tags.Thumbnail).to.equal(syncThumbnail);
        });

        it('should return the first deferred raw profile thumbnail with an image', function () {
            const firstWithImage = getRawThumbnail('first');

            const tags = buildThumbnailTags({
                steps: [getSyncStep({}), getDeferredStep()],
                deferredResults: {
                    pngText: [
                        {embeddedExifThumbnail: {type: 'image/jpeg'}},
                        {readTags: {MyTag: {value: 'my value'}}},
                        {embeddedExifThumbnail: firstWithImage},
                        {embeddedExifThumbnail: getRawThumbnail('second')},
                    ],
                },
            });

            expect(tags.Thumbnail).to.equal(firstWithImage);
        });

        it('should return no raw profile thumbnail when the thumbnail group is filtered out', function () {
            const tags = buildThumbnailTags({
                steps: [getSyncStep({embeddedExifThumbnail: getRawThumbnail('raw')})],
                tagFilter: createTagFilter({returnGroups: {thumbnail: false}}),
            });

            expect(tags).to.not.have.property('Thumbnail');
        });

        it('should return no raw profile thumbnail when the Thumbnail tag is filtered out', function () {
            const tags = buildThumbnailTags({
                steps: [getSyncStep({embeddedExifThumbnail: getRawThumbnail('raw')})],
                tagFilter: createTagFilter({returnTags: {'thumbnail.Thumbnail': false}}),
            });

            expect(tags).to.not.have.property('Thumbnail');
        });

        it('should not read a main thumbnail when there is no thumbnail IFD', function () {
            const rawThumbnail = getRawThumbnail('raw');
            const deps = createPipelineDeps();
            let thumbnailGetCalls = 0;
            deps.Thumbnail = {
                get() {
                    thumbnailGetCalls++;
                    return MAIN_WITH_IMAGE;
                },
            };

            const tags = buildTagsFromMergeSteps({
                mergeSteps: [getSyncStep({embeddedExifThumbnail: rawThumbnail}), {type: 'thumbnail'}],
                deferredResults: {},
                parsedGroups: {},
                expanded: false,
                tagFilter: createTagFilter({}),
                dataView: {},
                tiffHeaderOffset: 0,
                fileType: undefined,
                pngTextChunks: [],
                pngTextIsAsync: false,
                thumbnailIfdTags: undefined,
                deps,
            });

            expect(thumbnailGetCalls).to.equal(0);
            expect(tags.Thumbnail).to.equal(rawThumbnail);
        });

        it('should return a collected raw profile thumbnail from the thumbnail step', function () {
            const rawThumbnail = getRawThumbnail('raw');

            const tags = applyThumbnailStepWithRawThumbnails([rawThumbnail]);

            expect(tags.Thumbnail).to.equal(rawThumbnail);
        });

        for (const [description, constants] of [
            ['USE_PNG and USE_JXL', {USE_PNG: false, USE_JXL: false}],
            ['USE_EXIF', {USE_EXIF: false}],
            ['USE_THUMBNAIL', {USE_THUMBNAIL: false}],
        ]) {
            it(`should return no raw profile thumbnail in a build without ${description}`, function () {
                swap(Constants, constants);

                const tags = applyThumbnailStepWithRawThumbnails([getRawThumbnail('raw')]);

                expect(tags).to.not.have.property('Thumbnail');
            });
        }

        for (const constant of ['USE_PNG', 'USE_JXL']) {
            it(`should return an embedded thumbnail in a build with only ${constant} of the two`, function () {
                swap(Constants, {USE_PNG: constant === 'USE_PNG', USE_JXL: constant === 'USE_JXL'});
                const rawThumbnail = getRawThumbnail('raw');

                const tags = applyThumbnailStepWithRawThumbnails([rawThumbnail]);

                expect(tags.Thumbnail).to.equal(rawThumbnail);
            });
        }

        function getRawThumbnail(image) {
            return {type: 'image/jpeg', image};
        }

        function getSyncStep({embeddedExifThumbnail}) {
            return {
                type: 'processPngTextReadTags',
                readTags: {},
                embeddedExifTags: {Model: {value: 'model'}},
                embeddedExifThumbnail,
            };
        }

        function getDeferredStep() {
            return {type: 'processPngTextReadTagsDeferredList', deferredKey: 'pngText'};
        }

        function buildThumbnailTags({
            steps,
            deferredResults = {},
            expanded = false,
            parsedGroups = {},
            tagFilter = createTagFilter({}),
            mainThumbnail,
        }) {
            const deps = createPipelineDeps();
            deps.Thumbnail = {
                get() {
                    return mainThumbnail;
                },
            };

            return buildTagsFromMergeSteps({
                mergeSteps: steps.concat([{type: 'thumbnail'}]),
                deferredResults,
                parsedGroups,
                expanded,
                tagFilter,
                dataView: {},
                tiffHeaderOffset: 0,
                fileType: undefined,
                pngTextChunks: [],
                pngTextIsAsync: false,
                thumbnailIfdTags: mainThumbnail ? {Compression: {value: 6}} : undefined,
                deps,
            });
        }

        function applyThumbnailStepWithRawThumbnails(embeddedExifThumbnails) {
            return applyMergeStep({
                step: {type: 'thumbnail'},
                deferredResults: {},
                parsedGroups: {},
                expanded: false,
                tagFilter: createTagFilter({}),
                dataView: {},
                tiffHeaderOffset: undefined,
                fileType: undefined,
                thumbnailIfdTags: undefined,
                embeddedExifThumbnails,
                tags: {},
                deps: createPipelineDeps(),
            });
        }
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

    describe('fileType step', function () {
        const LIBRARY_FILE_TYPE = {value: 'png', description: 'PNG'};

        it('should remove a FileType tag from file data when the file FileType tag is filtered out', function () {
            const tags = applyFileTypeStep({
                tagFilter: createTagFilter({returnTags: {'file.FileType': false}}),
                fileType: LIBRARY_FILE_TYPE,
            });

            expect(tags).to.not.have.property('FileType');
            expect(tags.Other.value).to.equal(1);
        });

        it('should remove a FileType tag from file data when the file group is filtered out', function () {
            const tags = applyFileTypeStep({
                tagFilter: createTagFilter({returnGroups: {file: false}}),
                fileType: LIBRARY_FILE_TYPE,
            });

            expect(tags).to.not.have.property('FileType');
        });

        it('should remove a FileType tag from file data when the library found no file type', function () {
            const tags = applyFileTypeStep({
                tagFilter: createTagFilter({}),
                fileType: undefined,
            });

            expect(tags).to.not.have.property('FileType');
        });

        it('should replace a FileType tag from file data with the library file type', function () {
            const tags = applyFileTypeStep({
                tagFilter: createTagFilter({}),
                fileType: LIBRARY_FILE_TYPE,
            });

            expect(tags.FileType).to.deep.equal(LIBRARY_FILE_TYPE);
        });

        it('should keep a group FileType tag in expanded mode when the file FileType tag is filtered out', function () {
            const tags = applyMergeStep({
                step: {type: 'fileType'},
                deferredResults: {},
                parsedGroups: {},
                expanded: true,
                tagFilter: createTagFilter({returnTags: {'file.FileType': false}}),
                dataView: {},
                tiffHeaderOffset: undefined,
                fileType: LIBRARY_FILE_TYPE,
                thumbnailIfdTags: undefined,
                tags: {xmp: {FileType: {value: 'from file data'}}},
                deps: createPipelineDeps(),
            });

            expect(tags.xmp.FileType.value).to.equal('from file data');
            expect(tags.file).to.equal(undefined);
        });

        function applyFileTypeStep({tagFilter, fileType}) {
            return applyMergeStep({
                step: {type: 'fileType'},
                deferredResults: {},
                parsedGroups: {},
                expanded: false,
                tagFilter,
                dataView: {},
                tiffHeaderOffset: undefined,
                fileType,
                thumbnailIfdTags: undefined,
                tags: {FileType: {value: 'from file data'}, Other: {value: 1}},
                deps: createPipelineDeps(),
            });
        }
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

        it('should merge embedded Exif and IPTC tags from the synchronous step at the top level in flat mode', function () {
            const {tags, parsedGroups} = buildPngTextTags({
                steps: [getSyncStepWithEmbeddedTags()],
                expanded: false,
            });

            expect(tags).to.deep.equal({
                SyncTag: {value: 'sync'},
                Model: {value: 'model'},
                Headline: {value: 'headline'},
            });
            expect(parsedGroups.exif).to.deep.equal({Model: {value: 'model'}});
            expect(parsedGroups.iptc).to.deep.equal({Headline: {value: 'headline'}});
        });

        it('should merge embedded Exif and IPTC tags from the synchronous step into their groups in expanded mode', function () {
            const {tags, parsedGroups} = buildPngTextTags({
                steps: [getSyncStepWithEmbeddedTags()],
                expanded: true,
            });

            expect(tags.exif).to.deep.equal({Model: {value: 'model'}});
            expect(tags.iptc).to.deep.equal({Headline: {value: 'headline'}});
            expect(tags.png).to.deep.equal({SyncTag: {value: 'sync'}});
            expect(tags).to.not.have.property('Model');
            expect(tags).to.not.have.property('Headline');
            expect(parsedGroups.exif).to.deep.equal({Model: {value: 'model'}});
            expect(parsedGroups.iptc).to.deep.equal({Headline: {value: 'headline'}});
        });

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should let a deferred Exif tag win over the synchronous step's and not mutate the synchronous tags in ${mode} mode`, function () {
                const syncStep = getSyncStepWithEmbeddedTags();
                const syncStepSnapshot = structuredClone(syncStep);

                const {tags, parsedGroups} = buildDeferredPngTextTags({
                    items: [{embeddedExifTags: {Model: {value: 'deferred model'}, Make: {value: 'make'}}}],
                    expanded,
                    stepsBefore: [syncStep],
                });

                const exifTags = expanded ? tags.exif : tags;
                expect(syncStep).to.deep.equal(syncStepSnapshot);
                expect(exifTags.Model).to.deep.equal({value: 'deferred model'});
                expect(exifTags.Make).to.deep.equal({value: 'make'});
                expect(parsedGroups.exif).to.deep.equal({Model: {value: 'deferred model'}, Make: {value: 'make'}});
            });
        }

        function getSyncStepWithEmbeddedTags() {
            return {
                type: 'processPngTextReadTags',
                readTags: {SyncTag: {value: 'sync'}},
                embeddedExifTags: {Model: {value: 'model'}},
                embeddedIptcTags: {Headline: {value: 'headline'}},
            };
        }

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
                {embeddedExifTags: {Make: {value: 'exif make 2'}, Model: {value: 'exif model'}}},
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

    describe('groups an Exif block carries', function () {
        const CARRIED_GROUPS = {
            iptc: {Headline: {value: 'headline'}},
            xmp: {Rating: {value: '5'}, _raw: '<x:xmpmeta/>'},
            photoshop: {ClippingPathName: {value: 'path1'}},
            icc: {ProfileVersion: {value: '4.3'}},
            makerNotes: {AutoRotate: {value: 0}},
        };

        it('should merge the carried groups of a PNG raw profile into their groups in expanded mode', function () {
            const {tags, parsedGroups} = buildCarriedGroupTags({
                steps: [getPngTextStep(CARRIED_GROUPS)],
                expanded: true,
            });

            for (const groupKey of Object.keys(CARRIED_GROUPS)) {
                expect(tags[groupKey]).to.deep.equal(CARRIED_GROUPS[groupKey]);
                expect(parsedGroups[groupKey]).to.deep.equal(CARRIED_GROUPS[groupKey]);
            }
            expect(tags.exif).to.deep.equal({Model: {value: 'model'}});
            expect(tags).to.not.have.property('Headline');
        });

        it('should merge the carried groups of a PNG raw profile top level, XMP without its raw packet, in flat mode', function () {
            const {tags, parsedGroups} = buildCarriedGroupTags({
                steps: [getPngTextStep(CARRIED_GROUPS)],
                expanded: false,
            });

            expect(JSON.stringify(tags)).to.equal(JSON.stringify({
                Headline: {value: 'headline'},
                ClippingPathName: {value: 'path1'},
                ProfileVersion: {value: '4.3'},
                AutoRotate: {value: 0},
                Model: {value: 'model'},
                Rating: {value: '5'},
            }));
            expect(parsedGroups.xmp).to.deep.equal(CARRIED_GROUPS.xmp);
            expect(parsedGroups.makerNotes).to.deep.equal(CARRIED_GROUPS.makerNotes);
        });

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should only keep a carried group in the parsed groups when the group is not returned in ${mode} mode`, function () {
                const {tags, parsedGroups} = buildCarriedGroupTags({
                    steps: [getPngTextStep({makerNotes: CARRIED_GROUPS.makerNotes, xmp: CARRIED_GROUPS.xmp})],
                    expanded,
                    tagFilter: createTagFilter({returnGroups: {makerNotes: false, xmp: false}}),
                });

                expect(tags).to.not.have.property('makerNotes');
                expect(tags).to.not.have.property('xmp');
                expect(tags).to.not.have.property('AutoRotate');
                expect(tags).to.not.have.property('Rating');
                expect(parsedGroups.makerNotes).to.deep.equal(CARRIED_GROUPS.makerNotes);
                expect(parsedGroups.xmp).to.deep.equal(CARRIED_GROUPS.xmp);
            });

            it(`should merge the carried groups from the tags returned for them in ${mode} mode`, function () {
                const deps = createPipelineDeps();
                deps.filterTagsForReturn = (groupKey, readTags) => {
                    const returnedTags = objectAssign({}, readTags);
                    delete returnedTags.Hidden;
                    return returnedTags;
                };

                const {tags, parsedGroups} = buildCarriedGroupTags({
                    steps: [getPngTextStep({makerNotes: {AutoRotate: {value: 0}, Hidden: {value: 1}}})],
                    expanded,
                    deps,
                });

                expect(expanded ? tags.makerNotes : tags).to.not.have.property('Hidden');
                expect((expanded ? tags.makerNotes : tags).AutoRotate).to.deep.equal({value: 0});
                expect(parsedGroups.makerNotes.Hidden).to.deep.equal({value: 1});
            });
        }

        it('should keep a _raw tag of a carried group other than XMP in flat mode', function () {
            const {tags} = buildCarriedGroupTags({
                steps: [getPngTextStep({makerNotes: {_raw: {value: 'maker notes'}}})],
                expanded: false,
            });

            expect(tags._raw).to.deep.equal({value: 'maker notes'});
        });

        it('should let Exif win over the maker notes, and ApplicationNotes XMP over Exif, in flat mode', function () {
            const {tags} = buildCarriedGroupTags({
                steps: [{
                    type: 'processPngTextReadTags',
                    readTags: {},
                    embeddedExifTags: {LensModel: {value: 'exif'}, Rating: {value: 'exif'}},
                    exifCarriedGroups: {
                        makerNotes: {LensModel: {value: 'maker notes'}, Rating: {value: 'maker notes'}},
                        xmp: {Rating: {value: 'xmp'}},
                    },
                }],
                expanded: false,
            });

            expect(tags.LensModel.value).to.equal('exif');
            expect(tags.Rating.value).to.equal('xmp');
        });

        it('should return the carried groups ahead of Exif and in reading order in expanded mode', function () {
            const {tags} = buildCarriedGroupTags({
                steps: [getPngTextStep({
                    makerNotes: CARRIED_GROUPS.makerNotes,
                    icc: CARRIED_GROUPS.icc,
                    photoshop: CARRIED_GROUPS.photoshop,
                    xmp: CARRIED_GROUPS.xmp,
                    iptc: CARRIED_GROUPS.iptc,
                })],
                expanded: true,
            });

            expect(Object.keys(tags)).to.deep.equal(['iptc', 'xmp', 'photoshop', 'icc', 'makerNotes', 'exif', 'png']);
        });

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should merge the carried groups of deferred raw profiles in order without mutating earlier groups in ${mode} mode`, function () {
                const syncStep = getPngTextStep({makerNotes: {AutoRotate: {value: 'sync'}, LensType: {value: 'sync'}}});
                const syncStepSnapshot = structuredClone(syncStep);

                const {tags, parsedGroups} = buildCarriedGroupTags({
                    steps: [syncStep, {type: 'processPngTextReadTagsDeferredList', deferredKey: 'pngText'}],
                    deferredResults: {pngText: [
                        {
                            embeddedExifTags: {Model: {value: 'first'}},
                            exifCarriedGroups: {makerNotes: {AutoRotate: {value: 'first'}, ShotInfo: {value: 'first'}}},
                        },
                        {
                            embeddedExifTags: {Model: {value: 'second'}},
                            exifCarriedGroups: {makerNotes: {AutoRotate: {value: 'second'}}, photoshop: CARRIED_GROUPS.photoshop},
                        },
                    ]},
                    expanded,
                });

                const expectedMakerNotes = {
                    AutoRotate: {value: 'second'},
                    LensType: {value: 'sync'},
                    ShotInfo: {value: 'first'},
                };
                expect(syncStep).to.deep.equal(syncStepSnapshot);
                expect(parsedGroups.makerNotes).to.deep.equal(expectedMakerNotes);
                expect(parsedGroups.photoshop).to.deep.equal(CARRIED_GROUPS.photoshop);
                if (expanded) {
                    expect(tags.makerNotes).to.deep.equal(expectedMakerNotes);
                    expect(tags.photoshop).to.deep.equal(CARRIED_GROUPS.photoshop);
                } else {
                    expect(tags).to.deep.include(expectedMakerNotes);
                    expect(tags.ClippingPathName).to.deep.equal({value: 'path1'});
                }
            });
        }

        describe('mergeBrobExifDeferred step', function () {
            for (const expanded of [false, true]) {
                const mode = expanded ? 'expanded' : 'flat';

                it(`should merge the brob Exif, the groups it carries and its thumbnail in ${mode} mode`, function () {
                    const thumbnail = {type: 'image/jpeg', image: 'brob'};

                    const {tags, parsedGroups} = buildCarriedGroupTags({
                        steps: [getBrobStep(), {type: 'thumbnail'}],
                        deferredResults: {brobExif: {
                            exifTags: {LensModel: {value: 'exif'}},
                            carriedGroups: {
                                makerNotes: {LensModel: {value: 'maker notes'}, AutoRotate: {value: 0}},
                                xmp: CARRIED_GROUPS.xmp,
                            },
                            thumbnail,
                        }},
                        expanded,
                    });

                    expect(tags.Thumbnail).to.equal(thumbnail);
                    expect(parsedGroups.exif).to.deep.equal({LensModel: {value: 'exif'}});
                    expect(parsedGroups.makerNotes.AutoRotate).to.deep.equal({value: 0});
                    expect(parsedGroups.xmp).to.deep.equal(CARRIED_GROUPS.xmp);
                    if (expanded) {
                        expect(Object.keys(tags)).to.deep.equal(['xmp', 'makerNotes', 'exif', 'Thumbnail']);
                        expect(tags.exif).to.deep.equal({LensModel: {value: 'exif'}});
                        expect(tags.makerNotes.LensModel).to.deep.equal({value: 'maker notes'});
                        expect(tags.xmp).to.deep.equal(CARRIED_GROUPS.xmp);
                    } else {
                        expect(tags.LensModel).to.deep.equal({value: 'exif'});
                        expect(tags.AutoRotate).to.deep.equal({value: 0});
                        expect(tags.Rating).to.deep.equal({value: '5'});
                        expect(tags).to.not.have.property('_raw');
                    }
                });
            }

            it('should merge the brob Exif into an existing parsed Exif group without mutating it', function () {
                const parsedExifTags = {Make: {value: 'make'}};
                const parsedGroups = {exif: parsedExifTags};

                buildCarriedGroupTags({
                    steps: [getBrobStep()],
                    deferredResults: {brobExif: {exifTags: {Model: {value: 'model'}}, carriedGroups: {}}},
                    expanded: true,
                    parsedGroups,
                });

                expect(parsedExifTags).to.deep.equal({Make: {value: 'make'}});
                expect(parsedGroups.exif).to.deep.equal({Make: {value: 'make'}, Model: {value: 'model'}});
            });

            it('should keep the brob Exif out of the returned tags when the exif group is not returned', function () {
                const {tags, parsedGroups} = buildCarriedGroupTags({
                    steps: [getBrobStep()],
                    deferredResults: {brobExif: {exifTags: {Model: {value: 'model'}}, carriedGroups: {}}},
                    expanded: true,
                    tagFilter: createTagFilter({returnGroups: {exif: false}}),
                });

                expect(tags).to.deep.equal({});
                expect(parsedGroups.exif).to.deep.equal({Model: {value: 'model'}});
            });

            it('should leave the tags alone when the brob Exif could not be read', function () {
                const {tags, parsedGroups} = buildCarriedGroupTags({
                    steps: [getBrobStep(), {type: 'thumbnail'}],
                    deferredResults: {brobExif: undefined},
                    expanded: true,
                });

                expect(tags).to.deep.equal({});
                expect(parsedGroups).to.deep.equal({});
            });

            it('should add no exif group for an empty brob Exif but still return its thumbnail', function () {
                const thumbnail = {type: 'image/jpeg', image: 'brob'};

                const {tags, parsedGroups} = buildCarriedGroupTags({
                    steps: [getBrobStep(), {type: 'thumbnail'}],
                    deferredResults: {brobExif: {exifTags: {}, carriedGroups: {}, thumbnail}},
                    expanded: true,
                });

                expect(tags).to.deep.equal({Thumbnail: thumbnail});
                expect(parsedGroups).to.deep.equal({});
            });

            function getBrobStep() {
                return {type: 'mergeBrobExifDeferred', deferredKey: 'brobExif'};
            }
        });

        function getPngTextStep(exifCarriedGroups) {
            return {
                type: 'processPngTextReadTags',
                readTags: {},
                embeddedExifTags: {Model: {value: 'model'}},
                exifCarriedGroups,
            };
        }

        function buildCarriedGroupTags({
            steps,
            deferredResults = {},
            expanded,
            tagFilter = createTagFilter({}),
            parsedGroups = {},
            deps = createPipelineDeps(),
        }) {
            const tags = buildTagsFromMergeSteps({
                mergeSteps: steps,
                deferredResults,
                parsedGroups,
                expanded,
                tagFilter,
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
