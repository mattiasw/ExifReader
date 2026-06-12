/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {parseArgs, run, checkLocalInstall} from '../../bin/cli.js';

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
    });

    describe('run', () => {
        it('builds with the resolved config', () => {
            const config = {include: {jpeg: true}};
            const {deps, calls} = makeDeps({resolveConfig: () => config});
            run(['node', 'cli', 'build'], deps);
            expect(calls.build).to.deep.equal([{config}]);
            expect(calls.exit).to.deep.equal([]);
        });

        it('respects a preset EXIFREADER_CUSTOM_BUILD env var without resolving', () => {
            const {deps, calls} = makeDeps({
                env: {EXIFREADER_CUSTOM_BUILD: '{"include":{}}'},
                resolveConfig: () => {
                    throw new Error('should not resolve');
                }
            });
            run(['node', 'cli', 'build'], deps);
            expect(calls.build).to.deep.equal([undefined]);
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
                isPnp: false
            });
            expect(result.ok).to.equal(true);
            expect(result.distPath).to.contain('exif-reader.js');
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

    function makeDeps(overrides) {
        const calls = {build: [], log: [], error: [], exit: []};
        const deps = Object.assign({
            cwd: () => '/proj',
            env: {},
            version: () => '1.2.3',
            resolveConfig: () => false,
            checkLocalInstall: () => ({ok: true, distPath: '/proj/node_modules/exifreader/dist/exif-reader.js'}),
            build: (options) => calls.build.push(options),
            log: (message) => calls.log.push(message),
            error: (message) => calls.error.push(message),
            exit: (code) => calls.exit.push(code)
        }, overrides);
        return {deps, calls};
    }
});
