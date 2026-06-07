/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const path = require('path');
const fs = require('fs');
const {execSync} = require('child_process');
const dependentHasExifReaderConfig = require('./findDependentConfig');

const EXIFREADER_ROOT_DIR = path.join(__dirname, '..');

module.exports = {runBuild, hasDependentConfig};

if (require.main === module) {
    // With --only-with-config (postinstall) only build when a dependent has a
    // config. Without it (`npm run build`) always build.
    if (!process.argv.includes('--only-with-config') || hasDependentConfig()) {
        runBuild();
    }
}

/**
 * Run the webpack build, installing the build toolchain first when a custom
 * build is requested.
 *
 * @param {{config?: object}} [options] When `config` is given (the `exifreader`
 *   config object), it is passed to webpack via the EXIFREADER_CUSTOM_BUILD env
 *   var. Otherwise webpack resolves the config from package.json itself.
 */
function runBuild(options) {
    options = options || {};
    process.chdir(EXIFREADER_ROOT_DIR);

    // Pin the build env regardless of the caller's shell: NODE_ENV=production
    // keeps webpack in production mode, and BABEL_ENV is only belt-and-suspenders
    // against a stray BABEL_ENV=test adding the test-only rewire plugin.
    const env = {...process.env, BABEL_ENV: 'production', NODE_ENV: 'production'};
    if (options.config) {
        env.EXIFREADER_CUSTOM_BUILD = JSON.stringify(options.config);
    }

    if (env.EXIFREADER_CUSTOM_BUILD || hasDependentConfig()) {
        installCustomBuildDependencies();
    }

    execSync(`npx -p ${getPackage('webpack-cli')} -p ${getPackage('webpack')} webpack`, {stdio: 'inherit', env});
}

function hasDependentConfig() {
    return !!dependentHasExifReaderConfig();
}

function installCustomBuildDependencies() {
    const tmpDir = path.join(EXIFREADER_ROOT_DIR, '__tmp');
    if (fs.existsSync(tmpDir)) {
        console.error(leftoverTmpMessage(tmpDir)); // eslint-disable-line no-console
        process.exit(1);
    }

    console.log('Installing ExifReader custom build dependencies...'); // eslint-disable-line no-console
    const packages = [
        '@babel/core',
        '@babel/preset-env',
        '@babel/register',
        'babel-loader',
        'cross-env',
        'string-replace-loader',
        'terser-webpack-plugin'
    ].map((_package) => getPackage(_package));

    let failed = false;
    try {
        initTmpDir(tmpDir);
        execSync(`npm install --production --loglevel=error --no-optional --no-package-lock --no-save ${packages.join(' ')}`, {stdio: 'inherit'});
        console.log('Done.'); // eslint-disable-line no-console
    } catch (error) {
        console.error('Could not install requirements for a custom build:', error); // eslint-disable-line no-console
        failed = true;
    } finally {
        // Always restore node_modules, even on failure. (process.exit() in the
        // catch would skip this, stranding node_modules inside __tmp.)
        cleanUpTmpDir(tmpDir);
    }

    if (failed) {
        process.exit(1);
    }
}

function getPackage(name) {
    const version = require(path.join(EXIFREADER_ROOT_DIR, 'package.json')).devDependencies[name].replace(/^\^/, '');
    return `${name}@${version}`;
}

function leftoverTmpMessage(tmpDir) {
    return `Found a leftover build directory (${tmpDir}), which usually means a previous custom `
        + 'build was interrupted. If no build is currently running, check whether '
        + `${path.join(tmpDir, 'node_modules')} holds your node_modules (move it back to `
        + `${path.join(EXIFREADER_ROOT_DIR, 'node_modules')} if so), then remove ${tmpDir} and retry.`;
}

function initTmpDir(tmpDir) {
    const nodeModulesDir = path.join(EXIFREADER_ROOT_DIR, 'node_modules');
    fs.mkdirSync(tmpDir, {recursive: true});
    if (fs.existsSync(nodeModulesDir)) {
        fs.renameSync(nodeModulesDir, path.join(tmpDir, 'node_modules'));
    }
    process.chdir(tmpDir);
    execSync('npm init -y', {stdio: 'inherit'});
}

function cleanUpTmpDir(tmpDir) {
    const nodeModulesDir = path.join(tmpDir, 'node_modules');
    if (fs.existsSync(nodeModulesDir)) {
        fs.renameSync(nodeModulesDir, path.join(EXIFREADER_ROOT_DIR, 'node_modules'));
    }
    process.chdir(EXIFREADER_ROOT_DIR);
    fs.rmSync(tmpDir, {recursive: true, force: true});
}
