/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {objectAssign} from '../../src/utils.js';
import Constants from '../../src/constants.js';
import {swapProperties, LINEAR_TIME_TIMEOUT_MS, expectTimeRatioBelow} from './test-utils.js';
import {
    buildTagsFromMergeBlocks,
    MERGE_ORDER,
    mergeAssignGroup,
    mergeBlock,
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

        const tags = mergeBlock({
            block: {slot: 'exif', group: 'exif', mode: 'merge', tags: {B: {value: 2}}},
            tags: originalTags,
            parsedGroups: {},
            expanded: true,
            tagFilter: createTagFilter({}),
            deps: createPipelineDeps(),
        });

        expect(tags).to.equal(originalTags);
        expect(tags.exif.A.value).to.equal(1);
        expect(tags.exif.B.value).to.equal(2);
    });

    describe('parsed groups', function () {
        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should write the parsed group of an assign block, also when the group is not returned, in ${mode} mode`, function () {
                const parsedGroups = {};
                const exifTags = {Model: {value: 'model'}};

                const tags = buildBlockTags({
                    blocks: [{slot: 'exif', group: 'exif', mode: 'assign', tags: exifTags}],
                    expanded,
                    parsedGroups,
                    tagFilter: createTagFilter({returnGroups: {exif: false}}),
                });

                expect(tags).to.deep.equal({});
                expect(parsedGroups.exif).to.equal(exifTags);
            });

            it(`should merge the parsed group of a merge block into an existing one without mutating it, in ${mode} mode`, function () {
                const parsedExifTags = {Make: {value: 'make'}};
                const parsedGroups = {exif: parsedExifTags};

                buildBlockTags({
                    blocks: [{slot: 'exif', group: 'exif', mode: 'merge', tags: {Model: {value: 'model'}}}],
                    expanded,
                    parsedGroups,
                    tagFilter: createTagFilter({returnGroups: {exif: false}}),
                });

                expect(parsedExifTags).to.deep.equal({Make: {value: 'make'}});
                expect(parsedGroups.exif).to.deep.equal({Make: {value: 'make'}, Model: {value: 'model'}});
            });

            it(`should write the parsed pngFile group of a pngFile block, also when png is not returned, in ${mode} mode`, function () {
                const parsedGroups = {};
                const fileTags = {Width: {value: 1}};

                const tags = buildBlockTags({
                    blocks: [{slot: 'pngFile', group: 'png', mode: 'pngFile', tags: fileTags}],
                    expanded,
                    parsedGroups,
                    tagFilter: createTagFilter({returnGroups: {png: false}}),
                });

                expect(tags).to.deep.equal({});
                expect(parsedGroups.pngFile).to.equal(fileTags);
            });
        }
    });

    describe('nested containers', function () {
        const CARRIED_GROUPS = {
            iptc: {Headline: {value: 'headline'}},
            xmp: {Rating: {value: '5'}, _raw: '<x:xmpmeta/>'},
            photoshop: {ClippingPathName: {value: 'path1'}},
            icc: {ProfileVersion: {value: '4.3'}},
            makerNotes: {AutoRotate: {value: 0}},
        };

        it('should merge the carried groups of an Exif container into their groups in expanded mode', function () {
            const {tags, parsedGroups} = buildCarriedGroupTags({
                steps: [getExifContainer(CARRIED_GROUPS)],
                expanded: true,
            });

            for (const groupKey of Object.keys(CARRIED_GROUPS)) {
                expect(tags[groupKey]).to.deep.equal(CARRIED_GROUPS[groupKey]);
                expect(parsedGroups[groupKey]).to.deep.equal(CARRIED_GROUPS[groupKey]);
            }
            expect(tags.exif).to.deep.equal({Model: {value: 'model'}});
            expect(tags).to.not.have.property('Headline');
        });

        it('should merge the carried groups of an Exif container top level, XMP without its raw packet, in flat mode', function () {
            const {tags, parsedGroups} = buildCarriedGroupTags({
                steps: [getExifContainer(CARRIED_GROUPS)],
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

        it('should sort the blocks of a container by slot whatever their order, and apply the container at its own slot', function () {
            const {tags} = buildCarriedGroupTags({
                steps: [
                    {slot: 'xmp', group: 'xmp', mode: 'assign', tags: {Rating: {value: 'segment'}, Source: {value: 'segment'}}},
                    {slot: 'exif', mode: 'nested', blocks: [
                        {slot: 'carriedXmp', group: 'xmp', mode: 'merge', tags: {Rating: {value: 'carried'}}},
                        {slot: 'exif', group: 'exif', mode: 'merge', tags: {Rating: {value: 'exif'}, Model: {value: 'model'}}},
                        {slot: 'carriedIptc', group: 'iptc', mode: 'merge', tags: {Rating: {value: 'iptc'}}},
                    ]},
                    {slot: 'file', group: 'file', mode: 'assign', tags: {FileSize: {value: 1}}},
                ],
                expanded: false,
            });

            expect(tags.Rating.value).to.equal('segment');
            expect(Object.keys(tags)).to.deep.equal(['FileSize', 'Rating', 'Model', 'Source']);
        });

        it('should apply a container at the brobExif slot after the xmp segment and before the icc segment in flat mode', function () {
            const {tags} = buildCarriedGroupTags({
                steps: [
                    {slot: 'icc', group: 'icc', mode: 'assign', tags: {Collision: {value: 'icc'}}},
                    {slot: 'brobExif', mode: 'nested', blocks: [{slot: 'exif', group: 'exif', mode: 'merge', tags: {Collision: {value: 'brob'}, Model: {value: 'brob'}}}]},
                    {slot: 'xmp', group: 'xmp', mode: 'assign', tags: {Collision: {value: 'xmp'}, Model: {value: 'xmp'}}},
                ],
                expanded: false,
            });

            expect(tags.Collision.value).to.equal('icc');
            expect(tags.Model.value).to.equal('brob');
        });

        it('should merge a nested Exif block into an existing parsed Exif group without mutating it', function () {
            const parsedExifTags = {Make: {value: 'make'}};
            const parsedGroups = {exif: parsedExifTags};

            buildCarriedGroupTags({
                steps: [{slot: 'brobExif', mode: 'nested', blocks: [{slot: 'exif', group: 'exif', mode: 'merge', tags: {Model: {value: 'model'}}}]}],
                expanded: true,
                parsedGroups,
            });

            expect(parsedExifTags).to.deep.equal({Make: {value: 'make'}});
            expect(parsedGroups.exif).to.deep.equal({Make: {value: 'make'}, Model: {value: 'model'}});
        });

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should only keep a carried group in the parsed groups when the group is not returned in ${mode} mode`, function () {
                const {tags, parsedGroups} = buildCarriedGroupTags({
                    steps: [getExifContainer({makerNotes: CARRIED_GROUPS.makerNotes, xmp: CARRIED_GROUPS.xmp})],
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
                    steps: [getExifContainer({makerNotes: {AutoRotate: {value: 0}, Hidden: {value: 1}}})],
                    expanded,
                    deps,
                });

                expect(expanded ? tags.makerNotes : tags).to.not.have.property('Hidden');
                expect((expanded ? tags.makerNotes : tags).AutoRotate).to.deep.equal({value: 0});
                expect(parsedGroups.makerNotes.Hidden).to.deep.equal({value: 1});
            });

            it(`should merge the containers of two raw profiles group by group without mutating the first in ${mode} mode`, function () {
                const first = getExifContainer({makerNotes: {AutoRotate: {value: 'first'}, LensType: {value: 'first'}}});
                const firstSnapshot = structuredClone(first);

                const {tags, parsedGroups} = buildCarriedGroupTags({
                    steps: [{slot: 'pngText', mode: 'nested', blocks: [
                        ...first.blocks,
                        ...getExifContainer({makerNotes: {AutoRotate: {value: 'second'}}}, {Model: {value: 'second'}}).blocks,
                    ]}],
                    expanded,
                });

                const makerNotes = expanded ? tags.makerNotes : tags;
                expect(makerNotes.AutoRotate).to.deep.equal({value: 'second'});
                expect(makerNotes.LensType).to.deep.equal({value: 'first'});
                expect((expanded ? tags.exif : tags).Model).to.deep.equal({value: 'second'});
                expect(parsedGroups.makerNotes).to.deep.equal({AutoRotate: {value: 'second'}, LensType: {value: 'first'}});
                expect(first).to.deep.equal(firstSnapshot);
            });
        }

        it('should keep a _raw tag of a carried group other than XMP in flat mode', function () {
            const {tags} = buildCarriedGroupTags({
                steps: [getExifContainer({makerNotes: {_raw: {value: 'maker notes'}}})],
                expanded: false,
            });

            expect(tags._raw).to.deep.equal({value: 'maker notes'});
        });

        it('should let Exif win over the maker notes, and ApplicationNotes XMP over Exif, in flat mode', function () {
            const {tags} = buildCarriedGroupTags({
                steps: [getExifContainer({
                    makerNotes: {LensModel: {value: 'maker notes'}, Rating: {value: 'maker notes'}},
                    xmp: {Rating: {value: 'xmp'}},
                }, {LensModel: {value: 'exif'}, Rating: {value: 'exif'}})],
                expanded: false,
            });

            expect(tags.LensModel.value).to.equal('exif');
            expect(tags.Rating.value).to.equal('xmp');
        });

        it('should return the carried groups ahead of Exif and in reading order in expanded mode', function () {
            const {tags} = buildCarriedGroupTags({
                steps: [getExifContainer({
                    makerNotes: CARRIED_GROUPS.makerNotes,
                    icc: CARRIED_GROUPS.icc,
                    photoshop: CARRIED_GROUPS.photoshop,
                    xmp: CARRIED_GROUPS.xmp,
                    iptc: CARRIED_GROUPS.iptc,
                }), {slot: 'pngFile', group: 'png', mode: 'pngFile', tags: {Width: {value: 1}}}],
                expanded: true,
            });

            expect(Object.keys(tags)).to.deep.equal(['iptc', 'xmp', 'photoshop', 'icc', 'makerNotes', 'exif', 'png', 'pngFile']);
        });

        it('should merge a container nested in a container', function () {
            const {tags} = buildCarriedGroupTags({
                steps: [{slot: 'pngText', mode: 'nested', blocks: [
                    {slot: 'pngText', group: 'png', mode: 'pngTextTags', tags: {Comment: {value: 'text'}}},
                    {slot: 'exif', mode: 'nested', blocks: [
                        {slot: 'exif', group: 'exif', mode: 'merge', tags: {Model: {value: 'model'}}},
                        {slot: 'carriedIptc', group: 'iptc', mode: 'merge', tags: {Headline: {value: 'h'}}},
                    ]},
                ]}],
                expanded: true,
            });

            expect(Object.keys(tags)).to.deep.equal(['iptc', 'exif', 'png', 'pngText']);
        });

        // The main Exif block's container: the carried groups as read, then Exif.
        function getExifContainer(carriedGroups, exifTags = {Model: {value: 'model'}}) {
            const carriedSlots = {iptc: 'carriedIptc', xmp: 'carriedXmp', photoshop: 'carriedPhotoshop', icc: 'carriedIcc', makerNotes: 'carriedMakerNotes'};
            const blocks = Object.keys(carriedGroups).map((groupKey) => ({
                slot: carriedSlots[groupKey],
                group: groupKey,
                mode: 'merge',
                tags: carriedGroups[groupKey],
            }));
            blocks.unshift({slot: 'exif', group: 'exif', mode: 'merge', tags: exifTags});
            return {slot: 'exif', mode: 'nested', blocks};
        }

        function buildCarriedGroupTags({
            steps,
            expanded,
            tagFilter = createTagFilter({}),
            parsedGroups = {},
            deps = createPipelineDeps(),
        }) {
            const tags = buildBlockTags({blocks: steps, expanded, tagFilter, parsedGroups, deps});
            return {tags, parsedGroups};
        }
    });

    describe('thumbnail step', function () {
        const MAIN_WITH_IMAGE = {type: 'image/jpeg', image: 'main'};
        const MAIN_WITHOUT_IMAGE = {Compression: {value: 1}};

        it('should remove an existing Thumbnail tag when there is no candidate', function () {
            const tags = buildThumbnailTags({candidates: [], tags: {Thumbnail: {value: 'existing'}}});

            expect(tags).to.not.have.property('Thumbnail');
        });

        it('should keep a main thumbnail without an image', function () {
            const tags = buildThumbnailTags({candidates: [getCandidate('main', MAIN_WITHOUT_IMAGE)]});

            expect(tags.Thumbnail).to.equal(MAIN_WITHOUT_IMAGE);
        });

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should return an embedded thumbnail top level when there is no main one in ${mode} mode`, function () {
                const embedded = getEmbeddedThumbnail('raw');

                const tags = buildThumbnailTags({
                    candidates: [{slot: 'exif', mode: 'nested', blocks: [
                        {slot: 'exif', group: 'exif', mode: 'merge', tags: {Model: {value: 'model'}}},
                        getCandidate('embedded', embedded),
                    ]}],
                    expanded,
                });

                expect(tags.Thumbnail).to.equal(embedded);
                expect(expanded ? tags.exif : tags).to.have.property('Model');
                if (expanded) {
                    expect(tags.exif).to.not.have.property('Thumbnail');
                }
            });
        }

        it('should return the main thumbnail when it has an image, over an embedded one', function () {
            const tags = buildThumbnailTags({candidates: [getCandidate('embedded', getEmbeddedThumbnail('raw')), getCandidate('main', MAIN_WITH_IMAGE)]});

            expect(tags.Thumbnail).to.equal(MAIN_WITH_IMAGE);
        });

        it('should return an embedded thumbnail with an image over a main one without', function () {
            const embedded = getEmbeddedThumbnail('raw');

            const tags = buildThumbnailTags({candidates: [getCandidate('main', MAIN_WITHOUT_IMAGE), getCandidate('embedded', embedded)]});

            expect(tags.Thumbnail).to.equal(embedded);
        });

        it('should return the main thumbnail without an image when no embedded one has an image', function () {
            const tags = buildThumbnailTags({candidates: [
                getCandidate('main', MAIN_WITHOUT_IMAGE),
                getCandidate('embedded', {type: 'image/jpeg'}),
                getCandidate('embedded', {Compression: {value: 6}}),
            ]});

            expect(tags.Thumbnail).to.equal(MAIN_WITHOUT_IMAGE);
        });

        it('should never return an embedded thumbnail without an image', function () {
            const tags = buildThumbnailTags({candidates: [getCandidate('embedded', {type: 'image/jpeg'}), getCandidate('embedded', {Compression: {value: 6}})]});

            expect(tags).to.not.have.property('Thumbnail');
        });

        it('should return the first embedded thumbnail with an image in merge order', function () {
            const firstWithImage = getEmbeddedThumbnail('first');

            const tags = buildThumbnailTags({candidates: [
                {slot: 'deferredPngText', mode: 'nested', blocks: [getCandidate('embedded', getEmbeddedThumbnail('deferred'))]},
                getCandidate('embedded', {type: 'image/jpeg'}),
                {slot: 'pngText', mode: 'nested', blocks: [getCandidate('embedded', firstWithImage), getCandidate('embedded', getEmbeddedThumbnail('second'))]},
            ]});

            expect(tags.Thumbnail).to.equal(firstWithImage);
        });

        it('should return no thumbnail when the thumbnail group is filtered out', function () {
            const tags = buildThumbnailTags({
                candidates: [getCandidate('main', MAIN_WITH_IMAGE)],
                tagFilter: createTagFilter({returnGroups: {thumbnail: false}}),
            });

            expect(tags).to.not.have.property('Thumbnail');
        });

        it('should return no thumbnail when the Thumbnail tag is filtered out', function () {
            const tags = buildThumbnailTags({
                candidates: [getCandidate('main', MAIN_WITH_IMAGE)],
                tagFilter: createTagFilter({returnTags: {'thumbnail.Thumbnail': false}}),
            });

            expect(tags).to.not.have.property('Thumbnail');
        });

        for (const constant of ['USE_EXIF', 'USE_THUMBNAIL']) {
            it(`should return no thumbnail in a build without ${constant}`, function () {
                swap(Constants, {[constant]: false});

                const tags = buildThumbnailTags({candidates: [getCandidate('main', MAIN_WITH_IMAGE)]});

                expect(tags).to.not.have.property('Thumbnail');
            });
        }

        it('should take the candidates given to mergeBlock', function () {
            const thumbnails = [{rank: 'embedded', thumbnail: getEmbeddedThumbnail('raw')}];

            const tags = mergeBlock({
                block: {slot: 'thumbnail', mode: 'thumbnail'},
                parsedGroups: {},
                expanded: false,
                tagFilter: createTagFilter({}),
                dataView: {},
                fileType: undefined,
                thumbnails,
                tags: {},
                deps: createPipelineDeps(),
            });

            expect(tags.Thumbnail).to.equal(thumbnails[0].thumbnail);
        });

        function getEmbeddedThumbnail(image) {
            return {type: 'image/jpeg', image};
        }

        function getCandidate(rank, thumbnail) {
            return {slot: 'thumbnail', group: 'thumbnail', mode: 'thumbnailCandidate', rank, tags: thumbnail};
        }

        function buildThumbnailTags({candidates, expanded = false, tagFilter = createTagFilter({}), tags = {}}) {
            return buildBlockTags({
                blocks: candidates.concat([{slot: 'thumbnail', mode: 'thumbnail'}, {slot: 'file', group: 'file', mode: 'assign', tags}]),
                expanded,
                tagFilter,
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

        const tags = mergeBlock({
            block: {
                slot: 'xmp',
                group: 'xmp',
                mode: 'assign',
                tags: {Collision: {value: 1}, _raw: '<xml/>'},
            },
            parsedGroups: {},
            expanded: false,
            tagFilter,
            dataView: {},
            fileType: undefined,
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
            const tags = mergeBlock({
                block: {slot: 'fileType', mode: 'fileType'},
                parsedGroups: {},
                expanded: true,
                tagFilter: createTagFilter({returnTags: {'file.FileType': false}}),
                dataView: {},
                fileType: LIBRARY_FILE_TYPE,
                tags: {xmp: {FileType: {value: 'from file data'}}},
                deps: createPipelineDeps(),
            });

            expect(tags.xmp.FileType.value).to.equal('from file data');
            expect(tags.file).to.equal(undefined);
        });

        function applyFileTypeStep({tagFilter, fileType}) {
            return mergeBlock({
                block: {slot: 'fileType', mode: 'fileType'},
                parsedGroups: {},
                expanded: false,
                tagFilter,
                dataView: {},
                fileType,
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

            const tags = mergeBlock({
                block: {slot: 'metadataRange', mode: 'metadataRange', metadataBlocks: blocks},
                parsedGroups: {},
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 1024},
                fileType: undefined,
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
            const tags = mergeBlock({
                block: {
                    slot: 'metadataRange',
                    mode: 'metadataRange',
                    metadataBlocks: [{type: 'exif', start: 2, end: 100}],
                    metadataTruncated: true,
                },
                parsedGroups: {},
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 1024},
                fileType: undefined,
                tags: {},
                deps: createPipelineDeps(),
            });

            expect(tags.metadataRange.complete).to.equal(false);
            expect(tags.metadataRange.end).to.equal(100);
        });

        it('should mark complete:false when a block end exceeds dataView.byteLength', function () {
            const tags = mergeBlock({
                block: {
                    slot: 'metadataRange',
                    mode: 'metadataRange',
                    metadataBlocks: [
                        {type: 'exif', start: 2, end: 9999},
                    ],
                },
                parsedGroups: {},
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 1024},
                fileType: undefined,
                tags: {},
                deps: createPipelineDeps(),
            });

            expect(tags.metadataRange.end).to.equal(9999);
            expect(tags.metadataRange.complete).to.equal(false);
        });

        it('should not attach metadataRange in flat mode', function () {
            const tags = mergeBlock({
                block: {
                    slot: 'metadataRange',
                    mode: 'metadataRange',
                    metadataBlocks: [{type: 'exif', start: 0, end: 100}],
                },
                parsedGroups: {},
                expanded: false,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 1024},
                fileType: undefined,
                tags: {},
                deps: createPipelineDeps(),
            });

            expect(tags.metadataRange).to.equal(undefined);
        });

        it('should not attach metadataRange when there are no blocks', function () {
            const tags = mergeBlock({
                block: {slot: 'metadataRange', mode: 'metadataRange', metadataBlocks: []},
                parsedGroups: {},
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 1024},
                fileType: undefined,
                tags: {},
                deps: createPipelineDeps(),
            });

            expect(tags.metadataRange).to.equal(undefined);
        });

        it('should sort blocks by start', function () {
            const tags = mergeBlock({
                block: {
                    slot: 'metadataRange',
                    mode: 'metadataRange',
                    metadataBlocks: [
                        {type: 'xmp', start: 100, end: 200},
                        {type: 'exif', start: 2, end: 100},
                    ],
                },
                parsedGroups: {},
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 1024},
                fileType: undefined,
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

            const tags = mergeBlock({
                block: {
                    slot: 'metadataRange',
                    mode: 'metadataRange',
                    metadataBlocks: [{type: 'mpf', start: 2, end: 200}],
                },
                parsedGroups,
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 9000},
                fileType: undefined,
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

            const tags = mergeBlock({
                block: {
                    slot: 'metadataRange',
                    mode: 'metadataRange',
                    metadataBlocks: [{type: 'mpf', start: 2, end: 200}],
                },
                parsedGroups,
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 8000},
                fileType: undefined,
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

            const tags = mergeBlock({
                block: {
                    slot: 'metadataRange',
                    mode: 'metadataRange',
                    metadataBlocks: [
                        {type: 'mpf', start: 2, end: 200},
                    ],
                },
                parsedGroups,
                expanded: true,
                tagFilter: createTagFilter({}),
                dataView: {byteLength: 9000},
                fileType: undefined,
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

        const tags = buildTagsFromMergeBlocks({
            mergeBlocks: [
                {slot: 'file', group: 'file', mode: 'assign', tags: {Collision: {value: 'first'}}},
                {slot: 'exif', group: 'exif', mode: 'assign', tags: {Collision: {value: 'second'}}},
            ],
            parsedGroups: {},
            expanded: false,
            tagFilter,
            dataView: {},
            fileType: undefined,
            pngTextBlocks: [],
            pngTextIsAsync: false,
            deps: createPipelineDeps(),
        });

        expect(tags.Collision.value).to.equal('second');
    });

    describe('many PNG text blocks', function () {
        const MANY_BLOCKS = 8000;

        it('should merge many pngTextTags blocks in linear time in flat mode', function () {
            this.timeout(LINEAR_TIME_TIMEOUT_MS);
            this.retries(2);
            const baselineBlocks = getSingleTagBlocks(MANY_BLOCKS / 8);
            const blocks = getSingleTagBlocks(MANY_BLOCKS);

            const tags = expectTimeRatioBelow(
                () => buildBlockTags({blocks: baselineBlocks, expanded: false}),
                () => buildBlockTags({blocks, expanded: false}),
                24
            );

            expect(Object.keys(tags)).to.have.lengthOf(MANY_BLOCKS);
            expect(tags[`k${MANY_BLOCKS - 1}`].value).to.equal(MANY_BLOCKS - 1);
        });

        it('should merge many pngTextTags blocks in linear time in expanded mode', function () {
            this.timeout(LINEAR_TIME_TIMEOUT_MS);
            this.retries(2);
            const baselineBlocks = getSingleTagBlocks(MANY_BLOCKS / 8);
            const blocks = getSingleTagBlocks(MANY_BLOCKS);

            const tags = expectTimeRatioBelow(
                () => buildBlockTags({blocks: baselineBlocks, expanded: true}),
                () => buildBlockTags({blocks, expanded: true}),
                24
            );

            expect(Object.keys(tags.png)).to.have.lengthOf(MANY_BLOCKS);
            expect(Object.keys(tags.pngText)).to.have.lengthOf(MANY_BLOCKS);
        });

        it('should merge many blocks nested in one container in linear time', function () {
            this.timeout(LINEAR_TIME_TIMEOUT_MS);
            this.retries(2);
            const baselineBlocks = getSingleTagBlocks(MANY_BLOCKS / 8);
            const blocks = getSingleTagBlocks(MANY_BLOCKS);

            const tags = expectTimeRatioBelow(
                () => buildBlockTags({blocks: [{slot: 'pngText', mode: 'nested', blocks: baselineBlocks}], expanded: true}),
                () => buildBlockTags({blocks: [{slot: 'pngText', mode: 'nested', blocks}], expanded: true}),
                24
            );

            expect(Object.keys(tags.png)).to.have.lengthOf(MANY_BLOCKS);
        });

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should let a later duplicate keyword win in ${mode} mode`, function () {
                const tags = buildBlockTags({
                    blocks: [getTextTagsBlock({k: {value: 'first'}}), getTextTagsBlock({k: {value: 'second'}})],
                    expanded,
                });

                expect((expanded ? tags.png : tags).k.value).to.equal('second');
            });
        }

        it('should not mutate the PNG file tags from an earlier pngFile block', function () {
            const fileTags = {Width: {value: 1}};

            const tags = buildBlockTags({
                blocks: [{slot: 'pngFile', group: 'png', mode: 'pngFile', tags: fileTags}, getTextTagsBlock({k: {value: 'text'}})],
                expanded: true,
            });

            expect(fileTags).to.deep.equal({Width: {value: 1}});
            expect(tags.pngFile).to.equal(fileTags);
            expect(tags.png).to.deep.equal({Width: {value: 1}, k: {value: 'text'}});
        });

        it('should not mutate the tags of a pngTextTags block', function () {
            const textTags = {k: {value: 'first'}};

            const tags = buildBlockTags({
                blocks: [getTextTagsBlock(textTags), getTextTagsBlock({k: {value: 'second'}})],
                expanded: true,
            });

            expect(textTags).to.deep.equal({k: {value: 'first'}});
            expect(tags.png.k.value).to.equal('second');
        });

        function getSingleTagBlocks(count) {
            const blocks = [];
            for (let i = 0; i < count; i++) {
                blocks.push(getTextTagsBlock({['k' + i]: {value: i}}));
            }
            return blocks;
        }

        function getTextTagsBlock(tags) {
            return {slot: 'pngText', group: 'png', mode: 'pngTextTags', tags};
        }
    });

    describe('icc block', function () {
        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should write the parsed icc group, also when the icc group is not returned, in ${mode} mode`, function () {
                const parsedGroups = {};
                const iccTags = {ProfileVersion: {value: '4.3'}};

                const tags = buildBlockTags({
                    blocks: [{slot: 'icc', group: 'icc', mode: 'assign', tags: iccTags}],
                    expanded,
                    parsedGroups,
                    tagFilter: createTagFilter({returnGroups: {icc: false}}),
                });

                expect(tags).to.deep.equal({});
                expect(parsedGroups.icc).to.equal(iccTags);
            });
        }

        it('should return an empty icc group for an empty ICC result in expanded output', function () {
            const parsedGroups = {};

            const tags = buildBlockTags({
                blocks: [{slot: 'icc', group: 'icc', mode: 'assign', tags: {}}],
                expanded: true,
                parsedGroups,
            });

            expect(tags).to.deep.equal({icc: {}});
            expect(parsedGroups.icc).to.deep.equal({});
        });
    });

    describe('brob XMP block', function () {
        const EARLIER_XMP = {Title: {value: 'earlier'}, Keep: {value: 'earlier'}, _raw: '<earlier/>'};

        it('should replace a non-empty earlier xmp group in expanded output', function () {
            const tags = buildBrobXmpTags({brobTags: {Title: {value: 'brob'}, _raw: '<brob/>'}, expanded: true});

            expect(tags.xmp).to.deep.equal({Title: {value: 'brob'}, _raw: '<brob/>'});
        });

        it('should merge into the earlier XMP tags key by key, without _raw, in flat output', function () {
            const tags = buildBrobXmpTags({brobTags: {Title: {value: 'brob'}, _raw: '<brob/>'}, expanded: false});

            expect(tags).to.deep.equal({Title: {value: 'brob'}, Keep: {value: 'earlier'}});
        });

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should leave the earlier xmp group and the parsed xmp group alone for an empty brob XMP in ${mode} mode`, function () {
                const parsedGroups = {xmp: EARLIER_XMP};

                const tags = buildBrobXmpTags({brobTags: {}, expanded, parsedGroups});

                expect(parsedGroups.xmp).to.equal(EARLIER_XMP);
                if (expanded) {
                    expect(tags.xmp).to.deep.equal(EARLIER_XMP);
                } else {
                    expect(tags).to.deep.equal({Title: {value: 'earlier'}, Keep: {value: 'earlier'}});
                }
            });

            it(`should write the parsed xmp group even when the xmp group is not returned in ${mode} mode`, function () {
                const parsedGroups = {xmp: EARLIER_XMP};
                const brobTags = {Title: {value: 'brob'}};

                const tags = buildBlockTags({
                    blocks: [getBrobXmpBlock(brobTags)],
                    expanded,
                    parsedGroups,
                    tagFilter: createTagFilter({returnGroups: {xmp: false}}),
                });

                expect(tags).to.deep.equal({});
                expect(parsedGroups.xmp).to.equal(brobTags);
            });

            it(`should merge nothing in a build without JXL in ${mode} mode`, function () {
                swap(Constants, {USE_JXL: false});
                const parsedGroups = {};

                const tags = buildBlockTags({
                    blocks: [getBrobXmpBlock({Title: {value: 'brob'}})],
                    expanded,
                    parsedGroups,
                });

                expect(tags).to.deep.equal({});
                expect(parsedGroups).to.deep.equal({});
            });
        }

        function buildBrobXmpTags({brobTags, expanded, parsedGroups = {}}) {
            return buildBlockTags({
                blocks: [getBrobXmpBlock(brobTags), {slot: 'xmp', group: 'xmp', mode: 'assign', tags: EARLIER_XMP}],
                expanded,
                parsedGroups,
            });
        }

        function getBrobXmpBlock(tags) {
            return {slot: 'brobXmp', group: 'xmp', mode: 'brobXmp', tags};
        }
    });

    describe('PNG fan-out', function () {
        const FILE_TAGS = {Width: {value: 'file'}, Shared: {value: 'file'}};
        const TEXT_TAGS = {Comment: {value: 'text'}, Shared: {value: 'text'}};
        const CHUNK_TAGS = {PixelsPerUnitX: {value: 'chunk'}, Shared: {value: 'chunk'}};

        it('should gather the file, text and chunk tags into png in that order whatever the push order', function () {
            const tags = buildPngTags({blocks: getPngBlocks().reverse()});

            expect(Object.keys(tags.png)).to.deep.equal(['Width', 'Shared', 'Comment', 'PixelsPerUnitX']);
            expect(tags.png.Shared.value).to.equal('chunk');
        });

        it('should keep the file tags alone in pngFile and the text tags in pngText', function () {
            const tags = buildPngTags({blocks: getPngBlocks()});

            expect(Object.keys(tags)).to.deep.equal(['png', 'pngFile', 'pngText']);
            expect(tags.pngFile).to.deep.equal(FILE_TAGS);
            expect(tags.pngText).to.deep.equal(TEXT_TAGS);
        });

        it('should let the text tags win over the file tags, and the chunk tags over the text tags, in flat output', function () {
            const tags = buildPngTags({blocks: getPngBlocks().reverse(), expanded: false});

            expect(Object.keys(tags)).to.deep.equal(['Width', 'Shared', 'Comment', 'PixelsPerUnitX']);
            expect(tags.Shared.value).to.equal('chunk');
        });

        it('should add no pngText group for a text block without text tags', function () {
            const tags = buildPngTags({blocks: [getFileBlock(), getTextBlock({})]});

            expect(Object.keys(tags)).to.deep.equal(['png', 'pngFile']);
        });

        it('should copy png into pngText when there are text chunks but no text tags', function () {
            const tags = buildPngTags({
                blocks: [getFileBlock(), {slot: 'pngText', mode: 'nested', blocks: [getTextBlock({}), {slot: 'exif', group: 'exif', mode: 'merge', tags: {Model: {value: 'model'}}}]}],
                hasPngTextData: true,
            });

            expect(Object.keys(tags)).to.deep.equal(['png', 'pngFile', 'exif', 'pngText']);
            expect(tags.pngText).to.deep.equal(FILE_TAGS);
            expect(tags.pngText).to.not.equal(tags.png);
        });

        it('should keep the text tags in pngText when there are text chunks', function () {
            const tags = buildPngTags({blocks: getPngBlocks(), hasPngTextData: true});

            expect(tags.pngText).to.deep.equal(TEXT_TAGS);
        });

        it('should replace pngText with a copy of png when the text chunks are read asynchronously', function () {
            const tags = buildPngTags({blocks: getPngBlocks(), pngTextIsAsync: true});

            expect(tags.pngText).to.deep.equal(tags.png);
            expect(tags.pngText).to.not.equal(tags.png);
        });

        for (const [description, options] of [
            ['in flat output', {expanded: false}],
            ['without a png group', {blocks: [{slot: 'exif', group: 'exif', mode: 'assign', tags: {Model: {value: 'model'}}}]}],
            ['when png is not returned', {tagFilter: createTagFilter({returnGroups: {png: false}})}],
            // Without PNG the pngFile block merges nothing, so a merge block fills png.
            ['in a build without PNG', {constants: {USE_PNG: false}, blocks: [{slot: 'pngChunk', group: 'png', mode: 'merge', tags: CHUNK_TAGS}]}],
        ]) {
            for (const copyOption of ['pngTextIsAsync', 'hasPngTextData']) {
                it(`should not copy png into pngText for ${copyOption} ${description}`, function () {
                    if (options.constants) {
                        swap(Constants, options.constants);
                    }

                    const tags = buildPngTags(objectAssign({blocks: [getFileBlock()], [copyOption]: true}, options));

                    expect(tags).to.not.have.property('pngText');
                });
            }
        }

        it('should not mutate an earlier png group when merging text tags into it', function () {
            const fileTags = structuredClone(FILE_TAGS);

            const tags = buildPngTags({blocks: [getFileBlock(fileTags), getTextBlock(TEXT_TAGS)]});

            expect(fileTags).to.deep.equal(FILE_TAGS);
            expect(tags.pngFile).to.equal(fileTags);
        });

        for (const blockMode of ['pngFile', 'pngTextTags']) {
            it(`should merge nothing from a ${blockMode} block in a build without PNG`, function () {
                swap(Constants, {USE_PNG: false});
                const parsedGroups = {};

                const tags = mergeBlockIntoTags({
                    block: {slot: 'pngText', group: 'png', mode: blockMode, tags: TEXT_TAGS},
                    expanded: true,
                    parsedGroups,
                });

                expect(tags).to.deep.equal({Existing: {value: 'existing'}});
                expect(parsedGroups).to.deep.equal({});
            });
        }

        it('should not return the text tags of a pngTextTags block when png is not returned', function () {
            const tags = mergeBlockIntoTags({
                block: {slot: 'pngText', group: 'png', mode: 'pngTextTags', tags: TEXT_TAGS},
                expanded: true,
                tagFilter: createTagFilter({returnGroups: {png: false}}),
            });

            expect(tags).to.deep.equal({Existing: {value: 'existing'}});
        });

        it('should merge the returned text tags of a pngTextTags block', function () {
            const deps = createPipelineDeps();
            deps.filterTagsForReturn = (groupKey) => ({Returned: {value: groupKey}});

            const tags = mergeBlockIntoTags({
                block: {slot: 'pngText', group: 'png', mode: 'pngTextTags', tags: TEXT_TAGS},
                expanded: true,
                deps,
            });

            expect(tags.png).to.deep.equal({Returned: {value: 'png'}});
            expect(tags.pngText).to.deep.equal({Returned: {value: 'png'}});
        });

        it('should merge the text tags of several blocks at the top level in flat output', function () {
            const tags = buildPngTags({
                blocks: [getTextBlock({A: {value: 1}}), getTextBlock({B: {value: 2}})],
                expanded: false,
            });

            expect(tags).to.deep.equal({A: {value: 1}, B: {value: 2}});
        });

        function getPngBlocks() {
            return [
                getFileBlock(),
                getTextBlock(TEXT_TAGS),
                {slot: 'pngChunk', group: 'png', mode: 'merge', tags: CHUNK_TAGS},
            ];
        }

        function getFileBlock(fileTags = FILE_TAGS) {
            return {slot: 'pngFile', group: 'png', mode: 'pngFile', tags: fileTags};
        }

        function getTextBlock(textTags) {
            return {slot: 'pngText', group: 'png', mode: 'pngTextTags', tags: textTags};
        }

        function buildPngTags({
            blocks,
            expanded = true,
            tagFilter = createTagFilter({}),
            hasPngTextData = false,
            pngTextIsAsync = false,
        }) {
            const deps = createPipelineDeps();
            const pngTextBlocks = [{kind: 'pngText'}];
            deps.hasPngTextData = (blocksToCheck) => hasPngTextData && blocksToCheck === pngTextBlocks;

            return buildBlockTags({blocks, expanded, tagFilter, deps, pngTextBlocks, pngTextIsAsync});
        }
    });

    describe('merge order', function () {
        it('should list the same slots, each once, in both orderings', function () {
            expect(MERGE_ORDER.flat.slice().sort()).to.deep.equal(MERGE_ORDER.expanded.slice().sort());
            expect(new Set(MERGE_ORDER.expanded).size).to.equal(MERGE_ORDER.expanded.length);
        });

        it('should order the groups by slot in expanded output whatever the push order', function () {
            const tags = buildBlockTags({blocks: getReversedExifBlocks(), expanded: true});

            expect(Object.keys(tags)).to.deep.equal(['file', 'xmp', 'makerNotes', 'exif']);
        });

        it('should let the carried XMP win over Exif, and Exif over the maker notes, in flat output whatever the push order', function () {
            const tags = buildBlockTags({blocks: getReversedExifBlocks(), expanded: false});

            expect(tags.Rating.value).to.equal('xmp');
            expect(tags.LensModel.value).to.equal('exif');
            expect(tags.FileSize.value).to.equal('file');
        });

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should merge two blocks of the same slot in push order in ${mode} mode`, function () {
                const tags = buildBlockTags({
                    blocks: [
                        {slot: 'riff', group: 'riff', mode: 'merge', tags: {First: {value: 1}, Collision: {value: 'first'}}},
                        {slot: 'riff', group: 'riff', mode: 'merge', tags: {Second: {value: 2}, Collision: {value: 'second'}}},
                    ],
                    expanded,
                });

                const riffTags = expanded ? tags.riff : tags;
                expect(Object.keys(riffTags)).to.deep.equal(['First', 'Collision', 'Second']);
                expect(riffTags.Collision.value).to.equal('second');
            });
        }

        function getReversedExifBlocks() {
            return [
                {slot: 'exif', group: 'exif', mode: 'assign', tags: {LensModel: {value: 'exif'}, Rating: {value: 'exif'}}},
                {slot: 'carriedXmp', group: 'xmp', mode: 'assign', tags: {Rating: {value: 'xmp'}}},
                {slot: 'carriedMakerNotes', group: 'makerNotes', mode: 'assign', tags: {LensModel: {value: 'maker notes'}}},
                {slot: 'file', group: 'file', mode: 'assign', tags: {FileSize: {value: 'file'}}},
            ];
        }
    });

    describe('tag blocks', function () {
        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            for (const blockMode of ['assign', 'merge', 'pngFile']) {
                it(`should not return the tags of a ${blockMode} block whose group is not returned in ${mode} mode`, function () {
                    const tags = mergeBlockIntoTags({
                        block: {slot: 'pngFile', group: 'png', mode: blockMode, tags: {MyTag: {value: 1}}},
                        expanded,
                        tagFilter: createTagFilter({returnGroups: {png: false}}),
                    });

                    expect(tags).to.deep.equal({Existing: {value: 'existing'}});
                });
            }

            it(`should merge the returned, not the parsed, tags of a block in ${mode} mode`, function () {
                const deps = createPipelineDeps();
                let filterArguments;
                deps.filterTagsForReturn = (...args) => {
                    filterArguments = args;
                    return {Returned: {value: 'returned'}};
                };
                const tagFilter = createTagFilter({});

                const tags = mergeBlockIntoTags({
                    block: {slot: 'riff', group: 'riff', mode: 'merge', tags: {Parsed: {value: 'parsed'}}},
                    expanded,
                    tagFilter,
                    deps,
                });

                expect(filterArguments).to.deep.equal(['riff', {Parsed: {value: 'parsed'}}, tagFilter]);
                expect((expanded ? tags.riff : tags).Returned.value).to.equal('returned');
                expect(expanded ? tags.riff : tags).to.not.have.property('Parsed');
            });

            it(`should drop _raw from a carried XMP block in flat output only, in ${mode} mode`, function () {
                const tags = buildBlockTags({
                    blocks: [{slot: 'carriedXmp', group: 'xmp', mode: 'assign', tags: {Rating: {value: '5'}, _raw: '<x/>'}}],
                    expanded,
                });

                if (expanded) {
                    expect(tags.xmp).to.deep.equal({Rating: {value: '5'}, _raw: '<x/>'});
                } else {
                    expect(tags).to.deep.equal({Rating: {value: '5'}});
                }
            });

            it(`should drop _raw from a merged XMP block in flat output only, in ${mode} mode`, function () {
                const tags = buildBlockTags({
                    blocks: [{slot: 'carriedXmp', group: 'xmp', mode: 'merge', tags: {Rating: {value: '5'}, _raw: '<x/>'}}],
                    expanded,
                });

                expect(expanded ? tags.xmp._raw : tags._raw).to.equal(expanded ? '<x/>' : undefined);
            });
        }

        it('should keep _raw of XMP in flat output in a build without XMP', function () {
            swap(Constants, {USE_XMP: false});

            const tags = buildBlockTags({
                blocks: [{slot: 'xmp', group: 'xmp', mode: 'assign', tags: {_raw: '<x/>'}}],
                expanded: false,
            });

            expect(tags._raw).to.equal('<x/>');
        });
    });

    describe('derived blocks', function () {
        it('should not add a gps group in flat output', function () {
            const deps = createPipelineDeps();
            deps.getGpsGroupFromExifTags = () => ({Latitude: {value: 1}});

            const tags = buildBlockTags({
                blocks: [{slot: 'gps', mode: 'gps'}],
                expanded: false,
                parsedGroups: {exif: {GPSLatitude: {value: 1}}},
                deps,
            });

            expect(tags).to.deep.equal({});
        });

        it('should derive the gps group from the parsed Exif group in expanded output', function () {
            const deps = createPipelineDeps();
            const parsedExifTags = {GPSLatitude: {value: 1}};
            let receivedExifTags;
            deps.getGpsGroupFromExifTags = (exifTags) => {
                receivedExifTags = exifTags;
                return {Latitude: {value: 1}};
            };

            const tags = buildBlockTags({
                blocks: [{slot: 'gps', mode: 'gps'}],
                expanded: true,
                parsedGroups: {exif: parsedExifTags},
                deps,
            });

            expect(receivedExifTags).to.equal(parsedExifTags);
            expect(tags).to.deep.equal({gps: {Latitude: {value: 1}}});
        });

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should give Composite the merged tags and the mode without an active tag filter in ${mode} mode`, function () {
                const {compositeArguments, compositeInputWhenCalled} = buildCompositeTags({expanded, isActive: false});

                const exifTags = {Model: {value: 'model'}};
                expect(compositeInputWhenCalled).to.deep.equal(expanded ? {exif: exifTags} : exifTags);
                expect(compositeArguments[1]).to.equal(expanded);
            });

            it(`should give Composite the parsed exif and file groups, expanded, with an active tag filter in ${mode} mode`, function () {
                const parsedGroups = {exif: {Model: {value: 'parsed'}}, file: {FileSize: {value: 'parsed'}}, xmp: {Rating: {value: 5}}};

                const {compositeArguments} = buildCompositeTags({expanded, isActive: true, parsedGroups});

                expect(compositeArguments[0]).to.deep.equal({exif: parsedGroups.exif, file: parsedGroups.file});
                expect(compositeArguments[0].exif).to.equal(parsedGroups.exif);
                expect(compositeArguments[1]).to.equal(true);
            });
        }

        it('should not add a composite group when it is not returned', function () {
            const {compositeArguments, tags} = buildCompositeTags({
                expanded: true,
                isActive: false,
                tagFilter: createTagFilter({returnGroups: {composite: false}}),
            });

            expect(compositeArguments).to.equal(undefined);
            expect(tags).to.not.have.property('composite');
        });

        function buildCompositeTags({expanded, isActive, parsedGroups = {}, tagFilter = createTagFilter({})}) {
            const deps = createPipelineDeps();
            let compositeArguments;
            let compositeInputWhenCalled;
            deps.Composite = {
                get(...args) {
                    compositeArguments = args;
                    compositeInputWhenCalled = structuredClone(args[0]);
                    return {FieldOfView: {value: 1}};
                },
            };
            tagFilter.isActive = isActive;

            const tags = buildBlockTags({
                blocks: [{slot: 'composite', mode: 'composite'}, {slot: 'exif', group: 'exif', mode: 'assign', tags: {Model: {value: 'model'}}}],
                expanded,
                parsedGroups,
                tagFilter,
                deps,
            });
            return {compositeArguments, compositeInputWhenCalled, tags};
        }
    });

    function buildBlockTags({
        blocks,
        expanded,
        parsedGroups = {},
        tagFilter = createTagFilter({}),
        deps = createPipelineDeps(),
        pngTextBlocks = [],
        pngTextIsAsync = false,
    }) {
        return buildTagsFromMergeBlocks({
            mergeBlocks: blocks,
            parsedGroups,
            expanded,
            tagFilter,
            dataView: {},
            fileType: undefined,
            pngTextBlocks,
            pngTextIsAsync,
            deps,
        });
    }

    function mergeBlockIntoTags({
        block,
        expanded,
        parsedGroups = {},
        tagFilter = createTagFilter({}),
        deps = createPipelineDeps(),
    }) {
        return mergeBlock({
            block,
            tags: {Existing: {value: 'existing'}},
            parsedGroups,
            expanded,
            tagFilter,
            dataView: {},
            fileType: undefined,
            deps,
        });
    }
});

function createPipelineDeps() {
    return {
        objectAssign,
        hasPngTextData() {
            return false;
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

    return mergeBlock({
        block: {slot: 'gps', mode: 'gps'},
        parsedGroups: {exif: {SomeExifTag: {value: 42}}},
        expanded: true,
        tagFilter: createTagFilter({}),
        dataView: {},
        fileType: undefined,
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

    return mergeBlock({
        block: {slot: 'composite', mode: 'composite'},
        parsedGroups: {},
        expanded: false,
        tagFilter: createTagFilter({}),
        dataView: {},
        fileType: undefined,
        tags: {MyTag: {value: 42}},
        deps,
    });
}
