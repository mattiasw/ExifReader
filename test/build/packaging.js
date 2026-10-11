/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const {expect} = require('chai');
const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {pathToFileURL} = require('url');

const ROOT_PATH = path.join(__dirname, '..', '..');
const PACK_TIMEOUT_MS = 60000;

const API_SHAPE = {load: 'function', loadView: 'function', errors: 'object'};
const SPECIFIERS = [
    {specifier: 'exifreader', file: 'dist/exif-reader.js', shape: API_SHAPE},
    {specifier: 'exifreader/package.json', file: 'package.json', shape: {name: 'exifreader'}},
    {specifier: 'exifreader/src/exif-reader.js', file: 'src/exif-reader.js', shape: API_SHAPE},
    {specifier: 'exifreader/dist/exif-reader.js', file: 'dist/exif-reader.js', shape: API_SHAPE}
];
const BLOCKED_SPECIFIERS = ['exifreader/bin/cli.js', 'exifreader/src/composable/core.js'];
const NOT_EXPORTED_CODE = 'ERR_PACKAGE_PATH_NOT_EXPORTED';

describe('packaging', function () {
    this.timeout(PACK_TIMEOUT_MS);

    let tempRoot;
    let consumerDir;
    let installedDir;
    let packedFiles;

    // The tarball is extracted, not installed: npm install would reach for the
    // network and run postinstall on every commit.
    before(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-packaging-'));
        const pack = packTarball(tempRoot);
        packedFiles = pack.files;

        const projectDir = path.join(tempRoot, 'consumer');
        const nodeModulesDir = path.join(projectDir, 'node_modules');
        fs.mkdirSync(nodeModulesDir, {recursive: true});
        fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({private: true}));
        // A bare archive name: GNU tar reads a Windows drive path as a remote host.
        execFileSync('tar', ['-xzf', pack.tarballName, '-C', nodeModulesDir], {
            cwd: pack.directory,
            timeout: PACK_TIMEOUT_MS
        });
        fs.renameSync(path.join(nodeModulesDir, 'package'), path.join(nodeModulesDir, 'exifreader'));

        consumerDir = fs.realpathSync(projectDir);
        installedDir = path.join(consumerDir, 'node_modules', 'exifreader');
        fs.writeFileSync(path.join(consumerDir, 'consumer.cjs'), buildRequireScript());
        fs.writeFileSync(path.join(consumerDir, 'consumer.mjs'), buildImportScript());
    });

    after(() => {
        fs.rmSync(tempRoot, {recursive: true, force: true});
    });

    it('ships src/package.json and no custom build marker in the npm tarball', () => {
        expect(packedFiles).to.include('src/package.json');
        expect(packedFiles).to.not.include('dist/.exifreader-custom-build.json');
    });

    it('declares src as side-effect-free ES modules and nothing else', () => {
        const content = JSON.parse(fs.readFileSync(path.join(ROOT_PATH, 'src', 'package.json'), 'utf8'));
        expect(content).to.deep.equal({type: 'module', sideEffects: false});
    });

    describe('under require', () => {
        let results;

        before(() => {
            results = runConsumerScript('consumer.cjs');
        });

        SPECIFIERS.forEach(({specifier, file, shape}) => {
            it(`resolves and loads ${specifier}`, () => {
                const result = results.resolutions[specifier];
                expect(result.error, 'resolution error').to.equal(undefined);
                expect(result.resolved).to.equal(path.join(installedDir, file));
                expect(result.loaded).to.deep.equal(shape);
            });
        });

        BLOCKED_SPECIFIERS.forEach((specifier) => {
            it(`refuses ${specifier} as not exported`, () => {
                expect(results.blocked[specifier]).to.deep.equal({error: NOT_EXPORTED_CODE});
            });
        });

        it('lets a custom build find the copy the project installed', () => {
            expect(results.install).to.include({
                ok: true,
                distPath: path.join(installedDir, 'dist', 'exif-reader.js')
            });
        });
    });

    describe('under import', () => {
        let results;

        before(() => {
            results = runConsumerScript('consumer.mjs');
        });

        SPECIFIERS.forEach(({specifier, file, shape}) => {
            it(`resolves and loads ${specifier}`, () => {
                const result = results.resolutions[specifier];
                expect(result.error, 'resolution error').to.equal(undefined);
                expect(result.resolved).to.equal(pathToFileURL(path.join(installedDir, file)).href);
                expect(result.loaded).to.deep.equal(shape);
            });
        });

        BLOCKED_SPECIFIERS.forEach((specifier) => {
            it(`refuses ${specifier} as not exported`, () => {
                expect(results.blocked[specifier]).to.deep.equal({error: NOT_EXPORTED_CODE});
            });
        });

        it('imports exifreader statically as a default export', () => {
            expect(results.staticDefaultImport).to.deep.equal(API_SHAPE);
        });
    });

    // The throwaway cache and the destination go in as environment variables so
    // no path passes through a shell, and skipping scripts keeps stdout parseable
    // as JSON. Windows needs the .cmd name and a shell to run npm.
    function packTarball(directory) {
        const isWindows = process.platform === 'win32';
        const packDestination = path.join(directory, 'pack');
        fs.mkdirSync(packDestination);
        const output = execFileSync(
            isWindows ? 'npm.cmd' : 'npm',
            ['pack', '--json', '--ignore-scripts'],
            {
                cwd: ROOT_PATH,
                shell: isWindows,
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: PACK_TIMEOUT_MS,
                env: {
                    ...process.env,
                    npm_config_cache: path.join(directory, 'cache'),
                    npm_config_pack_destination: packDestination
                }
            }
        ).toString();
        const [packResult] = JSON.parse(output);
        return {
            directory: packDestination,
            tarballName: packResult.filename,
            files: packResult.files.map((file) => file.path)
        };
    }

    // With an exports map, self-reference beats the paths option, so every resolution
    // runs in a child process whose script lives in the consumer. A failing script
    // surfaces its stderr in the thrown error's message.
    function runConsumerScript(scriptName) {
        const output = execFileSync(process.execPath, [path.join(consumerDir, scriptName)], {
            cwd: consumerDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: PACK_TIMEOUT_MS
        });
        return JSON.parse(output.toString());
    }
});

