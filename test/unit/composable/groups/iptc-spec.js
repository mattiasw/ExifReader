/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from '../../test-utils.js';
import IptcTags from '../../../../src/iptc-tags.js';
import {getValueBudget} from '../../../../src/tags-helpers.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {iptc, composedIptc, withRepeatableAsArrays} from '../../../../src/composable/groups/iptc.js';
import IptcTagNames from '../../../../src/iptc-tag-names.js';
import {getNaaBlock, headline} from '../../loadview-inventory-images.js';
import {getContext, recordCalls} from '../test-context.js';

describe('composable/groups/iptc', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should read the block\'s view at its offset with the shared value budget and filter the tags', () => {
        const reads = swapIptcRead();
        const view = getDataView('\x00'.repeat(32));
        const tagFilter = createTagFilter({includeTags: {iptc: ['Headline']}});
        const ctx = getContext({options: {includeUnknown: 'unknown'}, tagFilter});

        const result = iptc.read({kind: 'iptc', dataView: view, dataOffset: 4}, ctx);

        expect(result).to.deep.equal({tags: {Headline: {value: 'h'}}});
        expect(reads).to.deep.equal([[view, 4, 'unknown', tagFilter, ctx.valueBudget]]);
    });

    it('should read from the file when the block has no view of its own', () => {
        const reads = swapIptcRead();
        const ctx = getContext();

        iptc.read({kind: 'iptc', dataOffset: 4}, ctx);

        expect(reads[0][0]).to.equal(ctx.dataView);
    });

    it('should add an allowance for a decompressed raw profile only', () => {
        swapIptcRead();
        const view = getDataView('\x00'.repeat(1000));
        const untouched = getValueBudget(getContext().dataView);

        for (const [block, isAdded] of [
            [{origin: 'rawProfile', decompressed: true}, true],
            [{origin: 'rawProfile'}, false],
            [{carried: 'main', decompressed: true}, false],
        ]) {
            const ctx = getContext();
            iptc.read(Object.assign({kind: 'iptc', dataView: view, dataOffset: 0}, block), ctx);

            expect(ctx.valueBudget.iptcDatasetsRemaining > untouched.iptcDatasetsRemaining, JSON.stringify(block)).to.equal(isAdded);
        }
    });

    it('should merge as an embeddable group', () => {
        expect(iptc.merge({})).to.deep.equal({slot: 'iptc', mode: 'assign'});
        expect(iptc.merge({origin: 'rawProfile'})).to.deep.equal({slot: 'iptc', mode: 'merge'});
        expect(iptc.merge({carried: 'main'})).to.deep.equal({slot: 'carriedIptc', mode: 'assign'});
        expect(iptc.merge({carried: 'rawProfile'})).to.deep.equal({slot: 'carriedIptc', mode: 'merge'});
    });

    describe('the main block\'s IPTC-NAA suppression', () => {
        it('should suppress the main block\'s IPTC-NAA when there is an IPTC segment', () => {
            expect(isSuppressed({carried: 'main'}, [{kind: 'exif'}, {kind: 'iptc'}])).to.equal(true);
        });

        it('should not suppress it for a raw IPTC text chunk or no IPTC block', () => {
            expect(isSuppressed({carried: 'main'}, [{kind: 'iptc', text: {}}])).to.equal(false);
            expect(isSuppressed({carried: 'main'}, [{kind: 'exif'}])).to.equal(false);
        });

        it('should leave the other carried blocks alone', () => {
            expect(isSuppressed({carried: 'brob'}, [{kind: 'iptc'}])).to.equal(false);
            expect(isSuppressed({carried: 'rawProfile'}, [{kind: 'iptc'}])).to.equal(false);
            expect(isSuppressed({}, [{kind: 'iptc'}])).to.equal(false);
        });

        function isSuppressed(block, finderBlocks) {
            return iptc.suppressions[0].isSuppressed(block, finderBlocks, getContext());
        }
    });

    describe('the group a composed reader gets', () => {
        it('should read one repeatable dataset as an array where the default entry\'s group reads an object', () => {
            const block = {kind: 'iptc', dataView: getDataView(getNaaBlock([keywords('k'), headline('h')])), dataOffset: 0};

            const composed = composedIptc.read(block, getContext()).tags;
            const defaultEntry = iptc.read(block, getContext()).tags;

            expect(composed).to.deep.equal({
                Keywords: [{id: 0x0219, value: [0x6b], description: 'k'}],
                Headline: {id: 0x0269, value: [0x68], description: 'h'},
            });
            expect(defaultEntry.Keywords).to.deep.equal({id: 0x0219, value: [0x6b], description: 'k'});
        });

        it('should read with the default entry\'s reader, looked up at call time', () => {
            const {calls, restore} = recordCalls(IptcTags, 'read', () => ({Keywords: {id: 0x0219, value: 'k'}, Headline: {id: 0x0269, value: 'h'}}));
            restores.push(restore);
            const view = getDataView('\x00'.repeat(32));
            const ctx = getContext({options: {includeUnknown: 'unknown'}});

            const result = composedIptc.read({kind: 'iptc', dataView: view, dataOffset: 4}, ctx);

            expect(result).to.deep.equal({tags: {Keywords: [{id: 0x0219, value: 'k'}], Headline: {id: 0x0269, value: 'h'}}});
            expect(calls).to.deep.equal([[view, 4, 'unknown', ctx.tagFilter, ctx.valueBudget]]);
        });

        it('should be the default entry\'s group in everything but the read', () => {
            for (const name of ['key', 'consumes', 'emits', 'merge', 'fromExif', 'brand']) {
                expect(composedIptc[name], name).to.deep.equal(iptc[name]);
            }
            expect(composedIptc.merge).to.equal(iptc.merge);
            expect(composedIptc.fromExif).to.equal(iptc.fromExif);
            expect(composedIptc.suppressions.map(({kind}) => kind)).to.deep.equal(['iptc']);
            expect(composedIptc.suppressions[0].isSuppressed).to.equal(iptc.suppressions[0].isSuppressed);
        });
    });

    describe('wrapping repeatable datasets in arrays', () => {
        const tagNames = {
            0x0219: {name: 'Keywords', repeatable: true},
            0x0250: {name: 'By-line', repeatable: true},
            0x0269: {name: 'Headline'},
            0x0205: 'Object Name',
        };

        it('should wrap a repeatable dataset read once', () => {
            const keywordsTag = {id: 0x0219, value: 'k', description: 'k'};

            expect(withRepeatableAsArrays({Keywords: keywordsTag}, tagNames)).to.deep.equal({Keywords: [keywordsTag]});
        });

        it('should leave a repeatable dataset read more than once as its array', () => {
            const array = [{id: 0x0219, value: 'k'}, {id: 0x0219, value: 'l'}];

            const tags = withRepeatableAsArrays({Keywords: array}, tagNames);

            expect(tags.Keywords).to.equal(array);
            expect(tags.Keywords).to.deep.equal([{id: 0x0219, value: 'k'}, {id: 0x0219, value: 'l'}]);
        });

        it('should leave the datasets that are not repeatable, or unknown, as objects', () => {
            const tags = {
                'Headline': {id: 0x0269, value: 'h'},
                'Object Name': {id: 0x0205, value: 'o'},
                'undefined-4660': {id: 0x1234, value: 'u'},
            };

            expect(withRepeatableAsArrays(tags, tagNames)).to.deep.equal({
                'Headline': {id: 0x0269, value: 'h'},
                'Object Name': {id: 0x0205, value: 'o'},
                'undefined-4660': {id: 0x1234, value: 'u'},
            });
        });

        it('should keep the order of the tags', () => {
            const tags = withRepeatableAsArrays({
                'Headline': {id: 0x0269, value: 'h'},
                'Keywords': {id: 0x0219, value: 'k'},
                'By-line': {id: 0x0250, value: 'b'},
            }, tagNames);

            expect(Object.keys(tags)).to.deep.equal(['Headline', 'Keywords', 'By-line']);
        });

        it('should wrap each of the iptc dictionary\'s repeatable datasets', () => {
            const dictionary = IptcTagNames['iptc'];
            const repeatableIds = Object.keys(dictionary).filter((id) => dictionary[id].repeatable).map(Number);
            const tags = {};
            repeatableIds.forEach((id) => {
                tags[dictionary[id].name] = {id, value: 'v'};
            });

            const wrapped = withRepeatableAsArrays(tags, dictionary);

            expect(repeatableIds).to.have.lengthOf(13);
            expect(Object.keys(wrapped).filter((name) => Array.isArray(wrapped[name]))).to.have.lengthOf(13);
        });
    });

    function keywords(value) {
        return {record: 2, dataset: 0x19, value};
    }

    function swapIptcRead() {
        const {calls, restore} = recordCalls(IptcTags, 'read', () => ({Headline: {value: 'h'}, ObjectName: {value: 'o'}}));
        restores.push(restore);
        return calls;
    }
});
