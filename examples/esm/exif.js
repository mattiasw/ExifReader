/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The UMD format used in the pre-built file in the dist folder won't work with
// native ES modules. Just use the main source file instead since the project is
// already written as ES modules.
import ExifReader from '../src/exif-reader.js';

document.getElementById('file').addEventListener('change', handleFile);

document.querySelector('html').setAttribute('data-initialized', '');

function handleFile(event) {
    const files = event.target.files;
    const reader = new FileReader();

    window.exifReaderClear();

    reader.onload = function (readerEvent) {
        try {
            const tags = ExifReader.load(readerEvent.target.result);

            // The MakerNote tag can be really large. Remove it to lower
            // memory usage if you're parsing a lot of files and saving the
            // tags.
            delete tags['MakerNote'];

            // If you want to extract the thumbnail you can use it like
            // this:
            if (tags['Thumbnail'] && tags['Thumbnail'].image) {
                const image = document.getElementById('thumbnail');
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
