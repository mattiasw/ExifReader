/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getByteStringFromNumber} from '../../test-utils.js';
import {COMPRESSION_METHOD_BROTLI} from '../../../../src/utils.js';
import {getValueBudget} from '../../../../src/tags-helpers.js';
import ByteOrder from '../../../../src/byte-order.js';
import Tags from '../../../../src/tags.js';
import TagNames0thIfd from '../../../../src/tag-names-0th-ifd.js';
import TagNamesExifIfd from '../../../../src/tag-names-exif-ifd.js';
import TagNamesGpsIfd from '../../../../src/tag-names-gps-ifd.js';
import TagNamesInteroperabilityIfd from '../../../../src/tag-names-interoperability-ifd.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {exif} from '../../../../src/composable/groups/exif.js';
import {getContext, recordCalls} from '../test-context.js';
import {TAG_MAKE, ascii, getTiff} from '../../loadview-inventory-images.js';

describe('composable/groups/exif', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should consume the exif kind and emit the kinds an Exif block carries', () => {
        expect(exif.key).to.equal('exif');
        expect(exif.consumes).to.deep.equal(['exif']);
        expect(exif.emits).to.deep.equal(['iptc', 'xmp', 'photoshop', 'icc', 'makerNote', 'thumbnail']);
    });

    describe('reading the main block', () => {
        it('should read a TIFF block from the file and filter its tags', () => {
            const tiff = getTiff({ifd0: [ascii(TAG_MAKE, 'Canon'), ascii(0x0110, 'Model')]});
            const ctx = getContext({dataView: getDataView('xx' + tiff), tagFilter: createTagFilter({includeTags: {exif: ['Make']}})});

            const result = exif.read({kind: 'exif', tiffHeaderOffset: 2}, ctx);

            expect(Object.keys(result.tags)).to.deep.equal(['Make']);
            expect(result.tags.Make.value).to.deep.equal(['Canon']);
            expect(result.blocks).to.deep.equal([]);
        });

        it('should create the value budget from the block\'s view', () => {
            const tiff = getTiff({ifd0: [ascii(TAG_MAKE, 'Canon')]});
            const view = getDataView(tiff);
            const ctx = getContext({dataView: getDataView('\x00'.repeat(4096))});

            exif.read({kind: 'exif', tiffHeaderOffset: 0, dataView: view}, ctx);

            // Reading Exif draws no IPTC datasets, so this count still shows which view sized the budget.
            expect(ctx.valueBudget.iptcDatasetsRemaining).to.equal(getValueBudget(view).iptcDatasetsRemaining);
            expect(getValueBudget(ctx.dataView).iptcDatasetsRemaining).to.not.equal(getValueBudget(view).iptcDatasetsRemaining);
            expect(ctx.getValueBudget()).to.equal(ctx.valueBudget);
        });

        it('should read nothing from a block without a TIFF header offset', () => {
            const reads = recordTagsReads();

            expect(exif.read({kind: 'exif'}, getContext())).to.equal(undefined);
            expect(reads).to.have.lengthOf(0);
        });

        it('should read a malformed main TIFF header as no tags', () => {
            const ctx = getContext({dataView: getDataView('\x00'.repeat(8))});

            expect(exif.read({kind: 'exif', tiffHeaderOffset: 0}, ctx)).to.deep.equal({tags: {}, blocks: []});
        });

        it('should let a malformed embedded TIFF header throw, which drops the block', () => {
            const ctx = getContext({dataView: getDataView('\x00'.repeat(8))});

            expect(() => exif.read({kind: 'exif', tiffHeaderOffset: 0, origin: 'rawProfile'}, ctx)).to.throw();
        });

        it('should take the 0th and Exif dictionaries as one merged object, built once', () => {
            const reads = recordTagsReads();

            exif.read({kind: 'exif', tiffHeaderOffset: 0}, getContext());
            exif.read({kind: 'exif', tiffHeaderOffset: 0}, getContext());

            const tagNames = reads[0][6];
            expect(tagNames['0th']).to.equal(tagNames['exif']);
            expect(tagNames['0th']).to.not.equal(TagNames0thIfd);
            expect(tagNames['0th'][0x010f]).to.equal(TagNames0thIfd[0x010f]);
            expect(tagNames['0th'][0x829a]).to.equal(TagNamesExifIfd[0x829a]);
            expect(reads[1][6]['0th']).to.equal(tagNames['0th']);
        });

        it('should pass the thumbnail IFD dictionary and read the thumbnail IFD when the thumbnail group is composed', () => {
            const reads = recordTagsReads();

            exif.read({kind: 'exif', tiffHeaderOffset: 0}, getContext({composed: {groups: {thumbnail: true}}}));

            const tagNames = reads[0][6];
            expect(Object.keys(tagNames).sort()).to.deep.equal(['0th', '1st', 'exif', 'gps', 'interoperability']);
            expect(tagNames['1st']).to.equal(TagNames0thIfd);
            expect(tagNames['gps']).to.equal(TagNamesGpsIfd);
            expect(tagNames['interoperability']).to.equal(TagNamesInteroperabilityIfd);
            expect(reads[0][7]).to.equal(true);
        });

        it('should leave out the thumbnail IFD dictionary and not read the thumbnail IFD without the thumbnail group', () => {
            const reads = recordTagsReads();

            exif.read({kind: 'exif', tiffHeaderOffset: 0}, getContext());

            expect(Object.keys(reads[0][6]).sort()).to.deep.equal(['0th', 'exif', 'gps', 'interoperability']);
            expect(reads[0][7]).to.equal(false);
        });

        it('should not read the thumbnail IFD when the filter leaves the thumbnail group out', () => {
            const reads = recordTagsReads();
            const tagFilter = createTagFilter({excludeTags: {thumbnail: true}});

            exif.read({kind: 'exif', tiffHeaderOffset: 0}, getContext({tagFilter, composed: {groups: {thumbnail: true}}}));

            expect(reads[0][7]).to.equal(false);
        });

        it('should pass the options and the filter to the tag reader', () => {
            const reads = recordTagsReads();
            const tagFilter = createTagFilter();
            const view = getDataView('\x00'.repeat(16));
            const ctx = getContext({options: {includeUnknown: 'unknown', computed: 'computed'}, tagFilter});

            exif.read({kind: 'exif', tiffHeaderOffset: 6, dataView: view}, ctx);

            expect(reads[0].slice(0, 6)).to.deep.equal([view, 6, 'unknown', 'computed', tagFilter, ctx.valueBudget]);
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

            const {tags, blocks} = exif.read({kind: 'exif', tiffHeaderOffset: 6, dataView: view}, getContext());

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

            const {blocks} = exif.read({kind: 'exif', tiffHeaderOffset: 0, origin: 'rawProfile', decompressed: true}, getContext());

            expect(blocks[0].carried).to.equal('rawProfile');
            expect(blocks[1]).to.include({kind: 'thumbnail', decompressed: true, rank: 'embedded'});
        });

        it('should emit no XMP block for ApplicationNotes that are not a number array', () => {
            swapTagsRead({ApplicationNotes: {value: ['<', 'x']}});

            expect(exif.read({kind: 'exif', tiffHeaderOffset: 0}, getContext()).blocks).to.deep.equal([]);
        });

        it('should emit no Photoshop block without both tags or with non-array settings', () => {
            for (const tags of [
                {ImageSourceData: {value: [1]}},
                {PhotoshopSettings: {value: [2]}},
                {ImageSourceData: {value: [1]}, PhotoshopSettings: {value: 'settings'}},
            ]) {
                swapTagsRead(tags);

                expect(exif.read({kind: 'exif', tiffHeaderOffset: 0}, getContext()).blocks, JSON.stringify(tags)).to.deep.equal([]);
            }
        });

        it('should emit no maker note block without the maker note offset, and one without a Make', () => {
            swapTagsRead({MakerNote: {value: [1]}});
            expect(exif.read({kind: 'exif', tiffHeaderOffset: 0}, getContext()).blocks).to.deep.equal([]);

            swapTagsRead({MakerNote: {value: [1]}}, {makerNoteOffset: 0});
            const {blocks} = exif.read({kind: 'exif', tiffHeaderOffset: 0}, getContext());
            expect(blocks).to.have.lengthOf(1);
            expect(blocks[0].make).to.equal(undefined);
        });
    });

    describe('reading a brob block', () => {
        const BROB_BLOCK = {kind: 'exif', compression: 'brotli', dataOffset: 2, length: 100};

        it('should read nothing when the jxl format is not composed', () => {
            const ctx = getContext({dataView: getDataView('\x00'.repeat(16))});
            const decompressions = recordDecompressions(ctx, getDataView(''));

            expect(exif.read(BROB_BLOCK, ctx)).to.equal(undefined);
            expect(decompressions).to.have.lengthOf(0);
        });

        it('should decompress the box, bounded by the bytes present, and read the TIFF after its header offset when jxl is composed', async () => {
            const tiff = getTiff({ifd0: [ascii(TAG_MAKE, 'Canon')]});
            const ctx = getContext({dataView: getDataView('\x00'.repeat(16)), composed: {formats: {jxl: true}}});
            const decompressions = recordDecompressions(ctx, getDataView(getByteStringFromNumber(2, 4) + 'xx' + tiff));

            const result = await exif.read(BROB_BLOCK, ctx);

            expect(decompressions).to.have.lengthOf(1);
            expect(decompressions[0].view.byteOffset).to.equal(2);
            expect(decompressions[0].view.byteLength).to.equal(14);
            expect(decompressions[0].rest).to.deep.equal([COMPRESSION_METHOD_BROTLI, undefined, 'dataview']);
            expect(result.tags.Make.value).to.deep.equal(['Canon']);
            expect(result.blocks).to.deep.equal([]);
        });

        it('should give no tags of its own for a brob block that parsed to none', async () => {
            swapTagsRead({'IPTC-NAA': {value: 'iptc view'}});
            const ctx = getContext({composed: {formats: {jxl: true}}});
            recordDecompressions(ctx, getDataView(getByteStringFromNumber(0, 4) + '\x00'.repeat(8)));
            const tagFilter = createTagFilter({excludeTags: {exif: ['IPTC-NAA']}});
            ctx.tagFilter = tagFilter;

            const result = await exif.read(BROB_BLOCK, ctx);

            expect(result).to.deep.equal({tags: undefined, blocks: []});
        });

        it('should add the decompressed view\'s allowance to the value budget', async () => {
            recordTagsReads();
            const ctx = getContext({composed: {formats: {jxl: true}}});
            const untouched = getValueBudget(ctx.dataView);
            recordDecompressions(ctx, getDataView(getByteStringFromNumber(0, 4) + '\x00'.repeat(8)));

            await exif.read(BROB_BLOCK, ctx);

            expect(ctx.valueBudget.remaining).to.be.above(untouched.remaining);
            expect(ctx.valueBudget.decompressedAllowanceRemaining).to.be.below(untouched.decompressedAllowanceRemaining);
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

    describe('merge', () => {
        it('should assign the main block and merge an embedded one', () => {
            expect(exif.merge({})).to.deep.equal({slot: 'exif', mode: 'assign'});
            expect(exif.merge({origin: 'rawProfile'})).to.deep.equal({slot: 'exif', mode: 'merge'});
        });

        it('should merge a brob block inside the brobExif slot', () => {
            expect(exif.merge({compression: 'brotli'})).to.deep.equal({slot: 'exif', mode: 'merge', outerSlot: 'brobExif'});
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
