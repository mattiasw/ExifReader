/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from '../../test-utils.js';
import {COMPRESSION_METHOD_BROTLI} from '../../../../src/utils.js';
import XmpTags from '../../../../src/xmp-tags.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
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
            expect(ctx.decompressedApplicationNotesSize).to.equal(0);
        });
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

    function swapXmpRead() {
        const {calls, restore} = recordCalls(XmpTags, 'read', () => Object.assign({}, XMP_TAGS));
        restores.push(restore);
        return calls;
    }
});
