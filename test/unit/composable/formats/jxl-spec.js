/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import Jxl from '../../../../src/image-header-jxl.js';
import JxlFileTags from '../../../../src/jxl-file-tags.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {jxlHeader, jxlFile} from '../../../../src/composable/formats/jxl.js';
import {decompression} from '../../../../src/decompression.js';
import {getContext, recordCalls} from '../test-context.js';

describe('composable/formats/jxl', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should give the JPEG XL file type', () => {
        expect(jxlHeader.fileType).to.deep.equal({value: 'jxl', description: 'JPEG XL'});
    });

    it('should bring the pooled decompression', () => {
        expect(jxlHeader.decompression).to.equal(decompression);
    });

    it('should detect and find through Jxl.isJxlFile and Jxl.findJxlOffsets at call time', () => {
        const dataView = {};
        const ranges = [];
        const detects = recordCalls(Jxl, 'isJxlFile', 'detected');
        const finds = recordCalls(Jxl, 'findJxlOffsets', 'blocks');
        restores.push(detects.restore, finds.restore);

        expect(jxlHeader.detect(dataView)).to.equal('detected');
        expect(jxlHeader.find(dataView, ranges)).to.equal('blocks');

        expect(detects.calls).to.have.lengthOf(1);
        expect(detects.calls[0][0]).to.equal(dataView);
        expect(finds.calls).to.have.lengthOf(1);
        expect(finds.calls[0]).to.have.lengthOf(2);
        expect(finds.calls[0][0]).to.equal(dataView);
        expect(finds.calls[0][1]).to.equal(ranges);
    });

    it('should assign its tags to the jxlFile slot', () => {
        expect(jxlFile.merge({})).to.deep.equal({slot: 'jxlFile', mode: 'assign'});
    });

    it('should read the codestream header and filter its tags', () => {
        const {calls, restore} = recordCalls(JxlFileTags, 'read', {ImageWidth: {value: 1}, ImageHeight: {value: 2}});
        restores.push(restore);
        const ctx = getContext({tagFilter: createTagFilter({excludeTags: {file: ['ImageHeight']}})});

        const result = jxlFile.read({codestreamOffset: 12}, ctx);

        expect(result).to.deep.equal({tags: {ImageWidth: {value: 1}}});
        expect(calls).to.deep.equal([[ctx.dataView, 12]]);
    });
});
