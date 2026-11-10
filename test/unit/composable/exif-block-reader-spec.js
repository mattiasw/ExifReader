/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getByteStringFromNumber} from '../test-utils.js';
import {COMPRESSION_METHOD_BROTLI, objectAssign} from '../../../src/utils.js';
import {getValueBudget} from '../../../src/tags-helpers.js';
import ByteOrder from '../../../src/byte-order.js';
import Tags from '../../../src/tags.js';
import TagNames0thIfd from '../../../src/tag-names-0th-ifd.js';
import TagNamesExifIfd from '../../../src/tag-names-exif-ifd.js';
import TagNamesGpsIfd from '../../../src/tag-names-gps-ifd.js';
import TagNamesInteroperabilityIfd from '../../../src/tag-names-interoperability-ifd.js';
import {createTagFilter} from '../../../src/tag-filter.js';
import {GROUP_BRAND} from '../../../src/composable/brand.js';
import * as ExifBlockReader from '../../../src/composable/exif-block-reader.js';
import {EXIF_EMITTED_KINDS, exifBlockReader, readExifBlock, getExifMergeDescriptor} from '../../../src/composable/exif-block-reader.js';
import * as ExifTags from '../../../src/composable/tags/exif.js';
import {DateTime, ExposureTime, GPSLatitudeRef, InteroperabilityIndex, WhiteBalance, Make} from '../../../src/composable/tags/exif.js';
import {getContext, recordCalls} from './test-context.js';
import {TAG_MAKE, TAG_MODEL, ascii, short, getTiff} from '../loadview-inventory-images.js';

const TAG_NAMES = {'0th': {[TAG_MAKE]: 'Make', [TAG_MODEL]: 'Model'}, exif: {}, gps: {}, interoperability: {}};
const POINTER_IDS = [0x8769, 0x8825, 0xa005];

