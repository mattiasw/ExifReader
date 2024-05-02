/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import Xml from '../../src/xml';

describe('xml', () => {
    it('should recognize xmp file', () => {
        expect(Xml.isXMLFile(getDataView('<?xpacket begin'))).to.be.true;
    });

    it('should find offset', () => {
        expect(Xml.findOffsets(new Uint8Array([0x3c, 0x3f, 0x78, 0x70, 0x61, 0x63, 0x6b, 0x65, 0x74, 0x20, 0x62, 0x65, 0x67, 0x69, 0x6e]))).to.deep.equal({
            xmpChunks: [
                {
                    dataOffset: 0,
                    length: 15
                },
            ]
        });
    });
});
