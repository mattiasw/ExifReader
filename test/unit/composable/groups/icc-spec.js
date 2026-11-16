/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {deflateSync} from 'node:zlib';
import {getDataView, swapProperties} from '../../test-utils.js';
import IccTags from '../../../../src/icc-tags.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {withDecompressBudget} from '../../../../src/utils.js';
import {icc} from '../../../../src/composable/groups/icc.js';
import {getContext, recordCalls} from '../test-context.js';

describe('composable/groups/icc', () => {
    const restores = [];
    const ICC_TAGS = {ProfileVersion: {value: 1}, ColorSpaceData: {value: 'RGB'}};

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should read the chunks from the file with the async flag and decompression config and filter the tags', () => {
        const reads = swapIccRead(() => Object.assign({}, ICC_TAGS));
        const chunks = [{offset: 0, length: 4}];
        const decompressConfig = {maxDecompressedSize: 1};
        const ctx = getContext({options: {async: false}, tagFilter: createTagFilter({includeTags: {icc: ['ProfileVersion']}}), decompressConfig});

        const result = icc.read({kind: 'icc', chunks}, ctx);

        expect(result).to.deep.equal({tags: {ProfileVersion: {value: 1}}});
        expect(reads).to.deep.equal([[ctx.dataView, chunks, false, decompressConfig]]);
    });

    it('should read the block\'s own view when it has one', () => {
        const reads = swapIccRead(() => ({}));
        const view = getDataView('icc');

        icc.read({kind: 'icc', dataView: view, chunks: [{}]}, getContext());

        expect(reads[0][0]).to.equal(view);
    });

    it('should filter the tags of a compressed profile once they resolve', async () => {
        const reads = swapIccRead(() => Promise.resolve(Object.assign({}, ICC_TAGS)));
        const ctx = getContext({options: {async: true}, tagFilter: createTagFilter({excludeTags: {icc: ['ColorSpaceData']}})});

        expect(await icc.read({kind: 'icc', chunks: [{}]}, ctx)).to.deep.equal({tags: {ProfileVersion: {value: 1}}});
        expect(reads[0][2]).to.equal(true);
    });

    it('should read nothing from a block without chunks', () => {
        const reads = swapIccRead(() => ({}));

        expect(icc.read({kind: 'icc', chunks: []}, getContext())).to.equal(undefined);
        expect(reads).to.have.lengthOf(0);
    });

    it('should merge as an embeddable group', () => {
        expect(icc.merge({})).to.deep.equal({slot: 'icc', mode: 'assign'});
        expect(icc.merge({origin: 'rawProfile'})).to.deep.equal({slot: 'icc', mode: 'merge'});
        expect(icc.merge({carried: 'main'})).to.deep.equal({slot: 'carriedIcc', mode: 'assign'});
        expect(icc.merge({carried: 'brob'})).to.deep.equal({slot: 'carriedIcc', mode: 'merge'});
    });

    describe('building its block from the Exif tags', () => {
        it('should build the block from ICC_Profile as one chunk of the whole profile', () => {
            const profile = [3, 4];

            expect(icc.fromExif({ICC_Profile: {value: profile}}, {carried: 'main'})).to.deep.equal({
                kind: 'icc',
                dataView: profile,
                chunks: [{offset: 0, length: 2, chunkNumber: 1, chunksTotal: 1}],
                carried: 'main',
            });
            expect(icc.fromExif({ICC_Profile: {value: profile}}, {carried: 'rawProfile'}).carried).to.equal('rawProfile');
        });

        it('should build no block without ICC_Profile', () => {
            expect(icc.fromExif({}, {carried: 'main'})).to.not.be.ok;
        });
    });

    describe('a compressed profile', () => {
        const COMPRESSED_PROFILE = deflateSync(Buffer.alloc(128));
        const COMPRESSED_BLOCK = {
            kind: 'icc',
            compression: 'deflate',
            chunks: [{offset: 0, length: COMPRESSED_PROFILE.length, chunkNumber: 1, chunksTotal: 1, compressionMethod: 0}],
        };
        let constructed;

        beforeEach(() => {
            constructed = 0;
            const OriginalDecompressionStream = globalThis.DecompressionStream;
            restores.push(swapProperties(globalThis, {
                DecompressionStream: class extends OriginalDecompressionStream {
                    constructor(format) {
                        super(format);
                        constructed++;
                    }
                }
            }));
        });

        it('should read nothing without the load\'s decompression config', () => {
            const ctx = getCompressedProfileContext({decompressConfig: undefined, composed: {}});

            expect(icc.read(COMPRESSED_BLOCK, ctx)).to.equal(undefined);
            expect(constructed).to.equal(0);
        });

        it('should decompress it with the load\'s config', async () => {
            const ctx = getCompressedProfileContext({decompressConfig: withDecompressBudget({}), composed: {formats: {png: true}}});

            const result = await icc.read(COMPRESSED_BLOCK, ctx);

            expect(result).to.deep.equal({tags: {}});
            expect(constructed).to.equal(1);
        });

        function getCompressedProfileContext({decompressConfig, composed}) {
            const dataView = new DataView(COMPRESSED_PROFILE.buffer.slice(COMPRESSED_PROFILE.byteOffset, COMPRESSED_PROFILE.byteOffset + COMPRESSED_PROFILE.length));
            return getContext({dataView, options: {async: true}, decompressConfig, composed});
        }
    });

    describe('the carried ICC suppression', () => {
        it('should suppress a carried profile when a finder ICC block has chunks', () => {
            expect(isSuppressed({carried: 'main'}, [{kind: 'icc', chunks: [{}]}])).to.equal(true);
        });

        it('should not suppress it for an empty block or no ICC block', () => {
            expect(isSuppressed({carried: 'main'}, [{kind: 'icc', chunks: []}])).to.equal(false);
            expect(isSuppressed({carried: 'main'}, [{kind: 'xmp', chunks: [{}]}])).to.equal(false);
        });

        it('should not suppress a block that is not carried', () => {
            expect(isSuppressed({}, [{kind: 'icc', chunks: [{}]}])).to.equal(false);
        });

        function isSuppressed(block, finderBlocks) {
            return icc.suppressions[0].isSuppressed(block, finderBlocks, getContext());
        }
    });

    function swapIccRead(result) {
        const {calls, restore} = recordCalls(IccTags, 'read', result);
        restores.push(restore);
        return calls;
    }
});
