/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const path = require('path');

const INSTALL_DIR = path.join(__dirname, '..');

// Default export, used by the postinstall path and webpack.config.js. Walks up
// from the install location and returns the first package.json's `exifreader`
// value. The options arg is for tests only (inject a reader / install dir).
module.exports = findFromInstallLocation;
module.exports.forCli = forCli;

function findFromInstallLocation(options) {
    return walkUp(path.join(installDirFrom(options), '..'), readerFrom(options));
}

// Config resolution for `npx exifreader build`: prefer the project the user is
// in by walking up from the start dir and using the first package.json found,
// falling back to the install-location walk only when it has no `exifreader`
// key. Using the first package.json avoids grabbing a stray ancestor's config.
function forCli(startDir, options) {
    const read = readerFrom(options);
    return nearestConfig(startDir, read)
        || walkUp(path.join(installDirFrom(options), '..'), read)
        || false;
}

function installDirFrom(options) {
    return (options && options.installDir) || INSTALL_DIR;
}

function readerFrom(options) {
    return (options && options.readPackageJson) || requirePackageJson;
}

function walkUp(directory, read) {
    const packageJson = read(directory);
    if (packageJson !== undefined) {
        return packageJson.exifreader;
    }
    const parent = path.join(directory, '..');
    return parent === directory ? false : walkUp(parent, read);
}

function nearestConfig(directory, read) {
    const packageJson = read(directory);
    if (packageJson !== undefined) {
        return packageJson.exifreader || false;
    }
    const parent = path.join(directory, '..');
    return parent === directory ? false : nearestConfig(parent, read);
}

function requirePackageJson(directory) {
    try {
        return require(path.join(directory, 'package.json'));
    } catch (error) {
        return undefined;
    }
}
