/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {objectAssign} from '../../../../src/utils.js';
import Composite from '../../../../src/composite.js';
import {createTagFilter, filterTagsForReturn} from '../../../../src/tag-filter.js';
import {buildTagsFromMergeBlocks} from '../../../../src/loadview-pipeline.js';
import {composite} from '../../../../src/composable/groups/composite.js';
import {recordCalls} from '../test-context.js';

describe('composable/groups/composite', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should be a derived group that reads no block', () => {
        expect(composite).to.not.have.property('read');
        expect(composite.merge()).to.deep.equal({slot: 'composite', mode: 'composite'});
    });

    describe('the composite mode', () => {
        const EXIF_TAGS = {Model: {value: 'model'}};

        for (const expanded of [false, true]) {
            const mode = expanded ? 'expanded' : 'flat';

            it(`should give Composite the merged tags and the mode without an active tag filter in ${mode} mode`, () => {
                const {calls, inputs} = swapCompositeGet({FieldOfView: {value: 1}});

                const tags = buildCompositeTags({expanded});

                expect(inputs).to.deep.equal([expanded ? {exif: EXIF_TAGS} : EXIF_TAGS]);
                expect(calls[0][1]).to.equal(expanded);
                expect(expanded ? tags.composite : tags).to.deep.include({FieldOfView: {value: 1}});
            });

            it(`should give Composite the parsed exif and file groups, expanded, with an active tag filter in ${mode} mode`, () => {
                const {calls} = swapCompositeGet(undefined);
                const parsedGroups = {exif: {Model: {value: 'parsed'}}, file: {FileSize: {value: 'parsed'}}, xmp: {Rating: {value: 5}}};

                buildCompositeTags({expanded, parsedGroups, blocks: [composite.merge()], tagFilter: getActiveTagFilter()});

                expect(calls[0][0]).to.deep.equal({exif: parsedGroups.exif, file: parsedGroups.file});
                expect(calls[0][0].exif).to.equal(parsedGroups.exif);
                expect(calls[0][1]).to.equal(true);
            });
        }

        it('should give Composite every parsed tag block in flat merge order when the filter only caps reading', () => {
            const {calls, inputs} = swapCompositeGet(undefined);
            const fileTags = {FileSize: {value: 'file'}, Model: {value: 'file'}};
            const blocks = [
                composite.merge(),
                {slot: 'xmp', group: 'xmp', mode: 'assign', tags: {FocalLength: {value: 'xmp'}, Make: {value: 'xmp'}}},
                {slot: 'exif', group: 'exif', mode: 'assign', tags: {Model: {value: 'exif'}, FocalLength: {value: 'exif'}}},
                {slot: 'file', group: 'file', mode: 'assign', tags: fileTags},
            ];

            const tags = buildCompositeTags({expanded: false, blocks, tagFilterIsReadCap: true, tagFilter: getActiveTagFilter({exif: false})});

            expect(inputs).to.deep.equal([{FileSize: {value: 'file'}, Model: {value: 'exif'}, FocalLength: {value: 'xmp'}, Make: {value: 'xmp'}}]);
            expect(calls[0][1]).to.equal(false);
            expect(fileTags).to.deep.equal({FileSize: {value: 'file'}, Model: {value: 'file'}});
            expect(tags.Model).to.deep.equal({value: 'file'});
        });

        it('should give Composite the parsed exif and file groups when the filter only caps reading in expanded mode', () => {
            const {calls} = swapCompositeGet(undefined);
            const parsedGroups = {exif: {Model: {value: 'parsed'}}, file: {FileSize: {value: 'parsed'}}};

            buildCompositeTags({expanded: true, parsedGroups, blocks: [composite.merge()], tagFilterIsReadCap: true, tagFilter: getActiveTagFilter()});

            expect(calls[0][0]).to.deep.equal({exif: parsedGroups.exif, file: parsedGroups.file});
            expect(calls[0][1]).to.equal(true);
        });

        it('should compute nothing when the composite group is not returned', () => {
            const {calls} = swapCompositeGet({FieldOfView: {value: 1}});

            const tags = buildCompositeTags({expanded: true, tagFilter: createTagFilter({includeTags: {exif: true}})});

            expect(calls).to.deep.equal([]);
            expect(tags).to.not.have.property('composite');
        });

        it('should add nothing when Composite computes nothing', () => {
            swapCompositeGet(undefined);

            expect(buildCompositeTags({expanded: true})).to.deep.equal({exif: EXIF_TAGS});
            expect(buildCompositeTags({expanded: false})).to.deep.equal(EXIF_TAGS);
        });

        it('should add the returned composite tags only', () => {
            swapCompositeGet({FieldOfView: {value: 1}, ScaleFactorTo35mmEquivalent: {value: 2}});

            const tags = buildCompositeTags({expanded: true, tagFilter: createTagFilter({includeTags: {exif: true, composite: ['FieldOfView']}})});

            expect(tags.composite).to.deep.equal({FieldOfView: {value: 1}});
        });

        function swapCompositeGet(result) {
            const inputs = [];
            const recorded = recordCalls(Composite, 'get', (input) => {
                inputs.push(structuredClone(input));
                return result;
            });
            restores.push(recorded.restore);
            return {calls: recorded.calls, inputs};
        }

        function getActiveTagFilter(returnGroups = {}) {
            const tagFilter = createTagFilter({includeTags: {exif: true, file: true, xmp: true, composite: true}});
            const shouldReturnGroup = tagFilter.shouldReturnGroup;
            tagFilter.shouldReturnGroup = (groupKey) => returnGroups[groupKey] !== false && shouldReturnGroup(groupKey);
            return tagFilter;
        }

        function buildCompositeTags({
            expanded,
            parsedGroups = {},
            blocks = [composite.merge(), {slot: 'exif', group: 'exif', mode: 'assign', tags: EXIF_TAGS}],
            tagFilter = createTagFilter(),
            tagFilterIsReadCap = false,
        }) {
            return buildTagsFromMergeBlocks({
                mergeBlocks: blocks,
                parsedGroups,
                expanded,
                tagFilter,
                tagFilterIsReadCap,
                dataView: {},
                fileType: undefined,
                modes: composite.mergeModes,
                deps: {objectAssign, filterTagsForReturn},
            });
        }
    });
});
