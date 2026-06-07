/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const path = require('path');
const fs = require('fs');
const os = require('os');
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

    let tmpDir;
    try {
        if (env.EXIFREADER_CUSTOM_BUILD || hasDependentConfig()) {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-build-'));
            installCustomBuildDependencies(tmpDir);
            const buildModules = path.join(tmpDir, 'node_modules');
            // Point webpack at the isolated toolchain. NODE_PATH (read at child
            // startup) covers webpack.config.js's require('terser-webpack-plugin')
            // and Babel's @babel/preset-env lookup. EXIFREADER_BUILD_MODULES feeds
            // resolveLoader.modules for the webpack loaders.
            env.EXIFREADER_BUILD_MODULES = buildModules;
            env.NODE_PATH = env.NODE_PATH ? buildModules + path.delimiter + env.NODE_PATH : buildModules;
        }

        execSync(`npx -p ${getPackage('webpack-cli')} -p ${getPackage('webpack')} webpack`, {stdio: 'inherit', env});
    } finally {
        if (tmpDir) {
            try {
                fs.rmSync(tmpDir, {recursive: true, force: true});
            } catch (error) {
                // Best-effort: a locked file (e.g. Windows AV/watcher) during
                // cleanup must not mask the build result. os.tmpdir() is reaped
                // by the OS anyway.
            }
        }
    }
}

function hasDependentConfig() {
    return !!dependentHasExifReaderConfig();
}

function installCustomBuildDependencies(tmpDir) {
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

    // npm init only creates a package.json to anchor the install to tmpDir, so
    // silence its package.json dump (stderr is kept for real errors).
    execSync('npm init -y', {cwd: tmpDir, stdio: ['ignore', 'ignore', 'inherit']});
    execSync(`npm install --production --loglevel=error --no-optional --no-package-lock --no-save ${packages.join(' ')}`, {cwd: tmpDir, stdio: 'inherit'});
    console.log('Done.'); // eslint-disable-line no-console
}

function getPackage(name) {
    const version = require(path.join(EXIFREADER_ROOT_DIR, 'package.json')).devDependencies[name].replace(/^\^/, '');
    return `${name}@${version}`;
}
