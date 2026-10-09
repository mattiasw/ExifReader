/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getByteStringFromNumber, getDataView, swapProperties} from './test-utils.js';
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

const IFD_TYPE_SHORT = 3;
const IFD_TYPE_LONG = 4;
const IFD_TYPE_RATIONAL = 5;
const FOCAL_PLANE_RESOLUTION_UNIT_MILLIMETERS = 4;

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

    it('excludeTags: { png: true } should not block embedded exif tags', async function () {
        fakeImageHeader({
            fileType: 'png',
            pngTextChunks: [1],
        });
        fakePngTextTagsReadAsync(
            {'Color Type': {value: 2, description: 'RGB'}},
            [{embeddedExifTags: {UserComment: {id: 0x9286, value: 'Hello'}}}]
        );

        const tags = await ExifReader.loadView({}, {
            async: true,
            excludeTags: {
                png: true,
            },
        });

        expect(tags.UserComment).to.not.equal(undefined);
        expect(tags['Color Type']).to.equal(undefined);
    });

    it('includeTags.thumbnail should not turn the thumbnail IFD of embedded png exif into a Thumbnail tag', async function () {
        fakeImageHeader({
            fileType: 'png',
            pngTextChunks: [1],
        });
        fakePngTextTagsReadAsync({}, [{
            embeddedExifTags: {
                UserComment: {id: 0x9286, value: 'Hello'},
                Thumbnail: {JPEGInterchangeFormat: {id: 0x0201, value: 272}},
            },
        }]);

        const tags = await ExifReader.loadView({}, {
            async: true,
            includeTags: {
                exif: true,
                thumbnail: true,
            },
        });

        expect(tags.UserComment).to.not.equal(undefined);
        expect(tags.Thumbnail).to.equal(undefined);
    });

    it('includeTags: { png: true } should not include embedded exif when exif is not included', async function () {
        fakeImageHeader({
            fileType: 'png',
            pngTextChunks: [1],
        });
        fakePngTextTagsReadAsync(
            {'Color Type': {value: 2, description: 'RGB'}},
            [{embeddedExifTags: {UserComment: {id: 0x9286, value: 'Hello'}}}]
        );

        const tags = await ExifReader.loadView({}, {
            async: true,
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

    for (const [filterName, filterOptions] of [
        ['includeTags', {includeTags: {xmp: true}}],
        ['excludeTags', {excludeTags: {exif: ['Make']}}],
    ]) {
        it(`${filterName} should keep an XMP tag named __proto__ as an own tag`, function () {
            fakeImageHeader({
                fileType: 'jpeg',
                xmpChunks: [{dataOffset: 0, length: 1}],
            });
            fakeXmpTagsRead(getXmpTagsWithProtoTag());

            const tags = ExifReader.loadView({}, {expanded: true, ...filterOptions});

            expect(Object.keys(tags.xmp)).to.include.members(['__proto__', 'Other']);
            expect(Object.getPrototypeOf(tags.xmp)).to.equal(Object.prototype);
            expect(Object.getOwnPropertyDescriptor(tags.xmp, '__proto__').value.value).to.equal('polluted');
            expect(tags.xmp.value).to.equal(undefined);
            expect(tags.xmp.description).to.equal(undefined);
        });

        it(`${filterName} should keep an XMP tag named __proto__ as an own top-level tag when flat`, function () {
            fakeImageHeader({
                fileType: 'jpeg',
                xmpChunks: [{dataOffset: 0, length: 1}],
            });
            fakeXmpTagsRead(getXmpTagsWithProtoTag());

            const tags = ExifReader.loadView({}, filterOptions);

            expect(Object.keys(tags)).to.include('__proto__');
            expect(Object.getPrototypeOf(tags)).to.equal(Object.prototype);
            expect(tags.value).to.equal(undefined);
            expect(tags.description).to.equal(undefined);
        });
    }

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

    it('includeTags: { composite: true } should read the Exif sub-IFD for the composite tags', function () {
        const image = getExifJpeg([
            {tag: 0x920a, rational: [50, 1]},
            {tag: 0xa405, short: 75},
        ]);

        const tags = ExifReader.loadView(getDataView(image), {
            expanded: true,
            includeTags: {composite: true},
        });

        expect(tags.composite.FocalLength35efl.value).to.equal(75);
        expect(tags.composite.ScaleFactorTo35mmEquivalent).to.not.equal(undefined);
        expect(tags.composite.FieldOfView).to.not.equal(undefined);
        expect(tags.exif).to.equal(undefined);
        expect(tags.file).to.equal(undefined);
    });

    it('includeTags: { composite: true } should return the composite tags flat without their dependencies', function () {
        const image = getExifJpeg([
            {tag: 0x920a, rational: [50, 1]},
            {tag: 0xa405, short: 75},
        ]);

        const tags = ExifReader.loadView(getDataView(image), {
            includeTags: {composite: true},
        });

        expect(tags.FocalLength35efl.value).to.equal(75);
        expect(tags.ScaleFactorTo35mmEquivalent).to.not.equal(undefined);
        expect(tags.FieldOfView).to.not.equal(undefined);
        expect(tags.FocalLength).to.equal(undefined);
        expect(tags['Exif IFD Pointer']).to.equal(undefined);
    });

    it('includeTags: { composite: true } should compute FocalLength35efl from the file group dimensions', function () {
        const image = getExifJpeg([
            {tag: 0x920a, rational: [50, 1]},
            {tag: 0xa20e, rational: [100, 1]},
            {tag: 0xa20f, rational: [100, 1]},
            {tag: 0xa210, short: FOCAL_PLANE_RESOLUTION_UNIT_MILLIMETERS},
        ], getSof0Segment(3600, 2400));

        const tags = ExifReader.loadView(getDataView(image), {
            expanded: true,
            includeTags: {composite: true},
        });

        expect(tags.composite.FocalLength35efl.value).to.be.closeTo(50, 0.01);
    });

    it('includeTags: { composite: true } should compute FocalLength35efl from the file group dimensions when flat', function () {
        const image = getExifJpeg([
            {tag: 0x920a, rational: [50, 1]},
            {tag: 0xa20e, rational: [100, 1]},
            {tag: 0xa20f, rational: [100, 1]},
            {tag: 0xa210, short: FOCAL_PLANE_RESOLUTION_UNIT_MILLIMETERS},
        ], getSof0Segment(3600, 2400));

        const tags = ExifReader.loadView(getDataView(image), {
            includeTags: {composite: true},
        });

        expect(tags.FocalLength35efl.value).to.be.closeTo(50, 0.01);
    });

    it('includeTags: { composite: true } should compute FocalLength35efl from the original pixel dimensions of a resized image', function () {
        const tags = ExifReader.loadView(getDataView(getResizedFocalPlaneJpeg()), {
            expanded: true,
            includeTags: {composite: true},
        });

        expect(tags.composite.FocalLength35efl.value).to.be.closeTo(50, 0.01);
        expect(tags.exif).to.equal(undefined);
    });

    it('includeTags: { composite: true } should compute FocalLength35efl from the original pixel dimensions of a resized image when flat', function () {
        const tags = ExifReader.loadView(getDataView(getResizedFocalPlaneJpeg()), {
            includeTags: {composite: true},
        });

        expect(tags.FocalLength35efl.value).to.be.closeTo(50, 0.01);
        expect(tags.PixelXDimension).to.equal(undefined);
        expect(tags.PixelYDimension).to.equal(undefined);
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

    it('includeTags.iptc should include a repeated tag by id', function () {
        const image = getIptcJpeg([
            {dataset: 0x19, text: 'alpha'},
            {dataset: 0x05, text: 'title'},
            {dataset: 0x19, text: 'beta'},
        ]);

        const tags = ExifReader.loadView(getDataView(image), {
            expanded: true,
            includeTags: {
                iptc: [0x0219],
            },
        });

        expect(tags.iptc.Keywords.map(({description}) => description)).to.deep.equal(['alpha', 'beta']);
        expect(tags.iptc['Object Name']).to.equal(undefined);
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

function fakePngTextTagsReadAsync(readTags, asyncEntries) {
    restoreFunctions.push(swapProperties(PngTextTags, {
        read() {
            return {readTags, readTagsPromise: Promise.resolve(asyncEntries)};
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

function getXmpTagsWithProtoTag() {
    return JSON.parse(
        '{"__proto__": {"value": "polluted", "attributes": {}, "description": "polluted"},'
        + ' "Other": {"value": "other", "attributes": {}, "description": "other"}}'
    );
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

function getResizedFocalPlaneJpeg() {
    return getExifJpeg([
        {tag: 0x920a, rational: [50, 1]},
        {tag: 0xa002, short: 3600},
        {tag: 0xa003, short: 2400},
        {tag: 0xa20e, rational: [100, 1]},
        {tag: 0xa20f, rational: [100, 1]},
        {tag: 0xa210, short: FOCAL_PLANE_RESOLUTION_UNIT_MILLIMETERS},
    ], getSof0Segment(360, 240));
}

/**
 * Builds a big-endian JPEG whose only IFD0 entry points to an Exif IFD
 * holding the given tags.
 *
 * @param {Array<{tag: number, short?: number, rational?: number[]}>} exifTags
 * @param {string} [trailingSegments] Segments placed after the Exif APP1.
 */
function getExifJpeg(exifTags, trailingSegments = '') {
    const IFD0_OFFSET = 8;
    const EXIF_IFD_OFFSET = 26;
    const IFD_ENTRY_LENGTH = 12;
    const RATIONAL_LENGTH = 8;
    const exifIfdLength = 2 + exifTags.length * IFD_ENTRY_LENGTH + 4;
    const rationalTags = exifTags.filter(({rational}) => rational);
    const entries = exifTags.map(({tag, short, rational}) => {
        if (rational) {
            const valueOffset = EXIF_IFD_OFFSET + exifIfdLength + rationalTags.findIndex((entry) => entry.tag === tag) * RATIONAL_LENGTH;
            return getIfdEntry(tag, IFD_TYPE_RATIONAL, 1, getByteStringFromNumber(valueOffset, 4));
        }
        return getIfdEntry(tag, IFD_TYPE_SHORT, 1, getByteStringFromNumber(short, 2) + '\x00\x00');
    });
    const rationalValues = rationalTags.map(({rational}) => {
        return getByteStringFromNumber(rational[0], 4) + getByteStringFromNumber(rational[1], 4);
    });
    const tiffBlock = 'MM\x00\x2a' + getByteStringFromNumber(IFD0_OFFSET, 4)
        + getByteStringFromNumber(1, 2)
        + getIfdEntry(0x8769, IFD_TYPE_LONG, 1, getByteStringFromNumber(EXIF_IFD_OFFSET, 4))
        + getByteStringFromNumber(0, 4)
        + getByteStringFromNumber(exifTags.length, 2)
        + entries.join('')
        + getByteStringFromNumber(0, 4)
        + rationalValues.join('');
    return '\xff\xd8' + getSegment('\xff\xe1', 'Exif\x00\x00' + tiffBlock) + trailingSegments + '\xff\xd9';
}

/**
 * Builds a JPEG whose APP13 Photoshop block holds the given IPTC record 2
 * datasets, in order.
 *
 * @param {Array<{dataset: number, text: string}>} records
 */
function getIptcJpeg(records) {
    const iptcData = records
        .map(({dataset, text}) => '\x1c\x02' + getByteStringFromNumber(dataset, 1) + getByteStringFromNumber(text.length, 2) + text)
        .join('');
    const padding = iptcData.length % 2 === 0 ? '' : '\x00';
    const naaBlock = '8BIM\x04\x04\x00\x00' + getByteStringFromNumber(iptcData.length, 4) + iptcData + padding;
    return '\xff\xd8' + getSegment('\xff\xed', 'Photoshop 3.0\x00' + naaBlock) + '\xff\xd9';
}

function getSof0Segment(width, height) {
    return getSegment('\xff\xc0', '\x08' + getByteStringFromNumber(height, 2) + getByteStringFromNumber(width, 2));
}

function getIfdEntry(tag, type, count, value) {
    return getByteStringFromNumber(tag, 2)
        + getByteStringFromNumber(type, 2)
        + getByteStringFromNumber(count, 4)
        + value;
}

function getSegment(marker, content) {
    return marker + getByteStringFromNumber(content.length + 2, 2) + content;
}
