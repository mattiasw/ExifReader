/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from '../../test-utils.js';
import IptcTags from '../../../../src/iptc-tags.js';
import TagNames0thIfd from '../../../../src/tag-names-0th-ifd.js';
import {getValueBudget} from '../../../../src/tags-helpers.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {iptc} from '../../../../src/composable/groups/iptc.js';
import {getContext, recordCalls} from '../test-context.js';

describe('composable/groups/iptc', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should consume the iptc kind and inject IPTC-NAA', () => {
        expect(iptc.key).to.equal('iptc');
        expect(iptc.consumes).to.deep.equal(['iptc']);
        expect(iptc.emits).to.deep.equal([]);
        expect(iptc.descriptors).to.deep.equal([{ifd: '0th', id: 0x83bb}]);
        expect(TagNames0thIfd[0x83bb]).to.equal('IPTC-NAA');
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

    function swapIptcRead() {
        const {calls, restore} = recordCalls(IptcTags, 'read', () => ({Headline: {value: 'h'}, ObjectName: {value: 'o'}}));
        restores.push(restore);
        return calls;
    }
});
