/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getCharacterArray} from '../../src/utils.js';
import TagNames from '../../src/iptc-tag-names.js';
import * as Descriptions from '../../src/iptc-tag-names-descriptions.js';

describe('iptc-tag-names-descriptions', () => {
    it('exports only functions the dictionary references', () => {
        const referenced = Object.values(TagNames.iptc).flatMap((entry) => Object.values(entry));

        for (const exportName of Object.keys(Descriptions)) {
            expect(referenced, exportName).to.include(Descriptions[exportName]);
        }
    });

    it('names an unknown character set escape sequence Unknown', () => {
        expect(Descriptions.getEncodingName(getCharacterArray('\x1b%X'))).to.equal('Unknown');
    });

    it('keeps a creation date shorter than eight characters as it is', () => {
        expect(Descriptions.getCreationDate(getCharacterArray('1990'))).to.equal('1990');
    });

    it('describes a Record 2 destination as its text', () => {
        expect(Descriptions.getRecord2DestinationDescription(getCharacterArray('Paris'))).to.equal('Paris');
    });
});
