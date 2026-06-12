/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils.js';
import Xml from '../../src/xml.js';

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

    describe('metadataBlocks', () => {
        it('should emit a single xmp block covering the entire buffer', () => {
            const metadataBlocks = [];
            Xml.findOffsets(getDataView('<?xpacket begin'), metadataBlocks);
            expect(metadataBlocks[0]).to.deep.equal({type: 'xmp', start: 0, end: 15});
        });

        it('should not mark truncated when the buffer ends with an xpacket end marker', () => {
            const xml = '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta><?xpacket end="r"?>';
            const metadataBlocks = [];
            Xml.findOffsets(getDataView(xml), metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(false);
        });

        it('should not mark truncated when the buffer ends with </x:xmpmeta>', () => {
            const xml = '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta>';
            const metadataBlocks = [];
            Xml.findOffsets(getDataView(xml), metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(false);
        });

        it('should tolerate trailing whitespace before the xpacket end marker', () => {
            const xml = '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta><?xpacket end="r"?>\n\n  \r\n';
            const metadataBlocks = [];
            Xml.findOffsets(getDataView(xml), metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(false);
        });

        it('should mark truncated when neither closing marker is present (cut mid-packet)', () => {
            const xml = '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Descr';
            const metadataBlocks = [];
            Xml.findOffsets(getDataView(xml), metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(true);
        });

        it('should detect the end marker even past several KiB of XMP write padding', () => {
            const head = '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta><?xpacket end="w"?>';
            const padding = ' '.repeat(4096); // Adobe recommends 2-4 KiB padding
            const xml = head + padding;
            const metadataBlocks = [];
            Xml.findOffsets(getDataView(xml), metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(false);
        });
    });
});
