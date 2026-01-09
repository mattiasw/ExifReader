/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {BIG_ENDIAN} from '../../src/byte-order.js';
import * as ExifReader from '../../src/exif-reader';
import {__RewireAPI__ as ExifReaderRewireAPI} from '../../src/exif-reader';

describe('tag filtering options', function () {
    afterEach(() => {
        ExifReaderRewireAPI.__ResetDependency__('ImageHeader');
        ExifReaderRewireAPI.__ResetDependency__('Tags');
        ExifReaderRewireAPI.__ResetDependency__('PngTextTags');
        ExifReaderRewireAPI.__ResetDependency__('XmpTags');
        ExifReaderRewireAPI.__ResetDependency__('IccTags');
        ExifReaderRewireAPI.__ResetDependency__('Thumbnail');
    });

    it('excludeTags.exif should exclude a tag by name', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        rewireTagsRead({
            DateTimeOriginal: {id: 0x9003, value: '2020:01:01 00:00:00'},
        });

        const tags = ExifReader.loadView({}, {
            excludeTags: {
                exif: ['DateTimeOriginal'],
            },
        });

        expect(tags.DateTimeOriginal).to.equal(undefined);
    });

    it('excludeTags.exif should exclude a tag by id', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        rewireTagsRead({
            DateTimeOriginal: {id: 0x9003, value: '2020:01:01 00:00:00'},
        });

        const tags = ExifReader.loadView({}, {
            excludeTags: {
                exif: [0x9003],
            },
        });

        expect(tags.DateTimeOriginal).to.equal(undefined);
    });

    it('includeTags should override excludeTags for the same group (excludeAll)', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        rewireTagsRead({
            DateTimeOriginal: {id: 0x9003, value: '2020:01:01 00:00:00'},
        });

        const tags = ExifReader.loadView({}, {
            includeTags: {
                exif: true,
            },
            excludeTags: {
                exif: true,
            },
        });

        expect(tags.DateTimeOriginal).to.not.equal(undefined);
    });

    it('includeTags should override excludeTags for the same group (selectors)', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        rewireTagsRead({
            DateTimeOriginal: {id: 0x9003, value: '2020:01:01 00:00:00'},
        });

        const tags = ExifReader.loadView({}, {
            includeTags: {
                exif: true,
            },
            excludeTags: {
                exif: ['DateTimeOriginal'],
            },
        });

        expect(tags.DateTimeOriginal).to.not.equal(undefined);
    });

    it('includeTags should be an include-pattern and exclude groups not mentioned', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        rewireTagsRead({
            DateTimeOriginal: {id: 0x9003, value: '2020:01:01 00:00:00'},
        });

        const tags = ExifReader.loadView({}, {
            includeTags: {
                exif: true,
            },
        });

        expect(tags.DateTimeOriginal).to.not.equal(undefined);
        expect(tags.FileType).to.equal(undefined);
    });

    it('includeTags should allow filtering output to empty without throwing', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        rewireTagsRead({
            DateTimeOriginal: {id: 0x9003, value: '2020:01:01 00:00:00'},
        });

        expect(() => {
            ExifReader.loadView({}, {
                includeTags: {
                    exif: ['NonExistentTag'],
                },
            });
        }).to.not.throw();
    });

    it('excludeTags: { png: true } should not block embedded exif tags', function () {
        rewireImageHeader({
            fileType: 'png',
            pngTextChunks: [{type: 'tEXt', offset: 1, length: 1}],
        });
        rewirePngTextTagsRead({
            __exif: {
                UserComment: {id: 0x9286, value: 'Hello'},
            },
            'Color Type': {value: 2, description: 'RGB'},
        });

        const tags = ExifReader.loadView({}, {
            excludeTags: {
                png: true,
            },
        });

        expect(tags.UserComment).to.not.equal(undefined);
        expect(tags['Color Type']).to.equal(undefined);
    });

    it('includeTags: { png: true } should not include embedded exif when exif is not included', function () {
        rewireImageHeader({
            fileType: 'png',
            pngTextChunks: [{type: 'tEXt', offset: 1, length: 1}],
        });
        rewirePngTextTagsRead({
            __exif: {
                UserComment: {id: 0x9286, value: 'Hello'},
            },
            'Color Type': {value: 2, description: 'RGB'},
        });

        const tags = ExifReader.loadView({}, {
            includeTags: {
                png: true,
            },
        });

        expect(tags['Color Type']).to.not.equal(undefined);
        expect(tags.UserComment).to.equal(undefined);
    });

    it('includeTags.xmp should filter tags (xmpChunks path)', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            xmpChunks: [{dataOffset: 0, length: 1}],
        });
        rewireXmpTagsRead({
            DateTimeOriginal: {value: '2020:01:01 00:00:00'},
            Other: {value: 'ignored'},
            _raw: '<xml/>',
        });

        const tags = ExifReader.loadView({}, {
            expanded: true,
            includeTags: {
                xmp: ['DateTimeOriginal'],
            },
        });

        expect(tags.xmp.DateTimeOriginal).to.not.equal(undefined);
        expect(tags.xmp.Other).to.equal(undefined);
        expect(tags.xmp._raw).to.equal(undefined);
    });

    it('includeTags.xmp should filter tags (embedded ApplicationNotes path)', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        rewireTagsRead({
            ApplicationNotes: {
                id: 0x02bc,
                value: [60, 120, 109, 112, 47, 62],
            },
        });
        rewireXmpTagsRead({
            DateTimeOriginal: {value: '2020:01:01 00:00:00'},
            Other: {value: 'ignored'},
            _raw: '<xml/>',
        });

        const tags = ExifReader.loadView({}, {
            expanded: true,
            includeTags: {
                xmp: ['DateTimeOriginal'],
            },
        });

        expect(tags.xmp.DateTimeOriginal).to.not.equal(undefined);
        expect(tags.xmp.Other).to.equal(undefined);
        expect(tags.xmp._raw).to.equal(undefined);
    });

    it('includeTags.file should control FileType output', function () {
        rewireImageHeader({
            fileType: 'jpeg',
        });

        const tags = ExifReader.loadView({}, {
            includeTags: {
                file: ['SomeOtherFileTag'],
            },
        });

        expect(tags.FileType).to.equal(undefined);
    });

    it('includeTags.file: [FileType] should return FileType', function () {
        rewireImageHeader({
            fileType: 'jpeg',
        });

        const tags = ExifReader.loadView({}, {
            includeTags: {
                file: ['FileType'],
            },
        });

        expect(tags.FileType).to.equal('jpeg');
    });

    it('excludeTags.file: [FileType] should remove FileType', function () {
        rewireImageHeader({
            fileType: 'jpeg',
        });

        const tags = ExifReader.loadView({}, {
            excludeTags: {
                file: ['FileType'],
            },
        });

        expect(tags.FileType).to.equal(undefined);
    });

    it('includeTags.thumbnail should return the top-level Thumbnail', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        rewireTagsRead({
            Thumbnail: {
                JPEGInterchangeFormat: {id: 0x0201, value: 42},
                JPEGInterchangeFormatLength: {id: 0x0202, value: 99},
            },
        });
        rewireThumbnailGet((_, thumbnailIfdTags) => {
            if (
                thumbnailIfdTags
                && thumbnailIfdTags.JPEGInterchangeFormat
                && thumbnailIfdTags.JPEGInterchangeFormatLength
            ) {
                return {value: 'thumb'};
            }

            return undefined;
        });

        const tags = ExifReader.loadView({}, {
            includeTags: {
                thumbnail: ['Thumbnail'],
            },
        });

        expect(tags.Thumbnail).to.not.equal(undefined);
    });

    it('excludeTags.thumbnail: [Thumbnail] should remove top-level Thumbnail', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        rewireTagsRead({
            Thumbnail: {
                JPEGInterchangeFormat: {id: 0x0201, value: 42},
                JPEGInterchangeFormatLength: {id: 0x0202, value: 99},
            },
        });
        rewireThumbnailGet(() => ({value: 'thumb'}));

        const tags = ExifReader.loadView({}, {
            excludeTags: {
                thumbnail: ['Thumbnail'],
            },
        });

        expect(tags.Thumbnail).to.equal(undefined);
    });

    it('includeTags.icc should filter embedded ICC tags', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        rewireTagsRead({
            ICC_Profile: {id: 0x8773, value: [1, 2, 3]},
        });
        rewireIccTagsRead({
            ProfileDescription: {value: 'keep'},
            Other: {value: 'drop'},
        });

        const tags = ExifReader.loadView({}, {
            expanded: true,
            includeTags: {
                icc: ['ProfileDescription'],
            },
        });

        expect(tags.icc.ProfileDescription).to.not.equal(undefined);
        expect(tags.icc.Other).to.equal(undefined);
    });

    it('includeTags.gps should filter computed gps group fields', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        rewireTagsRead({
            GPSLatitude: {id: 0x0002, value: [[1, 1], [2, 1], [3, 1]]},
            GPSLatitudeRef: {id: 0x0001, value: ['N']},
            GPSLongitude: {id: 0x0004, value: [[1, 1], [2, 1], [3, 1]]},
            GPSLongitudeRef: {id: 0x0003, value: ['E']},
        });

        const tags = ExifReader.loadView({}, {
            expanded: true,
            includeTags: {
                gps: ['Latitude'],
            },
        });

        expect(tags.gps.Latitude).to.not.equal(undefined);
        expect(tags.gps.Longitude).to.equal(undefined);
    });

    it('includeTags.xmp: [] should skip XMP parsing', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            xmpChunks: [{dataOffset: 0, length: 1}],
        });
        rewireXmpTagsReadToThrow();

        const tags = ExifReader.loadView({}, {
            expanded: true,
            includeTags: {
                xmp: [],
            },
        });

        expect(tags.xmp).to.equal(undefined);
    });

    it('includeTags.xmp: [] should not trigger Exif parsing as a dependency', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        rewireTagsReadToThrow();

        const tags = ExifReader.loadView({}, {
            includeTags: {
                xmp: [],
            },
        });

        expect(Object.keys(tags).length).to.equal(0);
    });

    it('includeTags.icc: [] should skip ICC parsing', function () {
        rewireImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
            iccChunks: [{dataOffset: 0, length: 1}],
        });
        rewireTagsReadToThrow();
        rewireIccTagsReadToThrow();

        const tags = ExifReader.loadView({}, {
            expanded: true,
            includeTags: {
                icc: [],
            },
        });

        expect(tags.icc).to.equal(undefined);
    });
});

