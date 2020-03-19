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

        reader.onload = function (readerEvent) {
            try {
                var tags = ExifReader.load(readerEvent.target.result);

                // The MakerNote tag can be really large. Remove it to lower
                // memory usage if you're parsing a lot of files and saving the
                // tags.
                delete tags['MakerNote'];

                // If you want to extract the thumbnail you can use it like
                // this:
                if (tags['Thumbnail'] && tags['Thumbnail'].image) {
                    var image = document.getElementById('thumbnail');
                    image.classList.remove('hidden');
                    image.src = 'data:image/jpg;base64,' + tags['Thumbnail'].base64;
                }

                listTags(tags);
            } catch (error) {
                alert(error);
            }
        };

        reader.readAsArrayBuffer(files[0]);
    }

    function listTags(tags) {
        var tableBody;
        var name;
        var row;

        tableBody = document.getElementById('exif-table-body');
        tableBody.innerHTML = '';
        for (name in tags) {
            if (tags[name].description !== undefined) {
                row = document.createElement('tr');
                row.innerHTML = '<td>' + name + '</td><td>' + tags[name].description + '</td>';
                tableBody.appendChild(row);
            }
        }
    }
});
