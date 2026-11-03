/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import Composite from '../../../../src/composite.js';
import {composite} from '../../../../src/composable/groups/composite.js';

describe('composable/groups/composite', () => {
    it('should be a derived group that reads no block', () => {
        expect(composite).to.not.have.property('read');
        expect(composite.merge()).to.deep.equal({slot: 'composite', mode: 'composite'});
    });

    it('should hand the pipeline the Composite object itself', () => {
        expect(composite.mergeDeps).to.deep.equal({Composite});
        expect(composite.mergeDeps.Composite).to.equal(Composite);
    });
});
