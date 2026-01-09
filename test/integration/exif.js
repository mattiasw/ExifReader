const fs = require('fs');
const crypto = require('crypto');
const {DOMParser, onErrorStopParsing} = require('@xmldom/xmldom');

const ExifReader = require('../../src/exif-reader.js');
const domParser = new DOMParser({onError: onErrorStopParsing});
const imageDataByPath = Object.create(null);
const cachedFileSizeByPath = Object.create(null);
const maxCachedFileSizeBytes = 1024 * 1024; // 1 MiB.

module.exports = {
    parse,
};

async function parse(imagePath, options = {}) {
    const data = getImageData(imagePath);

    try {
        const baseOptions = {
            includeUnknown: true,
            async: true,
            domParser,
        };
        const combinedOptions = Object.assign({}, baseOptions, options);
        const expandedOptions = Object.assign(
            {},
            baseOptions,
            options,
            {expanded: true}
        );

        const result = {
            combined: hashDetails(await ExifReader.load(data, combinedOptions)),
            expanded: hashGroupDetails(
                await ExifReader.load(data, expandedOptions)
            ),
        };

        return result;
    } catch (error) {
        if (error instanceof ExifReader.errors.MetadataMissingError) {
            return 'No Exif data found';
        }

        return error.toString();
    }

    function getImageData(pathToFile) {
        if (Object.prototype.hasOwnProperty.call(imageDataByPath, pathToFile)) {
            return imageDataByPath[pathToFile];
        }

        const fileSizeBytes = getFileSizeBytes(pathToFile);
        const imageData = fs.readFileSync(pathToFile);
        if (fileSizeBytes <= maxCachedFileSizeBytes) {
            imageDataByPath[pathToFile] = imageData;
        }

        return imageData;
    }
}

function getFileSizeBytes(pathToFile) {
    if (Object.prototype.hasOwnProperty.call(cachedFileSizeByPath, pathToFile)) {
        return cachedFileSizeByPath[pathToFile];
    }

    const sizeBytes = fs.statSync(pathToFile).size;
    cachedFileSizeByPath[pathToFile] = sizeBytes;

    return sizeBytes;
}

function hashDetails(tags) {
    for (const tagName of Object.keys(tags)) {
        const tag = tags[tagName];

        if (!tag || (typeof tag !== 'object')) {
            tags[tagName] = hash(tag);

            continue;
        }

        if (tagName === 'Thumbnail') {
            if (tag.image) {
                tag.image = hash(tag.image);
                tag.base64 = hash(tag.base64);
            }
        } else if (tagName === 'Images') {
            for (let i = 0; i < tag.length; i++) {
                if (tag[i].image) {
                    tag[i].image = hash(tag[i].image);
                    tag[i].base64 = hash(tag[i].base64);
                }
            }
        } else if (Array.isArray(tag)) {
            tag.map((item) => {
                item.value = hash(item.value);
                item.description = hash(item.description);
            });
        } else if (Object.prototype.hasOwnProperty.call(tag, 'value')) {
            tag.value = hash(tag.value);
            if (Object.prototype.hasOwnProperty.call(tag, 'description')) {
                tag.description = hash(tag.description);
            }
            if (tag.attributes) {
                tag.attributes = hash(tag.attributes);
            }
        } else {
            tags[tagName] = hash(tag);
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
            return crypto
                .createHash('sha1')
                .update(new Uint8Array(value))
                .digest('base64');
        }
        value = new Uint8Array(value).map((byte) => Number(byte));
    } else if (Array.isArray(value)) {
        let newValue = value;
        if (value.length > 200) {
            newValue = value
                .slice(0, 100)
                .concat(['...'])
                .concat(value.slice(-100));
        }

        return newValue.map(hash);
    } else if (typeof value === 'object') {
        const newValue = {};
        for (const key in value) {
            newValue[key] = hash(value[key]);
        }

        return newValue;
    } else if (typeof value === 'string') {
        if (value.length > 200) {
            return `${value.substring(0, 100)}[...]${
                value.substring(value.length - 100)
            }`;
        }

        return value;
    }

    return value;
}
