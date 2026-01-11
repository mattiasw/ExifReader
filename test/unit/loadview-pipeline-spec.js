/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {objectAssign} from '../../src/utils.js';
import {
    addPngTextReadTagsToTagsAndGroups,
    applyMergeStep,
    buildTagsFromMergeSteps,
    mergeAssignGroup,
    mergeMergeGroup,
} from '../../src/loadview-pipeline.js';

describe('loadView pipeline module', function () {
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
        const readTags = {
            __exif: {EmbeddedExif: {value: 'x'}},
            __iptc: {EmbeddedIptc: {value: 'y'}},
            PngTag: {value: 'z'},
        };
        const parsedGroups = {};
        const tagFilter = createTagFilter({
            returnGroups: {
                exif: true,
                iptc: true,
                png: false,
            },
        });

        const tags = addPngTextReadTagsToTagsAndGroups({
            readTags,
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
        Constants: {
            USE_JPEG: true,
            USE_WEBP: true,
            USE_EXIF: true,
            USE_THUMBNAIL: true,
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
