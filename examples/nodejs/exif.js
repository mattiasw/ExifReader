'use strict';

const path = require('path');
const fs = require('fs');
global.DataView = require('jdataview');
global.DOMParser = require('xmldom').DOMParser;

const ExifReader = require('../../dist/exif-reader');

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
        const tags = ExifReader.load(data);

        // The MakerNote tag can be really large. Remove it to lower memory
        // usage if you're parsing a lot of files and saving the tags.
        delete tags['MakerNote'];

        listTags(tags);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
});

function listTags(tags) {
    for (const name in tags) {
        console.log(`${name}: ${tags[name].description}`);
    }
}
