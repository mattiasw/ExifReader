/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {makeLoadAuto} from '../../src/load-auto.js';

describe('load-auto', () => {
    describe('sliceInputBuffer (via loadAdaptiveFromMemory, typed array branch)', () => {
        function makeView() {
            // A view of four 0xAA bytes at offset 2 in a buffer of 0xBB bytes.
            const parent = new Uint8Array(10);
            parent.fill(0xBB);
            parent.fill(0xAA, 2, 6);
            return new Uint8Array(parent.buffer, 2, 4);
        }

        function loadFromDataReturning(end) {
            return () => Promise.resolve({metadataRange: {end}});
        }

        it('does not slice past the end of the typed array view when end exceeds its length', () => {
            const view = makeView();
            const loadAuto = makeLoadAuto(loadFromDataReturning(100));
            return loadAuto(view, {expanded: true, includeOffsets: true}).then((tags) => {
                const buffer = tags.metadataRange.buffer;
                expect(buffer.byteLength).to.equal(4);
                expect(Array.from(new Uint8Array(buffer))).to.deep.equal([0xAA, 0xAA, 0xAA, 0xAA]);
            });
        });

        it('slices to end when end is within the typed array view length', () => {
            const view = makeView();
            const loadAuto = makeLoadAuto(loadFromDataReturning(2));
            return loadAuto(view, {expanded: true, includeOffsets: true}).then((tags) => {
                const buffer = tags.metadataRange.buffer;
                expect(buffer.byteLength).to.equal(2);
                expect(Array.from(new Uint8Array(buffer))).to.deep.equal([0xAA, 0xAA]);
            });
        });

        it('does not slice outside the typed array view when end is negative', () => {
            const view = makeView();
            const loadAuto = makeLoadAuto(loadFromDataReturning(-3));
            return loadAuto(view, {expanded: true, includeOffsets: true}).then((tags) => {
                expect(tags.metadataRange.buffer.byteLength).to.equal(0);
            });
        });
    });
});