function rewireImageHeader(appMarkersValue) {
    ExifReaderRewireAPI.__Rewire__('ImageHeader', {
        parseAppMarkers() {
            return appMarkersValue;
        },
    });
}

function rewireTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('Tags', {
        read() {
            return {tags: tagsValue, byteOrder: BIG_ENDIAN};
        },
    });
}

function rewireTagsReadToThrow() {
    ExifReaderRewireAPI.__Rewire__('Tags', {
        read() {
            throw new Error('Tags.read was called.');
        },
    });
}

function rewirePngTextTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('PngTextTags', {
        read() {
            return {readTags: tagsValue, readTagsPromise: undefined};
        },
    });
}

function rewireXmpTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('XmpTags', {
        read() {
            return tagsValue;
        },
    });
}

function rewireXmpTagsReadToThrow() {
    ExifReaderRewireAPI.__Rewire__('XmpTags', {
        read() {
            throw new Error('XmpTags.read was called.');
        },
    });
}

function rewireIccTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('IccTags', {
        read() {
            return tagsValue;
        },
    });
}

function rewireIccTagsReadToThrow() {
    ExifReaderRewireAPI.__Rewire__('IccTags', {
        read() {
            throw new Error('IccTags.read was called.');
        },
    });
}

function rewireThumbnailGet(getFunction) {
    ExifReaderRewireAPI.__Rewire__('Thumbnail', {
        get: getFunction,
    });
}