function buildRequireScript() {
    return `
${summarizeSource()}
const resolutions = {};
${specifiersSource()}.forEach((specifier) => {
    try {
        const resolved = require.resolve(specifier);
        const loaded = require(specifier);
        resolutions[specifier] = {resolved, loaded: summarize(loaded)};
    } catch (error) {
        resolutions[specifier] = {error: error.code || error.message};
    }
});

const blocked = {};
${blockedSpecifiersSource()}.forEach((specifier) => {
    try {
        blocked[specifier] = {resolved: require.resolve(specifier)};
    } catch (error) {
        blocked[specifier] = {error: error.code || error.message};
    }
});

let install;
try {
    install = require('./node_modules/exifreader/bin/cli.js').checkLocalInstall(process.cwd());
} catch (error) {
    install = {error: error.code || error.message};
}
process.stdout.write(JSON.stringify({resolutions, blocked, install}));
`;
}

function buildImportScript() {
    return `
import exifReader from 'exifreader';
${summarizeSource()}
const resolutions = {};
for (const specifier of ${specifiersSource()}) {
    try {
        const resolved = import.meta.resolve(specifier);
        const options = specifier.endsWith('.json') ? {with: {type: 'json'}} : undefined;
        const loaded = await import(specifier, options);
        resolutions[specifier] = {resolved, loaded: summarize(loaded.default)};
    } catch (error) {
        resolutions[specifier] = {error: error.code || error.message};
    }
}

const blocked = {};
for (const specifier of ${blockedSpecifiersSource()}) {
    try {
        blocked[specifier] = {resolved: import.meta.resolve(specifier)};
    } catch (error) {
        blocked[specifier] = {error: error.code || error.message};
    }
}

process.stdout.write(JSON.stringify({resolutions, blocked, staticDefaultImport: summarize(exifReader)}));
`;
}

function summarizeSource() {
    return `
function summarize(value) {
    const summary = {};
    ['load', 'loadView', 'errors'].forEach((key) => {
        if (value[key] !== undefined) {
            summary[key] = typeof value[key];
        }
    });
    if (typeof value.name === 'string') {
        summary.name = value.name;
    }
    return summary;
}
`;
}

function specifiersSource() {
    return JSON.stringify(SPECIFIERS.map(({specifier}) => specifier));
}

function blockedSpecifiersSource() {
    return JSON.stringify(BLOCKED_SPECIFIERS);
}
