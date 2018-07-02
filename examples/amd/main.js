/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

requirejs(['../../dist/exif-reader'], function (ExifReader) {
    'use strict';

    if (!supportsFileReader()) {
        document.write('<strong>Sorry, your web browser does not support the FileReader API.</strong>');
        return;
    }

    document.getElementById('file').addEventListener('change', handleFile, false);

    function supportsFileReader() {
        return window.FileReader !== undefined;
    }

    function handleFile(event) {
        var files = event.target.files;
        var reader = new FileReader();

        reader.onload = function (event) {
            try {
                var tags = ExifReader.load(event.target.result);

                // The MakerNote tag can be really large. Remove it to lower
                // memory usage if you're parsing a lot of files and saving the
                // tags.
                delete tags['MakerNote'];

                listTags(tags);
            } catch (error) {
                alert(error);
            }
        };

        // We only need the start of the file for the Exif info.
        reader.readAsArrayBuffer(files[0].slice(0, 128 * 1024));
    }

    function listTags(tags) {
        var tableBody;
        var name;
        var row;

        tableBody = document.getElementById('exif-table-body');
        for (name in tags) {
            row = document.createElement('tr');
            row.innerHTML = '<td>' + name + '</td><td>' + tags[name].description + '</td>';
            tableBody.appendChild(row);
        }
    }
});
