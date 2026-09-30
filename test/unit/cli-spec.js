/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {parseArgs, run, checkLocalInstall, readConfigFile} from '../../bin/cli.js';
import {configHash} from '../../bin/custom-build-marker.js';

const PROJECT_DIR = path.resolve('/proj');
const DIST_DIR = path.join(PROJECT_DIR, 'node_modules', 'exifreader', 'dist');
const DIST_PATH = path.join(DIST_DIR, 'exif-reader.js');

describe('cli', () => {
    describe('parseArgs', () => {
        it('parses the build command', () => {
            expect(parseArgs(['node', 'cli', 'build'])).to.include({command: 'build', help: false, version: false});
        });

        it('has no command for an empty invocation', () => {
            expect(parseArgs(['node', 'cli']).command).to.equal(undefined);
        });

        it('recognizes --help and -h', () => {
            expect(parseArgs(['node', 'cli', '--help']).help).to.equal(true);
            expect(parseArgs(['node', 'cli', '-h']).help).to.equal(true);
        });

        it('recognizes --version and -v', () => {
            expect(parseArgs(['node', 'cli', '--version']).version).to.equal(true);
            expect(parseArgs(['node', 'cli', '-v']).version).to.equal(true);
        });

        it('captures an unknown command', () => {
            expect(parseArgs(['node', 'cli', 'frobnicate']).command).to.equal('frobnicate');
        });

        it('has no build flags by default', () => {
            expect(parseArgs(['node', 'cli', 'build'])).to.include({check: false, ifNeeded: false, config: undefined});
        });

        it('recognizes --check', () => {
            expect(parseArgs(['node', 'cli', 'build', '--check']).check).to.equal(true);
        });

        it('recognizes --if-needed', () => {
            expect(parseArgs(['node', 'cli', 'build', '--if-needed']).ifNeeded).to.equal(true);
        });

        it('reads the path after --config', () => {
            expect(parseArgs(['node', 'cli', 'build', '--config', 'x.json']).config).to.equal('x.json');
        });

        it('reads the path in --config=<path>', () => {
            expect(parseArgs(['node', 'cli', 'build', '--config=x.json']).config).to.equal('x.json');
        });

        it('keeps an equals sign inside the --config=<path> value', () => {
            expect(parseArgs(['node', 'cli', 'build', '--config=a=b.json']).config).to.equal('a=b.json');
        });

        it('gives an empty config path for --config with no value', () => {
            expect(parseArgs(['node', 'cli', 'build', '--config']).config).to.equal('');
            expect(parseArgs(['node', 'cli', 'build', '--config=']).config).to.equal('');
        });

        it('does not take a following flag as the --config value', () => {
            const args = parseArgs(['node', 'cli', 'build', '--config', '--check']);
            expect(args.config).to.equal('');
            expect(args.check).to.equal(true);
        });

        it('parses the command when --config <path> comes before it', () => {
            expect(parseArgs(['node', 'cli', '--config', 'x.json', 'build'])).to.include({command: 'build', config: 'x.json'});
        });

        it('does not take the --config value as the command', () => {
            expect(parseArgs(['node', 'cli', '--config', 'x.json']).command).to.equal(undefined);
        });

        it('still takes an argument after a flag other than --config as the command', () => {
            expect(parseArgs(['node', 'cli', '--check', 'build']).command).to.equal('build');
        });
    });

    describe('run', () => {
        it('builds with the resolved config', () => {
            const config = {include: {jpeg: true}};
            const {deps, calls} = makeDeps({resolveConfig: () => config});
            run(['node', 'cli', 'build'], deps);
            expect(calls.build).to.deep.equal([{config}]);
            expect(calls.exit).to.deep.equal([]);
        });

        it('logs where it builds', () => {
            const {deps, calls} = makeDeps({resolveConfig: () => ({include: {}})});
            run(['node', 'cli', 'build'], deps);
            expect(calls.log).to.deep.equal([`Building a custom exifreader bundle at ${DIST_PATH}`]);
            expect(calls.error).to.deep.equal([]);
        });

        it('builds with a preset EXIFREADER_CUSTOM_BUILD env var without resolving', () => {
            const {deps, calls} = makeDeps({
                env: {EXIFREADER_CUSTOM_BUILD: '{"include":{}}'},
                resolveConfig: () => {
                    throw new Error('should not resolve');
                }
            });
            run(['node', 'cli', 'build'], deps);
            expect(calls.build).to.deep.equal([{config: {include: {}}}]);
            expect(calls.log).to.deep.equal([`Building a custom exifreader bundle at ${DIST_PATH}`]);
            expect(calls.exit).to.deep.equal([]);
        });

        it('falls back to package.json when EXIFREADER_CUSTOM_BUILD is empty', () => {
            const config = {include: {jpeg: true}};
            const {deps, calls} = makeDeps({env: {EXIFREADER_CUSTOM_BUILD: ''}, resolveConfig: () => config});
            run(['node', 'cli', 'build'], deps);
            expect(calls.build).to.deep.equal([{config}]);
        });

        it('errors and does not build when EXIFREADER_CUSTOM_BUILD is not valid JSON', () => {
            const {deps, calls} = makeDeps({env: {EXIFREADER_CUSTOM_BUILD: '{include'}});
            run(['node', 'cli', 'build'], deps);
            expect(calls.build).to.deep.equal([]);
            expect(calls.exit).to.deep.equal([1]);
            expect(calls.error.join('')).to.contain('EXIFREADER_CUSTOM_BUILD is not valid JSON');
            expect(calls.error.join('')).to.contain('for example {"include": {"jpeg": true}}, or unset it.');
        });

        it('errors and does not build when EXIFREADER_CUSTOM_BUILD is not a JSON object', () => {
            const {deps, calls} = makeDeps({env: {EXIFREADER_CUSTOM_BUILD: 'null'}});
            run(['node', 'cli', 'build'], deps);
            expect(calls.build).to.deep.equal([]);
            expect(calls.exit).to.deep.equal([1]);
            expect(calls.error.join('')).to.contain('EXIFREADER_CUSTOM_BUILD');
        });

        it('errors and does not build when EXIFREADER_CUSTOM_BUILD has no include or exclude section', () => {
            const {deps, calls} = makeDeps({env: {EXIFREADER_CUSTOM_BUILD: '{"exifreader":{"include":{"jpeg":true}}}'}});
            run(['node', 'cli', 'build'], deps);
            expect(calls.build).to.deep.equal([]);
            expect(calls.exit).to.deep.equal([1]);
            expect(calls.error.join('')).to.contain('EXIFREADER_CUSTOM_BUILD must hold a JSON object with an "include" or "exclude" section');
        });

        it('builds from an EXIFREADER_CUSTOM_BUILD with only an exclude section', () => {
            const {deps, calls} = makeDeps({env: {EXIFREADER_CUSTOM_BUILD: '{"exclude":{"xmp":true}}'}});
            run(['node', 'cli', 'build'], deps);
            expect(calls.build).to.deep.equal([{config: {exclude: {xmp: true}}}]);
            expect(calls.exit).to.deep.equal([]);
        });

        describe('--config', () => {
            it('builds from the file config over the env var and package.json', () => {
                const config = {include: {png: true}};
                const {deps, calls} = makeDeps({
                    env: {EXIFREADER_CUSTOM_BUILD: '{"include":{"jpeg":true}}'},
                    resolveConfig: () => {
                        throw new Error('should not resolve');
                    },
                    readConfigFile: () => config
                });
                run(['node', 'cli', 'build', '--config', 'x.json'], deps);
                expect(calls.build).to.deep.equal([{config}]);
                expect(calls.log).to.deep.equal([`Building a custom exifreader bundle at ${DIST_PATH}`]);
                expect(calls.exit).to.deep.equal([]);
            });

            it('resolves a relative path against the working directory', () => {
                const {deps, calls} = makeDeps({readConfigFile: (filePath) => {
                    calls.readConfigFile.push(filePath);
                    return {include: {}};
                }});
                run(['node', 'cli', 'build', '--config=conf/x.json'], deps);
                expect(calls.readConfigFile).to.deep.equal([path.resolve(PROJECT_DIR, 'conf', 'x.json')]);
            });

            it('uses an absolute path as it is', () => {
                const absolutePath = path.resolve('/elsewhere/x.json');
                const {deps, calls} = makeDeps({readConfigFile: (filePath) => {
                    calls.readConfigFile.push(filePath);
                    return {include: {}};
                }});
                run(['node', 'cli', 'build', '--config', absolutePath], deps);
                expect(calls.readConfigFile).to.deep.equal([absolutePath]);
            });

            it('errors, names the path and does not build when the file cannot be read', () => {
                const {deps, calls} = makeDeps({readConfigFile: () => {
                    throw new Error('ENOENT: no such file');
                }});
                run(['node', 'cli', 'build', '--config', 'x.json'], deps);
                expect(calls.build).to.deep.equal([]);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.error.join('')).to.contain(path.resolve(PROJECT_DIR, 'x.json'));
                expect(calls.error.join('')).to.contain('ENOENT: no such file');
            });

            [null, [], 5, 'include', {}, {includes: {jpeg: true}}, {exifreader: {include: {jpeg: true}}}].forEach((value) => {
                it(`errors, names the path and does not build when the file holds ${JSON.stringify(value)}`, () => {
                    const {deps, calls} = makeDeps({readConfigFile: () => value});
                    run(['node', 'cli', 'build', '--config', 'x.json'], deps);
                    expect(calls.build).to.deep.equal([]);
                    expect(calls.exit).to.deep.equal([1]);
                    expect(calls.error.join('')).to.contain(path.resolve(PROJECT_DIR, 'x.json'));
                    expect(calls.error.join('')).to.contain('for example {"include": {"jpeg": true}}.');
                });
            });

            it('errors and does not build when --config has no value', () => {
                const {deps, calls} = makeDeps({readConfigFile: () => {
                    throw new Error('should not read');
                }});
                run(['node', 'cli', 'build', '--config'], deps);
                expect(calls.build).to.deep.equal([]);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.error.join('')).to.contain('--config needs a path');
            });
        });

        describe('--check', () => {
            const config = {include: {jpeg: true}};

            it('exits 0 when no config is found', () => {
                const {deps, calls} = makeDeps();
                run(['node', 'cli', 'build', '--check'], deps);
                expect(calls.exit).to.deep.equal([0]);
                expect(calls.error).to.deep.equal([]);
                expect(calls.log.join('')).to.contain('nothing to check');
                expect(calls.build).to.deep.equal([]);
            });

            it('exits 0 when the marker matches, reading it from the installed dist directory', () => {
                const {deps, calls} = makeDeps({
                    resolveConfig: () => config,
                    readMarker: (distDir) => {
                        calls.readMarker.push(distDir);
                        return {configHash: configHash(config), version: '1.2.3'};
                    }
                });
                run(['node', 'cli', 'build', '--check'], deps);
                expect(calls.readMarker).to.deep.equal([DIST_DIR]);
                expect(calls.exit).to.deep.equal([0]);
                expect(calls.error).to.deep.equal([]);
                expect(calls.log.join('')).to.contain('up to date');
                expect(calls.log.join('')).to.contain(DIST_PATH);
                expect(calls.build).to.deep.equal([]);
            });

            it('exits 1 naming the stock bundle when there is no marker', () => {
                const {deps, calls} = makeDeps({resolveConfig: () => config});
                run(['node', 'cli', 'build', '--check'], deps);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.error.join('')).to.contain('stock');
                expect(calls.error.join('')).to.contain(DIST_PATH);
                expect(calls.error.join('')).to.contain('npx exifreader build');
                expect(calls.build).to.deep.equal([]);
            });

            it('exits 1 when the marker has a different config hash', () => {
                const {deps, calls} = makeDeps({
                    resolveConfig: () => config,
                    readMarker: () => ({configHash: configHash({include: {png: true}}), version: '1.2.3'})
                });
                run(['node', 'cli', 'build', '--check'], deps);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.error.join('')).to.contain('different configuration');
                expect(calls.error.join('')).to.contain(DIST_PATH);
                expect(calls.error.join('')).to.contain('npx exifreader build');
                expect(calls.build).to.deep.equal([]);
            });

            it('exits 1 when the marker has a different version', () => {
                const {deps, calls} = makeDeps({
                    resolveConfig: () => config,
                    readMarker: () => ({configHash: configHash(config), version: '1.2.2'})
                });
                run(['node', 'cli', 'build', '--check'], deps);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.error.join('')).to.contain('different configuration');
                expect(calls.build).to.deep.equal([]);
            });

            it('checks against the --config file', () => {
                const {deps, calls} = makeDeps({
                    readConfigFile: () => config,
                    readMarker: () => ({configHash: configHash(config), version: '1.2.3'})
                });
                run(['node', 'cli', 'build', '--check', '--config', 'x.json'], deps);
                expect(calls.exit).to.deep.equal([0]);
            });

            it('exits 1 when EXIFREADER_CUSTOM_BUILD is not a JSON object', () => {
                const {deps, calls} = makeDeps({env: {EXIFREADER_CUSTOM_BUILD: 'null'}});
                run(['node', 'cli', 'build', '--check'], deps);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.build).to.deep.equal([]);
            });

            it('does not print the shared-install warning', () => {
                const {deps, calls} = makeDeps({
                    resolveConfig: () => config,
                    checkLocalInstall: () => ({ok: true, distPath: DIST_PATH, shared: true})
                });
                run(['node', 'cli', 'build', '--check'], deps);
                expect(calls.error.join('')).to.not.contain('shared');
            });

            it('errors when combined with --if-needed', () => {
                const {deps, calls} = makeDeps({resolveConfig: () => config});
                run(['node', 'cli', 'build', '--check', '--if-needed'], deps);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.error.join('')).to.contain('--check and --if-needed');
                expect(calls.build).to.deep.equal([]);
            });
        });

        describe('--if-needed', () => {
            const config = {include: {jpeg: true}};

            it('skips the build when the marker matches', () => {
                const {deps, calls} = makeDeps({
                    resolveConfig: () => config,
                    readMarker: (distDir) => {
                        calls.readMarker.push(distDir);
                        return {configHash: configHash(config), version: '1.2.3'};
                    }
                });
                run(['node', 'cli', 'build', '--if-needed'], deps);
                expect(calls.readMarker).to.deep.equal([DIST_DIR]);
                expect(calls.build).to.deep.equal([]);
                expect(calls.exit).to.deep.equal([]);
                expect(calls.log.join('')).to.contain('up to date');
            });

            it('builds when there is no marker', () => {
                const {deps, calls} = makeDeps({resolveConfig: () => config});
                run(['node', 'cli', 'build', '--if-needed'], deps);
                expect(calls.build).to.deep.equal([{config}]);
            });

            it('builds when the marker is stale', () => {
                const {deps, calls} = makeDeps({
                    resolveConfig: () => config,
                    readMarker: () => ({configHash: configHash(config), version: '1.2.2'})
                });
                run(['node', 'cli', 'build', '--if-needed'], deps);
                expect(calls.build).to.deep.equal([{config}]);
            });

            it('errors like a plain build when no config is found', () => {
                const {deps, calls} = makeDeps();
                run(['node', 'cli', 'build', '--if-needed'], deps);
                expect(calls.build).to.deep.equal([]);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.error.join('')).to.contain('No ExifReader custom build configuration found');
            });

            it('does not print the shared-install warning when no build runs', () => {
                const {deps, calls} = makeDeps({
                    resolveConfig: () => config,
                    checkLocalInstall: () => ({ok: true, distPath: DIST_PATH, shared: true}),
                    readMarker: () => ({configHash: configHash(config), version: '1.2.3'})
                });
                run(['node', 'cli', 'build', '--if-needed'], deps);
                expect(calls.error).to.deep.equal([]);
            });
        });

        describe('shared install warning', () => {
            it('warns, naming the dist path, before building into a shared install', () => {
                const {deps, calls} = makeDeps({
                    resolveConfig: () => ({include: {}}),
                    checkLocalInstall: () => ({ok: true, distPath: DIST_PATH, shared: true})
                });
                run(['node', 'cli', 'build'], deps);
                expect(calls.error).to.have.lengthOf(1);
                expect(calls.error[0]).to.contain(DIST_PATH);
                expect(calls.error[0]).to.contain('last build wins');
                expect(calls.output.map((entry) => entry.stream)).to.deep.equal(['error', 'log', 'build']);
            });

            it('does not warn when the install is not shared', () => {
                const {deps, calls} = makeDeps({resolveConfig: () => ({include: {}})});
                run(['node', 'cli', 'build'], deps);
                expect(calls.error).to.deep.equal([]);
            });
        });

        it('errors and does not build when exifreader is not a local install', () => {
            const {deps, calls} = makeDeps({checkLocalInstall: () => ({ok: false, message: 'install first'})});
            run(['node', 'cli', 'build'], deps);
            expect(calls.build).to.deep.equal([]);
            expect(calls.error).to.deep.equal(['install first']);
            expect(calls.exit).to.deep.equal([1]);
        });

        it('errors and does not build when no config is found', () => {
            const {deps, calls} = makeDeps({resolveConfig: () => false});
            run(['node', 'cli', 'build'], deps);
            expect(calls.build).to.deep.equal([]);
            expect(calls.exit).to.deep.equal([1]);
            expect(calls.error.join('')).to.contain('exifreader');
        });

        it('prints help and exits 0 for --help', () => {
            const {deps, calls} = makeDeps();
            run(['node', 'cli', '--help'], deps);
            expect(calls.exit).to.deep.equal([0]);
            expect(calls.log.join('')).to.contain('build');
        });

        it('prints help and exits 1 for no args', () => {
            const {deps, calls} = makeDeps();
            run(['node', 'cli'], deps);
            expect(calls.exit).to.deep.equal([1]);
        });

        it('prints the version and exits 0', () => {
            const {deps, calls} = makeDeps();
            run(['node', 'cli', '--version'], deps);
            expect(calls.log).to.deep.equal(['1.2.3']);
            expect(calls.exit).to.deep.equal([0]);
        });

        it('errors on an unknown command', () => {
            const {deps, calls} = makeDeps();
            run(['node', 'cli', 'frobnicate'], deps);
            expect(calls.exit).to.deep.equal([1]);
            expect(calls.error.join('')).to.contain('frobnicate');
        });

        it('shows help without an unknown-command error for an unrecognized flag', () => {
            const {deps, calls} = makeDeps();
            run(['node', 'cli', '--frobnicate'], deps);
            expect(calls.error).to.deep.equal([]);
            expect(calls.log.join('')).to.contain('build');
            expect(calls.exit).to.deep.equal([1]);
        });
    });

    describe('checkLocalInstall', () => {
        it('is ok when the resolved exifreader is the running copy', () => {
            const result = checkLocalInstall('/proj', {
                resolve: () => '/proj/node_modules/exifreader/package.json',
                realpath: (p) => p,
                rootDir: '/proj/node_modules/exifreader',
                exists: () => false,
                isPnp: false
            });
            expect(result.ok).to.equal(true);
            expect(result.distPath).to.contain('exif-reader.js');
        });

        describe('shared', () => {
            const root = path.resolve('/repo');
            const app = path.join(root, 'packages', 'app');
            const hoisted = path.join(root, 'node_modules', 'exifreader');

            it('is true for a hoisted workspace install', () => {
                const result = checkLocalInstall(app, {
                    resolve: () => path.join(hoisted, 'package.json'),
                    realpath: realpathOf([hoisted]),
                    rootDir: hoisted,
                    exists: existsOf([path.join(app, 'package.json'), path.join(root, 'package.json')]),
                    isPnp: false
                });
                expect(result).to.deep.equal({ok: true, distPath: path.join(hoisted, 'dist', 'exif-reader.js'), shared: true});
            });

            it('is true for a hoisted workspace install run from a subdirectory of the package', () => {
                const result = checkLocalInstall(path.join(app, 'src'), {
                    resolve: () => path.join(hoisted, 'package.json'),
                    realpath: realpathOf([hoisted]),
                    rootDir: hoisted,
                    exists: existsOf([path.join(app, 'package.json'), path.join(root, 'package.json')]),
                    isPnp: false
                });
                expect(result.shared).to.equal(true);
            });

            it('is true for a pnpm workspace package, whose store copy is at the workspace root', () => {
                const store = path.join(root, 'node_modules', '.pnpm', 'exifreader@1.2.3', 'node_modules', 'exifreader');
                const leaf = path.join(app, 'node_modules', 'exifreader');
                const result = checkLocalInstall(app, {
                    resolve: () => path.join(store, 'package.json'),
                    realpath: realpathOf([store], {[leaf]: store}),
                    rootDir: store,
                    exists: existsOf([path.join(app, 'package.json'), path.join(root, 'package.json')]),
                    isPnp: false
                });
                expect(result.ok).to.equal(true);
                expect(result.shared).to.equal(true);
            });

            it('is false for a single-package pnpm project', () => {
                const store = path.join(root, 'node_modules', '.pnpm', 'exifreader@1.2.3', 'node_modules', 'exifreader');
                const link = path.join(root, 'node_modules', 'exifreader');
                const result = checkLocalInstall(root, {
                    resolve: () => path.join(store, 'package.json'),
                    realpath: realpathOf([store], {[link]: store}),
                    rootDir: store,
                    exists: existsOf([path.join(root, 'package.json')]),
                    isPnp: false
                });
                expect(result.ok).to.equal(true);
                expect(result.shared).to.equal(false);
            });

            it('is false when the working directory is reached through a symlink', () => {
                const linkedRoot = path.resolve('/linked');
                const result = checkLocalInstall(linkedRoot, {
                    resolve: () => path.join(hoisted, 'package.json'),
                    realpath: realpathOf([hoisted], {[path.join(linkedRoot, 'node_modules')]: path.join(root, 'node_modules')}),
                    rootDir: hoisted,
                    exists: existsOf([path.join(linkedRoot, 'package.json')]),
                    isPnp: false
                });
                expect(result.shared).to.equal(false);
            });

            it('is false for a project whose node_modules is a symlink to another directory', () => {
                const cache = path.resolve('/cache/node_modules');
                const cached = path.join(cache, 'exifreader');
                const result = checkLocalInstall(root, {
                    resolve: () => path.join(cached, 'package.json'),
                    realpath: realpathOf([cached], {[path.join(root, 'node_modules')]: cache}),
                    rootDir: cached,
                    exists: existsOf([path.join(root, 'package.json')]),
                    isPnp: false
                });
                expect(result.shared).to.equal(false);
            });

            it('is false for a project at the filesystem root', () => {
                const fsRoot = path.resolve('/');
                const installed = path.join(fsRoot, 'node_modules', 'exifreader');
                const result = checkLocalInstall(fsRoot, {
                    resolve: () => path.join(installed, 'package.json'),
                    realpath: realpathOf([installed, path.join(fsRoot, 'node_modules')]),
                    rootDir: installed,
                    exists: existsOf([path.join(fsRoot, 'package.json')]),
                    isPnp: false
                });
                expect(result.shared).to.equal(false);
            });

            it('is true for an install in a sibling of node_modules whose name starts with node_modules', () => {
                const sibling = path.join(root, 'node_modules-cache', 'exifreader');
                const result = checkLocalInstall(root, {
                    resolve: () => path.join(sibling, 'package.json'),
                    realpath: realpathOf([sibling]),
                    rootDir: sibling,
                    exists: existsOf([path.join(root, 'package.json')]),
                    isPnp: false
                });
                expect(result.shared).to.equal(true);
            });

            it('is false for a plain project', () => {
                const result = checkLocalInstall(root, {
                    resolve: () => path.join(hoisted, 'package.json'),
                    realpath: realpathOf([hoisted]),
                    rootDir: hoisted,
                    exists: existsOf([path.join(root, 'package.json')]),
                    isPnp: false
                });
                expect(result.shared).to.equal(false);
            });

            it('is false for a plain project run from a subdirectory', () => {
                const result = checkLocalInstall(path.join(root, 'src', 'lib'), {
                    resolve: () => path.join(hoisted, 'package.json'),
                    realpath: realpathOf([hoisted]),
                    rootDir: hoisted,
                    exists: existsOf([path.join(root, 'package.json')]),
                    isPnp: false
                });
                expect(result.shared).to.equal(false);
            });

            it('is false when there is no package.json above the working directory', () => {
                const result = checkLocalInstall(app, {
                    resolve: () => path.join(hoisted, 'package.json'),
                    realpath: realpathOf([hoisted]),
                    rootDir: hoisted,
                    exists: () => false,
                    isPnp: false
                });
                expect(result.ok).to.equal(true);
                expect(result.shared).to.equal(false);
            });

            function existsOf(files) {
                return (file) => files.includes(file);
            }

            function realpathOf(existing, links) {
                return (target) => {
                    if (links && links[target]) {
                        return links[target];
                    }
                    if (existing.includes(target)) {
                        return target;
                    }
                    throw new Error(`ENOENT: ${target}`);
                };
            }
        });

        it('reports not-installed when resolution fails', () => {
            const result = checkLocalInstall('/proj', {resolve: () => {
                throw new Error('not found');
            }, isPnp: false});
            expect(result.ok).to.equal(false);
            expect(result.message.toLowerCase()).to.contain('install');
        });

        it('gives Plug\'n\'Play guidance when running under PnP', () => {
            const result = checkLocalInstall('/proj', {resolve: () => {
                throw new Error('not found');
            }, isPnp: true});
            expect(result.ok).to.equal(false);
            expect(result.message).to.contain('nodeLinker');
        });

        it('reports a mismatch when a different copy is running', () => {
            const result = checkLocalInstall('/proj', {
                resolve: () => '/cache/exifreader/package.json',
                realpath: (p) => p,
                rootDir: '/proj/node_modules/exifreader',
                isPnp: false
            });
            expect(result.ok).to.equal(false);
            expect(result.message.toLowerCase()).to.contain('different');
        });

        it('uses the real resolver with no overrides (exifreader is not a dependency of its own repo)', () => {
            const result = checkLocalInstall(process.cwd());
            expect(result.ok).to.equal(false);
            expect(result.message).to.be.a('string');
        });
    });

    describe('readConfigFile', () => {
        let directory;

        beforeEach(() => {
            directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-cli-'));
        });

        afterEach(() => {
            fs.rmSync(directory, {recursive: true, force: true});
        });

        it('reads a JSON file', () => {
            const filePath = path.join(directory, 'config.json');
            fs.writeFileSync(filePath, '{"include": {"jpeg": true}}');
            expect(readConfigFile(filePath)).to.deep.equal({include: {jpeg: true}});
        });

        it('reads a JSON file that starts with a UTF-8 byte order mark', () => {
            const filePath = path.join(directory, 'config.json');
            fs.writeFileSync(filePath, '\uFEFF{"include": {"jpeg": true}}', 'utf8');
            expect(readConfigFile(filePath)).to.deep.equal({include: {jpeg: true}});
        });

        it('throws for a missing file', () => {
            expect(() => readConfigFile(path.join(directory, 'missing.json'))).to.throw();
        });

        it('throws for invalid JSON', () => {
            const filePath = path.join(directory, 'config.json');
            fs.writeFileSync(filePath, '{include');
            expect(() => readConfigFile(filePath)).to.throw(SyntaxError);
        });
    });

    function makeDeps(overrides) {
        const calls = {build: [], log: [], error: [], exit: [], readConfigFile: [], readMarker: [], output: []};
        const deps = Object.assign({
            cwd: () => PROJECT_DIR,
            env: {},
            version: () => '1.2.3',
            resolveConfig: () => false,
            readConfigFile: () => {
                throw new Error('readConfigFile not stubbed');
            },
            readMarker: () => undefined,
            checkLocalInstall: () => ({ok: true, distPath: DIST_PATH, shared: false}),
            build: (options) => record('build', options),
            log: (message) => record('log', message),
            error: (message) => record('error', message),
            exit: (code) => record('exit', code)
        }, overrides);
        return {deps, calls};

        function record(stream, value) {
            calls[stream].push(value);
            calls.output.push({stream, value});
        }
    }
});
