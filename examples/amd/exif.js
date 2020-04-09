/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

requirejs(['../exif-reader'], function (ExifReader) {
    'use strict';

    if (!supportsFileReader()) {
        alert('Sorry, your web browser does not support the FileReader API.');
        return;
    }

    document.getElementById('file').addEventListener('change', handleFile, false);

    function supportsFileReader() {
        return window.FileReader !== undefined;
    }

    function handleFile(event) {
        var files = event.target.files;
        var reader = new FileReader();

        window.exifReaderClear();

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

                window.exifReaderListTags(tags);
            } catch (error) {
                window.exifReaderError(error.toString());
            }
        };

        reader.readAsArrayBuffer(files[0]);
    }
});
