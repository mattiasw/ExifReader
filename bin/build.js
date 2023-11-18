/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const path = require('path');
const fs = require('fs');
const {execSync} = require('child_process');
const dependentHasExifReaderConfig = require('./findDependentConfig');

const WEBPACK_VERSION = '5.89.0';

const EXIFREADER_ROOT_DIR = path.join(__dirname, '..');
process.chdir(EXIFREADER_ROOT_DIR);

if (!process.argv.includes('--only-with-config') || checkConfig()) {
    execSync(`npx webpack@${WEBPACK_VERSION}`, {stdio: 'inherit'});
}

function checkConfig() {
    if (dependentHasExifReaderConfig()) {
        if (!areDependenciesInstalled()) {
            console.log('Installing ExifReader custom build dependencies...'); // eslint-disable-line no-console
            const packages = [
                '@babel/core@7.23.2',
                '@babel/preset-env@7.23.2',
                '@babel/register@7.22.15',
                'babel-loader@8.2.5',
                'cross-env@7.0.3',
                'string-replace-loader@3.1.0',
                `webpack@${WEBPACK_VERSION}`,
                'webpack-cli@5.1.4',
                'terser-webpack-plugin@5.3.9'
            ];
            const tmpDir = path.join(EXIFREADER_ROOT_DIR, '__tmp');
            try {
                initTmpDir(tmpDir);
                execSync(`npm install --production --loglevel=error --no-optional --no-package-lock --no-save ${packages.join(' ')}`, {stdio: 'inherit'});
                console.log('Done.'); // eslint-disable-line no-console
            } catch (error) {
                console.error('Could not install requirements for a custom build:', error); // eslint-disable-line no-console
            } finally {
                cleanUpTmpDir(tmpDir);
            }
        }
        return true;
    }
    return false;
}

function areDependenciesInstalled() {
    try {
        execSync('npm ls webpack');
        return true;
    } catch (error) {
        return false;
    }
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
