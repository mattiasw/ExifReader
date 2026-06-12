/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {swapProperties} from './test-utils.js';
import ByteOrder from '../../src/byte-order.js';
import * as ExifReader from '../../src/exif-reader.js';
import ImageHeader from '../../src/image-header.js';
import Tags from '../../src/tags.js';
import CanonTags from '../../src/canon-tags.js';
import PngTextTags from '../../src/png-text-tags.js';
import XmpTags from '../../src/xmp-tags.js';
import IccTags from '../../src/icc-tags.js';
import FileTags from '../../src/file-tags.js';
import Thumbnail from '../../src/thumbnail.js';
import Composite from '../../src/composite.js';

const restoreFunctions = [];

describe('tag filtering options', function () {
    afterEach(() => {
        restoreAllFakes();
    });

    it('excludeTags.exif should exclude a tag by name', function () {
        fakeImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        fakeTagsRead({
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
        fakeImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        fakeTagsRead({
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
        fakeImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        fakeTagsRead({
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
        fakeImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        fakeTagsRead({
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
        fakeImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        fakeTagsRead({
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
        fakeImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        fakeTagsRead({
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
        fakeImageHeader({
            fileType: 'png',
            pngTextChunks: [{type: 'tEXt', offset: 1, length: 1}],
        });
        fakePngTextTagsRead({
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
        fakeImageHeader({
            fileType: 'png',
            pngTextChunks: [{type: 'tEXt', offset: 1, length: 1}],
        });
        fakePngTextTagsRead({
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
        fakeImageHeader({
            fileType: 'jpeg',
            xmpChunks: [{dataOffset: 0, length: 1}],
        });
        fakeXmpTagsRead({
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
        fakeImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        fakeTagsRead({
            ApplicationNotes: {
                id: 0x02bc,
                value: [60, 120, 109, 112, 47, 62],
            },
        });
        fakeXmpTagsRead({
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
        fakeImageHeader({
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
        fakeImageHeader({
            fileType: 'jpeg',
        });

        const tags = ExifReader.loadView({}, {
            includeTags: {
                file: ['FileType'],
            },
        });

        expect(tags.FileType).to.equal('jpeg');
    });

    it('includeTags: { composite: true, file: [FileType] } should still parse file deps for composite', function () {
        fakeImageHeader({
            fileType: {value: 'jpeg', description: 'JPEG'},
            fileDataOffset: 1,
        });
        fakeFileTagsRead({
            'Image Width': {value: 4000},
            'Image Height': {value: 3000},
            FileType: {value: 'ignored'},
        });
        fakeCompositeGet({
            FieldOfView: {value: 1},
        });

        const tags = ExifReader.loadView({}, {
            expanded: true,
            includeTags: {
                composite: true,
                file: ['FileType'],
            },
        });

        expect(tags.composite).to.not.equal(undefined);
        expect(tags.file).to.not.equal(undefined);
        expect(tags.file.FileType.value).to.equal('jpeg');
        expect(tags.file['Image Width']).to.equal(undefined);
        expect(tags.file['Image Height']).to.equal(undefined);
    });

    it('excludeTags.file: [FileType] should remove FileType', function () {
        fakeImageHeader({
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
        fakeImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        fakeTagsRead({
            Thumbnail: {
                JPEGInterchangeFormat: {id: 0x0201, value: 42},
                JPEGInterchangeFormatLength: {id: 0x0202, value: 99},
            },
        });
        fakeThumbnailGet((_, thumbnailIfdTags) => {
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
        fakeImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        fakeTagsRead({
            Thumbnail: {
                JPEGInterchangeFormat: {id: 0x0201, value: 42},
                JPEGInterchangeFormatLength: {id: 0x0202, value: 99},
            },
        });
        fakeThumbnailGet(() => ({value: 'thumb'}));

        const tags = ExifReader.loadView({}, {
            excludeTags: {
                thumbnail: ['Thumbnail'],
            },
        });

        expect(tags.Thumbnail).to.equal(undefined);
    });

    it('includeTags.icc should filter embedded ICC tags', function () {
        fakeImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        fakeTagsRead({
            ICC_Profile: {id: 0x8773, value: [1, 2, 3]},
        });
        fakeIccTagsRead({
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
        fakeImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        fakeTagsRead({
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
        fakeImageHeader({
            fileType: 'jpeg',
            xmpChunks: [{dataOffset: 0, length: 1}],
        });
        fakeXmpTagsReadToThrow();

        const tags = ExifReader.loadView({}, {
            expanded: true,
            includeTags: {
                xmp: [],
            },
        });

        expect(tags.xmp).to.equal(undefined);
    });

    it('includeTags.xmp: [] should not trigger Exif parsing as a dependency', function () {
        fakeImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        fakeTagsReadToThrow();

        const tags = ExifReader.loadView({}, {
            includeTags: {
                xmp: [],
            },
        });

        expect(Object.keys(tags).length).to.equal(0);
    });

    it('includeTags.icc: [] should skip ICC parsing', function () {
        fakeImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
            iccChunks: [{dataOffset: 0, length: 1}],
        });
        fakeTagsReadToThrow();
        fakeIccTagsReadToThrow();

        const tags = ExifReader.loadView({}, {
            expanded: true,
            includeTags: {
                icc: [],
            },
        });

        expect(tags.icc).to.equal(undefined);
    });

    it('includeTags.makerNotes should filter Canon maker-note tags', function () {
        fakeImageHeader({
            fileType: 'jpeg',
            tiffHeaderOffset: 1,
        });
        fakeTagsRead({
            Make: {id: 0x010f, value: ['Canon']},
            MakerNote: {id: 0x927c, value: [1, 2, 3], __offset: 42},
        });
        fakeCanonTagsRead({
            LensType: {id: 0x0001, value: 61182, description: '61182'},
            LensModel: {
                id: 0x0095,
                value: ['RF24-105mm F4 L IS USM'],
                description: 'RF24-105mm F4 L IS USM'
            },
        });

        const tags = ExifReader.loadView({}, {
            expanded: true,
            includeTags: {
                makerNotes: ['LensType'],
            },
        });

        expect(tags.makerNotes.LensType).to.not.equal(undefined);
        expect(tags.makerNotes.LensModel).to.equal(undefined);
    });
});

function fakeImageHeader(appMarkersValue) {
    restoreFunctions.push(swapProperties(ImageHeader, {
        parseAppMarkers() {
            return appMarkersValue;
        },
    }));
}

function fakeTagsRead(tagsValue) {
    restoreFunctions.push(swapProperties(Tags, {
        read() {
            return {tags: tagsValue, byteOrder: ByteOrder.BIG_ENDIAN};
        },
    }));
}

function fakeTagsReadToThrow() {
    restoreFunctions.push(swapProperties(Tags, {
        read() {
            throw new Error('Tags.read was called.');
        },
    }));
}

function fakePngTextTagsRead(tagsValue) {
    restoreFunctions.push(swapProperties(PngTextTags, {
        read() {
            return {readTags: tagsValue, readTagsPromise: undefined};
        },
    }));
}

function fakeXmpTagsRead(tagsValue) {
    restoreFunctions.push(swapProperties(XmpTags, {
        read() {
            return tagsValue;
        },
    }));
}

function fakeXmpTagsReadToThrow() {
    restoreFunctions.push(swapProperties(XmpTags, {
        read() {
            throw new Error('XmpTags.read was called.');
        },
    }));
}

function fakeIccTagsRead(tagsValue) {
    restoreFunctions.push(swapProperties(IccTags, {
        read() {
            return tagsValue;
        },
    }));
}

function fakeIccTagsReadToThrow() {
    restoreFunctions.push(swapProperties(IccTags, {
        read() {
            throw new Error('IccTags.read was called.');
        },
    }));
}

function fakeCanonTagsRead(tagsValue) {
    restoreFunctions.push(swapProperties(CanonTags, {
        read() {
            return tagsValue;
        },
    }));
}

function fakeFileTagsRead(tagsValue) {
    restoreFunctions.push(swapProperties(FileTags, {
        read() {
            return tagsValue;
        },
    }));
}

function fakeThumbnailGet(getFunction) {
    restoreFunctions.push(swapProperties(Thumbnail, {
        get: getFunction,
    }));
}

function fakeCompositeGet(tagsValue) {
    restoreFunctions.push(swapProperties(Composite, {
        get() {
            return tagsValue;
        },
    }));
}

function restoreAllFakes() {
    while (restoreFunctions.length > 0) {
        restoreFunctions.pop()();
    }
}
