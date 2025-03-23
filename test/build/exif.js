const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {DOMParser, onErrorStopParsing} = require('@xmldom/xmldom');

module.exports = {
    parse
};

async function parse(imagePath, libraryDir = '../..') {
    const exifReaderPath = require.resolve(path.join(libraryDir, 'dist/exif-reader'));
    delete require.cache[exifReaderPath];
    const ExifReader = require(exifReaderPath);
    const data = fs.readFileSync(imagePath);

    try {
        const domParser = new DOMParser({onError: onErrorStopParsing});
        const result = {
            combined: hashDetails(await ExifReader.load(data, {includeUnknown: true, async: true, domParser})),
            expanded: hashGroupDetails(await ExifReader.load(data, {expanded: true, includeUnknown: true, async: true, domParser}))
        };
        return result;
    } catch (error) {
        if (error instanceof ExifReader.errors.MetadataMissingError) {
            return 'No Exif data found';
        }
        return error.toString();
    }
}

function hashDetails(tags) {
    for (const tagName of Object.keys(tags)) {
        if (tagName === 'Thumbnail') {
            if (tags[tagName].image) {
                tags[tagName].image = hash(tags[tagName].image);
                tags[tagName].base64 = hash(tags[tagName].base64);
            }
        } else if (tagName === 'Images') {
            for (let i = 0; i < tags[tagName].length; i++) {
                if (tags[tagName][i].image) {
                    tags[tagName][i].image = hash(tags[tagName][i].image);
                    tags[tagName][i].base64 = hash(tags[tagName][i].base64);
                }
            }
        } else if (Array.isArray(tags[tagName])) {
            tags[tagName].map((item) => {
                item.value = hash(item.value);
                item.description = hash(item.description);
            });
        } else {
            tags[tagName].value = hash(tags[tagName].value);
            tags[tagName].description = hash(tags[tagName].description);
            if (tags[tagName].attributes) {
                tags[tagName].attributes = hash(tags[tagName].attributes);
            }
        }
    }

    return tags;
}

function hashGroupDetails(tags) {
    for (const tagGroupName of Object.keys(tags)) {
        if (tagGroupName === 'Thumbnail') {
            hashDetails({Thumbnail: tags[tagGroupName]});
        } else if (tagGroupName !== 'gps') {
            hashDetails(tags[tagGroupName]);
        }
    }

    return tags;
}

function hash(value) {
    if (value instanceof ArrayBuffer) {
        if (value.byteLength > 200) {
            return crypto.createHash('sha1').update(new Uint8Array(value)).digest('base64');
        }
        value = (new Uint8Array(value)).map((byte) => Number(byte));
    } else if (Array.isArray(value)) {
        const newValue = value.length > 200 ? value.slice(0, 100).concat(['...']).concat(value.slice(-100)) : value;
        return newValue.map(hash);
    } else if (typeof value === 'object') {
        const newValue = {};
        for (const key in value) {
            newValue[key] = hash(value[key]);
        }
        return newValue;
    } else if (typeof value === 'string') {
        if (value.length > 200) {
            return `${value.substring(0, 100)}[...]${value.substring(value.length - 100)}`;
        }
        return value;
    }
    return value;
}
