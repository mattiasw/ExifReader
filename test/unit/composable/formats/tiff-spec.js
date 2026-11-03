/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import Tiff from '../../../../src/image-header-tiff.js';
import {tiffHeader} from '../../../../src/composable/formats/tiff.js';
import {recordCalls} from '../test-context.js';

describe('composable/formats/tiff', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should give the TIFF file type', () => {
        expect(tiffHeader.fileType).to.deep.equal({value: 'tiff', description: 'TIFF'});
    });

    it('should detect through Tiff.isTiffFile and find through Tiff.findTiffOffsets, which takes no arguments, at call time', () => {
        const dataView = {};
        const ranges = [];
        const detects = recordCalls(Tiff, 'isTiffFile', 'detected');
        const finds = recordCalls(Tiff, 'findTiffOffsets', 'blocks');
        restores.push(detects.restore, finds.restore);

        expect(tiffHeader.detect(dataView)).to.equal('detected');
        expect(tiffHeader.find(dataView, ranges)).to.equal('blocks');

        expect(detects.calls).to.have.lengthOf(1);
        expect(detects.calls[0][0]).to.equal(dataView);
        expect(finds.calls).to.deep.equal([[]]);
    });
});
