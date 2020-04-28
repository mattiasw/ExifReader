/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const path = require('path');

module.exports = getConfigFromParent.bind(null, path.join(__dirname, '..'));

function getConfigFromParent(directory) {
    const parentDirectory = path.join(directory, '..');
    if (parentDirectory === directory) {
        return false;
    }

    try {
        const packageJson = require(path.join(parentDirectory, 'package.json'));
        return packageJson.exifreader;
    } catch (error) {
        return getConfigFromParent(parentDirectory);
    }
}
