/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import TagNamesPentaxIfd from '../../src/tag-names-pentax-ifd';

describe('tag-names-pentax-ifd', () => {
    it('should have tag PentaxVersion', () => {
        expect(TagNamesPentaxIfd[0x0000].name).to.equal('PentaxVersion');
        expect(TagNamesPentaxIfd[0x0000].description([0x0e, 0x00, 0x00, 0x00])).to.equal('14.0.0.0');
    });

    it('should have tag PentaxModelID', () => {
        expect(TagNamesPentaxIfd[0x0005]).to.equal('PentaxModelID');
    });

    it('should have tag LevelInfo', () => {
        expect(TagNamesPentaxIfd[0x022b]).to.equal('LevelInfo');
    });
});
