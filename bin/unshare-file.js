/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const fs = require('fs');

module.exports = {unshareFile};

/**
 * Give a hardlinked file its own inode with the same content, so that writing
 * to it no longer changes the other links. A file with one link, or a missing
 * file, is left alone.
 *
 * @param {string} filePath The file to unshare.
 */
function unshareFile(filePath) {
    // Package managers can hardlink package files from a shared store, and webpack writes in place.
    if (!fs.existsSync(filePath) || fs.statSync(filePath).nlink <= 1) {
        return;
    }
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    try {
        fs.copyFileSync(filePath, tmpPath);
        fs.renameSync(tmpPath, filePath);
    } catch (error) {
        fs.rmSync(tmpPath, {force: true});
        throw error;
    }
}
