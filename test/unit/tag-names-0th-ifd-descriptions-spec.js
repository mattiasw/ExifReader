/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import TagNames0thIfd from '../../src/tag-names-0th-ifd.js';
import * as Descriptions from '../../src/tag-names-0th-ifd-descriptions.js';

describe('tag-names-0th-ifd-descriptions', () => {
    it('exports only functions the dictionary references', () => {
        const referenced = Object.values(TagNames0thIfd).flatMap((entry) => Object.values(entry));

        for (const exportName of Object.keys(Descriptions)) {
            expect(referenced, exportName).to.include(Descriptions[exportName]);
        }
    });
});
