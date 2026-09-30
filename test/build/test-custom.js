/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const {expect} = require('chai');
const path = require('path');
const fs = require('fs');
const {rimrafSync} = require('rimraf');
const {execSync, execFileSync, spawnSync} = require('child_process');
const Exif = require('./exif');
const configurations = require('./custom-builds.json');

const FIXTURES_PATH = path.join(__dirname, '..', 'fixtures');
const MARKER_FILE_NAME = '.exifreader-custom-build.json';

describe('custom configuration image outputs', () => {
    const ORIGINAL_DIR = process.cwd();
    const TEMP_PROJECT_DIR = path.join(__dirname, 'tmp');
    const PACKAGE = path.join(__dirname, `../../exifreader-${getVersion()}.tgz`);

    const filter = getFilter(process.argv);

    before(() => {
        cleanUp();
    });

    configurations.filter((configuration) => !filter || (configuration.id === filter)).forEach((configuration) => {
        describe(`configuration "${configuration.id}"`, function () {
            this.timeout(120000);

            describe('initial build', () => {
                before(() => {
                    setUp();
                    updatePackageJson(configuration.config);
                    execFileSync('npm', ['install', '--loglevel=error', PACKAGE], {stdio: 'ignore'});
                });

                after(() => {
                    cleanUp();
                });

                if (configuration.maxDistRatio) {
                    // Guards module elimination: the parse-output comparison
                    // below passes even when tree-shaking is broken and the
                    // bundle ships every module (regression in 4.41.1).
                    it('stays substantially smaller than the full bundle', () => {
                        const customSize = fs.statSync(path.join(TEMP_PROJECT_DIR, 'node_modules', 'exifreader', 'dist', 'exif-reader.js')).size;
                        const fullSize = fs.statSync(path.join(__dirname, '..', '..', 'dist', 'exif-reader.js')).size;
                        expect(customSize).to.be.below(fullSize * configuration.maxDistRatio);
                    });
                }

                fs.readdirSync(path.join(FIXTURES_PATH, 'images')).forEach((imageName) => {
                    it(`matches stored image output for ${imageName}`, async () => {
                        await testFile(imageName, configuration);
                    });
                });
            });

            if (configuration.rebuild) {
                describe('rebuild', () => {
                    before(() => {
                        setUp();
                        execFileSync('npm', ['install', '--loglevel=error', PACKAGE], {stdio: 'ignore'});
                        updatePackageJson(configuration.config);
                        execSync('npm rebuild exifreader', {stdio: 'ignore'});
                    });

                    after(() => {
                        cleanUp();
                    });

                    it('records the custom build marker', () => {
                        expect(fs.existsSync(path.join(installedDistDir(), MARKER_FILE_NAME))).to.equal(true);
                    });

                    it('passes build --check against the package.json config', () => {
                        expect(runCli(['build', '--check']).status).to.equal(0);
                    });

                    fs.readdirSync(path.join(FIXTURES_PATH, 'images')).forEach((imageName) => {
                        it(`matches stored image output for ${imageName}`, async () => {
                            await testFile(imageName, configuration);
                        });
                    });
                });
            }

            if (configuration.cli) {
                describe('cli build', () => {
                    let checkBeforeBuild;

                    before(() => {
                        setUp();
                        execFileSync('npm', ['install', '--ignore-scripts', '--loglevel=error', PACKAGE], {stdio: 'ignore'});
                        updatePackageJson(configuration.config);
                        const binDir = path.join(TEMP_PROJECT_DIR, 'node_modules', '.bin');
                        expect(fs.existsSync(path.join(binDir, 'exifreader')) || fs.existsSync(path.join(binDir, 'exifreader.cmd'))).to.equal(true);
                        checkBeforeBuild = runCli(['build', '--check']);
                        execSync('node node_modules/exifreader/bin/cli.js build', {cwd: TEMP_PROJECT_DIR, stdio: 'ignore'});
                    });

                    after(() => {
                        cleanUp();
                    });

                    it('fails build --check on the stock bundle before building', () => {
                        expect(checkBeforeBuild.status).to.not.equal(0);
                        expect(checkBeforeBuild.stderr).to.contain('stock full build');
                    });

                    it('records the custom build marker', () => {
                        expect(fs.existsSync(path.join(installedDistDir(), MARKER_FILE_NAME))).to.equal(true);
                    });

                    it('passes build --check after building', () => {
                        expect(runCli(['build', '--check']).status).to.equal(0);
                    });

                    it('passes build --check with the same config from a --config file', () => {
                        const configPath = path.join(TEMP_PROJECT_DIR, 'exifreader-config.json');
                        fs.writeFileSync(configPath, JSON.stringify(configuration.config));
                        expect(runCli(['build', '--check', '--config', configPath]).status).to.equal(0);
                    });

                    it('passes build --check with the same config from EXIFREADER_CUSTOM_BUILD', () => {
                        const env = {...process.env, EXIFREADER_CUSTOM_BUILD: JSON.stringify(configuration.config)};
                        expect(runCli(['build', '--check'], env).status).to.equal(0);
                    });

                    it('does not rebuild with build --if-needed when the bundle is up to date', () => {
                        const bundlePath = path.join(installedDistDir(), 'exif-reader.js');
                        const modifiedBefore = fs.statSync(bundlePath).mtimeMs;
                        const result = runCli(['build', '--if-needed']);
                        expect(result.status).to.equal(0);
                        expect(result.stdout).to.contain('up to date');
                        expect(fs.statSync(bundlePath).mtimeMs).to.equal(modifiedBefore);
                    });

                    fs.readdirSync(path.join(FIXTURES_PATH, 'images')).forEach((imageName) => {
                        it(`matches stored image output for ${imageName}`, async () => {
                            await testFile(imageName, configuration);
                        });
                    });
                });
            }
        });
    });

    function getFilter(argv) {
        return argv
            .filter((arg) => arg.startsWith('--name='))
            .map((arg) => arg.replace(/^--name=/, ''))[0];
    }

    function getVersion() {
        try {
            const version = require(path.join(__dirname, '../../package.json')).version;
            if (/^\d+\.\d+\.\d+$/.test(version)) {
                return version;
            }
        } catch (error) {
            // Just ignore and return a value that's not going to exist.
        }
        return 'x.x.x';
    }

    function setUp() {
        process.chdir(path.join(__dirname, '../..'));
        execSync('npm pack', {stdio: 'ignore'});
        fs.mkdirSync(TEMP_PROJECT_DIR);
        process.chdir(TEMP_PROJECT_DIR);
        execSync('npm init -y', {stdio: 'ignore'});
    }

    function cleanUp() {
        process.chdir(ORIGINAL_DIR);
        rimrafSync(PACKAGE, {disableGlob: true});
        rimrafSync(TEMP_PROJECT_DIR, {disableGlob: true});
    }

    function installedDistDir() {
        return path.join(TEMP_PROJECT_DIR, 'node_modules', 'exifreader', 'dist');
    }

    function runCli(args, env) {
        return spawnSync('node', [path.join('node_modules', 'exifreader', 'bin', 'cli.js'), ...args], {
            cwd: TEMP_PROJECT_DIR,
            encoding: 'utf8',
            env: env || process.env
        });
    }

    function updatePackageJson(config) {
        const packageJsonPath = path.join(TEMP_PROJECT_DIR, 'package.json');
        const packageJson = require(packageJsonPath);
        packageJson.exifreader = config;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson));
    }

    async function testFile(imageName, configuration) {
        const storedResult = JSON.parse(fs.readFileSync(path.join(FIXTURES_PATH, 'outputs', `${imageName}_${configuration.id}.out`)));
        // The process needs to be the same as when the stored result was
        // created and now retrieved, i.e. first stringified and then parsed,
        // since some values can't be correctly represented in JSON format.
        const result = JSON.parse(JSON.stringify(
            await Exif.parse(path.join(FIXTURES_PATH, 'images', imageName), path.join(TEMP_PROJECT_DIR, 'node_modules/exifreader'))
        ));

        expect(result).to.deep.equal(storedResult);
        // try {
        //     expect(result).to.deep.equal(storedResult);
        // } catch (error) {
        //     console.log('STORED:', storedResult);
        //     console.log('RESULT:', result);
        //     throw error;
        // }
    }
});
