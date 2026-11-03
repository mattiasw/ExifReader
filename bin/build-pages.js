/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * This script is used to build GitHub Pages when there is a new release. The
 * script will create a temporary directory "gh-pages" and place all files
 * needed for GitHub Pages in there. Then they need to be committed to the
 * gh-pages branch and pushed to actually be visible.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GH_PAGES_TEMP_DIR = path.join(ROOT, 'gh-pages');

if (require.main === module) {
    buildSite(ROOT, GH_PAGES_TEMP_DIR);
}

/**
 * Collects the example pages, the whole source tree and the bundle, and copies
 * them into the output directory, creating every directory on the way.
 *
 * @param {string} root The repository root.
 * @param {string} outputDirectory Where the site is assembled.
 */
function buildSite(root, outputDirectory) {
    let files = collectFiles(path.join(root, 'examples'), '', ['html', 'css', 'js']);
    files = collectFiles(root, 'src', ['js'], files);
    files[path.join(root, 'dist/exif-reader.js')] = 'exif-reader.js';
    files[path.join(root, 'dist/exif-reader.js.map')] = 'exif-reader.js.map';

    copyFiles(files, outputDirectory);
}

function collectFiles(rootDirectory, subDirectory, extensions, files = {}) {
    fs.readdirSync(path.join(rootDirectory, subDirectory), {withFileTypes: true}).forEach((file) => {
        if (file.isDirectory()) {
            files = collectFiles(rootDirectory, path.join(subDirectory, file.name), extensions, files);
        } else if (hasFileExtension(file.name, extensions)) {
            files[path.join(rootDirectory, subDirectory, file.name)] = path.join(subDirectory, file.name);
        }
    });

    return files;
}

function hasFileExtension(filename, extensions) {
    return extensions.some((extension) => filename.endsWith(extension));
}

function copyFiles(files, outputDirectory) {
    for (const from in files) {
        const to = path.join(outputDirectory, files[from]);
        fs.mkdirSync(path.dirname(to), {recursive: true});
        fs.copyFileSync(from, to);
    }
}

module.exports = {buildSite};
