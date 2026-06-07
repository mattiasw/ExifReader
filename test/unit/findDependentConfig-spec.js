/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import path from 'path';
import findDependentConfig from '../../bin/findDependentConfig';

// Build paths with the platform separator so they match what the
// implementation produces via path.join (backslashes on Windows). Hardcoded
// POSIX paths would never match the walked-up paths on Windows.
const APP = path.join(path.sep, 'app');
const INSTALL_DIR = path.join(APP, 'node_modules', 'exifreader');
const LEAF_DIR = path.join(APP, 'packages', 'x');
const ELSEWHERE_INSTALL = path.join(path.sep, 'elsewhere', 'node_modules', 'exifreader');

describe('findDependentConfig', () => {
    describe('default export (install-location walk)', () => {
        it('returns the first ancestor package.json exifreader config', () => {
            const config = {include: {jpeg: true}};
            const tree = {[APP]: {exifreader: config}};
            expect(findDependentConfig({installDir: INSTALL_DIR, readPackageJson: reader(tree)})).to.equal(config);
        });

        it('is falsy when no ancestor has a package.json', () => {
            expect(findDependentConfig({installDir: INSTALL_DIR, readPackageJson: reader({})})).to.not.be.ok;
        });
    });

    describe('forCli (cwd-first, fallback to install location)', () => {
        it('uses the nearest package.json walking up from the start dir', () => {
            const leaf = {include: {tiff: true}};
            const tree = {[LEAF_DIR]: {exifreader: leaf}};
            expect(findDependentConfig.forCli(LEAF_DIR, {installDir: INSTALL_DIR, readPackageJson: reader(tree)})).to.equal(leaf);
        });

        it('stops at the first package.json and falls back to the install location when it has no key', () => {
            const root = {include: {jpeg: true}};
            const tree = {
                [LEAF_DIR]: {name: 'x'},
                [APP]: {exifreader: root}
            };
            expect(findDependentConfig.forCli(LEAF_DIR, {installDir: INSTALL_DIR, readPackageJson: reader(tree)})).to.equal(root);
        });

        it('does not hunt up from cwd for a stray ancestor key (stops at the first package.json)', () => {
            // APP has a key and is an ancestor of the cwd, but the cwd's own
            // package.json has none and the install location is elsewhere, so the
            // ancestor key must not be picked up.
            const tree = {
                [LEAF_DIR]: {name: 'x'},
                [APP]: {exifreader: {include: {png: true}}}
            };
            expect(findDependentConfig.forCli(LEAF_DIR, {installDir: ELSEWHERE_INSTALL, readPackageJson: reader(tree)})).to.equal(false);
        });

        it('returns false when no package.json is found anywhere', () => {
            expect(findDependentConfig.forCli(LEAF_DIR, {installDir: INSTALL_DIR, readPackageJson: reader({})})).to.equal(false);
        });
    });

    describe('default reader (real filesystem)', () => {
        it('reads package.json from disk; ExifReader has no exifreader key in any ancestor', () => {
            expect(findDependentConfig.forCli(process.cwd())).to.equal(false);
            expect(findDependentConfig()).to.not.be.ok;
        });
    });

    function reader(tree) {
        return (directory) => tree[directory];
    }
});
