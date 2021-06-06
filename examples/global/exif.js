/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

(function (window, document) {
    'use strict';

    if (!supportsFileReader()) {
        alert('Sorry, your web browser does not support the FileReader API.');
        return;
    }

    window.addEventListener('load', function () {
        document.getElementById('file').addEventListener('change', handleFile, false);
    }, false);

    // >>> IGNORE: Helper code for interactive example.
    document.querySelector('html').setAttribute('data-initialized', '');
    // <<<

    function supportsFileReader() {
        return window.FileReader !== undefined;
    }

    function handleFile(event) {
        // >>> IGNORE: Helper code for interactive example.
        window.exifReaderClear();
        // <<<
        ExifReader.load(event.target.files[0]).then(function (tags) {
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

            // Use the tags now present in `tags`.

            // >>> IGNORE: Helper code for interactive example.
            window.exifReaderListTags(tags);
            // <<<
        }).catch(function (error) {
            // Handle error.

            // >>> IGNORE: Helper code for interactive example.
            window.exifReaderError(error.toString());
            // <<<
        });
    }
})(window, document);
