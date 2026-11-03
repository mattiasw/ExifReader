/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import TagNamesExifIfd from '../../src/tag-names-exif-ifd.js';
import * as Descriptions from '../../src/tag-names-exif-ifd-descriptions.js';

describe('tag-names-exif-ifd-descriptions', () => {
    it('exports only functions the dictionary references', () => {
        const referenced = Object.values(TagNamesExifIfd).flatMap((entry) => Object.values(entry));

        for (const exportName of Object.keys(Descriptions)) {
            expect(referenced, exportName).to.include(Descriptions[exportName]);
        }
    });
});
