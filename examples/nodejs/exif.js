/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const ExifReader = require('../../dist/exif-reader');
const exifErrors = ExifReader.errors;

if (process.argv.length < 3) {
    console.log(`Usage: node ${path.basename(__filename)} <filename>`);
    process.exit();
}

const filePath = process.argv[2];

ExifReader.load(filePath, {expanded: true, computed: true}).then(function (tags) {
    // The MakerNote tag can be really large. Remove it to lower memory
    // usage if you're parsing a lot of files and saving the tags.
    if (tags.exif) {
        delete tags.exif['MakerNote'];
    }

    // If you want to extract the thumbnail you can save it like this:
    if (tags['Thumbnail'] && tags['Thumbnail'].image) {
        fs.writeFileSync(path.join(os.tmpdir(), 'thumbnail.jpg'), Buffer.from(tags['Thumbnail'].image));
    }

    // If you want to extract images from the multi-picture metadata (MPF) you can save them like this:
    if (tags['mpf'] && tags['mpf']['Images']) {
        for (let i = 0; i < tags['mpf']['Images'].length; i++) {
            fs.writeFileSync(path.join(os.tmpdir(), `mpf-image-${i}.jpg`), Buffer.from(tags['mpf']['Images'][i].image));
            // You can also read the metadata from each of these images too:
            // ExifReader.load(tags['mpf']['Images'][i].image, {expanded: true});
        }
    }

    listTags(tags);
}).catch(function (error) {
    if (error instanceof exifErrors.MetadataMissingError) {
        console.log('No Exif data found');
    }

    console.error(error);
    process.exit(1);
});

function listTags(tags) {
    for (const group in tags) {
        for (const name in tags[group]) {
            if (group === 'gps') {
                console.log(`${group}:${name}: ${tags[group][name]}`);
            } else if ((group === 'Thumbnail') && (name === 'type')) {
                console.log(`${group}:${name}: ${tags[group][name]}`);
            } else if ((group === 'Thumbnail') && (name === 'image')) {
                console.log(`${group}:${name}: <image>`);
            } else if ((group === 'Thumbnail') && (name === 'base64')) {
                console.log(`${group}:${name}: <base64 encoded image>`);
            } else if ((group === 'mpf') && (name === 'Images')) {
                console.log(`${group}:${name}: ${getMpfImagesDescription(tags[group][name])}`);
            } else if ((group === 'xmp') && (name === '_raw')) {
                console.log(`${group}:${name}: <XMP data string>`);
            } else if ((group === 'exif') && (name === 'ImageSourceData')) {
                console.log(`${group}:${name}: <Adobe data>`);
            } else if (Array.isArray(tags[group][name])) {
                console.log(`${group}:${name}: ${tags[group][name].map((item) => item.description).join(', ')}`);
            } else {
                console.log(`${group}:${name}: ${typeof tags[group][name].description === 'string' ? tags[group][name].description.trim() : tags[group][name].description}`);
            }
        }
    }
}

function getMpfImagesDescription(images) {
    return images.map(
        (image, index) => `(${index}) ` + Object.keys(image).map((key) => {
            if (key === 'image') {
                return `${key}: <image>`;
            }
            if (key === 'base64') {
                return `${key}: <base64 encoded image>`;
            }
            return `${key}: ${image[key].description}`;
        }).join(', ')
    ).join('; ');
}
