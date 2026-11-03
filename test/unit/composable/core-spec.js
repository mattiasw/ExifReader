/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {brotliDecompressSync, inflateSync} from 'node:zlib';
import {expect} from 'chai';
import {DOMParser as XmldomParser} from '@xmldom/xmldom';
import * as Core from '../../../src/composable/core.js';
import {createReader, errors, tagFilter} from '../../../src/composable/core.js';
import {GROUP_BRAND, FORMAT_BRAND} from '../../../src/composable/brand.js';
import * as ExifReader from '../../../src/exif-reader.js';
import Errors from '../../../src/errors.js';
import ImageHeader from '../../../src/image-header.js';
import {allFormats, tiff, jpeg, png, jxl, xml} from '../../../src/composable/formats.js';
import {file, jpegHeader} from '../../../src/composable/formats/jpeg.js';
import {
    allGroups, exif, iptc, xmp, icc, photoshop, mpf, canon, pentax, makerNotes, gps, composite, thumbnail,
} from '../../../src/composable/groups.js';
import {WhiteBalance, InteroperabilityIndex, Make as MakeTag} from '../../../src/composable/tags/exif.js';
import {createTagFilter} from '../../../src/tag-filter.js';
import {getDataView, swapProperties} from '../test-utils.js';
import {
    ascii,
    rationals,
    getIccProfile,
    canonMakerNote,
    getTiff,
    getJpeg,
    getSof0Segment,
    getJfifSegment,
    getExifSegment,
    getXmpSegment,
    getXmpPacket,
    TAG_MAKE,
    TAG_MODEL,
    TAG_CANON_LENS_MODEL,
    TAG_GPS_LATITUDE_REF,
    TAG_GPS_LATITUDE,
    TAG_FOCAL_LENGTH,
    TAG_FOCAL_PLANE_X_RESOLUTION,
    TAG_FOCAL_PLANE_Y_RESOLUTION,
    TAG_FOCAL_PLANE_RESOLUTION_UNIT,
    rational,
    short,
    getPng,
    getZtxtChunk,
    getIccpChunk,
    deflate,
    getExifChunk,
    getExifRawProfile,
    getJxl,
    getBrobBox,
    getJxlcBox,
} from '../loadview-inventory-images.js';

const IMAGES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'images');
const FORMATS_BUT_XML = allFormats.filter((format) => format !== xml);
const TAG_DATE_TIME = 0x0132;
const THUMBNAIL_IMAGE = '\xff\xd8thumb\xff\xd9';
const DATE_TIME = {name: 'DateTime', ids: [TAG_DATE_TIME], group: 'exif'};
const JPEG = getJpeg(
    getSof0Segment(),
    getJfifSegment(),
    getExifSegment(getTiff({
        ifd0: [ascii(TAG_MAKE, 'Canon'), ascii(TAG_MODEL, 'Model'), ascii(TAG_DATE_TIME, '2020:01:01 00:00:00')],
        exifIfd: [canonMakerNote([ascii(TAG_CANON_LENS_MODEL, 'canon lens')])],
        gpsIfd: [ascii(TAG_GPS_LATITUDE_REF, 'N'), rationals(TAG_GPS_LATITUDE, [[1, 1], [0, 1], [0, 1]])],
        thumbnail: {image: THUMBNAIL_IMAGE},
    })),
    getXmpSegment(getXmpPacket({Title: 'xmp'}))
);
const XMP_SIDECAR = '<?xpacket begin=""?>' + getXmpPacket({Title: 'xmp'}) + '<?xpacket end="w"?>';
const NOISE = '-'.repeat(32);
const GROUPS_MESSAGE = 'the groups are exif, iptc, xmp, icc, photoshop, makerNotes, mpf, file, jfif, png, riff, gif, gps, composite and thumbnail';
const DOM_PARSER_OPTION_MESSAGE = 'reader.load: the domParser option is not supported: pass domParser to createReader';
const DECOMPRESS_OPTION_MESSAGE = 'reader.load: the decompress option is not supported: pass decompress to createReader';
const UNKNOWN_COMPRESSION_TEXT = '<text using unknown compression>';
const BOOLEAN_OPTIONS = ['expanded', 'includeUnknown', 'computed', 'includeOffsets'];
const INPUT_MESSAGE = 'reader.load: data must be an ArrayBuffer, a SharedArrayBuffer, a DataView, a typed array such as Uint8Array or a Node Buffer, or a Blob or File';

