/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import PngTextTags from '../../src/png-text-tags';

describe('png-text-tags', () => {
    it('should read image tag', () => {
        const tagDatatEXt = 'MyTag0\x00My value.';
        const tagDataiTXt = 'MyTag1\x00\x00\x00fr\x00MyFrTag1\x00My other value.';
        const dataView = getDataView(tagDatatEXt + tagDataiTXt);
        const chunks = [
            {type: 'tEXt', offset: 0, length: tagDatatEXt.length},
            {type: 'iTXt', offset: tagDatatEXt.length, length: tagDataiTXt.length}
        ];

        const tags = PngTextTags.read(dataView, chunks);

        expect(tags['MyTag0']).to.deep.equal({
            value: 'My value.',
            description: 'My value.'
        });
        expect(tags['MyTag1 (fr)']).to.deep.equal({
            value: 'My other value.',
            description: 'My other value.'
        });
    });
});
