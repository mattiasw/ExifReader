/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from '../test-utils.js';
import {getCharacterArray} from '../../../src/utils.js';
import * as IptcBlockReader from '../../../src/composable/iptc-block-reader.js';
import {iptcBlockReader} from '../../../src/composable/iptc-block-reader.js';
import {iptc as iptcGroup} from '../../../src/composable/groups/iptc.js';
import {iptc as iptcGroupWithDependencies} from '../../../src/composable/groups.js';
import * as IptcTagDescriptors from '../../../src/composable/tags/iptc.js';
import {ByLine, Keywords, DateCreated} from '../../../src/composable/tags/iptc.js';
import * as ExifTagDescriptors from '../../../src/composable/tags/exif.js';
import {IPTCNAA} from '../../../src/composable/tags/exif.js';
import {getContext} from './test-context.js';
import {getNaaBlock, headline} from '../loadview-inventory-images.js';

describe('composable/iptc-block-reader', () => {
    it('should export only the reader link', () => {
        expect(Object.keys(IptcBlockReader)).to.deep.equal(['iptcBlockReader']);
        expect(Object.keys(iptcBlockReader)).to.deep.equal(['createParseOnlyGroup', 'isDescriptor']);
    });

    describe('createParseOnlyGroup', () => {
        it('should make a group that consumes, emits, merges and suppresses as the whole iptc group', () => {
            const group = iptcBlockReader.createParseOnlyGroup([ByLine]);

            expect(group.key).to.equal(iptcGroup.key);
            expect(group.consumes).to.deep.equal(iptcGroup.consumes);
            expect(group.emits).to.deep.equal(iptcGroup.emits);
            expect(group.merge).to.equal(iptcGroup.merge);
            expect(group.brand).to.equal(iptcGroup.brand);
            expect(group.suppressions).to.have.lengthOf(iptcGroup.suppressions.length);
            group.suppressions.forEach((suppression, index) => {
                expect(suppression.kind).to.equal(iptcGroup.suppressions[index].kind);
                expect(suppression.isSuppressed).to.equal(iptcGroup.suppressions[index].isSuppressed);
            });
        });

        it('should depend on the Exif tags the whole iptc group depends on', () => {
            const group = iptcBlockReader.createParseOnlyGroup([ByLine]);

            expect(group.exifDependencies).to.deep.equal([IPTCNAA]);
            expect(group.exifDependencies).to.deep.equal(iptcGroupWithDependencies.exifDependencies);
        });

        it('should return only the datasets of the descriptors, described as the dictionary describes them, a repeatable one as an array', () => {
            const block = getBlock(getNaaBlock([
                byLine('A'),
                headline('H'),
                keywords('K1'),
                dateCreated('20200102'),
                keywords('K2'),
                {record: 2, dataset: 0xf0, value: 'U'},
            ]));
            const group = iptcBlockReader.createParseOnlyGroup([ByLine, Keywords, DateCreated]);

            const {tags} = group.read(block, getContext());

            expect(tags).to.deep.equal({
                'By-line': [{id: 0x0250, value: getCharacterArray('A'), description: 'A'}],
                'Keywords': [
                    {id: 0x0219, value: getCharacterArray('K1'), description: 'K1'},
                    {id: 0x0219, value: getCharacterArray('K2'), description: 'K2'},
                ],
                'Date Created': {id: 0x0237, value: getCharacterArray('20200102'), description: '2020-01-02'},
            });
        });

        it('should return no unknown or unchosen dataset when unknown tags are included', () => {
            const block = getBlock(getNaaBlock([byLine('A'), headline('H'), {record: 2, dataset: 0xf0, value: 'U'}]));
            const group = iptcBlockReader.createParseOnlyGroup([ByLine]);

            const {tags} = group.read(block, getContext({options: {includeUnknown: true}}));

            expect(Object.keys(tags)).to.deep.equal(['By-line']);
        });

        it('should draw every dataset from the shared value budget', () => {
            const ctx = getContext();
            ctx.getValueBudget().iptcDatasetsRemaining = 1;
            const block = getBlock(getNaaBlock([headline('H'), byLine('A')]));

            const {tags} = iptcBlockReader.createParseOnlyGroup([ByLine]).read(block, ctx);

            expect(tags).to.deep.equal({});
            expect(ctx.getValueBudget().iptcDatasetsRemaining).to.equal(0);
        });
    });

    describe('isDescriptor', () => {
        it('should accept every IPTC descriptor', () => {
            Object.keys(IptcTagDescriptors).forEach((binding) => {
                expect(iptcBlockReader.isDescriptor(IptcTagDescriptors[binding]), binding).to.equal(true);
            });
        });

        it('should reject the Exif descriptors and a descriptor of another dictionary or group', () => {
            Object.keys(ExifTagDescriptors).forEach((binding) => {
                expect(iptcBlockReader.isDescriptor(ExifTagDescriptors[binding]), binding).to.equal(false);
            });
            expect(iptcBlockReader.isDescriptor(Object.assign({}, ByLine, {dictionary: '0th'}))).to.equal(false);
            expect(iptcBlockReader.isDescriptor(Object.assign({}, ByLine, {group: 'exif'}))).to.equal(false);
        });
    });

    function getBlock(naaBlock) {
        return {kind: 'iptc', dataView: getDataView(naaBlock), dataOffset: 0};
    }

    function byLine(value) {
        return {record: 2, dataset: 0x50, value};
    }

    function keywords(value) {
        return {record: 2, dataset: 0x19, value};
    }

    function dateCreated(value) {
        return {record: 2, dataset: 0x37, value};
    }
});
