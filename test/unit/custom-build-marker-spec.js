/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {MARKER_FILE_NAME, configHash, readMarker, writeMarker, removeMarker, markerMatches} from '../../bin/custom-build-marker.js';

describe('custom-build-marker', () => {
    describe('configHash', () => {
        it('is a sha256 hex digest', () => {
            expect(configHash({include: {jpeg: true}})).to.match(/^[0-9a-f]{64}$/);
        });

        it('is stable under key reordering at every nesting depth', () => {
            const first = {include: {jpeg: true, exif: ['DateTime', 'Orientation'], png: {a: 1, b: 2}}};
            const second = {include: {png: {b: 2, a: 1}, exif: ['DateTime', 'Orientation'], jpeg: true}};
            expect(configHash(first)).to.equal(configHash(second));
        });

        it('differs when a value changes', () => {
            expect(configHash({include: {jpeg: true}})).to.not.equal(configHash({include: {jpeg: false}}));
        });

        it('differs when a nested value changes', () => {
            expect(configHash({include: {png: {a: 1}}})).to.not.equal(configHash({include: {png: {a: 2}}}));
        });

        it('differs when a key changes', () => {
            expect(configHash({include: {jpeg: true}})).to.not.equal(configHash({exclude: {jpeg: true}}));
        });

        it('differs when the array order changes', () => {
            expect(configHash({include: {exif: ['DateTime', 'Orientation']}}))
                .to.not.equal(configHash({include: {exif: ['Orientation', 'DateTime']}}));
        });

        it('differs between an array and its only element', () => {
            expect(configHash({a: [1]})).to.not.equal(configHash({a: 1}));
        });

        it('differs between an array and an object with index keys', () => {
            expect(configHash({a: ['x']})).to.not.equal(configHash({a: {0: 'x'}}));
        });

        it('differs between an object and a string that looks like it', () => {
            expect(configHash({a: {b: 1}})).to.not.equal(configHash({a: '{"b":1}'}));
        });
    });

    describe('marker file', () => {
        let distDir;

        beforeEach(() => {
            distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-marker-'));
        });

        afterEach(() => {
            fs.rmSync(distDir, {recursive: true, force: true});
        });

        it('round-trips through writeMarker and readMarker', () => {
            const config = {include: {jpeg: true}};
            writeMarker(distDir, config, '1.2.3');
            expect(readMarker(distDir)).to.deep.equal({configHash: configHash(config), version: '1.2.3'});
        });

        it('writes the marker under its file name in the dist directory', () => {
            writeMarker(distDir, {include: {}}, '1.2.3');
            expect(MARKER_FILE_NAME).to.equal('.exifreader-custom-build.json');
            expect(fs.existsSync(path.join(distDir, MARKER_FILE_NAME))).to.equal(true);
        });

        it('reads a missing marker as undefined', () => {
            expect(readMarker(distDir)).to.equal(undefined);
        });

        it('reads a marker with invalid JSON as undefined', () => {
            fs.writeFileSync(path.join(distDir, MARKER_FILE_NAME), '{not json');
            expect(readMarker(distDir)).to.equal(undefined);
        });

        it('removes an existing marker', () => {
            writeMarker(distDir, {include: {}}, '1.2.3');
            removeMarker(distDir);
            expect(fs.existsSync(path.join(distDir, MARKER_FILE_NAME))).to.equal(false);
        });

        it('does not throw when removing a missing marker', () => {
            expect(() => removeMarker(distDir)).to.not.throw();
        });
    });

    describe('markerMatches', () => {
        const config = {include: {jpeg: true}};

        it('is true when both the hash and the version match', () => {
            expect(markerMatches({configHash: configHash(config), version: '1.2.3'}, config, '1.2.3')).to.equal(true);
        });

        it('is false when the hash differs', () => {
            expect(markerMatches({configHash: configHash({include: {png: true}}), version: '1.2.3'}, config, '1.2.3')).to.equal(false);
        });

        it('is false when the version differs', () => {
            expect(markerMatches({configHash: configHash(config), version: '1.2.4'}, config, '1.2.3')).to.equal(false);
        });

        it('is false for a missing marker', () => {
            expect(markerMatches(undefined, config, '1.2.3')).to.equal(false);
        });

        it('is false for a marker holding JSON null', () => {
            expect(markerMatches(null, config, '1.2.3')).to.equal(false);
        });
    });
});
