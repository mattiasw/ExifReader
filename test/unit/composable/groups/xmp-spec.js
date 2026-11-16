/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from '../../test-utils.js';
import {COMPRESSION_METHOD_BROTLI, objectAssign} from '../../../../src/utils.js';
import XmpTags from '../../../../src/xmp-tags.js';
import {createTagFilter, filterTagsForReturn} from '../../../../src/tag-filter.js';
import {buildTagsFromMergeBlocks} from '../../../../src/loadview-pipeline.js';
import {xmp} from '../../../../src/composable/groups/xmp.js';
import {getContext, recordCalls} from '../test-context.js';

describe('composable/groups/xmp', () => {
    const restores = [];
    const XMP_TAGS = {Title: {value: 't'}, Rating: {value: 1}};
    const getDomParser = () => 'DOM parser';

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    describe('reading a finder block', () => {
        it('should read the chunks from the file with the DOM parser options and filter the tags', () => {
            const reads = swapXmpRead();
            const chunks = [{dataOffset: 2, length: 10}];
            const tagFilter = createTagFilter({includeTags: {xmp: ['Title']}});
            const ctx = getContext({options: {domParser: 'parser'}, tagFilter, getDomParser});

            const result = xmp.read({kind: 'xmp', chunks}, ctx);

            expect(result).to.deep.equal({tags: {Title: {value: 't'}}});
            expect(reads).to.deep.equal([[ctx.dataView, chunks, 'parser', getDomParser]]);
        });

        it('should read the block\'s own view when it has one', () => {
            const reads = swapXmpRead();
            const view = getDataView('<x/>');

            xmp.read({kind: 'xmp', dataView: view, chunks: [{dataOffset: 0, length: 4}]}, getContext());

            expect(reads[0][0]).to.equal(view);
        });

        it('should read nothing from a block without chunks', () => {
            const reads = swapXmpRead();

            expect(xmp.read({kind: 'xmp', chunks: []}, getContext())).to.equal(undefined);
            expect(reads).to.have.lengthOf(0);
        });
    });

    describe('reading a carried block', () => {
        it('should read the packet the Exif block carries', () => {
            const reads = swapXmpRead();
            const ctx = getContext({options: {domParser: 'parser'}, getDomParser});

            const result = xmp.read({kind: 'xmp', carried: 'main', byteLength: 4, getDataView: () => 'packet'}, ctx);

            expect(result).to.deep.equal({tags: XMP_TAGS});
            expect(reads).to.deep.equal([['packet', undefined, 'parser', getDomParser]]);
        });

        it('should read a decompressed carried packet only within the ApplicationNotes bound', () => {
            const reads = swapXmpRead();
            const ctx = getContext({dataView: getDataView('\x00'.repeat(10))});
            const bound = 4 * 10 + 64 * 1024;

            expect(xmp.read({kind: 'xmp', carried: 'rawProfile', decompressed: true, byteLength: bound + 1, getDataView: () => 'packet'}, ctx)).to.equal(undefined);
            expect(reads).to.have.lengthOf(0);
            expect(xmp.read({kind: 'xmp', carried: 'rawProfile', decompressed: true, byteLength: bound, getDataView: () => 'packet'}, ctx)).to.deep.equal({tags: XMP_TAGS});
            expect(ctx.decompressedApplicationNotesSize).to.equal(bound);
        });

        it('should not draw on the bound for a carried packet that was not decompressed', () => {
            swapXmpRead();
            const ctx = getContext();

            expect(xmp.read({kind: 'xmp', carried: 'main', byteLength: 1000000, getDataView: () => 'packet'}, ctx)).to.deep.equal({tags: XMP_TAGS});
            expect(ctx.decompressedApplicationNotesSize || 0).to.equal(0);
        });

        it('should bound the decompressed carried packets by 4 times the file size plus 64 KiB together', () => {
            const reads = swapXmpRead();
            const ctx = getContext({dataView: getDataView('\x00'.repeat(1000))});
            const bound = 4 * 1000 + 64 * 1024;

            expect(xmp.read(getDecompressedBlock(bound - 10), ctx)).to.deep.equal({tags: XMP_TAGS});
            expect(xmp.read(getDecompressedBlock(11), ctx)).to.equal(undefined);
            expect(reads).to.have.lengthOf(1);
            expect(xmp.read(getDecompressedBlock(10), ctx)).to.deep.equal({tags: XMP_TAGS});
            expect(ctx.decompressedApplicationNotesSize).to.equal(bound);
        });

        it('should read an empty decompressed carried packet without drawing on the bound', () => {
            swapXmpRead();
            const ctx = getContext();

            expect(xmp.read(getDecompressedBlock(0), ctx)).to.deep.equal({tags: XMP_TAGS});
            expect(ctx.decompressedApplicationNotesSize).to.equal(0);
        });

        for (const byteLength of [NaN, undefined, null, '5', -1]) {
            it(`should refuse a decompressed carried packet of byte length ${describeValue(byteLength)} and keep the bound`, () => {
                const reads = swapXmpRead();
                const ctx = getContext();

                expect(xmp.read(getDecompressedBlock(byteLength), ctx)).to.equal(undefined);
                expect(reads).to.have.lengthOf(0);
                expect(ctx.decompressedApplicationNotesSize).to.equal(undefined);
                expect(xmp.read(getDecompressedBlock(10), ctx)).to.deep.equal({tags: XMP_TAGS});
                expect(ctx.decompressedApplicationNotesSize).to.equal(10);
            });
        }

        it('should refuse every decompressed carried packet when the file size is NaN', () => {
            const reads = swapXmpRead();
            const ctx = getContext({dataView: {byteLength: NaN}});

            expect(xmp.read(getDecompressedBlock(1), ctx)).to.equal(undefined);
            expect(reads).to.have.lengthOf(0);
        });

        it('should give each load the whole bound', () => {
            swapXmpRead();
            const bound = 4 * 16 + 64 * 1024;
            const first = getContext();
            const second = getContext();

            expect(xmp.read(getDecompressedBlock(bound), first)).to.deep.equal({tags: XMP_TAGS});
            expect(xmp.read(getDecompressedBlock(bound), second)).to.deep.equal({tags: XMP_TAGS});
        });

        function getDecompressedBlock(byteLength) {
            return {kind: 'xmp', carried: 'rawProfile', decompressed: true, byteLength, getDataView: () => 'packet'};
        }
    });

    describe('reading a brob block', () => {
        const BROB_BLOCK = {kind: 'xmp', compression: 'brotli', dataOffset: 2, length: 100};

        it('should read nothing when the jxl format is not composed', () => {
            const ctx = getContext();

            expect(ctx.decompress).to.equal(undefined);
            expect(xmp.read(BROB_BLOCK, ctx)).to.equal(undefined);
        });

        it('should decompress the box, bounded by the bytes present, and read the packet when jxl is composed', async () => {
            const reads = swapXmpRead();
            const ctx = getContext({options: {domParser: 'parser'}, composed: {formats: {jxl: true}}, getDomParser});
            const packet = getDataView('<x/>');
            const decompressions = recordDecompressions(ctx, packet);

            const result = await xmp.read(BROB_BLOCK, ctx);

            expect(result).to.deep.equal({tags: XMP_TAGS});
            expect(decompressions).to.have.lengthOf(1);
            expect(decompressions[0].view.byteOffset).to.equal(2);
            expect(decompressions[0].view.byteLength).to.equal(14);
            expect(decompressions[0].rest).to.deep.equal([COMPRESSION_METHOD_BROTLI, undefined, 'dataview']);
            expect(reads).to.deep.equal([[packet, [{dataOffset: 0, length: 4}], 'parser', getDomParser]]);
        });

        it('should give empty tags for a decompressed packet over the brob XMP bound', async () => {
            const reads = swapXmpRead();
            const ctx = getContext({dataView: getDataView('\x00'.repeat(16)), composed: {formats: {jxl: true}}});
            recordDecompressions(ctx, {byteLength: 4 * 16 + 64 * 1024 + 1});

            expect(await xmp.read(BROB_BLOCK, ctx)).to.deep.equal({tags: {}});
            expect(reads).to.have.lengthOf(0);
        });

        it('should read a decompressed packet of exactly the brob XMP bound', async () => {
            const reads = swapXmpRead();
            const ctx = getContext({dataView: getDataView('\x00'.repeat(16)), composed: {formats: {jxl: true}}});
            recordDecompressions(ctx, {byteLength: 4 * 16 + 64 * 1024});

            expect(await xmp.read(BROB_BLOCK, ctx)).to.deep.equal({tags: XMP_TAGS});
            expect(reads).to.have.lengthOf(1);
        });

        for (const byteLength of [NaN, undefined]) {
            it(`should give empty tags for a decompressed packet of byte length ${describeValue(byteLength)}`, async () => {
                const reads = swapXmpRead();
                const ctx = getContext({composed: {formats: {jxl: true}}});
                recordDecompressions(ctx, {byteLength});

                expect(await xmp.read(BROB_BLOCK, ctx)).to.deep.equal({tags: {}});
                expect(reads).to.have.lengthOf(0);
            });
        }

        it('should give empty tags for every decompressed packet when the file size is NaN', async () => {
            const reads = swapXmpRead();
            const ctx = getContext({dataView: {byteLength: NaN, buffer: new ArrayBuffer(16), byteOffset: 0}, composed: {formats: {jxl: true}}});
            recordDecompressions(ctx, {byteLength: 1});

            expect(await xmp.read(BROB_BLOCK, ctx)).to.deep.equal({tags: {}});
            expect(reads).to.have.lengthOf(0);
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

    it('should merge a brob block as brob XMP and the others as an embeddable group', () => {
        expect(xmp.merge({compression: 'brotli'})).to.deep.equal({slot: 'brobXmp', mode: 'brobXmp'});
        expect(xmp.merge({})).to.deep.equal({slot: 'xmp', mode: 'assign'});
        expect(xmp.merge({carried: 'main'})).to.deep.equal({slot: 'carriedXmp', mode: 'assign'});
        expect(xmp.merge({carried: 'rawProfile'})).to.deep.equal({slot: 'carriedXmp', mode: 'merge'});
    });

    describe('building its block from the Exif tags', () => {
        it('should build the block from number-array ApplicationNotes, viewed as their byte string', () => {
            const block = xmp.fromExif({ApplicationNotes: {value: [60, 120]}}, {carried: 'main', decompressed: false});

            expect(block).to.include({kind: 'xmp', carried: 'main', decompressed: false, byteLength: 2});
            expect(block.getDataView()).to.equal('<x');
        });

        it('should pass on how the Exif block was carried and whether it was decompressed', () => {
            expect(xmp.fromExif({ApplicationNotes: {value: [60]}}, {carried: 'brob', decompressed: true})).to.include({carried: 'brob', decompressed: true});
        });

        it('should build no block for ApplicationNotes that are not a number array, or without them', () => {
            expect(xmp.fromExif({ApplicationNotes: {value: ['<', 'x']}}, {carried: 'main', decompressed: false})).to.not.be.ok;
            expect(xmp.fromExif({ApplicationNotes: {value: '<x'}}, {carried: 'main', decompressed: false})).to.not.be.ok;
            expect(xmp.fromExif({}, {carried: 'main', decompressed: false})).to.not.be.ok;
        });
    });

    describe('the carried XMP suppression', () => {
        it('should suppress a carried packet when a finder XMP block has chunks', () => {
            expect(isSuppressed({carried: 'main'}, [{kind: 'xmp', chunks: [{}]}])).to.equal(true);
        });

        it('should not suppress it for a brob box, an empty block or no XMP block', () => {
            expect(isSuppressed({carried: 'main'}, [{kind: 'xmp', compression: 'brotli'}])).to.equal(false);
            expect(isSuppressed({carried: 'main'}, [{kind: 'xmp', chunks: []}])).to.equal(false);
            expect(isSuppressed({carried: 'main'}, [{kind: 'icc', chunks: [{}]}])).to.equal(false);
        });

        it('should not suppress a block that is not carried', () => {
            expect(isSuppressed({}, [{kind: 'xmp', chunks: [{}]}])).to.equal(false);
        });

        function isSuppressed(block, finderBlocks) {
            return xmp.suppressions[0].isSuppressed(block, finderBlocks, getContext());
        }
    });

    describe('the brobXmp mode', () => {
        const EARLIER_XMP = {Title: {value: 'earlier'}, Keep: {value: 'earlier'}, _raw: '<earlier/>'};

        it('should replace a non-empty earlier xmp group in expanded output', () => {
            const tags = buildBrobXmpTags({brobTags: {Title: {value: 'brob'}, _raw: '<brob/>'}, expanded: true});

            expect(tags.xmp).to.deep.equal({Title: {value: 'brob'}, _raw: '<brob/>'});
        });

        it('should merge into the earlier XMP tags key by key, without _raw, in flat output', () => {
            const tags = buildBrobXmpTags({brobTags: {Title: {value: 'brob'}, _raw: '<brob/>'}, expanded: false});

            expect(tags).to.deep.equal({Title: {value: 'brob'}, Keep: {value: 'earlier'}});
        });

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            for (const [description, brobTags] of [['an empty', {}], ['a failed', undefined]]) {
                it(`should leave the earlier xmp group and the parsed xmp group alone for ${description} brob XMP in ${mode} mode`, () => {
                    const parsedGroups = {xmp: EARLIER_XMP};

                    const tags = buildBrobXmpTags({brobTags, expanded, parsedGroups});

                    expect(parsedGroups.xmp).to.equal(EARLIER_XMP);
                    if (expanded) {
                        expect(tags.xmp).to.deep.equal(EARLIER_XMP);
                    } else {
                        expect(tags).to.deep.equal({Title: {value: 'earlier'}, Keep: {value: 'earlier'}});
                    }
                });
            }

            it(`should write the parsed xmp group even when the xmp group is not returned in ${mode} mode`, () => {
                const parsedGroups = {xmp: EARLIER_XMP};
                const brobTags = {Title: {value: 'brob'}};

                const tags = buildTags({
                    blocks: [getBrobXmpBlock(brobTags)],
                    expanded,
                    parsedGroups,
                    tagFilter: createTagFilter({includeTags: {exif: true}}),
                });

                expect(tags).to.deep.equal({});
                expect(parsedGroups.xmp).to.equal(brobTags);
            });
        }

        function buildBrobXmpTags({brobTags, expanded, parsedGroups = {}}) {
            return buildTags({
                blocks: [getBrobXmpBlock(brobTags), {slot: 'xmp', group: 'xmp', mode: 'assign', tags: EARLIER_XMP}],
                expanded,
                parsedGroups,
            });
        }

        function getBrobXmpBlock(tags) {
            return objectAssign({group: 'xmp', tags}, xmp.merge({compression: 'brotli'}));
        }

        function buildTags({blocks, expanded, parsedGroups, tagFilter = createTagFilter()}) {
            return buildTagsFromMergeBlocks({
                mergeBlocks: blocks,
                parsedGroups,
                expanded,
                tagFilter,
                dataView: {},
                fileType: undefined,
                modes: xmp.mergeModes,
                deps: {objectAssign, filterTagsForReturn},
            });
        }
    });

    function swapXmpRead() {
        const {calls, restore} = recordCalls(XmpTags, 'read', () => Object.assign({}, XMP_TAGS));
        restores.push(restore);
        return calls;
    }

    function describeValue(value) {
        return typeof value === 'string' ? `the string '${value}'` : String(value);
    }
});
