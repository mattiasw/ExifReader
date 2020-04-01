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
            console.log('Installing ExifReader custom build dependencies...');
            execSync('npm install --no-optional --no-package-lock');
            console.log('Done.');
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