describe('composable/core', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    describe('createReader', () => {
        it('should export createReader, errors and tagFilter, with no default export', () => {
            expect(Object.keys(Core).sort()).to.deep.equal(['createReader', 'errors', 'tagFilter']);
        });

        it('should return an object with a load function', () => {
            const reader = createReader({formats: [jpeg]});

            expect(Object.keys(reader)).to.deep.equal(['load']);
            expect(reader.load).to.be.a('function');
        });

        it('should need formats', () => {
            const message = 'createReader: formats must be an array of values imported from \'exifreader/formats\'';
            expect(() => createReader()).to.throw(TypeError, message);
            expect(() => createReader(null)).to.throw(TypeError, message);
            expect(() => createReader({})).to.throw(TypeError, message);
            expect(() => createReader({formats: jpeg})).to.throw(TypeError, message);
        });

        it('should need at least one format', () => {
            const message = 'createReader: formats must hold at least one value imported from \'exifreader/formats\'';
            expect(() => createReader({formats: []})).to.throw(TypeError, message);
            expect(() => createReader({formats: [], groups: [exif]})).to.throw(TypeError, message);
            expect(() => createReader({formats: [], tags: [DATE_TIME]})).to.throw(TypeError, message);
            expect(() => createReader({formats: [jpeg], groups: [], tags: []})).to.not.throw();
        });

        it('should need groups to be an array when given', () => {
            const message = 'createReader: groups must be an array of values imported from \'exifreader/groups\'';
            expect(() => createReader({formats: [jpeg], groups: exif})).to.throw(TypeError, message);
            expect(() => createReader({formats: [jpeg], groups: null})).to.throw(TypeError, message);
        });

        it('should need tags to be an array when given', () => {
            const message = 'createReader: tags must be an array of values imported from \'exifreader/tags/exif\'';
            expect(() => createReader({formats: [jpeg], tags: DATE_TIME})).to.throw(TypeError, message);
            expect(() => createReader({formats: [jpeg], tags: null})).to.throw(TypeError, message);
        });

        it('should reject a key that is not formats, groups, tags, tagFilter, domParser or decompress', () => {
            expect(() => createReader({formats: [jpeg], group: [exif]}))
                .to.throw(TypeError, 'createReader: unknown key \'group\': the keys are formats, groups, tags, tagFilter, domParser and decompress');
            expect(() => createReader(Object.create({formats: [jpeg], tag: [DATE_TIME]})))
                .to.throw(TypeError, 'createReader: unknown key \'tag\': the keys are formats, groups, tags, tagFilter, domParser and decompress');
            expect(() => createReader({formats: [jpeg], filter: tagFilter}))
                .to.throw(TypeError, 'createReader: unknown key \'filter\': the keys are formats, groups, tags, tagFilter, domParser and decompress');
        });

        it('should accept the tag filter as tagFilter', () => {
            expect(() => createReader({formats: [jpeg], tagFilter})).to.not.throw();
            expect(() => createReader({formats: [jpeg], groups: [exif], tags: [DATE_TIME], tagFilter})).to.not.throw();
            expect(() => createReader({formats: [jpeg], tagFilter: undefined})).to.not.throw();
        });

        it('should need tagFilter to be the tag filter when given', () => {
            const message = 'createReader: tagFilter must be the tagFilter imported from \'exifreader/core\'';
            const copy = Object.assign({}, tagFilter);
            for (const value of [null, {}, true, exif, jpeg, createTagFilter, tagFilter.createTagFilter, {brand: GROUP_BRAND}, {brand: FORMAT_BRAND}]) {
                expect(() => createReader({formats: [jpeg], tagFilter: value}), String(value)).to.throw(TypeError, message);
            }
            expect(() => createReader({formats: [jpeg], tagFilter: copy})).to.not.throw();
        });

        it('should need domParser to be a DOM parser when given', () => {
            const message = 'createReader: domParser must be a DOM parser, an object with a parseFromString method';
            for (const value of [null, {}, 42, 'x', true, false, 0, '', {parseFromString: 'x'}, XmldomParser]) {
                expectCreateReaderError({formats: [jpeg], domParser: value}, message, String(value));
            }
            expect(() => createReader({formats: [jpeg], domParser: new XmldomParser()})).to.not.throw();
            expect(() => createReader({formats: [jpeg], domParser: {parseFromString: () => undefined}})).to.not.throw();
        });

        it('should check domParser after tagFilter and the tables', () => {
            expect(() => createReader({formats: [{}], domParser: null}))
                .to.throw(TypeError, 'createReader: formats[0] is not a value imported from \'exifreader/formats\'');
            expect(() => createReader({formats: [jpeg], tagFilter: null, domParser: null}))
                .to.throw(TypeError, 'createReader: tagFilter must be the tagFilter imported from \'exifreader/core\'');
        });

        it('should need decompress to be an object when given', () => {
            const message = 'createReader: decompress must be an object with brotli, deflate and maxDecompressedSize';
            for (const value of [null, [], () => undefined, 'x', 42, true, new Map()]) {
                expectCreateReaderError({formats: [jpeg], decompress: value}, message, String(value));
            }
        });

        it('should reject a decompress key that is not brotli, deflate or maxDecompressedSize', () => {
            const cases = [
                [{maxDecompressSize: 1}, 'maxDecompressSize'],
                [{gzip: () => undefined}, 'gzip'],
                [Object.create({bogus: 1}), 'bogus'],
            ];
            for (const [decompress, key] of cases) {
                expectCreateReaderError(
                    {formats: [jpeg], decompress},
                    'createReader: decompress has no key \'' + key + '\': the keys are brotli, deflate and maxDecompressedSize',
                    key
                );
            }
        });

        it('should need decompress.brotli and decompress.deflate to be functions when given', () => {
            for (const field of ['brotli', 'deflate']) {
                for (const value of [42, 'x', {}, null]) {
                    expectCreateReaderError(
                        {formats: [jpeg], decompress: {[field]: value}},
                        'createReader: decompress.' + field + ' must be a function',
                        field + ' ' + String(value)
                    );
                }
            }
        });

        it('should need decompress.maxDecompressedSize to be a number of bytes, zero or more', () => {
            const message = 'createReader: decompress.maxDecompressedSize must be a number of bytes, zero or more';
            for (const value of [NaN, -1, -Infinity, '1024', null]) {
                expectCreateReaderError({formats: [jpeg], decompress: {maxDecompressedSize: value}}, message, String(value));
            }
        });

        it('should take decompress left out, undefined or with its fields left out', () => {
            const values = [
                undefined,
                {},
                {brotli: undefined},
                {maxDecompressedSize: 0},
                {maxDecompressedSize: -0},
                {maxDecompressedSize: Infinity},
                {brotli: () => undefined, deflate: () => undefined, maxDecompressedSize: 1024},
            ];
            expect(() => createReader({formats: [png], groups: [icc]})).to.not.throw();
            for (const decompress of values) {
                expect(() => createReader({formats: [png], groups: [icc], decompress}), JSON.stringify(decompress)).to.not.throw();
            }
            expect(() => createReader({formats: [jpeg], decompress: {maxDecompressedSize: 1024}})).to.not.throw();
        });

        it('should check decompress after domParser, tagFilter and the tables', () => {
            expect(() => createReader({formats: [{}], decompress: null}))
                .to.throw(TypeError, 'createReader: formats[0] is not a value imported from \'exifreader/formats\'');
            expect(() => createReader({formats: [jpeg], tagFilter: null, decompress: null}))
                .to.throw(TypeError, 'createReader: tagFilter must be the tagFilter imported from \'exifreader/core\'');
            expect(() => createReader({formats: [jpeg], domParser: null, decompress: null}))
                .to.throw(TypeError, 'createReader: domParser must be a DOM parser, an object with a parseFromString method');
        });

        it('should check the decompress keys before the decompress fields', () => {
            expect(() => createReader({formats: [jpeg], decompress: {brotli: 42, gzip: 1}}))
                .to.throw(TypeError, 'createReader: decompress has no key \'gzip\': the keys are brotli, deflate and maxDecompressedSize');
        });

        it('should check tagFilter after the tables', () => {
            expect(() => createReader({formats: [{}], tagFilter: null}))
                .to.throw(TypeError, 'createReader: formats[0] is not a value imported from \'exifreader/formats\'');
            expect(() => createReader({formats: [jpeg], tags: [{}], tagFilter: null}))
                .to.throw(TypeError, 'createReader: tags[0] is not a value imported from \'exifreader/tags/exif\'');
        });

        it('should check the arrays before their elements', () => {
            expect(() => createReader({formats: [{}], groups: exif}))
                .to.throw(TypeError, 'createReader: groups must be an array of values imported from \'exifreader/groups\'');
            expect(() => createReader({formats: [jpeg], groups: [{}], tags: DATE_TIME}))
                .to.throw(TypeError, 'createReader: tags must be an array of values imported from \'exifreader/tags/exif\'');
        });

        it('should name the first format that was not imported from the formats', () => {
            expect(() => createReader({formats: [{}, jpeg]}))
                .to.throw(TypeError, 'createReader: formats[0] is not a value imported from \'exifreader/formats\'');
            expect(() => createReader({formats: [jpeg, tiff, undefined, {}]}))
                .to.throw(TypeError, 'createReader: formats[2] is not a value imported from \'exifreader/formats\'');
            expect(() => createReader({formats: [jpeg, file]}))
                .to.throw(TypeError, 'createReader: formats[1] is not a value imported from \'exifreader/formats\'');
            expect(() => createReader({formats: [jpegHeader]}))
                .to.throw(TypeError, 'createReader: formats[0] is not a value imported from \'exifreader/formats\'');
            expect(() => createReader({formats: [exif]}))
                .to.throw(TypeError, 'createReader: formats[0] is not a value imported from \'exifreader/formats\'');
            expect(() => createReader({formats: [{header: jpeg.header, readers: jpeg.readers}]}))
                .to.throw(TypeError, 'createReader: formats[0] is not a value imported from \'exifreader/formats\'');
        });

        it('should name the first group that was not imported from the groups', () => {
            expect(() => createReader({formats: [jpeg], groups: [null]}))
                .to.throw(TypeError, 'createReader: groups[0] is not a value imported from \'exifreader/groups\'');
            expect(() => createReader({formats: [jpeg], groups: [exif, iptc, jpeg]}))
                .to.throw(TypeError, 'createReader: groups[2] is not a value imported from \'exifreader/groups\'');
            expect(() => createReader({formats: [jpeg], groups: [file]}))
                .to.throw(TypeError, 'createReader: groups[0] is not a value imported from \'exifreader/groups\'');
        });

        it('should accept tag descriptors by shape', () => {
            expect(() => createReader({formats: [jpeg], tags: [DATE_TIME, {name: 'WhiteBalance', ids: [0xa403, 0x0007], group: 'exif'}]})).to.not.throw();
        });

        it('should name the first tag that is not an Exif tag descriptor', () => {
            const invalidTags = [
                null,
                'DateTime',
                TAG_DATE_TIME,
                {ids: [TAG_DATE_TIME], group: 'exif'},
                {name: 'DateTime', ids: [], group: 'exif'},
                {name: 'DateTime', ids: TAG_DATE_TIME, group: 'exif'},
                {name: 'DateTime', ids: ['0x0132'], group: 'exif'},
                {name: 'DateTime', ids: '0132', group: 'exif'},
                {name: 'DateTime', ids: {length: 1, every: () => true}, group: 'exif'},
                {name: 'DateTime', ids: [TAG_DATE_TIME, 'x'], group: 'exif'},
                {name: 'DateTime', ids: [TAG_DATE_TIME]},
                {name: 'Keywords', ids: [25], group: 'iptc'},
            ];
            for (const tag of invalidTags) {
                expect(() => createReader({formats: [jpeg], tags: [DATE_TIME, tag]}), JSON.stringify(tag))
                    .to.throw(TypeError, 'createReader: tags[1] is not a value imported from \'exifreader/tags/exif\'');
            }
        });

        it('should reject a cyclic emission graph', () => {
            const groups = [getGroup('a', ['b']), getGroup('b', ['a'])];

            expect(() => createReader({formats: [jpeg], groups})).to.throw(Error, /^createReader: The group emission graph has a cycle through a$/);
        });

        it('should reject an emission graph deeper than three blocks', () => {
            const groups = [getGroup('a', ['b']), getGroup('b', ['c']), getGroup('c', ['d']), getGroup('d', [])];

            expect(() => createReader({formats: [jpeg], groups})).to.throw(Error, /^createReader: The group emission graph is deeper than 3 blocks through a$/);
        });

        it('should accept an emission graph exactly three blocks deep', () => {
            const groups = [getGroup('a', ['b']), getGroup('b', ['c']), getGroup('c', [])];

            expect(() => createReader({formats: [jpeg], groups})).to.not.throw();
        });
    });

    describe('errors', () => {
        it('should export UnsupportedFormatError and not MetadataMissingError', () => {
            expect(Object.keys(errors)).to.deep.equal(['UnsupportedFormatError']);
            expect(errors.UnsupportedFormatError).to.equal(Errors.UnsupportedFormatError);
        });
    });

    describe('load', () => {
        const filteredAllReader = createReader({formats: allFormats, groups: allGroups, tagFilter, domParser: new XmldomParser()});
        const exifReader = createReader({formats: FORMATS_BUT_XML, groups: [exif, thumbnail]});

        it('should return a promise and not throw for any input or options', async () => {
            for (const groups of [[xmp], [exif]]) {
                const reader = createReader({formats: [jpeg], groups});
                const calls = [
                    () => reader.load(),
                    () => reader.load(null, null),
                    () => reader.load('', 1),
                    () => reader.load(getDataView(NOISE), {async: true}),
                    () => reader.load(getDataView(JPEG), {length: 1}),
                    () => reader.load({arrayBuffer: () => {
                        throw new Error('read');
                    }, slice: sliceStub, size: 0}),
                ];
                for (const call of calls) {
                    let result;
                    expect(() => {
                        result = call();
                    }).to.not.throw();
                    expect(result).to.be.an.instanceof(Promise);
                    await result.catch(() => undefined);
                }
            }
        });

        it('should say that a Promise is required on a runtime without one', () => {
            restores.push(swapProperties(globalThis, {Promise: undefined}));

            expect(() => exifReader.load(getDataView(JPEG))).to.throw(Error, 'Promise is required');
        });

        describe('the output shape', () => {
            const groupedReader = createReader({formats: [jpeg], groups: [exif]});

            it('should group the tags by default', async () => {
                const tags = await groupedReader.load(getDataView(JPEG));

                expect(tags).to.deep.equal(await groupedReader.load(getDataView(JPEG), {expanded: true}));
                expect(tags.file.FileType.value).to.equal('jpeg');
                expect(tags.exif.Make.description).to.equal('Canon');
                expect(tags.FileType).to.equal(undefined);
            });

            it('should give the flat tags of the default entry when expanded is false', async () => {
                const expected = await ExifReader.load(getDataView(JPEG), {async: true, includeTags: {file: true, jfif: true, exif: true}});
                expect(expected.Make.description).to.equal('Canon');

                expect(await groupedReader.load(getDataView(JPEG), {expanded: false})).to.deep.equal(expected);
            });

            it('should give the offsets with includeOffsets alone', async () => {
                const tags = await groupedReader.load(getDataView(JPEG), {includeOffsets: true});

                expect(tags.metadataRange.blocks.map((block) => block.type)).to.deep.equal(['file', 'jfif', 'exif']);
            });

            describe('a group with no entry of its own', () => {
                it('should leave out a whole group that is empty', async () => {
                    const bytes = getJpeg(getSof0Segment(), getExifSegment(getTiff({ifd0: []})));

                    const tags = await groupedReader.load(getDataView(bytes));

                    expect(tags.exif).to.equal(undefined);
                    expect(tags.file.FileType.value).to.equal('jpeg');
                });

                it('should give no exif key for a Brotli Exif box whose TIFF has no tags', async () => {
                    const bytes = getJxl(getBrobBox('Exif', '\x00\x00\x00\x00' + getTiff({ifd0: []})), getJxlcBox());

                    const tags = await createReader({formats: [jxl], groups: [exif]}).load(getDataView(bytes));

                    expect(Object.keys(tags)).to.deep.equal(['file']);
                });

                it('should leave out the icc group of an unsupported iCCP compression method', async () => {
                    const bytes = getPng(getIccpChunk('icc', 1, deflate(getIccProfile('ICCP'))));

                    const tags = await createReader({formats: [png], groups: [icc]}).load(getDataView(bytes));

                    expect(tags.icc).to.equal(undefined);
                });

                it('should keep a group whose entries are not tags', async () => {
                    const tags = await createReader({formats: [jpeg], groups: [thumbnail]}).load(getDataView(JPEG));

                    expect(Object.keys(tags.Thumbnail)).to.include('image');
                });
            });
        });

        it('should reject data that is not bytes or a Blob with a TypeError naming the accepted types', async () => {
            const inputs = [
                'https://example.com/image.jpg',
                new URL('https://example.com/image.jpg'),
                new Response(new Uint8Array(4)),
                null,
                undefined,
                {},
                42,
            ];
            for (const input of inputs) {
                await expectRejection(exifReader.load(input), INPUT_MESSAGE, String(input));
            }
        });

        it('should pass on an error from turning bytes into a view that is not a TypeError', async () => {
            const bytes = {
                get buffer() {
                    throw new RangeError('buffer');
                },
            };

            const error = await getRejection(exifReader.load(bytes));

            expect(error).to.be.an.instanceof(RangeError);
            expect(error.message).to.equal('buffer');
        });

        it('should read a Blob as its bytes', async () => {
            const bytes = getBytes(JPEG);

            expect(await exifReader.load(new Blob([bytes]), {expanded: true})).to.deep.equal(await exifReader.load(bytes.buffer, {expanded: true}));
        });

        it('should read a Blob-like object whose arrayBuffer returns the bytes directly', async () => {
            const bytes = getBytes(JPEG);
            const blobLike = {arrayBuffer: () => bytes.buffer, slice: sliceStub, size: bytes.length};

            expect((await exifReader.load(blobLike)).exif.Make.description).to.equal('Canon');
        });

        it('should not take an object with only some of the Blob shape for a Blob', async () => {
            const bytes = getBytes(JPEG);
            const shapes = [
                {arrayBuffer: () => Promise.resolve(bytes.buffer), size: bytes.length},
                {arrayBuffer: () => Promise.resolve(bytes.buffer), slice: sliceStub},
                {arrayBuffer: bytes.buffer, slice: sliceStub, size: bytes.length},
            ];
            for (const shape of shapes) {
                expect((await getRejection(exifReader.load(shape))).message).to.equal(INPUT_MESSAGE);
            }
        });

        it('should pass on the rejection of a Blob read', async () => {
            const blobLike = {arrayBuffer: () => Promise.reject(new Error('read failed')), slice: sliceStub, size: 1};

            expect((await getRejection(exifReader.load(blobLike))).message).to.equal('read failed');
        });

        it('should read only the window of a typed array into a larger buffer', async () => {
            const bytes = getBytes(JPEG);
            const pool = new Uint8Array(bytes.length + 40);
            pool.fill(0xff);
            pool.set(bytes, 16);

            const tags = await exifReader.load(new Uint8Array(pool.buffer, 16, bytes.length), {expanded: true});

            expect(tags).to.deep.equal(await exifReader.load(bytes.buffer, {expanded: true}));
            expect(tags.Thumbnail.image.byteLength).to.equal(THUMBNAIL_IMAGE.length);
        });

        it('should reject options that are not an object', async () => {
            for (const options of [null, 'expanded', true, 1]) {
                await expectRejection(exifReader.load(getDataView(JPEG), options), 'reader.load: options must be an object', String(options));
            }
        });

        it('should reject the async option whatever its value', async () => {
            for (const async of [true, false, undefined]) {
                await expectRejection(exifReader.load(getDataView(JPEG), {async}), 'reader.load: the async option is not supported: load always returns a Promise', String(async));
            }
        });

        it('should reject the length option', async () => {
            await expectRejection(exifReader.load(getDataView(JPEG), {length: 100}), 'reader.load: the length option is not supported: to read the first bytes of a Blob or File, pass blob.slice(0, length)');
        });

        it('should reject the domParser option whatever its value', async () => {
            for (const domParser of [new XmldomParser(), undefined, null, {}, 42]) {
                await expectRejection(exifReader.load(getDataView(JPEG), {domParser}), DOM_PARSER_OPTION_MESSAGE, String(domParser));
            }
        });

        it('should reject the decompress option whatever its value', async () => {
            for (const decompress of [{}, undefined, null, 42, {maxDecompressedSize: 1}]) {
                await expectRejection(exifReader.load(getDataView(JPEG), {decompress}), DECOMPRESS_OPTION_MESSAGE, String(decompress));
            }
        });

        it('should reject an unknown option by name', async () => {
            await expectRejection(exifReader.load(getDataView(JPEG), {expanded: true, includeUnkown: true}), 'reader.load: unknown option \'includeUnkown\'');
        });

        it('should reject an option carried by the prototype of options', async () => {
            const cases = [
                [Object.create({async: false}), 'reader.load: the async option is not supported: load always returns a Promise'],
                [Object.create({length: 5}), 'reader.load: the length option is not supported: to read the first bytes of a Blob or File, pass blob.slice(0, length)'],
                [Object.create({domParser: new XmldomParser()}), DOM_PARSER_OPTION_MESSAGE],
                [Object.create({decompress: {}}), DECOMPRESS_OPTION_MESSAGE],
                [Object.create({bogus: 1}), 'reader.load: unknown option \'bogus\''],
                [Object.create({expanded: 0}), getBooleanOptionMessage('expanded')],
            ];
            for (const [options, message] of cases) {
                await expectRejection(exifReader.load(getDataView(JPEG), options), message, message);
            }
        });

        describe('a boolean option', () => {
            it('should reject a value that is not true, false or undefined, without throwing', async () => {
                for (const option of BOOLEAN_OPTIONS) {
                    for (const value of [0, 1, 'false', '', null]) {
                        let result;
                        expect(() => {
                            result = exifReader.load(getDataView(JPEG), {[option]: value});
                        }).to.not.throw();
                        expect(result).to.be.an.instanceof(Promise);
                        await expectRejection(result, getBooleanOptionMessage(option), option + ' ' + JSON.stringify(value));
                    }
                }
            });

            it('should accept undefined and an absent key as before', async () => {
                const expected = await exifReader.load(getDataView(JPEG));

                for (const option of BOOLEAN_OPTIONS) {
                    expect(await exifReader.load(getDataView(JPEG), {[option]: undefined}), option).to.deep.equal(expected);
                }
                expect(await exifReader.load(getDataView(JPEG), {})).to.deep.equal(expected);
            });

            it('should accept true and false', async () => {
                expect((await exifReader.load(getDataView(JPEG), {expanded: true})).exif.Make.description).to.equal('Canon');
                expect((await exifReader.load(getDataView(JPEG), {expanded: false})).Make.description).to.equal('Canon');
                for (const option of BOOLEAN_OPTIONS) {
                    for (const value of [true, false]) {
                        expect(await exifReader.load(getDataView(JPEG), {[option]: value}), option + ' ' + value).to.be.an('object');
                    }
                }
            });

            it('should report the keys before the values', async () => {
                await expectRejection(exifReader.load(getDataView(JPEG), {expanded: 0, bogus: 1}), 'reader.load: unknown option \'bogus\'');
                await expectRejection(exifReader.load(getDataView(JPEG), {expanded: 0, async: true}), 'reader.load: the async option is not supported: load always returns a Promise');
            });

            it('should report the options in a fixed order, not the order of the keys', async () => {
                await expectRejection(exifReader.load(getDataView(JPEG), {includeOffsets: 'yes', expanded: 0}), getBooleanOptionMessage('expanded'));
                await expectRejection(exifReader.load(getDataView(JPEG), {includeOffsets: 'yes', computed: 0, includeUnknown: 1}), getBooleanOptionMessage('includeUnknown'));
                await expectRejection(exifReader.load(getDataView(JPEG), {includeOffsets: 'yes', computed: 0}), getBooleanOptionMessage('computed'));
            });

            it('should check the values before the tag filter, with or without it', async () => {
                await expectRejection(exifReader.load(getDataView(JPEG), {includeTags: {exif: true}, expanded: 0}), getBooleanOptionMessage('expanded'));
                await expectRejection(exifReader.load(getDataView(JPEG), {excludeTags: {exif: true}, includeOffsets: null}), getBooleanOptionMessage('includeOffsets'));
            });

            it('should check the values before the DOM parser and the input data', async () => {
                restores.push(swapProperties(globalThis, {DOMParser: undefined}));
                const reader = createReader({formats: [jpeg], groups: [xmp]});

                await expectRejection(reader.load(getDataView(JPEG), {expanded: 'true'}), getBooleanOptionMessage('expanded'));
                await expectRejection(reader.load('not an image', {expanded: 'true'}), getBooleanOptionMessage('expanded'));
            });
        });

        describe('without the tag filter', () => {
            const includeMessage = 'reader.load: includeTags needs the tag filter: add tagFilter, imported from \'exifreader/core\', to createReader';
            const excludeMessage = 'reader.load: excludeTags needs the tag filter: add tagFilter, imported from \'exifreader/core\', to createReader';

            it('should reject includeTags or excludeTags without throwing', async () => {
                const cases = [
                    [{includeTags: {exif: ['Make']}}, includeMessage],
                    [{includeTags: true}, includeMessage],
                    [{excludeTags: {exif: ['Make']}}, excludeMessage],
                    [{excludeTags: {}}, excludeMessage],
                    [{includeTags: {exif: true}, excludeTags: {xmp: true}}, includeMessage],
                    [{includeTags: {exif: true}, excludeTags: null}, includeMessage],
                    [{includeTags: 0, excludeTags: {xmp: true}}, excludeMessage],
                    [{includeTags: {exiff: true}}, includeMessage],
                    [{excludeTags: {gps: 'yes'}}, excludeMessage],
                    [{excludeTags: 'gps'}, excludeMessage],
                    [{excludeTags: ['gps']}, excludeMessage],
                ];
                for (const reader of [exifReader, createReader({formats: [jpeg], tags: [DATE_TIME]}), createReader({formats: [jpeg], groups: [gps]})]) {
                    for (const [options, message] of cases) {
                        let result;
                        expect(() => {
                            result = reader.load(getDataView(JPEG), options);
                        }).to.not.throw();
                        expect(result).to.be.an.instanceof(Promise);
                        const error = await getRejection(result);
                        expect(error, JSON.stringify(options)).to.be.an.instanceof(TypeError);
                        expect(error.message, JSON.stringify(options)).to.equal(message);
                    }
                }
            });

            it('should check the options before the tag filter and the tag filter before the DOM parser', async () => {
                restores.push(swapProperties(globalThis, {DOMParser: undefined}));
                const reader = createReader({formats: [jpeg], groups: [xmp]});

                expect((await getRejection(reader.load(getDataView(JPEG), {includeTags: {xmp: true}, bogus: 1}))).message).to.equal('reader.load: unknown option \'bogus\'');
                expect((await getRejection(reader.load(getDataView(JPEG), {includeTags: {xmp: true}}))).message).to.equal(includeMessage);
                expect((await getRejection(reader.load(getDataView(JPEG), {includeTags: {xmp: true}, domParser: new XmldomParser()}))).message).to.equal(DOM_PARSER_OPTION_MESSAGE);
                expect((await getRejection(reader.load(getDataView(JPEG), {domParser: new XmldomParser(), excludeTags: 'xmp'}))).message).to.equal(DOM_PARSER_OPTION_MESSAGE);
            });

            it('should read with the tag filter composed', async () => {
                const reader = createReader({formats: [jpeg], groups: [exif], tagFilter});

                const included = await reader.load(getDataView(JPEG), {includeTags: {exif: ['Make']}});
                const excluded = await reader.load(getDataView(JPEG), {excludeTags: {exif: ['Model']}});

                expect(Object.keys(included)).to.deep.equal(['exif']);
                expect(Object.keys(included.exif)).to.deep.equal(['Make']);
                expect(excluded.exif.Make.description).to.equal('Canon');
                expect(excluded.exif.Model).to.equal(undefined);
            });
        });

        it('should treat a falsy excludeTags as none on a reader without the tag filter', async () => {
            const expected = await exifReader.load(getDataView(JPEG), {expanded: true});
            for (const excludeTags of [undefined, null, false, 0, '']) {
                expect(await exifReader.load(getDataView(JPEG), {expanded: true, excludeTags}), JSON.stringify(excludeTags)).to.deep.equal(expected);
            }
        });

        it('should accept every supported option', async () => {
            const options = {
                expanded: true,
                includeUnknown: true,
                computed: true,
                includeOffsets: true,
                includeTags: {exif: ['Make', 'Model'], xmp: true},
                excludeTags: {exif: ['Model']},
            };

            const tags = await filteredAllReader.load(getDataView(JPEG), options);

            expect(Object.keys(tags).sort()).to.deep.equal(['exif', 'metadataRange', 'xmp']);
            expect(Object.keys(tags.exif)).to.deep.equal(['Make', 'Model']);
            expect(tags.metadataRange.blocks.map((block) => block.type)).to.deep.equal(['file', 'jfif', 'exif', 'xmp']);
        });

        describe('decompress', () => {
            const LIMIT = 4096;
            const EXIF_BLOCK = '\x00\x00\x00\x00' + getTiff({ifd0: [ascii(TAG_MAKE, 'Make')]});
            const EXIF_BROB_JXL = getJxl(getBrobBox('Exif', EXIF_BLOCK), getJxlcBox());
            const ZTXT_TEXT = 'Compressed text here';
            const ZTXT_PNG = getPng(getZtxtChunk('Comment', ZTXT_TEXT));
            let warnings;

            beforeEach(() => {
                warnings = 0;
                restores.push(swapProperties(console, {warn: () => {
                    warnings++;
                }}));
            });

            it('should use the reader\'s functions and limit on every path that decompresses', async () => {
                const cases = [
                    ['Exif brob', {formats: [jxl], groups: [exif]}, EXIF_BROB_JXL, 'brotli', (tags) => tags.exif.Make.description, 'Make'],
                    [
                        'XMP brob',
                        {formats: [jxl], groups: [xmp], domParser: new XmldomParser()},
                        getJxl(getBrobBox('xml ', getXmpPacket({Title: 'xmp'})), getJxlcBox()),
                        'brotli',
                        (tags) => tags.xmp.Title.value,
                        'xmp',
                    ],
                    ['zTXt', {formats: [png]}, ZTXT_PNG, 'deflate', (tags) => tags.png.Comment.value, ZTXT_TEXT],
                    [
                        'iCCP',
                        {formats: [png], groups: [icc]},
                        getPng(getIccpChunk('icc', 0, deflate(getIccProfile('ABCD')))),
                        'deflate',
                        (tags) => tags.icc['Device Manufacturer'].value,
                        'ABCD',
                    ],
                ];
                for (const [label, tables, image, method, getValue, expected] of cases) {
                    const calls = [];
                    const reader = createReader(Object.assign({decompress: getRecordingDecompress(calls, LIMIT)}, tables));

                    const tags = await reader.load(getDataView(image));

                    expect(calls.length, label).to.equal(1);
                    expect(calls[0][0], label).to.equal(method);
                    expect(calls[0][1], label).to.be.an.instanceof(Uint8Array);
                    expect(calls[0][2], label).to.deep.equal({maxOutputLength: LIMIT + 1});
                    expect(getValue(tags), label).to.equal(expected);
                }
                expect(warnings).to.equal(0);
            });

            it('should skip a block over the reader\'s limit, also with the built-in decompression', async () => {
                const overLimit = createReader({formats: [png], decompress: {maxDecompressedSize: 1}});
                expect((await overLimit.load(getDataView(ZTXT_PNG))).png.Comment.value).to.equal(UNKNOWN_COMPRESSION_TEXT);
                expect(warnings).to.equal(1);

                const underLimit = createReader({formats: [png], decompress: {maxDecompressedSize: ZTXT_TEXT.length}});
                expect((await underLimit.load(getDataView(ZTXT_PNG))).png.Comment.value).to.equal(ZTXT_TEXT);
                expect(warnings).to.equal(1);

                const calls = [];
                const stubbed = createReader({formats: [jxl], groups: [exif], decompress: getRecordingDecompress(calls, EXIF_BLOCK.length - 1)});
                expect((await stubbed.load(getDataView(EXIF_BROB_JXL))).exif).to.equal(undefined);
                expect(calls.map((call) => call[2])).to.deep.equal([{maxOutputLength: EXIF_BLOCK.length}]);
                expect(warnings).to.equal(2);
            });

            it('should take a limit carried by the prototype of decompress', async () => {
                const reader = createReader({formats: [png], decompress: Object.create({maxDecompressedSize: 1})});

                expect((await reader.load(getDataView(ZTXT_PNG))).png.Comment.value).to.equal(UNKNOWN_COMPRESSION_TEXT);
                expect(warnings).to.equal(1);
            });

            it('should hold a limit of zero', async () => {
                const builtIn = createReader({formats: [png], decompress: {maxDecompressedSize: 0}});
                expect((await builtIn.load(getDataView(ZTXT_PNG))).png.Comment.value).to.equal(UNKNOWN_COMPRESSION_TEXT);
                expect(warnings).to.equal(1);

                const calls = [];
                const stubbed = createReader({formats: [jxl], groups: [exif], decompress: getRecordingDecompress(calls, 0)});
                expect((await stubbed.load(getDataView(EXIF_BROB_JXL))).exif).to.equal(undefined);
                expect(calls.map((call) => call[2])).to.deep.equal([{maxOutputLength: 1}]);
                expect(warnings).to.equal(2);
            });

            it('should not change when the caller changes its decompress object after createReader', async () => {
                const calls = [];
                const replacementCalls = [];
                const decompress = getRecordingDecompress(calls, LIMIT);
                delete decompress.deflate;
                const reader = createReader({formats: [jxl], groups: [exif], decompress});
                const changes = [
                    () => {
                        decompress.brotli = getRecordingDecompress(replacementCalls, LIMIT).brotli;
                    },
                    () => {
                        decompress.maxDecompressedSize = Infinity;
                    },
                    () => {
                        decompress.maxDecompressedSize = 'x';
                    },
                    () => {
                        decompress.gzip = () => undefined;
                    },
                ];

                for (const change of changes) {
                    change();
                    expect((await reader.load(getDataView(EXIF_BROB_JXL))).exif.Make.description).to.equal('Make');
                }

                expect(calls.map((call) => call[2])).to.deep.equal(changes.map(() => ({maxOutputLength: LIMIT + 1})));
                expect(replacementCalls).to.deep.equal([]);
            });

            it('should read each decompress field once', async () => {
                const calls = [];
                let reads = 0;
                const decompress = {
                    brotli: getRecordingDecompress(calls, LIMIT).brotli,
                    get maxDecompressedSize() {
                        reads++;
                        return reads === 1 ? LIMIT : 'x';
                    },
                };

                const reader = createReader({formats: [jxl], groups: [exif], decompress});
                await reader.load(getDataView(EXIF_BROB_JXL));
                await reader.load(getDataView(EXIF_BROB_JXL));

                expect(calls.map((call) => call[2])).to.deep.equal([{maxOutputLength: LIMIT + 1}, {maxOutputLength: LIMIT + 1}]);
                expect(reads).to.equal(1);
            });

            it('should give each load the whole limit, concurrent or sequential', async () => {
                const limit = EXIF_BLOCK.length + 4;
                expect(limit).to.be.below(2 * EXIF_BLOCK.length);
                const calls = [];
                const decompress = getRecordingDecompress(calls, limit);
                const snapshot = Object.assign({}, decompress);
                const reader = createReader({formats: [jxl], groups: [exif], decompress});

                const concurrent = await Promise.all([reader.load(getDataView(EXIF_BROB_JXL)), reader.load(getDataView(EXIF_BROB_JXL))]);
                const sequential = [await reader.load(getDataView(EXIF_BROB_JXL)), await reader.load(getDataView(EXIF_BROB_JXL))];

                for (const tags of concurrent.concat(sequential)) {
                    expect(tags.exif.Make.description).to.equal('Make');
                }
                expect(calls.map((call) => call[2])).to.deep.equal([1, 2, 3, 4].map(() => ({maxOutputLength: limit + 1})));
                expect(warnings).to.equal(0);
                expect(decompress).to.deep.equal(snapshot);
                expect(Object.keys(decompress)).to.deep.equal(['brotli', 'deflate', 'maxDecompressedSize']);
            });
        });

        it('should resolve an XMP sidecar to FileType alone in a reader with xml but without xmp', async () => {
            const reader = createReader({formats: allFormats, groups: [exif]});

            expect(await reader.load(getDataView(XMP_SIDECAR), {expanded: false})).to.deep.equal({FileType: {value: 'xml', description: 'XML'}});
            expect(await reader.load(getDataView(XMP_SIDECAR), {expanded: true})).to.deep.equal({file: {FileType: {value: 'xml', description: 'XML'}}});
        });

        it('should read the XMP of a sidecar in a reader with xml and xmp', async () => {
            const reader = createReader({formats: [xml], groups: [xmp], domParser: new XmldomParser()});

            const tags = await reader.load(getDataView(XMP_SIDECAR), {expanded: true});

            expect(tags.file.FileType.value).to.equal('xml');
            expect(tags.xmp.Title.value).to.equal('xmp');
        });

        describe('without a DOM parser', () => {
            beforeEach(() => {
                restores.push(swapProperties(globalThis, {DOMParser: undefined}));
            });

            it('should reject a reader with xmp, whatever the input', async () => {
                const reader = createReader({formats: [jpeg], groups: [xmp]});
                for (const input of [getDataView(JPEG), getDataView(NOISE), 'not bytes']) {
                    const error = await getRejection(reader.load(input));
                    expect(error).to.be.an.instanceof(Error);
                    expect(error.message).to.equal('reader.load: xmp is in groups but no DOM parser is available: pass domParser to createReader, for example new DOMParser({onError: onErrorStopParsing}) from @xmldom/xmldom, or leave xmp out of groups');
                }
            });

            it('should parse the XMP with the parser of the reader', async () => {
                const parser = new XmldomParser();
                const parsed = [];
                const domParser = {
                    parseFromString(xmlString, mimeType) {
                        parsed.push(mimeType);
                        return parser.parseFromString(xmlString, mimeType);
                    },
                };

                const tags = await createReader({formats: [jpeg], groups: [xmp], domParser}).load(getDataView(JPEG), {expanded: true});

                expect(tags.xmp.Title.value).to.equal('xmp');
                expect(parsed.length).to.be.above(0);
            });
        });

        it('should look up the global DOMParser when load runs', async () => {
            restores.push(swapProperties(globalThis, {DOMParser: undefined}));
            const reader = createReader({formats: [jpeg], groups: [xmp]});
            restores.push(swapProperties(globalThis, {DOMParser: XmldomParser}));

            const tags = await reader.load(getDataView(JPEG), {expanded: true});

            expect(tags.xmp.Title.value).to.equal('xmp');
        });

        it('should use the parser of the reader before the global DOMParser', async () => {
            let globalCalls = 0;
            restores.push(swapProperties(globalThis, {DOMParser: function CountingParser() {
                globalCalls++;
                return new XmldomParser();
            }}));
            const reader = createReader({formats: [jpeg], groups: [xmp], domParser: new XmldomParser()});

            const tags = await reader.load(getDataView(JPEG), {expanded: true});

            expect(tags.xmp.Title.value).to.equal('xmp');
            expect(globalCalls).to.equal(0);
        });

        it('should reject an image no composed format recognizes with an UnsupportedFormatError', async () => {
            const reader = createReader({formats: [jpeg], groups: [exif]});
            const pngBytes = fs.readFileSync(path.join(IMAGES_PATH, 'test.png'));

            for (const input of [getDataView(NOISE), pngBytes]) {
                const error = await getRejection(reader.load(input));
                expect(error).to.be.an.instanceof(errors.UnsupportedFormatError);
                expect(error.name).to.equal('UnsupportedFormatError');
                expect(error.message).to.equal('reader.load: none of this reader\'s formats (jpeg) recognizes the input: it is in another format or is not an image');
            }
        });

        it('should name the formats of the reader once each in detection order', async () => {
            const reader = createReader({formats: [xml, png, tiff, jpeg, png]});

            const error = await getRejection(reader.load(getDataView(NOISE)));

            expect(error).to.be.an.instanceof(errors.UnsupportedFormatError);
            expect(error.name).to.equal('UnsupportedFormatError');
            expect(error.message).to.equal('reader.load: none of this reader\'s formats (tiff, jpeg, png, xml) recognizes the input: it is in another format or is not an image');
        });

        it('should pass a non-format error from the read through as the same object', async () => {
            const failure = new RangeError('read failed');
            restores.push(swapProperties(ImageHeader, {parseAppMarkers: () => {
                throw failure;
            }}));
            const reader = createReader({formats: [jpeg], groups: [exif]});

            expect(await getRejection(reader.load(getDataView(JPEG)))).to.equal(failure);
        });

        it('should give a png reader\'s expanded tags under png alone', async () => {
            const pngBytes = fs.readFileSync(path.join(IMAGES_PATH, 'test.png'));
            const expected = await ExifReader.load(pngBytes, {async: true, expanded: true, includeTags: {png: true, file: true}});

            const tags = await createReader({formats: [png]}).load(pngBytes, {expanded: true});

            expect(expected.pngFile).to.not.equal(undefined);
            expect(expected.pngText).to.not.equal(undefined);
            expect(Object.keys(tags).sort()).to.deep.equal(['file', 'png']);
            expect(tags.png).to.deep.equal(expected.png);
        });

        it('should keep pngFile and pngText in flat tags', async () => {
            const pngBytes = fs.readFileSync(path.join(IMAGES_PATH, 'test.png'));
            const expected = await ExifReader.load(pngBytes, {async: true, includeTags: {png: true, file: true}});

            expect(await createReader({formats: [png]}).load(pngBytes, {expanded: false})).to.deep.equal(expected);
        });

        it('should return FileType for formats that bring no file reader', async () => {
            for (const [format, fileName, value] of [[tiff, 'test.tiff', 'tiff'], [png, 'test.png', 'png']]) {
                const bytes = fs.readFileSync(path.join(IMAGES_PATH, fileName));
                for (const tables of [{groups: []}, {groups: [exif]}, {groups: [gps]}, {tags: [DATE_TIME]}]) {
                    const tags = await createReader(Object.assign({formats: [format]}, tables)).load(bytes);
                    expect(tags.file.FileType.value, fileName).to.equal(value);
                }
                const narrowed = await createReader({formats: [format], groups: [exif], tagFilter}).load(bytes, {includeTags: {file: true}});
                expect(narrowed, fileName).to.deep.equal({file: {FileType: {value, description: value.toUpperCase()}}});
            }
        });

        it('should read compressed PNG text chunks however the tags are filtered', async () => {
            const pngImage = getDataView(getPng(
                getZtxtChunk('Comment', 'Compressed'),
                getZtxtChunk('Raw profile type exif', getExifRawProfile(getTiff({ifd0: [ascii(TAG_MAKE, 'Make'), ascii(TAG_DATE_TIME, '2020:01:01 00:00:00')]})))
            ));

            expect((await createReader({formats: [png]}).load(pngImage)).png.Comment.description).to.equal('Compressed');
            expect((await createReader({formats: [png], tagFilter}).load(pngImage, {includeTags: {png: true}})).png.Comment.description).to.equal('Compressed');
            expect((await createReader({formats: [png], tags: [DATE_TIME]}).load(pngImage)).exif.DateTime.description).to.equal('2020:01:01 00:00:00');
        });

        it('should read composite from the merged tags when nothing caps Exif, as the default entry does', async () => {
            const pngImage = getDataView(getPng(getExifChunk(getTiff({exifIfd: [
                rational(TAG_FOCAL_LENGTH, 50, 1),
                rational(TAG_FOCAL_PLANE_X_RESOLUTION, 100, 1),
                rational(TAG_FOCAL_PLANE_Y_RESOLUTION, 100, 1),
                short(TAG_FOCAL_PLANE_RESOLUTION_UNIT, 4),
            ]}))));
            const expected = await ExifReader.load(pngImage, {async: true});
            expect(expected.FocalLength35efl).to.not.equal(undefined);

            for (const tags of [[], [DATE_TIME]]) {
                const reader = createReader({formats: [png], groups: [exif, composite], tags});
                expect(await reader.load(pngImage, {expanded: false}), JSON.stringify(tags)).to.deep.equal(expected);
            }
        });

        describe('includeTags', () => {
            const exifOnlyReader = createReader({formats: [jpeg], groups: [exif]});

            it('should never widen it to a group the reader reads but does not compose', async () => {
                const reader = createReader({formats: [jpeg], groups: [gps], tagFilter});

                for (const includeUnknown of [false, true]) {
                    const tags = await reader.load(getDataView(JPEG), {expanded: true, includeUnknown, includeTags: {exif: true}});

                    expect(tags, String(includeUnknown)).to.deep.equal({});
                }
            });

            it('should treat a falsy value as no includeTags on a reader without the tag filter', async () => {
                const expected = await exifOnlyReader.load(getDataView(JPEG), {expanded: true});
                for (const includeTags of [false, 0, '', null, undefined]) {
                    expect(await exifOnlyReader.load(getDataView(JPEG), {expanded: true, includeTags}), String(includeTags)).to.deep.equal(expected);
                }
                expect(expected.exif.Make.description).to.equal('Canon');
            });
        });

        describe('tag descriptors', () => {
            const dateTimeReader = createReader({formats: [jpeg], tags: [DATE_TIME]});
            const filteredDateTimeReader = createReader({formats: [jpeg], tags: [DATE_TIME], tagFilter});

            it('should return only the described tags of their group', async () => {
                const tags = await dateTimeReader.load(getDataView(JPEG), {expanded: true});

                expect(Object.keys(tags).sort()).to.deep.equal(['exif', 'file', 'jfif']);
                expect(Object.keys(tags.exif)).to.deep.equal(['DateTime']);
                expect(tags.exif.DateTime.description).to.equal('2020:01:01 00:00:00');
            });

            it('should be narrowed by includeTags by name or id, and never widened', async () => {
                const load = (includeTags) => filteredDateTimeReader.load(getDataView(JPEG), {expanded: true, includeTags});

                expect(await load({exif: ['Make']})).to.deep.equal({});
                expect(Object.keys((await load({exif: ['datetime', 'Make']})).exif)).to.deep.equal(['DateTime']);
                expect(Object.keys((await load({exif: [TAG_DATE_TIME, TAG_MAKE]})).exif)).to.deep.equal(['DateTime']);
                expect(Object.keys((await load({exif: [TAG_DATE_TIME]})).exif)).to.deep.equal(['DateTime']);
                expect(await load({exif: [TAG_MAKE]})).to.deep.equal({});
                expect(Object.keys((await load({exif: true})).exif)).to.deep.equal(['DateTime']);
            });

            it('should not widen an id selector to a tag of another IFD with the same id', async () => {
                const reader = createReader({formats: [jpeg], tags: [{name: 'InteroperabilityIndex', ids: [TAG_GPS_LATITUDE_REF], group: 'exif'}], tagFilter});

                const tags = await reader.load(getDataView(JPEG), {expanded: true, includeTags: {exif: [TAG_GPS_LATITUDE_REF]}});

                expect(tags.exif).to.equal(undefined);
            });

            describe('with a descriptor of more than one id', () => {
                const WHITE_BALANCE_ID = 0xa403;
                const WHITE_BALANCE_ALIAS_ID = 0xfe4e;
                const whiteBalanceJpeg = getJpeg(
                    getSof0Segment(),
                    getExifSegment(getTiff({
                        ifd0: [ascii(TAG_MAKE, 'Canon')],
                        exifIfd: [short(WHITE_BALANCE_ID, 1), ascii(WHITE_BALANCE_ALIAS_ID, 'As Shot')],
                    }))
                );
                // IFD0 is read before the Exif IFD, so a read of both ids ends at the Exif IFD's value.
                const aliasInIfd0Jpeg = getJpeg(
                    getSof0Segment(),
                    getExifSegment(getTiff({
                        ifd0: [ascii(WHITE_BALANCE_ALIAS_ID, 'As Shot')],
                        exifIfd: [short(WHITE_BALANCE_ID, 1)],
                    }))
                );
                const whiteBalanceReader = createReader({formats: [jpeg], tags: [WhiteBalance, MakeTag], tagFilter});

                it('should read only the selected id when selected by that id', async () => {
                    const {composed, standard} = await loadBoth({exif: [WHITE_BALANCE_ID]});

                    expect(composed.exif.WhiteBalance).to.deep.equal(standard.exif.WhiteBalance);
                    expect(composed.exif.WhiteBalance.value).to.equal(1);
                    expect(composed.exif.WhiteBalance.description).to.equal('Manual white balance');
                });

                it('should read only the alias id when selected by it', async () => {
                    const {composed, standard} = await loadBoth({exif: [WHITE_BALANCE_ALIAS_ID]}, aliasInIfd0Jpeg);

                    expect(composed.exif.WhiteBalance).to.deep.equal(standard.exif.WhiteBalance);
                    expect(composed.exif.WhiteBalance.description).to.equal('As Shot');
                });

                it('should read every id when selected by name, also next to an id', async () => {
                    for (const selector of [['WhiteBalance'], ['WhiteBalance', WHITE_BALANCE_ID], [WHITE_BALANCE_ID, 'whitebalance']]) {
                        const {composed, standard} = await loadBoth({exif: selector});

                        expect(composed.exif.WhiteBalance, JSON.stringify(selector)).to.deep.equal(standard.exif.WhiteBalance);
                        expect(composed.exif.WhiteBalance.description, JSON.stringify(selector)).to.equal('As Shot');
                    }
                });

                it('should read the id selected next to a tag of another descriptor', async () => {
                    const {composed, standard} = await loadBoth({exif: [WHITE_BALANCE_ID, TAG_MAKE]});

                    expect(composed.exif).to.deep.equal(standard.exif);
                    expect(Object.keys(composed.exif).sort()).to.deep.equal(['Make', 'WhiteBalance']);
                    expect(composed.exif.WhiteBalance.description).to.equal('Manual white balance');
                });

                it('should not return an unknown tag of another IFD that has the selected id', async () => {
                    const reader = createReader({formats: [jpeg], tags: [WhiteBalance, InteroperabilityIndex], tagFilter});
                    const bytes = getJpeg(
                        getSof0Segment(),
                        getExifSegment(getTiff({
                            exifIfd: [short(WHITE_BALANCE_ID, 1)],
                            interopIfd: [ascii(TAG_GPS_LATITUDE_REF, 'R98'), short(WHITE_BALANCE_ID, 2)],
                        }))
                    );

                    const tags = await reader.load(getDataView(bytes), {
                        expanded: true,
                        includeUnknown: true,
                        includeTags: {exif: [WHITE_BALANCE_ID, 'InteroperabilityIndex']},
                    });

                    expect(Object.keys(tags.exif).sort()).to.deep.equal(['InteroperabilityIndex', 'WhiteBalance']);
                    expect(tags.exif.WhiteBalance.value).to.equal(1);
                });

                it('should not return a tag of another IFD that has the selected id', async () => {
                    const descriptor = {name: 'WhiteBalance', ids: [WHITE_BALANCE_ID, TAG_GPS_LATITUDE_REF], group: 'exif'};
                    const reader = createReader({formats: [jpeg], tags: [descriptor], tagFilter});

                    const tags = await reader.load(getDataView(JPEG), {expanded: true, includeTags: {exif: [TAG_GPS_LATITUDE_REF]}});

                    expect(tags.exif || {}).to.deep.equal({});
                });

                it('should not widen an id selector to another id of the same name', async () => {
                    const descriptor = {name: 'WhiteBalance', ids: [WHITE_BALANCE_ID], group: 'exif'};
                    const reader = createReader({formats: [jpeg], tags: [descriptor], tagFilter});
                    const bytes = getJpeg(getSof0Segment(), getExifSegment(getTiff({exifIfd: [ascii(WHITE_BALANCE_ALIAS_ID, 'As Shot')]})));

                    const tags = await reader.load(getDataView(bytes), {expanded: true, includeTags: {exif: [WHITE_BALANCE_ID]}});

                    expect(tags.exif).to.equal(undefined);
                });

                async function loadBoth(includeTags, bytes = whiteBalanceJpeg) {
                    const options = {expanded: true, includeTags};
                    return {
                        composed: await whiteBalanceReader.load(getDataView(bytes), options),
                        standard: await ExifReader.load(getDataView(bytes), Object.assign({async: true}, options)),
                    };
                }
            });

            it('should leave a whole composed group as it is', async () => {
                const reader = createReader({formats: [jpeg], groups: [exif], tags: [DATE_TIME]});

                const tags = await reader.load(getDataView(JPEG), {expanded: true});

                expect(tags.exif.Make.description).to.equal('Canon');
                expect(tags.exif.DateTime.description).to.equal('2020:01:01 00:00:00');
            });

            it('should be subject to excludeTags', async () => {
                const tags = await filteredDateTimeReader.load(getDataView(JPEG), {expanded: true, excludeTags: {exif: ['DateTime']}});

                expect(tags.exif).to.equal(undefined);
                expect(Object.keys(tags)).to.include('file');
            });
        });

        describe('a group that needs Exif without exif composed', () => {
            it('should read gps without returning exif', async () => {
                const tags = await createReader({formats: [jpeg], groups: [gps]}).load(getDataView(JPEG), {expanded: true});

                expect(tags.gps.Latitude).to.equal(1);
                expect(tags.exif).to.equal(undefined);
                expect(Object.keys(tags).sort()).to.deep.equal(['file', 'gps', 'jfif']);
            });

            it('should read the thumbnail without returning exif', async () => {
                const tags = await createReader({formats: [jpeg], groups: [thumbnail]}).load(getDataView(JPEG), {expanded: true});

                expect(tags.Thumbnail.image.byteLength).to.equal(THUMBNAIL_IMAGE.length);
                expect(tags.exif).to.equal(undefined);
            });

            it('should read Canon maker notes without returning exif', async () => {
                const tags = await createReader({formats: [jpeg], groups: [canon]}).load(getDataView(JPEG), {expanded: true});

                expect(tags.makerNotes.LensModel.description).to.equal('canon lens');
                expect(tags.exif).to.equal(undefined);
            });

            it('should read composite without returning exif', async () => {
                const tags = await createReader({formats: [jpeg], groups: [composite]}).load(getDataView(JPEG), {expanded: true});

                expect(tags.exif).to.equal(undefined);
                expect(Object.keys(tags).sort()).to.deep.equal(['file', 'jfif']);
            });

            it('should not add exif for a group that needs no Exif', async () => {
                const tags = await createReader({formats: [jpeg], groups: [mpf]}).load(getDataView(JPEG), {expanded: true, includeOffsets: true});

                expect(tags.metadataRange.blocks.map((block) => block.type)).to.deep.equal(['file', 'jfif']);
            });

            it('should list the parse-only Exif block in metadataRange', async () => {
                const tags = await createReader({formats: [jpeg], groups: [icc]}).load(getDataView(JPEG), {expanded: true, includeOffsets: true});

                expect(tags.metadataRange.blocks.map((block) => block.type)).to.deep.equal(['file', 'jfif', 'exif']);
            });
        });

        describe('excludeTags', () => {
            const domParser = new XmldomParser();

            it('should drop xmp whether or not something caps Exif', async () => {
                for (const groups of [[exif, xmp], [xmp]]) {
                    const tags = await createReader({formats: [jpeg], groups, tagFilter, domParser}).load(getDataView(JPEG), {expanded: true, excludeTags: {xmp: true}});
                    expect(tags.xmp).to.equal(undefined);
                    const kept = await createReader({formats: [jpeg], groups, tagFilter, domParser}).load(getDataView(JPEG), {expanded: true});
                    expect(kept.xmp.Title.value).to.equal('xmp');
                }
            });

            it('should drop gps on a gps-only reader', async () => {
                const tags = await createReader({formats: [jpeg], groups: [gps], tagFilter}).load(getDataView(JPEG), {expanded: true, excludeTags: {gps: true}});

                expect(tags.gps).to.equal(undefined);
            });

            it('should drop the thumbnail whether or not something caps Exif', async () => {
                for (const groups of [[exif, thumbnail], [thumbnail]]) {
                    const tags = await createReader({formats: [jpeg], groups, tagFilter}).load(getDataView(JPEG), {expanded: true, excludeTags: {thumbnail: true}});
                    expect(tags.Thumbnail).to.equal(undefined);
                }
            });

            it('should drop maker notes when the MakerNote tag is excluded', async () => {
                for (const groups of [[makerNotes], [canon, pentax], [exif, makerNotes]]) {
                    const reader = createReader({formats: [jpeg], groups, tagFilter});
                    expect((await reader.load(getDataView(JPEG), {expanded: true})).makerNotes.LensModel.description).to.equal('canon lens');
                    expect((await reader.load(getDataView(JPEG), {expanded: true, includeTags: {makerNotes: true}})).makerNotes.LensModel.description).to.equal('canon lens');
                    const tags = await reader.load(getDataView(JPEG), {expanded: true, includeTags: {makerNotes: true}, excludeTags: {exif: ['MakerNote']}});
                    expect(tags.makerNotes).to.equal(undefined);
                    expect((await reader.load(getDataView(JPEG), {expanded: true, excludeTags: {exif: ['MakerNote']}})).makerNotes).to.equal(undefined);
                }
            });

            it('should let the caller\'s own includeTags entry win over its excludeTags entry for the same group', async () => {
                const reader = createReader({formats: [jpeg], groups: [exif, xmp], tagFilter, domParser});

                const tags = await reader.load(getDataView(JPEG), {expanded: true, includeTags: {xmp: true}, excludeTags: {xmp: true}});

                expect(tags.xmp.Title.value).to.equal('xmp');
            });
        });

        describe('a malformed includeTags or excludeTags', () => {
            const OPTIONS = ['includeTags', 'excludeTags'];
            const reader = createReader({formats: [jpeg], groups: [exif], tagFilter});
            const load = (options) => reader.load(getDataView(JPEG), options);
            const getValueMessage = (option, group) => 'reader.load: ' + option + '.' + group + ' must be true, false or an array of tag names or ids';

            it('should reject either option that is not an object keyed by group, without throwing', async () => {
                for (const option of OPTIONS) {
                    for (const value of [true, 1, 'exif', ['exif'], Object.assign(['exif'], {exif: true})]) {
                        let result;
                        expect(() => {
                            result = load({[option]: value});
                        }).to.not.throw();
                        await expectRejection(result, 'reader.load: ' + option + ' must be an object keyed by group', option + ' ' + String(value));
                    }
                }
            });

            it('should reject a Map, a Set or a Date as either option', async () => {
                for (const option of OPTIONS) {
                    for (const value of [new Map([['exif', true]]), new Set(['exif']), new Date()]) {
                        await expectRejection(load({[option]: value}), 'reader.load: ' + option + ' must be an object keyed by group', option + ' ' + value.constructor.name);
                    }
                }
            });

            it('should accept an object of groups without a prototype', async () => {
                const includeTags = Object.assign(Object.create(null), {exif: ['Make']});
                const excludeTags = Object.assign(Object.create(null), {exif: ['Make']});

                expect(Object.keys((await load({expanded: true, includeTags})).exif)).to.deep.equal(['Make']);
                expect((await load({expanded: true, excludeTags})).exif.Make).to.equal(undefined);
            });

            it('should reject a key that is not a group, with the list of groups', async () => {
                for (const option of OPTIONS) {
                    for (const key of ['exiff', 'gsp', 'Exif', 'thumbnails', 'constructor', 'toString', 'hasOwnProperty']) {
                        await expectRejection(load({[option]: {[key]: true}}), 'reader.load: ' + option + ' has no group \'' + key + '\': ' + GROUPS_MESSAGE, option + ' ' + key);
                    }
                    await expectRejection(load({[option]: JSON.parse('{"__proto__": true}')}), 'reader.load: ' + option + ' has no group \'__proto__\': ' + GROUPS_MESSAGE, option);
                }
            });

            it('should reject a key that is not a group whatever its value', async () => {
                for (const option of OPTIONS) {
                    for (const value of [false, undefined, ['Make']]) {
                        await expectRejection(load({[option]: {exiff: value}}), 'reader.load: ' + option + ' has no group \'exiff\': ' + GROUPS_MESSAGE, option + ' ' + String(value));
                    }
                }
            });

            it('should reject a group value that is not true, false or an array', async () => {
                for (const option of OPTIONS) {
                    for (const group of ['exif', 'gps']) {
                        for (const value of [null, 0, 1, NaN, '', 'yes', 'all', 'MakerNote', {}, {Make: true}]) {
                            await expectRejection(load({[option]: {[group]: value}}), getValueMessage(option, group), option + ' ' + group + ' ' + JSON.stringify(value));
                        }
                    }
                }
            });

            it('should reject an array element that is neither a string nor a number', async () => {
                for (const option of OPTIONS) {
                    for (const value of [[{}], [null], [undefined], [true], [['Make']], ['Make', {}], [0x010f, null]]) {
                        await expectRejection(load({[option]: {exif: value}}), getValueMessage(option, 'exif'), option + ' ' + String(value));
                        await expectRejection(load({[option]: {gps: value}}), getValueMessage(option, 'gps'), option + ' gps ' + String(value));
                    }
                }
            });

            it('should accept names and ids in one array, and an empty array', async () => {
                const named = await load({expanded: true, includeTags: {exif: ['Make', 0x010f]}});
                const excluded = await load({expanded: true, excludeTags: {exif: ['Make', 0x0110]}});

                expect(Object.keys(named.exif)).to.deep.equal(['Make']);
                expect(excluded.exif.Make).to.equal(undefined);
                expect(excluded.exif.Model).to.equal(undefined);
                expect(await load({expanded: true, excludeTags: {exif: []}})).to.deep.equal(await load({expanded: true}));
                expect(await load({expanded: true, includeTags: {exif: []}})).to.deep.equal({});
            });

            it('should accept false and undefined as a group value', async () => {
                const expected = await load({expanded: true});

                expect(await load({expanded: true, includeTags: {exif: false}})).to.be.an('object');
                expect(await load({expanded: true, includeTags: {exif: undefined}})).to.be.an('object');
                expect(await load({expanded: true, excludeTags: {exif: false}})).to.deep.equal(expected);
                expect(await load({expanded: true, excludeTags: {exif: undefined}})).to.deep.equal(expected);
            });

            it('should take a falsy option as a whole as no option', async () => {
                const expected = await load({expanded: true});
                for (const option of OPTIONS) {
                    for (const value of [false, 0, '', null, undefined]) {
                        expect(await load({expanded: true, [option]: value}), option + ' ' + String(value)).to.deep.equal(expected);
                    }
                }
            });

            it('should accept a known group the reader does not compose and leave it out of the result', async () => {
                const expected = await load({expanded: true});

                const included = await load({expanded: true, includeTags: {exif: ['Make'], xmp: true, gps: ['GPSLatitude'], iptc: ['By-line'], thumbnail: false}});
                const excluded = await load({expanded: true, excludeTags: {xmp: true, gps: ['GPSLatitude'], thumbnail: true}});

                expect(Object.keys(included)).to.deep.equal(['exif']);
                expect(Object.keys(included.exif)).to.deep.equal(['Make']);
                expect(excluded).to.deep.equal(expected);
            });

            it('should accept every group name as a key', async () => {
                const groupNames = ['exif', 'iptc', 'xmp', 'icc', 'photoshop', 'makerNotes', 'mpf', 'file', 'jfif', 'png', 'riff', 'gif', 'gps', 'composite', 'thumbnail'];
                const excludeTags = Object.fromEntries(groupNames.map((name) => [name, false]));
                const includeTags = Object.assign({exif: true}, excludeTags, {exif: ['Make']});

                expect(Object.keys((await load({expanded: true, includeTags})).exif)).to.deep.equal(['Make']);
                expect(await load({expanded: true, excludeTags})).to.deep.equal(await load({expanded: true}));
            });

            it('should check includeTags before excludeTags, and each key in turn', async () => {
                const includeMessage = 'reader.load: includeTags has no group \'exiff\': ' + GROUPS_MESSAGE;

                await expectRejection(load({includeTags: {exiff: true}, excludeTags: {gsp: true}}), includeMessage);
                await expectRejection(load({includeTags: {exif: 1}, excludeTags: {gsp: true}}), getValueMessage('includeTags', 'exif'));
                await expectRejection(load({includeTags: {exif: 1, exiff: true}}), getValueMessage('includeTags', 'exif'));
                await expectRejection(load({includeTags: {exiff: true, exif: 1}}), includeMessage);
                await expectRejection(load({includeTags: {exif: true}, excludeTags: {gps: 'yes', gsp: true}}), getValueMessage('excludeTags', 'gps'));
                await expectRejection(load({includeTags: 'exif', excludeTags: {gsp: true}}), 'reader.load: includeTags must be an object keyed by group');
            });

            it('should check the boolean options before includeTags and excludeTags', async () => {
                await expectRejection(load({includeTags: {exiff: true}, computed: 1}), getBooleanOptionMessage('computed'));
                await expectRejection(load({excludeTags: 'exif', expanded: 'false'}), getBooleanOptionMessage('expanded'));
            });

            it('should check the options before the DOM parser and the input data', async () => {
                restores.push(swapProperties(globalThis, {DOMParser: undefined}));
                const xmpReader = createReader({formats: [jpeg], groups: [exif, xmp], tagFilter});
                const xmpLoad = (options, data) => xmpReader.load(data === undefined ? getDataView(JPEG) : data, options);

                await expectRejection(xmpLoad({includeTags: {exiff: true}, bogus: 1}), 'reader.load: unknown option \'bogus\'');
                await expectRejection(xmpLoad({includeTags: {exiff: true}}), 'reader.load: includeTags has no group \'exiff\': ' + GROUPS_MESSAGE);
                await expectRejection(xmpLoad({excludeTags: {xmp: 'yes'}}), getValueMessage('excludeTags', 'xmp'));
                await expectRejection(xmpLoad({includeTags: {exif: [{}]}}, 'not an image'), getValueMessage('includeTags', 'exif'));
                expect((await getRejection(xmpLoad({includeTags: {exif: true}}, 'not an image'))).message).to.contain('no DOM parser is available');
                await expectRejection(xmpLoad({includeTags: {exif: true}, domParser: new XmldomParser()}), DOM_PARSER_OPTION_MESSAGE);
                await expectRejection(xmpLoad({includeTags: {exif: true}, domParser: new XmldomParser()}, 'not an image'), DOM_PARSER_OPTION_MESSAGE);
                const parserReader = createReader({formats: [jpeg], groups: [exif, xmp], tagFilter, domParser: new XmldomParser()});
                await expectRejection(parserReader.load('not an image', {includeTags: {exif: true}}), INPUT_MESSAGE);
            });
        });

        it('should give the thumbnail base64 without Buffer', async () => {
            const bytes = getBytes(JPEG);
            restores.push(swapProperties(globalThis, {Buffer: undefined}));

            const tags = await createReader({formats: [jpeg], groups: [exif, thumbnail]}).load(bytes);

            expect(tags.Thumbnail.base64).to.equal(btoa(THUMBNAIL_IMAGE));
        });

        it('should give no thumbnail base64 without btoa', async () => {
            restores.push(swapProperties(globalThis, {btoa: undefined}));

            const tags = await createReader({formats: [jpeg], groups: [thumbnail]}).load(getDataView(JPEG));

            expect(tags.Thumbnail.base64).to.equal(undefined);
        });

        it('should read the same without the tag filter as with it when the load filters nothing', async () => {
            const domParser = new XmldomParser();
            const allGroupsButExif = allGroups.filter((group) => group !== exif);
            const compositions = [
                {formats: allFormats, groups: allGroups},
                {formats: FORMATS_BUT_XML, groups: [canon, pentax]},
                {formats: allFormats, groups: allGroupsButExif},
                {formats: FORMATS_BUT_XML, tags: [DATE_TIME]},
                {formats: FORMATS_BUT_XML, tags: [{name: 'GPSLatitude', ids: [TAG_GPS_LATITUDE], group: 'exif'}]},
            ].concat([exif, iptc, xmp, icc, photoshop, mpf, canon, pentax, makerNotes, gps, composite, thumbnail].map((group) => ({formats: FORMATS_BUT_XML, groups: [group]})));
            const images = [['Canon maker note', getBytes(JPEG)]].concat(['test.jpg', 'test-iptc.jpg', 'test.png', 'test.tiff', 'test.heic', 'test.avif', 'test.jxl', 'test.gif']
                .map((fileName) => [fileName, fs.readFileSync(path.join(IMAGES_PATH, fileName))]));
            for (const [fileName, bytes] of images) {
                for (const tables of compositions) {
                    const reader = createReader(Object.assign({domParser}, tables));
                    const filteredReader = createReader(Object.assign({tagFilter, domParser}, tables));
                    for (const expanded of [false, true]) {
                        const label = [fileName, getKeys(tables.groups), getKeys(tables.tags), expanded].join(' ');
                        expect(await reader.load(bytes, {expanded}), label).to.deep.equal(await filteredReader.load(bytes, {expanded}));
                    }
                }
            }
        });

        it('should match the default entry for every format and group', async () => {
            const domParser = new XmldomParser();
            const allReader = createReader({formats: allFormats, groups: allGroups, domParser});
            for (const fileName of ['test.jpg', 'test-iptc.jpg', 'test.png', 'test.tiff', 'test.heic', 'test.avif', 'test.jxl', 'test.gif']) {
                const bytes = fs.readFileSync(path.join(IMAGES_PATH, fileName));
                for (const expanded of [false, true]) {
                    const expected = await ExifReader.load(bytes, {async: true, expanded, domParser});
                    if (expanded) {
                        delete expected.pngFile;
                        delete expected.pngText;
                    }
                    expect(await allReader.load(bytes, {expanded}), fileName).to.deep.equal(expected);
                }
            }
        });
    });
});

