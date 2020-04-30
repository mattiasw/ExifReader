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

createTempDirectory();
buildSite();

function createTempDirectory() {
    try {
        fs.mkdirSync(GH_PAGES_TEMP_DIR);
    } catch (error) {
        if (error.code !== 'EEXIST') {
            console.error(error); // eslint-disable-line no-console
            process.exit(1);
        }
    }
}

function buildSite() {
    const directories = ['amd', 'esm', 'global', 'nodejs', 'src'];
    let files = collectFiles(path.join(ROOT, 'examples'), '', ['html', 'css', 'js']);
    files = collectFiles(ROOT, 'src', ['js'], files);
    files[path.join(ROOT, 'dist/exif-reader.js')] = 'exif-reader.js';
    files[path.join(ROOT, 'dist/exif-reader.js.map')] = 'exif-reader.js.map';

    createDirectories(directories);
    copyFiles(files);
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

function createDirectories(directories) {
    directories.forEach((directory) => {
        try {
            fs.mkdirSync(path.join(GH_PAGES_TEMP_DIR, directory));
        } catch (error) {
            if (error.code !== 'EEXIST') {
                console.error(error); // eslint-disable-line no-console
                process.exit(1);
            }
        }
    });
}

function copyFiles(files) {
    for (const from in files) {
        fs.copyFileSync(from, path.join(GH_PAGES_TEMP_DIR, files[from]));
    }
}
