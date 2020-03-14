/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The UMD format used in the pre-built file in the dist folder won't work with
// native ES modules. Just use the main source file instead since the project is
// already written as ES modules.
import ExifReader from '../../src/exif-reader';

if (supportsFileReader()) {
    document.getElementById('file').addEventListener('change', handleFile, false);
} else {
    document.write('<strong>Sorry, your web browser does not support the FileReader API.</strong>');
}

function supportsFileReader() {
    return window.FileReader !== undefined;
}

function handleFile(event) {
    const files = event.target.files;
    const reader = new FileReader();

    reader.onload = function (readerEvent) {
        try {
            const tags = ExifReader.load(readerEvent.target.result);

            // The MakerNote tag can be really large. Remove it to lower
            // memory usage if you're parsing a lot of files and saving the
            // tags.
            delete tags['MakerNote'];

            listTags(tags);
        } catch (error) {
            alert(error);
        }
    };

    reader.readAsArrayBuffer(files[0]);
}

function listTags(tags) {
    const tableBody = document.getElementById('exif-table-body');
    tableBody.innerHTML = '';
    for (const name in tags) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${name}</td>
            <td>${tags[name].description}</td>
        `;
        tableBody.appendChild(row);
    }
}
