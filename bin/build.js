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
            execSync('npm install --no-optional --no-package-lock --no-save @babel/core @babel/preset-env @babel/register babel-loader cross-env string-replace-loader webpack webpack-cli', {stdio: 'inherit'});
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
