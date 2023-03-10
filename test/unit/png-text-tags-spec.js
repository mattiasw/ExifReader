/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import PngTextTags from '../../src/png-text-tags';

describe('png-text-tags', () => {
    it('should read image tag', () => {
        const tagData = 'MyTag\x00My value.';
        const dataView = getDataView(tagData);
        expect(PngTextTags.read(dataView, [{length: tagData.length, offset: 0}])['MyTag']).to.deep.equal({
            value: 'My value.',
            description: 'My value.'
        });
    });
});
