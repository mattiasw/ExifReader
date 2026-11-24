/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import Png, {TYPE_TEXT, TYPE_ITXT, TYPE_ZTXT} from '../../../../src/image-header-png.js';
import PngFileTags from '../../../../src/png-file-tags.js';
import PngTextTags from '../../../../src/png-text-tags.js';
import PngTags from '../../../../src/png-tags.js';
import {objectAssign} from '../../../../src/utils.js';
import {createTagFilter, filterTagsForReturn} from '../../../../src/tag-filter.js';
import {buildTagsFromMergeBlocks} from '../../../../src/loadview-pipeline.js';
import {pngHeader, pngFile, pngText, pngChunk} from '../../../../src/composable/formats/png.js';
import {decompression} from '../../../../src/decompression.js';
import {getContext, recordCalls} from '../test-context.js';

describe('composable/formats/png', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should give the PNG file type', () => {
        expect(pngHeader.fileType).to.deep.equal({value: 'png', description: 'PNG'});
    });

    it('should bring the pooled decompression', () => {
        expect(pngHeader.decompression).to.equal(decompression);
    });

    it('should detect and find through Png.isPngFile and Png.findPngOffsets at call time', () => {
        const dataView = {};
        const ranges = [];
        const detects = recordCalls(Png, 'isPngFile', 'detected');
        const finds = recordCalls(Png, 'findPngOffsets', 'blocks');
        restores.push(detects.restore, finds.restore);

        expect(pngHeader.detect(dataView)).to.equal('detected');
        expect(pngHeader.find(dataView, ranges)).to.equal('blocks');

        expect(detects.calls).to.have.lengthOf(1);
        expect(detects.calls[0][0]).to.equal(dataView);
        expect(finds.calls).to.have.lengthOf(1);
        expect(finds.calls[0]).to.have.lengthOf(2);
        expect(finds.calls[0][0]).to.equal(dataView);
        expect(finds.calls[0][1]).to.equal(ranges);
    });

    describe('isHiddenInSyncMode', () => {
        it('should hide a compressed-text chunk type block, whatever its compression says', () => {
            expect(pngHeader.isHiddenInSyncMode({kind: 'pngText', text: {chunkType: TYPE_ZTXT}})).to.equal(true);
            expect(pngHeader.isHiddenInSyncMode({kind: 'exif', compression: 'deflate', text: {chunkType: TYPE_ZTXT}})).to.equal(true);
        });

        it('should not hide the other text chunks, compressed or not', () => {
            expect(pngHeader.isHiddenInSyncMode({kind: 'pngText', text: {chunkType: TYPE_TEXT}})).to.equal(false);
            expect(pngHeader.isHiddenInSyncMode({kind: 'pngText', compression: 'deflate', text: {chunkType: TYPE_ITXT}})).to.equal(false);
        });

        it('should not hide a block that is not a text chunk', () => {
            expect(pngHeader.isHiddenInSyncMode({kind: 'icc', compression: 'deflate', chunkType: TYPE_ZTXT})).to.equal(false);
        });
    });

    describe('the file reader', () => {
        it('should consume the pngFile kind into the png group', () => {
            expect(pngFile.key).to.equal('png');
            expect(pngFile.consumes).to.deep.equal(['pngFile']);
            expect(pngFile.emits).to.deep.equal([]);
            expect(pngFile.merge({})).to.deep.equal({slot: 'pngFile', mode: 'pngFile'});
        });

        it('should read the IHDR chunk and filter its tags', () => {
            const {calls, restore} = recordCalls(PngFileTags, 'read', {ImageWidth: {value: 1}, ImageHeight: {value: 2}});
            restores.push(restore);
            const ctx = getContext({tagFilter: createTagFilter({includeTags: {png: ['ImageWidth']}})});

            const result = pngFile.read({dataOffset: 16, length: 13}, ctx);

            expect(result).to.deep.equal({tags: {ImageWidth: {value: 1}}});
            expect(calls).to.deep.equal([[ctx.dataView, 16, 13]]);
        });
    });

    describe('the text reader', () => {
        it('should consume the pngText kind into the png group and emit the raw profiles\' kinds', () => {
            expect(pngText.key).to.equal('png');
            expect(pngText.consumes).to.deep.equal(['pngText']);
            expect(pngText.emits).to.deep.equal(['exif', 'iptc']);
        });

        it('should hand the block and the context to the text tag reader', () => {
            const {calls, restore} = recordCalls(PngTextTags, 'read', 'result');
            restores.push(restore);
            const block = {text: {}};
            const ctx = getContext();

            expect(pngText.read(block, ctx)).to.equal('result');
            expect(calls).to.have.lengthOf(1);
            expect(calls[0][0]).to.equal(block);
            expect(calls[0][1]).to.equal(ctx);
        });

        it('should merge an uncompressed chunk as text and a compressed one as deferred text', () => {
            expect(pngText.merge({text: {}})).to.deep.equal({slot: 'pngText', mode: 'pngTextTags'});
            expect(pngText.merge({text: {}, compression: 'deflate'})).to.deep.equal({slot: 'deferredPngText', mode: 'pngTextTags'});
        });

        describe('the raw-profile IPTC suppression', () => {
            const RAW_IPTC_CHUNK = {kind: 'iptc', compression: 'deflate', text: {name: 'Raw profile type iptc'}};

            it('should suppress a raw profile\'s IPTC-NAA when a raw IPTC chunk will be read', () => {
                expect(isSuppressed({kind: 'iptc', carried: 'rawProfile'}, [RAW_IPTC_CHUNK], getContext())).to.equal(true);
            });

            it('should not suppress a raw profile\'s IPTC-NAA without a raw IPTC chunk', () => {
                const ctx = getContext();

                expect(isSuppressed({kind: 'iptc', carried: 'rawProfile'}, [{kind: 'exif', text: {name: 'x'}}], ctx)).to.equal(false);
                expect(ctx.hasRawIptcProfile).to.equal(false);
            });

            it('should keep the scan\'s verdict on the context', () => {
                const ctx = getContext();

                expect(isSuppressed({kind: 'iptc', carried: 'rawProfile'}, [RAW_IPTC_CHUNK], ctx)).to.equal(true);
                expect(ctx.hasRawIptcProfile).to.equal(true);
                expect(isSuppressed({kind: 'iptc', carried: 'rawProfile'}, [], ctx)).to.equal(true);
            });

            it('should leave the main block\'s and a brob\'s IPTC-NAA to the other rules', () => {
                const ctx = getContext();

                expect(isSuppressed({kind: 'iptc', carried: 'main'}, [RAW_IPTC_CHUNK], ctx)).to.equal(false);
                expect(isSuppressed({kind: 'iptc', carried: 'brob'}, [RAW_IPTC_CHUNK], ctx)).to.equal(false);
                expect(isSuppressed({kind: 'iptc'}, [RAW_IPTC_CHUNK], ctx)).to.equal(false);
                expect(ctx.hasRawIptcProfile).to.equal(undefined);
            });

            function isSuppressed(block, finderBlocks, ctx) {
                return pngText.suppressions[0].isSuppressed(block, finderBlocks, ctx);
            }
        });
    });

    describe('the merge', () => {
        const FILE_TAGS = {Width: {value: 'file'}, Shared: {value: 'file'}};
        const TEXT_TAGS = {Comment: {value: 'text'}, Shared: {value: 'text'}};
        const CHUNK_TAGS = {PixelsPerUnitX: {value: 'chunk'}, Shared: {value: 'chunk'}};
        const PNG_NOT_RETURNED = createTagFilter({includeTags: {exif: true}});

        describe('the pngFile and pngTextTags modes', () => {
            it('should gather the file, text and chunk tags into png in that order whatever the push order', () => {
                const tags = buildPngTags({blocks: getPngBlocks().reverse()});

                expect(Object.keys(tags.png)).to.deep.equal(['Width', 'Shared', 'Comment', 'PixelsPerUnitX']);
                expect(tags.png.Shared.value).to.equal('chunk');
            });

            it('should keep the file tags alone in pngFile and the text tags in pngText', () => {
                const tags = buildPngTags({blocks: getPngBlocks()});

                expect(Object.keys(tags)).to.deep.equal(['png', 'pngFile', 'pngText']);
                expect(tags.pngFile).to.deep.equal(FILE_TAGS);
                expect(tags.pngText).to.deep.equal(TEXT_TAGS);
            });

            it('should let the text tags win over the file tags, and the chunk tags over the text tags, in flat output', () => {
                const tags = buildPngTags({blocks: getPngBlocks().reverse(), expanded: false});

                expect(Object.keys(tags)).to.deep.equal(['Width', 'Shared', 'Comment', 'PixelsPerUnitX']);
                expect(tags.Shared.value).to.equal('chunk');
            });

            it('should add no pngText group for a text block without text tags', () => {
                const tags = buildPngTags({blocks: [getFileBlock(), getTextBlock({})]});

                expect(Object.keys(tags)).to.deep.equal(['png', 'pngFile']);
            });

            it('should not mutate an earlier png group when merging text tags into it', () => {
                const fileTags = structuredClone(FILE_TAGS);

                const tags = buildPngTags({blocks: [getFileBlock(fileTags), getTextBlock(TEXT_TAGS)]});

                expect(fileTags).to.deep.equal(FILE_TAGS);
                expect(tags.pngFile).to.equal(fileTags);
            });

            it('should not mutate the tags of a text block', () => {
                const textTags = {k: {value: 'first'}};

                const tags = buildPngTags({blocks: [getTextBlock(textTags), getTextBlock({k: {value: 'second'}})]});

                expect(textTags).to.deep.equal({k: {value: 'first'}});
                expect(tags.png.k.value).to.equal('second');
            });

            it('should merge the text tags of several blocks at the top level in flat output', () => {
                const tags = buildPngTags({
                    blocks: [getTextBlock({A: {value: 1}}), getTextBlock({B: {value: 2}})],
                    expanded: false,
                });

                expect(tags).to.deep.equal({A: {value: 1}, B: {value: 2}});
            });

            it('should merge the returned text tags only', () => {
                const tags = buildPngTags({blocks: [getTextBlock(TEXT_TAGS)], tagFilter: createTagFilter({includeTags: {png: ['Comment']}})});

                expect(tags.png).to.deep.equal({Comment: {value: 'text'}});
                expect(tags.pngText).to.deep.equal({Comment: {value: 'text'}});
            });

            it('should merge the returned file tags only', () => {
                const tags = buildPngTags({blocks: [getFileBlock()], tagFilter: createTagFilter({includeTags: {png: ['Width']}})});

                expect(tags.png).to.deep.equal({Width: {value: 'file'}});
                expect(tags.pngFile).to.deep.equal({Width: {value: 'file'}});
            });

            for (const expanded of [false, true]) {
                const mode = expanded ? 'expanded' : 'flat';

                it(`should write the parsed pngFile group, also when png is not returned, in ${mode} mode`, () => {
                    const parsedGroups = {};

                    const tags = buildPngTags({blocks: [getFileBlock()], expanded, parsedGroups, tagFilter: PNG_NOT_RETURNED});

                    expect(tags).to.deep.equal({});
                    expect(parsedGroups.pngFile).to.equal(FILE_TAGS);
                });

                it(`should return no text tags when png is not returned in ${mode} mode`, () => {
                    const parsedGroups = {};

                    const tags = buildPngTags({blocks: [getTextBlock(TEXT_TAGS)], expanded, parsedGroups, tagFilter: PNG_NOT_RETURNED});

                    expect(tags).to.deep.equal({});
                    expect(parsedGroups).to.deep.equal({});
                });

                it(`should let a later duplicate keyword win in ${mode} mode`, () => {
                    const tags = buildPngTags({blocks: [getTextBlock({k: {value: 'first'}}), getTextBlock({k: {value: 'second'}})], expanded});

                    expect((expanded ? tags.png : tags).k.value).to.equal('second');
                });

                it(`should add the file and text tags to the flat Composite input in ${mode} mode`, () => {
                    const tags = buildPngTags({
                        blocks: [{slot: 'composite', mode: 'composite'}, getFileBlock(), getTextBlock({Comment: {value: 'text'}})],
                        expanded,
                        tagFilterIsReadCap: true,
                        tagFilter: createTagFilter({includeTags: {composite: true}}),
                        modes: {composite: (compositeTags, block, context) => objectAssign({}, compositeTags, {input: context.compositeInput})},
                    });

                    expect(tags.input).to.deep.equal(expanded ? undefined : {Width: {value: 'file'}, Shared: {value: 'file'}, Comment: {value: 'text'}});
                });
            }
        });

        describe('prepareMergeBlocks', () => {
            const combine = pngText.prepareMergeBlocks;

            it('should put every uncompressed text block into one nested tier at the first one\'s place', () => {
                const first = getTextBlock({A: {value: 1}});
                const second = getTextBlock({B: {value: 2}});
                const fileBlock = getFileBlock();
                const chunkBlock = {slot: 'pngChunk', group: 'png', mode: 'merge', tags: CHUNK_TAGS};

                expect(combine([fileBlock, first, chunkBlock, second])).to.deep.equal([
                    fileBlock,
                    {slot: 'pngText', mode: 'nested', blocks: [first, second]},
                    chunkBlock,
                ]);
            });

            it('should flatten a nested raw-profile container into its leaves', () => {
                const exifBlock = {slot: 'exif', group: 'exif', mode: 'merge', tags: {}};
                const carriedBlock = {slot: 'carriedIptc', group: 'iptc', mode: 'merge', tags: {}};
                const textBlock = getTextBlock({});

                const combined = combine([
                    {slot: 'pngText', mode: 'nested', blocks: [exifBlock, {slot: 'exif', mode: 'nested', blocks: [carriedBlock]}]},
                    textBlock,
                ]);

                expect(combined).to.deep.equal([{slot: 'pngText', mode: 'nested', blocks: [exifBlock, carriedBlock, textBlock]}]);
            });

            it('should leave a compressed text block as its own tier', () => {
                const deferred = objectAssign({group: 'png', tags: {}}, pngText.merge({text: {}, compression: 'deflate'}));

                expect(combine([deferred])).to.deep.equal([deferred]);
            });

            it('should add no tier without uncompressed text blocks', () => {
                const fileBlock = getFileBlock();

                expect(combine([fileBlock])).to.deep.equal([fileBlock]);
                expect(combine([])).to.deep.equal([]);
            });
        });

        describe('finishTags', () => {
            const COMPRESSED_TEXT_CHUNK = {kind: 'pngText', compression: 'deflate', text: {name: 'Comment'}};
            const UNCOMPRESSED_TEXT_CHUNK = {kind: 'pngText', text: {name: 'Comment'}};

            it('should copy png into pngText when a named text chunk is read asynchronously', () => {
                const tags = finish({tags: {png: FILE_TAGS, pngText: TEXT_TAGS}, async: true, blocks: [COMPRESSED_TEXT_CHUNK]});

                expect(tags.pngText).to.deep.equal(FILE_TAGS);
                expect(tags.pngText).to.not.equal(tags.png);
            });

            it('should keep the text tags for a compressed chunk without a name, or one read synchronously', () => {
                const nameless = {kind: 'exif', compression: 'deflate', text: {}};

                expect(finish({tags: {png: FILE_TAGS, pngText: TEXT_TAGS}, async: true, blocks: [nameless]}).pngText).to.equal(TEXT_TAGS);
                expect(finish({tags: {png: FILE_TAGS, pngText: TEXT_TAGS}, async: false, blocks: [COMPRESSED_TEXT_CHUNK]}).pngText).to.equal(TEXT_TAGS);
            });

            it('should copy png into pngText when there are text chunks but no text tags', () => {
                const rawProfile = {kind: 'exif', text: {name: 'Raw profile type exif'}};

                const tags = finish({tags: {png: FILE_TAGS}, blocks: [rawProfile]});

                expect(tags.pngText).to.deep.equal(FILE_TAGS);
                expect(tags.pngText).to.not.equal(tags.png);
            });

            it('should keep an existing pngText when the text chunks are read synchronously', () => {
                const tags = finish({tags: {png: FILE_TAGS, pngText: TEXT_TAGS}, blocks: [UNCOMPRESSED_TEXT_CHUNK]});

                expect(tags.pngText).to.equal(TEXT_TAGS);
            });

            it('should add no pngText without text chunks', () => {
                expect(finish({tags: {png: FILE_TAGS}, blocks: [{kind: 'pngFile'}]})).to.not.have.property('pngText');
                expect(finish({tags: {png: FILE_TAGS}, async: true, blocks: []})).to.not.have.property('pngText');
            });

            for (const [description, options] of [
                ['in flat output', {expanded: false, tags: {Width: {value: 'file'}}}],
                ['without a png group', {tags: {exif: {}}}],
                ['when png is not returned', {tagFilter: PNG_NOT_RETURNED}],
            ]) {
                for (const blocks of [[COMPRESSED_TEXT_CHUNK], [UNCOMPRESSED_TEXT_CHUNK]]) {
                    it(`should not copy png into pngText ${description} for ${blocks[0].compression ? 'an asynchronous' : 'a'} text chunk`, () => {
                        const tags = finish(objectAssign({tags: {png: FILE_TAGS}, async: true, blocks}, options));

                        expect(tags).to.not.have.property('pngText');
                    });
                }
            }

            function finish({tags, expanded = true, async = false, tagFilter = createTagFilter(), blocks}) {
                return pngText.finishTags(tags, {expanded, async, tagFilter, blocks});
            }
        });

        function getPngBlocks() {
            return [
                getFileBlock(),
                getTextBlock(TEXT_TAGS),
                {slot: 'pngChunk', group: 'png', mode: 'merge', tags: CHUNK_TAGS},
            ];
        }

        function getFileBlock(fileTags = FILE_TAGS) {
            return objectAssign({group: 'png', tags: fileTags}, pngFile.merge({}));
        }

        function getTextBlock(textTags) {
            return objectAssign({group: 'png', tags: textTags}, pngText.merge({text: {}}));
        }

        function buildPngTags({
            blocks,
            expanded = true,
            parsedGroups = {},
            tagFilter = createTagFilter(),
            tagFilterIsReadCap = false,
            modes = {},
        }) {
            return buildTagsFromMergeBlocks({
                mergeBlocks: blocks,
                parsedGroups,
                expanded,
                tagFilter,
                tagFilterIsReadCap,
                dataView: {},
                fileType: undefined,
                modes: objectAssign({}, pngFile.mergeModes, pngText.mergeModes, modes),
                deps: {objectAssign, filterTagsForReturn},
            });
        }
    });

    describe('the chunk reader', () => {
        it('should merge its tags into the pngChunk slot', () => {
            expect(pngChunk.merge({})).to.deep.equal({slot: 'pngChunk', mode: 'merge'});
        });

        it('should read the chunk at its offset and filter its tags', () => {
            const {calls, restore} = recordCalls(PngTags, 'read', {PixelsPerUnitX: {value: 1}, PixelUnits: {value: 1}});
            restores.push(restore);
            const ctx = getContext({tagFilter: createTagFilter({includeTags: {png: ['PixelsPerUnitX']}})});

            const result = pngChunk.read({dataOffset: 33}, ctx);

            expect(result).to.deep.equal({tags: {PixelsPerUnitX: {value: 1}}});
            expect(calls).to.deep.equal([[ctx.dataView, [33]]]);
        });
    });
});
