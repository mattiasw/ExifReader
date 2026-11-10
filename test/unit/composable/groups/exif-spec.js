/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import ByteOrder from '../../../../src/byte-order.js';
import Tags from '../../../../src/tags.js';
import TagNames0thIfd from '../../../../src/tag-names-0th-ifd.js';
import TagNamesExifIfd from '../../../../src/tag-names-exif-ifd.js';
import TagNamesGpsIfd from '../../../../src/tag-names-gps-ifd.js';
import TagNamesInteroperabilityIfd from '../../../../src/tag-names-interoperability-ifd.js';
import {EXIF_EMITTED_KINDS} from '../../../../src/composable/exif-block-reader.js';
import {exif} from '../../../../src/composable/groups/exif.js';
import {getContext, recordCalls} from '../test-context.js';

describe('composable/groups/exif', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should emit the kinds an Exif block carries', () => {
        expect(exif.emits).to.equal(EXIF_EMITTED_KINDS);
    });

    it('should take the 0th and Exif dictionaries as one merged object, built once', () => {
        const reads = recordTagsReads();

        exif.read({kind: 'exif', tiffHeaderOffset: 0}, getContext());
        exif.read({kind: 'exif', tiffHeaderOffset: 0}, getContext());

        const tagNames = reads[0][6];
        expect(tagNames['0th']).to.equal(tagNames['exif']);
        expect(tagNames['0th']).to.not.equal(TagNames0thIfd);
        expect(tagNames['0th'][0x010f]).to.equal(TagNames0thIfd[0x010f]);
        expect(tagNames['0th'][0x829a]).to.equal(TagNamesExifIfd[0x829a]);
        expect(Object.keys(tagNames['0th']).length).to.equal(Object.keys(TagNames0thIfd).length + Object.keys(TagNamesExifIfd).length);
        expect(reads[1][6]['0th']).to.equal(tagNames['0th']);
    });

    it('should pass all four dictionaries and the thumbnail IFD dictionary, and read the thumbnail IFD, when the thumbnail group is composed', () => {
        const reads = recordTagsReads();

        exif.read({kind: 'exif', tiffHeaderOffset: 0}, getContext({composed: {groups: {thumbnail: true}}}));

        const tagNames = reads[0][6];
        expect(Object.keys(tagNames).sort()).to.deep.equal(['0th', '1st', 'exif', 'gps', 'interoperability']);
        expect(tagNames['1st']).to.equal(TagNames0thIfd);
        expect(tagNames['gps']).to.equal(TagNamesGpsIfd);
        expect(tagNames['interoperability']).to.equal(TagNamesInteroperabilityIfd);
        expect(reads[0][7]).to.equal(true);
    });

    it('should leave out the thumbnail IFD dictionary and not read the thumbnail IFD without the thumbnail group', () => {
        const reads = recordTagsReads();

        exif.read({kind: 'exif', tiffHeaderOffset: 0}, getContext());

        expect(Object.keys(reads[0][6]).sort()).to.deep.equal(['0th', 'exif', 'gps', 'interoperability']);
        expect(reads[0][7]).to.equal(false);
    });

    function recordTagsReads() {
        const {calls, restore} = recordCalls(Tags, 'read', () => ({tags: {}, byteOrder: ByteOrder.BIG_ENDIAN}));
        restores.push(restore);
        return calls;
    }
});
