/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import IccTags from '../../src/icc-tags';

describe('icc-tags', () => {
    it('should return empty set if something throws', () => {
        expect(IccTags.read(undefined, [])).to.deep.equal({});
    });
});
