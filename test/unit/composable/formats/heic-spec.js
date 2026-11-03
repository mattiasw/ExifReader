/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import Heic from '../../../../src/image-header-heic.js';
import {heicHeader} from '../../../../src/composable/formats/heic.js';
import {recordCalls} from '../test-context.js';

describe('composable/formats/heic', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should give the HEIC file type', () => {
        expect(heicHeader.fileType).to.deep.equal({value: 'heic', description: 'HEIC'});
    });

    it('should detect and find through Heic.isHeicFile and Heic.findHeicOffsets at call time', () => {
        const dataView = {};
        const ranges = [];
        const detects = recordCalls(Heic, 'isHeicFile', 'detected');
        const finds = recordCalls(Heic, 'findHeicOffsets', 'blocks');
        restores.push(detects.restore, finds.restore);

        expect(heicHeader.detect(dataView)).to.equal('detected');
        expect(heicHeader.find(dataView, ranges)).to.equal('blocks');

        expect(detects.calls).to.have.lengthOf(1);
        expect(detects.calls[0][0]).to.equal(dataView);
        expect(finds.calls).to.have.lengthOf(1);
        expect(finds.calls[0]).to.have.lengthOf(2);
        expect(finds.calls[0][0]).to.equal(dataView);
        expect(finds.calls[0][1]).to.equal(ranges);
    });
});
