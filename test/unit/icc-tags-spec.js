/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import IccTags, {parseTags, __RewireAPI__ as IccTagsRewireAPI} from '../../src/icc-tags';

describe('icc-tags', () => {
    it('should return empty set if something throws', () => {
        expect(IccTags.read(undefined, [])).to.deep.equal({});
    });

    it('should not iterate mluc records when the record size cannot advance the read offset', () => {
        const NUM_RECORDS = 100000;
        const SIZE = 180;
        const data = new Uint8Array(SIZE);
        const dataView = new DataView(data.buffer);
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                data[offset + i] = string.charCodeAt(i);
            }
        };

        dataView.setUint32(0, SIZE); // Profile length.
        writeString(36, 'acsp'); // Profile signature.
        dataView.setUint32(128, 1); // Tag count.

        // Tag table entry: signature, offset to tag data, tag size.
        writeString(132, 'desc');
        dataView.setUint32(136, 144);
        dataView.setUint32(140, 36);

        // mluc tag with a record size that does not advance the read offset.
        writeString(144, 'mluc');
        dataView.setUint32(148, 0);
        dataView.setUint32(152, NUM_RECORDS);
        dataView.setUint32(156, 0);

        writeString(160, 'en');
        writeString(162, 'US');
        dataView.setUint32(164, 4);
        dataView.setUint32(168, 28);
        dataView.setUint16(172, 0x0048);
        dataView.setUint16(174, 0x0069);

        let recordReadCount = 0;
        IccTagsRewireAPI.__Rewire__('getUnicodeStringFromDataView', () => {
            recordReadCount += 1;
            return '';
        });

        try {
            parseTags(dataView);
        } finally {
            IccTagsRewireAPI.__ResetDependency__('getUnicodeStringFromDataView');
        }

        expect(recordReadCount).to.be.at.most(1);
    });

    it('should preserve parsed header tags when an mluc tag claims more records than fit in the buffer', () => {
        const SIZE = 180;
        const data = new Uint8Array(SIZE);
        const dataView = new DataView(data.buffer);
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                data[offset + i] = string.charCodeAt(i);
            }
        };

        dataView.setUint32(0, SIZE);
        writeString(36, 'acsp');
        dataView.setUint32(128, 1);

        writeString(132, 'desc');
        dataView.setUint32(136, 144);
        dataView.setUint32(140, 36);

        // mluc tag with a record count that does not fit in the buffer.
        writeString(144, 'mluc');
        dataView.setUint32(148, 0);
        dataView.setUint32(152, 1000);
        dataView.setUint32(156, 12);

        writeString(160, 'en');
        writeString(162, 'US');
        dataView.setUint32(164, 0);
        dataView.setUint32(168, 0);

        const tags = parseTags(dataView);

        expect(tags).to.have.nested.property('ICC Signature.value', 'acsp');
    });
});
