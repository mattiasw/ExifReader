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
            const packages = [
                '@babel/core@7.13.10',
                '@babel/preset-env@7.13.12',
                '@babel/register@7.13.8',
                'babel-loader@8.2.2',
                'cross-env@7.0.3',
                'string-replace-loader@3.0.3',
                'webpack@5.58.1',
                'webpack-cli@4.9.0',
                'terser-webpack-plugin@5.2.4'
            ];
            execSync(`npm install --production=false --loglevel=error --no-optional --no-package-lock --no-save ${packages.join(' ')}`, {stdio: 'inherit'});
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
