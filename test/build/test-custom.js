const {expect} = require('chai');
const path = require('path');
const fs = require('fs');
const rimraf = require('rimraf');
const {execSync} = require('child_process');
const Exif = require('./exif');
const configurations = require('./custom-builds.json');

const FIXTURES_PATH = path.join(__dirname, '..', 'fixtures');

describe('custom configuration image outputs', () => {
    const ORIGINAL_DIR = process.cwd();
    const TEMP_PROJECT_DIR = path.join(__dirname, 'tmp');
    const PACKAGE = path.join(__dirname, `../../exifreader-${getVersion()}.tgz`);

    before(() => {
        cleanUp();
    });

    configurations.forEach((configuration) => {
        describe(`configuration "${configuration.id}"`, function () {
            this.timeout(60000);

            describe('initial build', () => {
                before(() => {
                    setUp();
                    updatePackageJson(configuration.config);
                    execSync(`npm install --loglevel=error ${PACKAGE}`, {stdio: 'ignore'});
                });

                after(() => {
                    cleanUp();
                });

                fs.readdirSync(path.join(FIXTURES_PATH, 'images')).forEach((imageName) => {
                    it(`matches stored image output for ${imageName}`, () => {
                        testFile(imageName, configuration);
                    });
                });
            });

            describe('rebuild', () => {
                before(() => {
                    setUp();
                    execSync(`npm install --loglevel=error ${PACKAGE}`, {stdio: 'ignore'});
                    updatePackageJson(configuration.config);
                    execSync('npm rebuild exifreader', {stdio: 'ignore'});
                });

                after(() => {
                    cleanUp();
                });

                fs.readdirSync(path.join(FIXTURES_PATH, 'images')).forEach((imageName) => {
                    it(`matches stored image output for ${imageName}`, () => {
                        testFile(imageName, configuration);
                    });
                });
            });
        });
    });

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
        rimraf.sync(PACKAGE, {disableGlob: true});
        rimraf.sync(TEMP_PROJECT_DIR, {disableGlob: true});
    }

    function updatePackageJson(config) {
        const packageJsonPath = path.join(TEMP_PROJECT_DIR, 'package.json');
        const packageJson = require(packageJsonPath);
        packageJson.exifreader = config;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson));
    }

    function testFile(imageName, configuration) {
        const storedResult = JSON.parse(fs.readFileSync(path.join(FIXTURES_PATH, 'outputs', `${imageName}_${configuration.id}.out`)));
        // The process needs to be the same as when the stored result was
        // created and now retrieved, i.e. first stringified and then parsed,
        // since some values can't be correctly represented in JSON format.
        const result = JSON.parse(JSON.stringify(
            Exif.parse(path.join(FIXTURES_PATH, 'images', imageName), path.join(TEMP_PROJECT_DIR, 'node_modules/exifreader'))
        ));

        expect(result).to.deep.equal(storedResult);
    }
});
