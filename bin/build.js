/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const path = require('path');
const {execSync} = require('child_process');
const dependentHasExifReaderConfig = require('./findDependentConfig');

process.chdir(path.join(__dirname, '..'));

if (!process.argv.includes('--only-with-config') || checkConfig()) {
    execSync('webpack', {stdio: 'inherit'});
}

function checkConfig() {
    if (dependentHasExifReaderConfig()) {
        if (!isDependenciesInstalled()) {
            console.log('Installing ExifReader custom build dependencies...'); // eslint-disable-line no-console
            execSync('npm install --production=false --loglevel=error --no-optional --no-package-lock --no-save @babel/core@7.9.0 @babel/preset-env@7.9.0 @babel/register@7.9.0 babel-loader@8.1.0 cross-env@5.2.0 string-replace-loader@2.2.0 webpack@4.44.1 webpack-cli@3.3.12 terser-webpack-plugin@2.3.8', {stdio: 'inherit'});
            console.log('Done.'); // eslint-disable-line no-console
        }
        return true;
    }
    return false;
}

function isDependenciesInstalled() {
    try {
        execSync('npm ls webpack');
        return true;
    } catch (error) {
        return false;
    }
}