function getGroup(kind, emits) {
    return {
        brand: GROUP_BRAND,
        key: kind,
        consumes: [kind],
        emits,
        read: () => ({tags: {}}),
        merge: () => ({slot: kind, mode: 'assign'}),
    };
}

function getKeys(table) {
    return (table || []).map((value) => value.key || value.name).join('+');
}

function sliceStub() {
    return undefined;
}

function getBytes(data) {
    return new Uint8Array(getDataView(data).buffer);
}

function expectCreateReaderError(tables, message, label) {
    let error;
    try {
        createReader(tables);
    } catch (thrown) {
        error = thrown;
    }
    expect(error, label).to.be.an.instanceof(TypeError);
    expect(error.message, label).to.equal(message);
}

// Records each call and decompresses with node:zlib, which honours maxOutputLength.
function getRecordingDecompress(calls, maxDecompressedSize) {
    return {
        brotli: (data, options) => {
            calls.push(['brotli', data, options]);
            return brotliDecompressSync(data, options);
        },
        deflate: (data, options) => {
            calls.push(['deflate', data, options]);
            return inflateSync(data, options);
        },
        maxDecompressedSize,
    };
}

function getBooleanOptionMessage(option) {
    return 'reader.load: ' + option + ' must be true or false';
}

function getRejection(promise) {
    return promise.then(() => {
        throw new Error('Expected a rejection.');
    }, (error) => error);
}

async function expectRejection(promise, message, label) {
    const error = await getRejection(promise);
    expect(error, label).to.be.an.instanceof(TypeError);
    expect(error.message, label).to.equal(message);
}
