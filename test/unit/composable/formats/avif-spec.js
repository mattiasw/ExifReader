/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import Avif from '../../../../src/image-header-avif.js';
import {avifHeader} from '../../../../src/composable/formats/avif.js';
import {recordCalls} from '../test-context.js';

describe('composable/formats/avif', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should give the AVIF file type', () => {
        expect(avifHeader.fileType).to.deep.equal({value: 'avif', description: 'AVIF'});
    });

    it('should detect and find through Avif.isAvifFile and Avif.findAvifOffsets at call time', () => {
        const dataView = {};
        const ranges = [];
        const detects = recordCalls(Avif, 'isAvifFile', 'detected');
        const finds = recordCalls(Avif, 'findAvifOffsets', 'blocks');
        restores.push(detects.restore, finds.restore);

        expect(avifHeader.detect(dataView)).to.equal('detected');
        expect(avifHeader.find(dataView, ranges)).to.equal('blocks');

        expect(detects.calls).to.have.lengthOf(1);
        expect(detects.calls[0][0]).to.equal(dataView);
        expect(finds.calls).to.have.lengthOf(1);
        expect(finds.calls[0]).to.have.lengthOf(2);
        expect(finds.calls[0][0]).to.equal(dataView);
        expect(finds.calls[0][1]).to.equal(ranges);
    });
});
