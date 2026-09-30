/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {parseArgs, run, checkLocalInstall, readConfigFile} from '../../bin/cli.js';
import {configHash} from '../../bin/custom-build-marker.js';
import {getConsoleWarnSpy} from './test-utils.js';

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

        it('has no analyze flags or paths by default', () => {
            expect(parseArgs(['node', 'cli', 'build'])).to.deep.include({write: false, auto: false, verify: false, paths: []});
        });

        it('recognizes --write, --auto and --verify', () => {
            expect(parseArgs(['node', 'cli', 'analyze', '--write'])).to.include({write: true, auto: false, verify: false});
            expect(parseArgs(['node', 'cli', 'build', '--auto'])).to.include({write: false, auto: true, verify: false});
            expect(parseArgs(['node', 'cli', 'build', '--verify'])).to.include({write: false, auto: false, verify: true});
        });

        it('takes the arguments after the command as paths', () => {
            expect(parseArgs(['node', 'cli', 'build', '--auto', 'a.jpg', '--verify', 'samples', '--config', 'x.json'])).to.deep.include({
                command: 'build',
                paths: ['a.jpg', 'samples']
            });
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

    /* eslint-disable no-console */
    describe('images', () => {
        const RESULTS = {
            jpeg: {file: {FileType: {value: 'jpeg'}}, exif: {DateTime: {value: 1}}},
            png: {file: {FileType: {value: 'png'}}, xmp: {}}
        };
        const CONFIG = {include: {jpeg: true, png: true, exif: ['DateTime'], xmp: true}};
        const CONFIG_JSON = JSON.stringify(CONFIG, null, 2);
        let directory;

        beforeEach(() => {
            directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-cli-')));
            fs.mkdirSync(path.join(directory, 'samples', 'nested'), {recursive: true});
            fs.writeFileSync(path.join(directory, 'samples', 'a.jpg'), 'jpeg');
            fs.writeFileSync(path.join(directory, 'samples', 'nested', 'b.png'), 'png');
        });

        afterEach(() => {
            fs.rmSync(directory, {recursive: true, force: true});
        });

        describe('analyze', () => {
            it('prints only the configuration on stdout and the summary, warnings and hint on stderr', async () => {
                const {deps, calls} = imageDeps({checkLocalInstall: () => {
                    throw new Error('should not check the install');
                }});
                await run(['node', 'cli', 'analyze', 'samples'], deps);
                expect(calls.log).to.deep.equal([CONFIG_JSON]);
                expect(calls.error).to.deep.equal([
                    'Analyzed 2 images (jpeg, png).',
                    'No TIFF, HEIC, AVIF, JPEG XL, WebP or GIF images were found, so the build will not read those formats.',
                    'Tags and metadata groups that do not appear in these images are left out of the build, so pass a '
                        + 'sample of every kind of image your app reads, all in one run.',
                    'To use it, set it as the "exifreader" section of your package.json and run "npx exifreader build", '
                        + 'or save it to a file and run "npx exifreader build --config <file>". Run this command again '
                        + 'with --write to update package.json for you.'
                ]);
                expect(calls.exit).to.deep.equal([]);
                expect(calls.build).to.deep.equal([]);
            });

            it('says "1 image" for a single image', async () => {
                const {deps, calls} = imageDeps();
                await run(['node', 'cli', 'analyze', 'samples/a.jpg'], deps);
                expect(calls.error[0]).to.equal('Analyzed 1 image (jpeg).');
            });

            it('parses the files under the given paths, resolved against the working directory, with the DOM parser', async () => {
                const domParser = {};
                const {deps, calls, parsed} = imageDeps({resolveDomParser: (cwd) => {
                    calls.resolveDomParser.push(cwd);
                    return domParser;
                }});
                await run(['node', 'cli', 'analyze', 'samples/nested', path.join(directory, 'samples', 'a.jpg')], deps);
                expect(parsed.map((entry) => entry.data)).to.deep.equal(['jpeg', 'png']);
                expect(parsed.map((entry) => entry.options)).to.deep.equal([
                    {expanded: true, async: true, domParser},
                    {expanded: true, async: true, domParser}
                ]);
                expect(calls.resolveDomParser).to.deep.equal([directory]);
            });

            it('errors when no paths are given', async () => {
                const {deps, calls} = imageDeps();
                await run(['node', 'cli', 'analyze'], deps);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.error).to.deep.equal(['analyze needs the image files or directories to read, for example '
                    + '"npx exifreader analyze ./samples".']);
                expect(calls.log).to.deep.equal([]);
            });

            it('errors naming a path that does not exist', async () => {
                const {deps, calls, parsed} = imageDeps();
                await run(['node', 'cli', 'analyze', 'sampels'], deps);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.error).to.have.lengthOf(1);
                expect(calls.error[0]).to.contain(`Could not read ${path.join(directory, 'sampels')}: ENOENT`);
                expect(parsed).to.deep.equal([]);
            });

            it('names an entry of a directory that cannot be read and analyzes the rest', async () => {
                const broken = path.join(directory, 'samples', 'broken.jpg');
                fs.symlinkSync(path.join(directory, 'nowhere'), broken);
                const {deps, calls} = imageDeps();
                await run(['node', 'cli', 'analyze', 'samples'], deps);
                expect(calls.error[0].startsWith(`Skipped ${broken}: ENOENT`)).to.equal(true);
                expect(calls.log).to.deep.equal([CONFIG_JSON]);
                expect(calls.exit).to.deep.equal([]);
            });

            it('names each skipped file and still prints the configuration of the rest', async () => {
                fs.writeFileSync(path.join(directory, 'samples', 'notes.txt'), 'text');
                const {deps, calls} = imageDeps();
                await run(['node', 'cli', 'analyze', 'samples'], deps);
                expect(calls.error[0]).to.equal(`Skipped ${path.join(directory, 'samples', 'notes.txt')}: Invalid image format`);
                expect(calls.log).to.deep.equal([CONFIG_JSON]);
                expect(calls.exit).to.deep.equal([]);
            });

            it('errors when none of the files can be read as an image', async () => {
                fs.rmSync(path.join(directory, 'samples'), {recursive: true});
                fs.mkdirSync(path.join(directory, 'samples'));
                fs.writeFileSync(path.join(directory, 'samples', 'notes.txt'), 'text');
                const {deps, calls} = imageDeps();
                await run(['node', 'cli', 'analyze', 'samples'], deps);
                expect(calls.error).to.deep.equal([
                    `Skipped ${path.join(directory, 'samples', 'notes.txt')}: Invalid image format`,
                    'None of the given files could be read as an image, so there is nothing to analyze.'
                ]);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.log).to.deep.equal([]);
            });

            it('errors when the given directory holds no files', async () => {
                fs.mkdirSync(path.join(directory, 'empty'));
                const {deps, calls, parsed} = imageDeps();
                await run(['node', 'cli', 'analyze', 'empty'], deps);
                expect(calls.error).to.deep.equal(['No files were found in empty.']);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.log).to.deep.equal([]);
                expect(parsed).to.deep.equal([]);
            });

            it('errors when the parser cannot be loaded', async () => {
                const {deps, calls} = imageDeps({loadFullParser: () => Promise.reject(new Error('Cannot find module'))});
                await run(['node', 'cli', 'analyze', 'samples'], deps);
                expect(calls.error).to.deep.equal(['Cannot find module']);
                expect(calls.exit).to.deep.equal([1]);
            });

            it('says once that XMP content was not read without a DOM parser, and silences the parser warnings', async () => {
                const warnSpy = getConsoleWarnSpy();
                try {
                    const {deps, calls} = imageDeps({resolveDomParser: () => undefined});
                    await run(['node', 'cli', 'analyze', 'samples'], deps);
                    expect(calls.error[0]).to.equal('@xmldom/xmldom was not found, so the XMP content of the images was not read. '
                        + 'XMP is still included in the configuration when an image has it.');
                    expect(calls.log).to.deep.equal([CONFIG_JSON]);
                    expect(warnSpy.hasWarned).to.equal(false);
                    expect(console.warn).to.equal(warnSpy);
                } finally {
                    warnSpy.reset();
                }
            });

            it('does not silence console warnings when there is a DOM parser', async () => {
                const warnSpy = getConsoleWarnSpy();
                try {
                    const {deps, calls} = imageDeps({resolveDomParser: () => undefined});
                    deps.resolveDomParser = () => ({});
                    deps.loadFullParser = () => Promise.resolve({load: () => {
                        console.warn('parser warning');
                        return Promise.resolve(RESULTS.jpeg);
                    }});
                    await run(['node', 'cli', 'analyze', 'samples'], deps);
                    expect(calls.error.join('\n')).to.not.contain('xmldom');
                    expect(warnSpy.hasWarned).to.equal(true);
                } finally {
                    warnSpy.reset();
                }
            });

            describe('--write', () => {
                const packageJsonPath = () => path.join(directory, 'package.json');

                it('replaces the include section and says what it replaced', async () => {
                    fs.writeFileSync(packageJsonPath(), JSON.stringify({name: 'app', exifreader: {include: {png: true}}}, null, 4) + '\n');
                    const {deps, calls} = imageDeps();
                    await run(['node', 'cli', 'analyze', 'samples', '--write'], deps);
                    expect(fs.readFileSync(packageJsonPath(), 'utf8')).to.equal(JSON.stringify({name: 'app', exifreader: CONFIG}, null, 4) + '\n');
                    expect(calls.log).to.deep.equal([CONFIG_JSON]);
                    expect(calls.error.slice(-2)).to.deep.equal([
                        `Replaced {"include":{"png":true}} in the "exifreader" section of ${packageJsonPath()}.`,
                        'Run "npx exifreader build" to build it.'
                    ]);
                    expect(calls.error.join('\n')).to.not.contain('--write');
                    expect(calls.exit).to.deep.equal([]);
                });

                it('replaces an exclude section', async () => {
                    fs.writeFileSync(packageJsonPath(), JSON.stringify({exifreader: {exclude: {xmp: true}}}));
                    const {deps, calls} = imageDeps();
                    await run(['node', 'cli', 'analyze', 'samples', '--write'], deps);
                    expect(JSON.parse(fs.readFileSync(packageJsonPath(), 'utf8'))).to.deep.equal({exifreader: CONFIG});
                    expect(calls.error).to.include(`Replaced {"exclude":{"xmp":true}} in the "exifreader" section of ${packageJsonPath()}.`);
                });

                it('creates the exifreader section', async () => {
                    fs.writeFileSync(packageJsonPath(), JSON.stringify({name: 'app'}));
                    const {deps, calls} = imageDeps();
                    await run(['node', 'cli', 'analyze', 'samples', '--write'], deps);
                    expect(JSON.parse(fs.readFileSync(packageJsonPath(), 'utf8'))).to.deep.equal({name: 'app', exifreader: CONFIG});
                    expect(calls.error).to.include(`Added an "exifreader" section with this configuration to ${packageJsonPath()}.`);
                });

                it('adds include to an exifreader section without one', async () => {
                    fs.writeFileSync(packageJsonPath(), JSON.stringify({exifreader: {}}));
                    const {deps, calls} = imageDeps();
                    await run(['node', 'cli', 'analyze', 'samples', '--write'], deps);
                    expect(JSON.parse(fs.readFileSync(packageJsonPath(), 'utf8'))).to.deep.equal({exifreader: CONFIG});
                    expect(calls.error).to.include(`Added this configuration to the "exifreader" section of ${packageJsonPath()}.`);
                });

                it('writes to the nearest package.json above the working directory', async () => {
                    fs.writeFileSync(packageJsonPath(), JSON.stringify({name: 'app'}));
                    const {deps} = imageDeps({cwd: () => path.join(directory, 'samples')});
                    await run(['node', 'cli', 'analyze', '.', '--write'], deps);
                    expect(JSON.parse(fs.readFileSync(packageJsonPath(), 'utf8')).exifreader).to.deep.equal(CONFIG);
                });

                it('errors before reading any image when there is no package.json', async () => {
                    const {deps, calls, parsed} = imageDeps();
                    deps.fs = Object.assign({}, fs, {existsSync: () => false});
                    await run(['node', 'cli', 'analyze', 'samples', '--write'], deps);
                    expect(calls.exit).to.deep.equal([1]);
                    expect(calls.error).to.deep.equal([`No package.json found in ${directory} or any directory above it, so `
                        + 'there is nowhere to write the configuration. Run the command from your project, or leave out --write.']);
                    expect(calls.log).to.deep.equal([]);
                    expect(parsed).to.deep.equal([]);
                });

                it('errors naming the file when package.json is not valid JSON, and leaves it alone', async () => {
                    fs.writeFileSync(packageJsonPath(), '{name');
                    const {deps, calls} = imageDeps();
                    await run(['node', 'cli', 'analyze', 'samples', '--write'], deps);
                    expect(calls.exit).to.deep.equal([1]);
                    expect(calls.error[calls.error.length - 1]).to.contain(`Could not write the configuration to ${packageJsonPath()}: `);
                    expect(fs.readFileSync(packageJsonPath(), 'utf8')).to.equal('{name');
                });
            });
        });

        describe('build --auto', () => {
            it('builds the analyzed configuration and prints it first', async () => {
                const {deps, calls} = imageDeps({resolveConfig: () => {
                    throw new Error('should not resolve');
                }});
                await run(['node', 'cli', 'build', '--auto', 'samples'], deps);
                expect(calls.build).to.deep.equal([{config: CONFIG}]);
                expect(calls.log).to.deep.equal([CONFIG_JSON, `Building a custom exifreader bundle at ${DIST_PATH}`]);
                expect(calls.error[0]).to.equal('Analyzed 2 images (jpeg, png).');
                expect(calls.error.join('\n')).to.not.contain('--write');
                expect(calls.exit).to.deep.equal([]);
            });

            it('skips the build with --if-needed when the bundle was built from the analyzed configuration', async () => {
                const {deps, calls} = imageDeps({readMarker: () => ({configHash: configHash(CONFIG), version: '1.2.3'})});
                await run(['node', 'cli', 'build', '--auto', 'samples', '--if-needed'], deps);
                expect(calls.build).to.deep.equal([]);
                expect(calls.log).to.deep.equal([CONFIG_JSON, `The custom exifreader bundle at ${DIST_PATH} is up to date.`]);
                expect(calls.exit).to.deep.equal([]);
            });

            it('builds with --if-needed when the bundle was built from another configuration', async () => {
                const {deps, calls} = imageDeps({readMarker: () => ({configHash: configHash({include: {jpeg: true}}), version: '1.2.3'})});
                await run(['node', 'cli', 'build', '--auto', 'samples', '--if-needed'], deps);
                expect(calls.build).to.deep.equal([{config: CONFIG}]);
            });

            it('warns before building into a shared install', async () => {
                const {deps, calls} = imageDeps({checkLocalInstall: () => ({ok: true, distPath: DIST_PATH, shared: true})});
                await run(['node', 'cli', 'build', '--auto', 'samples'], deps);
                expect(calls.error.join('\n')).to.contain('last build wins');
                expect(calls.build).to.have.lengthOf(1);
            });

            it('does not build when exifreader is not a local install', () => {
                const {deps, calls, parsed} = imageDeps({checkLocalInstall: () => ({ok: false, message: 'install first'})});
                run(['node', 'cli', 'build', '--auto', 'samples'], deps);
                expect(calls.error).to.deep.equal(['install first']);
                expect(calls.exit).to.deep.equal([1]);
                expect(parsed).to.deep.equal([]);
            });

            it('does not build when none of the files can be read as an image', async () => {
                fs.writeFileSync(path.join(directory, 'notes.txt'), 'text');
                const {deps, calls} = imageDeps();
                await run(['node', 'cli', 'build', '--auto', 'notes.txt'], deps);
                expect(calls.build).to.deep.equal([]);
                expect(calls.exit).to.deep.equal([1]);
            });

            it('does not build when a path does not exist', () => {
                const {deps, calls, parsed} = imageDeps();
                run(['node', 'cli', 'build', '--auto', 'sampels'], deps);
                expect(calls.build).to.deep.equal([]);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.error.join('')).to.contain(path.join(directory, 'sampels'));
                expect(parsed).to.deep.equal([]);
            });

            it('errors instead of rejecting when the parser cannot be loaded', async () => {
                const {deps, calls} = imageDeps({loadFullParser: () => Promise.reject(new Error('Cannot find module'))});
                await run(['node', 'cli', 'build', '--auto', 'samples'], deps);
                expect(calls.error).to.deep.equal(['Cannot find module']);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.build).to.deep.equal([]);
            });

            it('errors instead of rejecting when the build fails', async () => {
                const {deps, calls} = imageDeps({build: () => {
                    throw new Error('webpack failed');
                }});
                await run(['node', 'cli', 'build', '--auto', 'samples'], deps);
                expect(calls.error[calls.error.length - 1]).to.equal('webpack failed');
                expect(calls.exit).to.deep.equal([1]);
            });
        });

        describe('rejected combinations', () => {
            [
                [['--auto', 'samples', '--config', 'x.json'], '--auto and --config cannot be used together. --auto builds the '
                    + 'configuration it derives from the images, so leave out --config.'],
                [['--auto', 'samples', '--check'], '--auto and --check cannot be used together. --check never builds, and '
                    + '--auto does not save the configuration it derives, so there is nothing for --check to compare against.'],
                [['--verify', 'samples', '--check'], '--verify and --check cannot be used together. To compare the installed '
                    + 'bundle with the full parser without rebuilding an up-to-date one, use --verify with --if-needed.'],
                [['--auto'], '--auto needs the image files or directories to read, for example "npx exifreader build --auto ./samples".'],
                [['--verify'], '--verify needs the image files or directories to read, for example "npx exifreader build --verify ./samples".'],
                [['--auto', '--verify'], '--auto needs the image files or directories to read, for example "npx exifreader build --auto ./samples".'],
                [['samples', 'more'], 'Unexpected argument: samples more. Image paths are only read with --auto or --verify, '
                    + 'for example "npx exifreader build --auto ./samples".'],
                [['--auto', 'samples', '--write'], '--write is an option of analyze, not build. To save the configuration, '
                    + 'run "npx exifreader analyze <paths...> --write", then "npx exifreader build".']
            ].forEach(([flags, message]) => {
                it(`errors for build ${flags.join(' ')} without reading or building anything`, () => {
                    const {deps, calls, parsed} = imageDeps({resolveConfig: () => ({include: {jpeg: true}}), readConfigFile: () => ({include: {jpeg: true}})});
                    const result = run(['node', 'cli', 'build'].concat(flags), deps);
                    expect(result).to.equal(undefined);
                    expect(calls.error).to.deep.equal([message]);
                    expect(calls.exit).to.deep.equal([1]);
                    expect(calls.build).to.deep.equal([]);
                    expect(parsed).to.deep.equal([]);
                });
            });
        });

        describe('build --verify', () => {
            it('builds, then logs that every image gave the same result', async () => {
                const {deps, calls} = imageDeps({resolveConfig: () => CONFIG});
                await run(['node', 'cli', 'build', '--verify', 'samples'], deps);
                expect(calls.build).to.deep.equal([{config: CONFIG}]);
                expect(calls.log).to.deep.equal([
                    `Building a custom exifreader bundle at ${DIST_PATH}`,
                    'All 2 images gave the same result with the custom build as with the full parser.'
                ]);
                expect(calls.error).to.deep.equal([]);
                expect(calls.exit).to.deep.equal([]);
                expect(calls.loadCustomParser).to.deep.equal([DIST_PATH]);
                expect(calls.output.map((entry) => entry.stream)).to.deep.equal(['log', 'build', 'loadCustomParser', 'log']);
            });

            it('says "The image" for a single image', async () => {
                const {deps, calls} = imageDeps({resolveConfig: () => CONFIG});
                await run(['node', 'cli', 'build', '--verify', 'samples/a.jpg'], deps);
                expect(calls.log[calls.log.length - 1]).to.equal('The image gave the same result with the custom build as with the full parser.');
            });

            it('compares both parsers with the same DOM parser, resolved from the working directory', async () => {
                const domParser = {};
                const {deps, calls, parsed, customParsed} = imageDeps({
                    resolveConfig: () => CONFIG,
                    resolveDomParser: (cwd) => {
                        calls.resolveDomParser.push(cwd);
                        return domParser;
                    }
                });
                await run(['node', 'cli', 'build', '--verify', 'samples/a.jpg'], deps);
                expect(calls.resolveDomParser).to.deep.equal([directory]);
                expect(parsed[0].options.domParser).to.equal(domParser);
                expect(customParsed[0].options.domParser).to.equal(domParser);
            });

            it('lists each file and difference and exits 1', async () => {
                const {deps, calls} = imageDeps({
                    resolveConfig: () => CONFIG,
                    customResults: {jpeg: {file: {FileType: {value: 'jpeg'}}, exif: {}}}
                });
                await run(['node', 'cli', 'build', '--verify', 'samples'], deps);
                expect(calls.error).to.deep.equal([
                    path.join(directory, 'samples', 'a.jpg'),
                    '  exif.DateTime: missing from the custom build',
                    '1 of 2 images gave a different result with the custom build than with the full parser.'
                ]);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.log).to.deep.equal([`Building a custom exifreader bundle at ${DIST_PATH}`]);
            });

            it('reports a custom build that cannot read an image', async () => {
                const {deps, calls} = imageDeps({resolveConfig: () => CONFIG, customResults: {jpeg: undefined}});
                await run(['node', 'cli', 'build', '--verify', 'samples/a.jpg'], deps);
                expect(calls.error).to.deep.equal([
                    path.join(directory, 'samples', 'a.jpg'),
                    '  the custom build failed: Invalid image format',
                    '1 of 1 image gave a different result with the custom build than with the full parser.'
                ]);
                expect(calls.exit).to.deep.equal([1]);
            });

            it('still verifies when --if-needed skipped the build', async () => {
                const {deps, calls} = imageDeps({
                    resolveConfig: () => CONFIG,
                    readMarker: () => ({configHash: configHash(CONFIG), version: '1.2.3'})
                });
                await run(['node', 'cli', 'build', '--verify', 'samples', '--if-needed'], deps);
                expect(calls.build).to.deep.equal([]);
                expect(calls.log).to.deep.equal([
                    `The custom exifreader bundle at ${DIST_PATH} is up to date.`,
                    'All 2 images gave the same result with the custom build as with the full parser.'
                ]);
            });

            it('verifies after an --auto build', async () => {
                const {deps, calls} = imageDeps();
                await run(['node', 'cli', 'build', '--auto', 'samples', '--verify'], deps);
                expect(calls.build).to.deep.equal([{config: CONFIG}]);
                expect(calls.log).to.deep.equal([
                    CONFIG_JSON,
                    `Building a custom exifreader bundle at ${DIST_PATH}`,
                    'All 2 images gave the same result with the custom build as with the full parser.'
                ]);
                expect(calls.exit).to.deep.equal([]);
            });

            it('names a file that is not an image once after an --auto build, and verifies only the analyzed images', async () => {
                fs.writeFileSync(path.join(directory, 'samples', 'notes.txt'), 'text');
                const {deps, calls, customParsed} = imageDeps();
                await run(['node', 'cli', 'build', '--auto', 'samples', '--verify'], deps);
                const skippedLine = `Skipped ${path.join(directory, 'samples', 'notes.txt')}: Invalid image format`;
                expect(calls.error.filter((line) => line === skippedLine)).to.have.lengthOf(1);
                expect(customParsed.map((entry) => entry.data)).to.deep.equal(['jpeg', 'png']);
                expect(calls.log[calls.log.length - 1]).to.equal('All 2 images gave the same result with the custom build as with the full parser.');
                expect(calls.exit).to.deep.equal([]);
            });

            it('reads the image paths from the working directory the command started in, even after the build changed it', async () => {
                let currentDirectory = directory;
                const elsewhere = path.join(directory, 'samples', 'nested');
                const {deps, calls, customParsed} = imageDeps({
                    cwd: () => currentDirectory,
                    resolveConfig: () => CONFIG,
                    build: (options) => {
                        calls.build.push(options);
                        currentDirectory = elsewhere;
                    },
                    resolveDomParser: (cwd) => {
                        calls.resolveDomParser.push(cwd);
                        return {};
                    }
                });
                await run(['node', 'cli', 'build', '--verify', 'samples'], deps);
                expect(calls.build).to.have.lengthOf(1);
                expect(customParsed.map((entry) => entry.data)).to.deep.equal(['jpeg', 'png']);
                expect(calls.resolveDomParser).to.deep.equal([directory]);
                expect(calls.exit).to.deep.equal([]);
            });

            it('errors before building when a path does not exist', () => {
                const {deps, calls} = imageDeps({resolveConfig: () => CONFIG});
                run(['node', 'cli', 'build', '--verify', 'sampels'], deps);
                expect(calls.build).to.deep.equal([]);
                expect(calls.exit).to.deep.equal([1]);
            });

            it('errors before building when the given directory holds no files', () => {
                fs.mkdirSync(path.join(directory, 'empty'));
                const {deps, calls} = imageDeps({resolveConfig: () => CONFIG});
                run(['node', 'cli', 'build', '--verify', 'empty'], deps);
                expect(calls.error).to.deep.equal(['No files were found in empty.']);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.build).to.deep.equal([]);
                expect(calls.log).to.deep.equal([]);
            });

            it('errors like a plain build when no configuration is found, without verifying', () => {
                const {deps, calls, parsed} = imageDeps();
                run(['node', 'cli', 'build', '--verify', 'samples'], deps);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.error.join('')).to.contain('No ExifReader custom build configuration found');
                expect(parsed).to.deep.equal([]);
            });

            it('errors when none of the files can be read as an image', async () => {
                fs.writeFileSync(path.join(directory, 'notes.txt'), 'text');
                const {deps, calls} = imageDeps({resolveConfig: () => CONFIG});
                await run(['node', 'cli', 'build', '--verify', 'notes.txt'], deps);
                expect(calls.error).to.deep.equal([
                    `Skipped ${path.join(directory, 'notes.txt')}: Invalid image format`,
                    'None of the given files could be read as an image, so nothing was verified.'
                ]);
                expect(calls.exit).to.deep.equal([1]);
                expect(calls.log).to.deep.equal([`Building a custom exifreader bundle at ${DIST_PATH}`]);
            });

            it('says once that XMP was compared at group level without a DOM parser, and silences the parser warnings', async () => {
                const warnSpy = getConsoleWarnSpy();
                try {
                    const {deps, calls} = imageDeps({resolveConfig: () => CONFIG, resolveDomParser: () => undefined});
                    await run(['node', 'cli', 'build', '--verify', 'samples'], deps);
                    expect(calls.error).to.deep.equal(['@xmldom/xmldom was not found, so XMP was compared at group level only.']);
                    expect(warnSpy.hasWarned).to.equal(false);
                    expect(console.warn).to.equal(warnSpy);
                } finally {
                    warnSpy.reset();
                }
            });

            it('restores console.warn when the comparison fails', async () => {
                const warnSpy = getConsoleWarnSpy();
                try {
                    const brokenResult = {};
                    Object.defineProperty(brokenResult, 'file', {enumerable: true, get: () => {
                        throw new Error('broken result');
                    }});
                    const {deps, calls} = imageDeps({
                        resolveConfig: () => CONFIG,
                        resolveDomParser: () => undefined,
                        customResults: {jpeg: brokenResult}
                    });
                    await run(['node', 'cli', 'build', '--verify', 'samples/a.jpg'], deps);
                    expect(calls.error[calls.error.length - 1]).to.equal('broken result');
                    expect(calls.exit).to.deep.equal([1]);
                    expect(console.warn).to.equal(warnSpy);
                } finally {
                    warnSpy.reset();
                }
            });
        });

        // Parsers that read a file's text as the key of a canned result. Without
        // a DOM parser they warn on the console like ExifReader does for XMP.
        function imageDeps(overrides) {
            overrides = Object.assign({}, overrides);
            const customResults = Object.assign({}, RESULTS, overrides.customResults);
            delete overrides.customResults;
            const parsed = [];
            const customParsed = [];
            const {deps, calls} = makeDeps(Object.assign({
                cwd: () => directory,
                loadFullParser: () => Promise.resolve(fakeParser(RESULTS, parsed)),
                loadCustomParser: (distPath) => {
                    calls.loadCustomParser.push(distPath);
                    calls.output.push({stream: 'loadCustomParser', value: distPath});
                    return fakeParser(customResults, customParsed);
                }
            }, overrides));
            calls.loadCustomParser = [];
            calls.resolveDomParser = [];
            return {deps, calls, parsed, customParsed};
        }

        function fakeParser(results, parsedLog) {
            return {
                load: (data, options) => {
                    parsedLog.push({data: data.toString(), options});
                    if (!options.domParser) {
                        console.warn('Warning: DOMParser is not available.');
                    }
                    const result = results[data.toString()];
                    return result ? Promise.resolve(result) : Promise.reject(new Error('Invalid image format'));
                }
            };
        }
    });

    /* eslint-enable no-console */

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
            fs,
            loadFullParser: () => Promise.reject(new Error('loadFullParser not stubbed')),
            loadCustomParser: () => {
                throw new Error('loadCustomParser not stubbed');
            },
            resolveDomParser: () => ({}),
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
