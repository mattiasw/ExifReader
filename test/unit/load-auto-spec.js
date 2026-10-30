/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import vm from 'node:vm';
import {expect} from 'chai';
import {makeLoadAuto} from '../../src/load-auto.js';
import {swapProperties} from './test-utils.js';

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

        describe('without ArrayBuffer.isView', () => {
            let restore;

            beforeEach(() => {
                restore = swapProperties(ArrayBuffer, {isView: undefined});
            });

            afterEach(() => {
                restore();
            });

            it('slices only the bytes of the typed array view', () => {
                const view = makeView();
                const loadAuto = makeLoadAuto(loadFromDataReturning(3));
                return loadAuto(view, {expanded: true, includeOffsets: true}).then((tags) => {
                    const buffer = tags.metadataRange.buffer;
                    expect(buffer).to.be.instanceOf(ArrayBuffer);
                    expect(Array.from(new Uint8Array(buffer))).to.deep.equal([0xAA, 0xAA, 0xAA]);
                });
            });
        });
    });

    describe('sliceInputBuffer (via loadAdaptiveFromMemory, cross-realm buffer branch)', () => {
        function getForeignRealmBuffer(constructorName) {
            return vm.runInNewContext(`
                const buffer = new ${constructorName}(6);
                new Uint8Array(buffer).set([1, 2, 3, 4, 5, 6]);
                buffer;
            `);
        }

        function loadFromDataReturning(end) {
            return () => Promise.resolve({metadataRange: {end}});
        }

        [ArrayBuffer, SharedArrayBuffer].forEach((Constructor) => {
            describe(`foreign ${Constructor.name}`, () => {
                let input;

                beforeEach(() => {
                    input = getForeignRealmBuffer(Constructor.name);
                    expect(input).to.not.be.instanceOf(Constructor);
                });

                it('slices to end when end is within the buffer length', () => {
                    const loadAuto = makeLoadAuto(loadFromDataReturning(3));
                    return loadAuto(input, {expanded: true, includeOffsets: true}).then((tags) => {
                        const buffer = tags.metadataRange.buffer;
                        expect(buffer.byteLength).to.equal(3);
                        expect(Array.from(new Uint8Array(buffer))).to.deep.equal([1, 2, 3]);
                        expect(tags.metadataRange.fetched).to.equal(3);
                    });
                });

                it('returns a copy of the whole buffer when end exceeds its length', () => {
                    const loadAuto = makeLoadAuto(loadFromDataReturning(100));
                    return loadAuto(input, {expanded: true, includeOffsets: true}).then((tags) => {
                        const buffer = tags.metadataRange.buffer;
                        expect(buffer).to.not.equal(input);
                        expect(buffer.byteLength).to.equal(6);
                        expect(Array.from(new Uint8Array(buffer))).to.deep.equal([1, 2, 3, 4, 5, 6]);
                    });
                });
            });
        });

        describe('input that is not a buffer', () => {
            function slice() {
                return 'sliced';
            }

            [
                ['has no slice function', {byteLength: 6}],
                ['has no byteLength', {slice}],
                ['has a buffer property', {buffer: new ArrayBuffer(6), slice, byteLength: 6}]
            ].forEach(([description, input]) => {
                it(`is returned as is when it ${description}`, () => {
                    const loadAuto = makeLoadAuto(loadFromDataReturning(3));
                    return loadAuto(input, {expanded: true, includeOffsets: true}).then((tags) => {
                        expect(tags.metadataRange.buffer).to.equal(input);
                    });
                });
            });
        });
    });
});
