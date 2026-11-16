/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import Png, {TYPE_TEXT, TYPE_ITXT, TYPE_ZTXT} from '../../../../src/image-header-png.js';
import PngFileTags from '../../../../src/png-file-tags.js';
import PngTextTags from '../../../../src/png-text-tags.js';
import PngTags from '../../../../src/png-tags.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {png, pngHeader, pngFile, pngText, pngChunk} from '../../../../src/composable/formats/png.js';
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

    it('should bring its header and the file, text and chunk readers', () => {
        expect(png.header).to.equal(pngHeader);
        expect(png.readers).to.have.lengthOf(3);
        expect(png.readers[0]).to.equal(pngFile);
        expect(png.readers[1]).to.equal(pngText);
        expect(png.readers[2]).to.equal(pngChunk);
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

            const result = pngFile.read({dataOffset: 16}, ctx);

            expect(result).to.deep.equal({tags: {ImageWidth: {value: 1}}});
            expect(calls).to.deep.equal([[ctx.dataView, 16]]);
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
