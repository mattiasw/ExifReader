/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use strict';

const path = require('path');
const fs = require('fs');

const ExifReader = require('../../dist/exif-reader');
const exifErrors = ExifReader.errors;

if (process.argv.length < 3) {
    console.log(`Usage: node ${path.basename(__filename)} <filename>`);
    process.exit();
}

const filePath = process.argv[2];

fs.readFile(filePath, function (error, data) {
    if (error) {
        console.error('Error reading file.');
        process.exit(1);
    }

    try {
        const tags = ExifReader.load(data.buffer);

        // The MakerNote tag can be really large. Remove it to lower memory
        // usage if you're parsing a lot of files and saving the tags.
        delete tags['MakerNote'];

        listTags(tags);
    } catch (error) {
        if (error instanceof exifErrors.MetadataMissingError) {
            console.log('No Exif data found');
        }

        console.error(error);
        process.exit(1);
    }
});

function listTags(tags) {
    for (const name in tags) {
        console.log(`${name}: ${tags[name].description}`);
    }
}