describe('composable/exif-block-reader', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should export the reader link, the reading code and the kinds an Exif block carries', () => {
        expect(Object.keys(ExifBlockReader).sort()).to.deep.equal(['EXIF_EMITTED_KINDS', 'exifBlockReader', 'getExifMergeDescriptor', 'readExifBlock']);
        expect(Object.keys(exifBlockReader)).to.deep.equal(['createParseOnlyGroup']);
        expect(EXIF_EMITTED_KINDS).to.deep.equal(['iptc', 'xmp', 'photoshop', 'icc', 'makerNote', 'thumbnail']);
    });

    describe('createParseOnlyGroup', () => {
        it('should make an Exif group that consumes the exif kind and emits the kinds an Exif block carries', () => {
            const group = exifBlockReader.createParseOnlyGroup([DateTime]);

            expect(group.key).to.equal('exif');
            expect(group.consumes).to.deep.equal(['exif']);
            expect(group.emits).to.equal(EXIF_EMITTED_KINDS);
            expect(group.merge).to.equal(getExifMergeDescriptor);
            expect(group.brand).to.equal(GROUP_BRAND);
        });

        it('should build the dictionaries once and pass the same ones to every read', () => {
            const reads = recordTagsReads();
            const group = exifBlockReader.createParseOnlyGroup([DateTime]);

            group.read({kind: 'exif', tiffHeaderOffset: 0}, getContext());
            group.read({kind: 'exif', tiffHeaderOffset: 0}, getContext());

            expect(reads[1][6]).to.equal(reads[0][6]);
        });

        it('should share one merged dictionary between IFD0 and the Exif IFD, with the 0th and exif descriptors', () => {
            const tagNames = getTagNames([DateTime, ExposureTime]);

            expect(tagNames['0th']).to.equal(tagNames['exif']);
            expect(tagNames['0th'][0x0132]).to.equal(TagNames0thIfd[0x0132]);
            expect(tagNames['0th'][0x829a]).to.deep.equal(TagNamesExifIfd[0x829a]);
        });

        it('should put the gps and interoperability descriptors in their own dictionaries', () => {
            const tagNames = getTagNames([GPSLatitudeRef, InteroperabilityIndex]);

            expect(tagNames['gps']).to.deep.equal({0x0001: TagNamesGpsIfd[0x0001]});
            expect(tagNames['interoperability']).to.deep.equal({0x0001: TagNamesInteroperabilityIfd[0x0001]});
            expect(tagNames['0th'][0x0001]).to.equal(undefined);
        });

        it('should give every IFD Tags.read walks a dictionary, also with no descriptor for it', () => {
            const tagNames = getTagNames([DateTime]);

            expect(Object.keys(tagNames).sort()).to.deep.equal(['0th', 'exif', 'gps', 'interoperability']);
            expect(tagNames['gps']).to.deep.equal({});
            expect(tagNames['interoperability']).to.deep.equal({});
        });

        it('should always name the three sub-IFD pointers, as the full dictionaries do', () => {
            const tagNames = getTagNames([GPSLatitudeRef]);

            expect(Object.keys(tagNames['0th']).map(Number).sort()).to.deep.equal(POINTER_IDS);
            expect(tagNames['0th'][0x8769]).to.equal(TagNames0thIfd[0x8769]);
            expect(tagNames['0th'][0x8825]).to.equal(TagNames0thIfd[0x8825]);
            expect(tagNames['0th'][0xa005]).to.equal(TagNamesExifIfd[0xa005]);
        });

        it('should map both ids of a descriptor of more than one id, with the description only where the dictionary has it', () => {
            const tagNames = getTagNames([WhiteBalance]);

            expect(tagNames['0th'][0xa403]).to.deep.equal({name: 'WhiteBalance', description: WhiteBalance.description});
            expect(tagNames['0th'][0xfe4e]).to.equal('WhiteBalance');
        });

        it('should build the full dictionaries from every generated descriptor', () => {
            const tagNames = getTagNames(Object.values(ExifTags));

            expect(tagNames['0th']).to.deep.equal(objectAssign({}, TagNames0thIfd, TagNamesExifIfd));
            expect(tagNames['gps']).to.deep.equal(TagNamesGpsIfd);
            expect(tagNames['interoperability']).to.deep.equal(TagNamesInteroperabilityIfd);
        });

        it('should give the thumbnail IFD the dictionary it is given, and no dictionary without one', () => {
            const ifd1TagNames = {};

            expect(getTagNames([DateTime], ifd1TagNames)['1st']).to.equal(ifd1TagNames);
            expect(getTagNames([DateTime])).to.not.have.property('1st');
        });

        it('should leave out a descriptor of a dictionary that is not its own, and write to no inherited object', () => {
            restores.push(() => [Object.prototype, Object, Object.prototype.toString].forEach((object) => delete object[0x0132]));
            const otherDictionaries = ['__proto__', 'constructor', 'toString', 'unknown'];

            const tagNames = getTagNames([ExposureTime].concat(otherDictionaries.map((dictionary) => objectAssign({}, DateTime, {dictionary}))));

            expect(({})[0x0132]).to.equal(undefined);
            expect(Object[0x0132]).to.equal(undefined);
            expect(Object.prototype.toString[0x0132]).to.equal(undefined);
            expect(tagNames['0th'][0x0132]).to.equal(undefined);
            expect(tagNames['0th'][0x829a]).to.deep.equal(TagNamesExifIfd[0x829a]);
        });

        describe('reading with its dictionaries', () => {
            const TAG_UNKNOWN = 0x9999;
            const TIFF = getTiff({ifd0: [ascii(TAG_MAKE, 'Canon'), ascii(TAG_MODEL, 'Model'), short(TAG_UNKNOWN, 1)]});

            it('should skip a tag outside its dictionaries', () => {
                const group = exifBlockReader.createParseOnlyGroup([Make]);

                const result = group.read({kind: 'exif', tiffHeaderOffset: 0}, getContext({dataView: getDataView(TIFF)}));

                expect(Object.keys(result.tags)).to.deep.equal(['Make']);
            });

            it('should name a tag outside its dictionaries by its id with includeUnknown', () => {
                const group = exifBlockReader.createParseOnlyGroup([Make]);

                const result = group.read({kind: 'exif', tiffHeaderOffset: 0}, getContext({dataView: getDataView(TIFF), options: {includeUnknown: true}}));

                expect(Object.keys(result.tags)).to.deep.equal(['Make', `undefined-${TAG_MODEL}`, `undefined-${TAG_UNKNOWN}`]);
            });
        });

        function getTagNames(descriptors, ifd1TagNames) {
            const reads = recordTagsReads();
            exifBlockReader.createParseOnlyGroup(descriptors, ifd1TagNames).read({kind: 'exif', tiffHeaderOffset: 0}, getContext());
            return reads[0][6];
        }
    });

    describe('reading the main block', () => {
        it('should read a TIFF block from the file and filter its tags', () => {
            const tiff = getTiff({ifd0: [ascii(TAG_MAKE, 'Canon'), ascii(TAG_MODEL, 'Model')]});
            const ctx = getContext({dataView: getDataView('xx' + tiff), tagFilter: createTagFilter({includeTags: {exif: ['Make']}})});

            const result = readExifBlock({kind: 'exif', tiffHeaderOffset: 2}, ctx, TAG_NAMES);

            expect(Object.keys(result.tags)).to.deep.equal(['Make']);
            expect(result.tags.Make.value).to.deep.equal(['Canon']);
            expect(result.blocks).to.deep.equal([]);
        });

        it('should create the value budget from the block\'s view', () => {
            const tiff = getTiff({ifd0: [ascii(TAG_MAKE, 'Canon')]});
            const view = getDataView(tiff);
            const ctx = getContext({dataView: getDataView('\x00'.repeat(4096))});

            readExifBlock({kind: 'exif', tiffHeaderOffset: 0, dataView: view}, ctx, TAG_NAMES);

            // Reading Exif draws no IPTC datasets, so this count still shows which view sized the budget.
            expect(ctx.valueBudget.iptcDatasetsRemaining).to.equal(getValueBudget(view).iptcDatasetsRemaining);
            expect(getValueBudget(ctx.dataView).iptcDatasetsRemaining).to.not.equal(getValueBudget(view).iptcDatasetsRemaining);
            expect(ctx.getValueBudget()).to.equal(ctx.valueBudget);
        });

        it('should read nothing from a block without a TIFF header offset', () => {
            const reads = recordTagsReads();

            expect(readExifBlock({kind: 'exif'}, getContext(), TAG_NAMES)).to.equal(undefined);
            expect(reads).to.have.lengthOf(0);
        });

        it('should read a malformed main TIFF header as no tags', () => {
            const ctx = getContext({dataView: getDataView('\x00'.repeat(8))});

            expect(readExifBlock({kind: 'exif', tiffHeaderOffset: 0}, ctx, TAG_NAMES)).to.deep.equal({tags: {}, blocks: []});
        });

        it('should let a malformed embedded TIFF header throw, which drops the block', () => {
            const ctx = getContext({dataView: getDataView('\x00'.repeat(8))});

            expect(() => readExifBlock({kind: 'exif', tiffHeaderOffset: 0, origin: 'rawProfile'}, ctx, TAG_NAMES)).to.throw(Error, 'Illegal byte order value');
        });

        it('should read the thumbnail IFD when the thumbnail group is composed', () => {
            const reads = recordTagsReads();

            readExifBlock({kind: 'exif', tiffHeaderOffset: 0}, getContext({composed: {groups: {thumbnail: true}}}), TAG_NAMES);

            expect(reads[0][7]).to.equal(true);
        });

        it('should not read the thumbnail IFD without the thumbnail group', () => {
            const reads = recordTagsReads();

            readExifBlock({kind: 'exif', tiffHeaderOffset: 0}, getContext(), TAG_NAMES);

            expect(reads[0][7]).to.equal(false);
        });

        it('should not read the thumbnail IFD when the filter leaves the thumbnail group out', () => {
            const reads = recordTagsReads();
            const tagFilter = createTagFilter({excludeTags: {thumbnail: true}});

            readExifBlock({kind: 'exif', tiffHeaderOffset: 0}, getContext({tagFilter, composed: {groups: {thumbnail: true}}}), TAG_NAMES);

            expect(reads[0][7]).to.equal(false);
        });

        it('should pass the options, the filter and the dictionaries to the tag reader', () => {
            const reads = recordTagsReads();
            const tagFilter = createTagFilter();
            const view = getDataView('\x00'.repeat(16));
            const ctx = getContext({options: {includeUnknown: 'unknown', computed: 'computed'}, tagFilter});

            readExifBlock({kind: 'exif', tiffHeaderOffset: 6, dataView: view}, ctx, TAG_NAMES);

            expect(reads[0].slice(0, 6)).to.deep.equal([view, 6, 'unknown', 'computed', tagFilter, ctx.valueBudget]);
            expect(reads[0][6]).to.equal(TAG_NAMES);
        });
    });

    describe('the blocks it emits', () => {
        it('should emit the carried blocks in emission order and keep the thumbnail IFD out of its tags', () => {
            const ifd1Tags = {JPEGInterchangeFormat: {value: 10}};
            const makerNoteBytes = [1, 2, 3];
            swapTagsRead({
                'IPTC-NAA': {value: 'iptc view'},
                ApplicationNotes: {value: [60, 120]},
                ImageSourceData: {value: [1]},
                PhotoshopSettings: {value: [2]},
                ICC_Profile: {value: [3, 4]},
                MakerNote: {value: makerNoteBytes},
                Make: {value: ['Canon']},
                Thumbnail: ifd1Tags,
            }, {makerNoteOffset: 100, byteOrder: ByteOrder.LITTLE_ENDIAN});
            const view = getDataView('\x00'.repeat(16));

            const {tags, blocks} = readExifBlock({kind: 'exif', tiffHeaderOffset: 6, dataView: view}, getContext(), TAG_NAMES);

            expect(tags).to.not.have.property('Thumbnail');
            expect(blocks.map((block) => block.kind)).to.deep.equal(['iptc', 'xmp', 'photoshop', 'icc', 'makerNote', 'thumbnail']);
            expect(blocks[0]).to.deep.equal({kind: 'iptc', dataView: 'iptc view', dataOffset: 0, carried: 'main'});
            expect(blocks[1]).to.include({kind: 'xmp', carried: 'main', decompressed: false, byteLength: 2});
            expect(blocks[1].getDataView()).to.equal('<x');
            expect(blocks[2]).to.deep.equal({kind: 'photoshop', value: [2], carried: 'main'});
            expect(blocks[3]).to.deep.equal({kind: 'icc', dataView: [3, 4], chunks: [{offset: 0, length: 2, chunkNumber: 1, chunksTotal: 1}], carried: 'main'});
            expect(blocks[4]).to.deep.equal({
                kind: 'makerNote',
                tiffView: view,
                tiffHeaderOffset: 6,
                makerNoteOffset: 100,
                byteOrder: ByteOrder.LITTLE_ENDIAN,
                make: ['Canon'],
                bytes: makerNoteBytes,
                carried: 'main',
            });
            expect(blocks[5]).to.deep.equal({kind: 'thumbnail', dataView: view, tiffHeaderOffset: 6, ifd1Tags, decompressed: false, rank: 'main'});
        });

        it('should mark the blocks an embedded Exif block carries with its origin', () => {
            swapTagsRead({'IPTC-NAA': {value: 'iptc view'}, Thumbnail: {}});

            const {blocks} = readExifBlock({kind: 'exif', tiffHeaderOffset: 0, origin: 'rawProfile', decompressed: true}, getContext(), TAG_NAMES);

            expect(blocks[0].carried).to.equal('rawProfile');
            expect(blocks[1]).to.include({kind: 'thumbnail', decompressed: true, rank: 'embedded'});
        });

        it('should emit no XMP block for ApplicationNotes that are not a number array', () => {
            swapTagsRead({ApplicationNotes: {value: ['<', 'x']}});

            expect(readExifBlock({kind: 'exif', tiffHeaderOffset: 0}, getContext(), TAG_NAMES).blocks).to.deep.equal([]);
        });

        it('should emit no Photoshop block without both tags or with non-array settings', () => {
            for (const tags of [
                {ImageSourceData: {value: [1]}},
                {PhotoshopSettings: {value: [2]}},
                {ImageSourceData: {value: [1]}, PhotoshopSettings: {value: 'settings'}},
            ]) {
                swapTagsRead(tags);

                expect(readExifBlock({kind: 'exif', tiffHeaderOffset: 0}, getContext(), TAG_NAMES).blocks, JSON.stringify(tags)).to.deep.equal([]);
            }
        });

        it('should emit no maker note block without the maker note offset, and one without a Make', () => {
            swapTagsRead({MakerNote: {value: [1]}});
            expect(readExifBlock({kind: 'exif', tiffHeaderOffset: 0}, getContext(), TAG_NAMES).blocks).to.deep.equal([]);

            swapTagsRead({MakerNote: {value: [1]}}, {makerNoteOffset: 0});
            const {blocks} = readExifBlock({kind: 'exif', tiffHeaderOffset: 0}, getContext(), TAG_NAMES);
            expect(blocks).to.have.lengthOf(1);
            expect(blocks[0].make).to.equal(undefined);
        });
    });

    describe('reading a brob block', () => {
        const BROB_BLOCK = {kind: 'exif', compression: 'brotli', dataOffset: 2, length: 100};

        it('should read nothing when the jxl format is not composed', () => {
            const ctx = getContext({dataView: getDataView('\x00'.repeat(16))});
            const decompressions = recordDecompressions(ctx, getDataView(''));

            expect(readExifBlock(BROB_BLOCK, ctx, TAG_NAMES)).to.equal(undefined);
            expect(decompressions).to.have.lengthOf(0);
        });

        it('should decompress the box, bounded by the bytes present, and read the TIFF after its header offset when jxl is composed', async () => {
            const tiff = getTiff({ifd0: [ascii(TAG_MAKE, 'Canon')]});
            const ctx = getContext({dataView: getDataView('\x00'.repeat(16)), composed: {formats: {jxl: true}}});
            const decompressions = recordDecompressions(ctx, getDataView(getByteStringFromNumber(2, 4) + 'xx' + tiff));

            const result = await readExifBlock(BROB_BLOCK, ctx, TAG_NAMES);

            expect(decompressions).to.have.lengthOf(1);
            expect(decompressions[0].view.byteOffset).to.equal(2);
            expect(decompressions[0].view.byteLength).to.equal(14);
            expect(decompressions[0].rest).to.deep.equal([COMPRESSION_METHOD_BROTLI, undefined, 'dataview']);
            expect(result.tags.Make.value).to.deep.equal(['Canon']);
            expect(result.blocks).to.deep.equal([]);
        });

        it('should give no tags of its own for a brob block that parsed to none', async () => {
            swapTagsRead({'IPTC-NAA': {value: 'iptc view'}});
            const tagFilter = createTagFilter({excludeTags: {exif: ['IPTC-NAA']}});
            const ctx = getContext({tagFilter, composed: {formats: {jxl: true}}});
            recordDecompressions(ctx, getDataView(getByteStringFromNumber(0, 4) + '\x00'.repeat(8)));

            const result = await readExifBlock(BROB_BLOCK, ctx, TAG_NAMES);

            expect(result).to.deep.equal({tags: undefined, blocks: []});
        });

        it('should add the decompressed view\'s allowance to the value budget and read with the dictionaries', async () => {
            const reads = recordTagsReads();
            const ctx = getContext({composed: {formats: {jxl: true}}});
            const untouched = getValueBudget(ctx.dataView);
            recordDecompressions(ctx, getDataView(getByteStringFromNumber(0, 4) + '\x00'.repeat(8)));

            await readExifBlock(BROB_BLOCK, ctx, TAG_NAMES);

            expect(ctx.valueBudget.remaining).to.be.above(untouched.remaining);
            expect(ctx.valueBudget.decompressedAllowanceRemaining).to.be.below(untouched.decompressedAllowanceRemaining);
            expect(reads[0][6]).to.equal(TAG_NAMES);
        });

        function recordDecompressions(ctx, decompressedView) {
            const decompressions = [];
            ctx.decompress = (view, ...rest) => {
                decompressions.push({view, rest});
                return Promise.resolve(decompressedView);
            };
            return decompressions;
        }
    });

    describe('getExifMergeDescriptor', () => {
        it('should assign the main block and merge an embedded one', () => {
            expect(getExifMergeDescriptor({})).to.deep.equal({slot: 'exif', mode: 'assign'});
            expect(getExifMergeDescriptor({origin: 'rawProfile'})).to.deep.equal({slot: 'exif', mode: 'merge'});
        });

        it('should merge a brob block inside the brobExif slot', () => {
            expect(getExifMergeDescriptor({compression: 'brotli'})).to.deep.equal({slot: 'exif', mode: 'merge', outerSlot: 'brobExif'});
        });
    });

    function recordTagsReads() {
        const {calls, restore} = recordCalls(Tags, 'read', () => ({tags: {}, byteOrder: ByteOrder.BIG_ENDIAN}));
        restores.push(restore);
        return calls;
    }

    function swapTagsRead(tags, {makerNoteOffset = undefined, byteOrder = ByteOrder.BIG_ENDIAN} = {}) {
        const {restore} = recordCalls(Tags, 'read', () => ({tags: Object.assign({}, tags), byteOrder, makerNoteOffset}));
        restores.push(restore);
    }
});
