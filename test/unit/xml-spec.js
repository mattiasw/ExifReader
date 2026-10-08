/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, swapProperties} from './test-utils.js';
import Xml from '../../src/xml.js';
import DataViewWrapper from '../../src/dataview.js';

describe('xml', () => {
    let restoreFromCharCode;

    afterEach(() => {
        if (restoreFromCharCode) {
            restoreFromCharCode();
            restoreFromCharCode = undefined;
        }
    });

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

        it('should find the closing marker without reading or converting the whole buffer', () => {
            const head = '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta><?xpacket end="w"?>';
            const dataView = getDataView(head + ' '.repeat(64 * 1024));
            let reads = 0;
            const countingView = {
                byteLength: dataView.byteLength,
                getUint8(offset) {
                    reads++;
                    return dataView.getUint8(offset);
                }
            };
            const originalFromCharCode = String.fromCharCode;
            let fromCharCodeCalls = 0;
            restoreFromCharCode = swapProperties(String, {
                fromCharCode(...charCodes) {
                    fromCharCodeCalls++;
                    return originalFromCharCode.apply(String, charCodes);
                }
            });
            const metadataBlocks = [];
            Xml.findOffsets(countingView, metadataBlocks);
            restoreFromCharCode();
            restoreFromCharCode = undefined;
            expect(fromCharCodeCalls).to.be.at.most(2);
            expect(reads).to.be.below(200);
            expect(metadataBlocks.truncated).to.equal(false);
        });

        it('should find a closing marker that follows a partial one', () => {
            const xml = '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><?xpacket en<?xpacket end="w"?>';
            const metadataBlocks = [];
            Xml.findOffsets(getDataView(xml), metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(false);
        });

        it('should find an xpacket end marker that ends at the last byte', () => {
            const xml = '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><?xpacket end=';
            const metadataBlocks = [];
            Xml.findOffsets(getDataView(xml), metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(false);
        });

        it('should mark truncated when the closing marker is cut one byte short', () => {
            const xml = '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><?xpacket end';
            const metadataBlocks = [];
            Xml.findOffsets(getDataView(xml), metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(true);
        });

        it('should mark truncated for a buffer shorter than the closing markers', () => {
            const metadataBlocks = [];
            Xml.findOffsets(getDataView('<?xpa'), metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(true);
        });

        it('should mark truncated for an empty buffer', () => {
            const metadataBlocks = [];
            Xml.findOffsets(getDataView(''), metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(true);
        });

        it('should find the closing marker in a Node.js Buffer wrapper', () => {
            const xml = '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta><?xpacket end="w"?>';
            const metadataBlocks = [];
            Xml.findOffsets(new DataViewWrapper(Buffer.from(xml)), metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(false);
        });

        it('should mark truncated for a cut-short Node.js Buffer wrapper without throwing', () => {
            const xml = '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><?xpacket end';
            const metadataBlocks = [];
            Xml.findOffsets(new DataViewWrapper(Buffer.from(xml)), metadataBlocks);
            expect(metadataBlocks.truncated).to.equal(true);
        });
    });
});
