const path = require('path');
const fs = require('fs');

module.exports = {
    parse
};

function parse(imagePath, libraryDir = '../..') {
    const exifReaderPath = require.resolve(path.join(libraryDir, 'dist/exif-reader'));
    delete require.cache[exifReaderPath];
    const ExifReader = require(exifReaderPath);
    const data = fs.readFileSync(imagePath);

    try {
        const result = {
            combined: ExifReader.load(data),
            expanded: ExifReader.load(data, {expanded: true})
        };
        if (result.combined.Thumbnail && result.combined.Thumbnail.image) {
            result.combined.Thumbnail.image = (new Uint8Array(result.combined.Thumbnail.image)).map((char) => Number(char)).toString();
        }
        if (result.expanded.Thumbnail && result.expanded.Thumbnail.image) {
            result.expanded.Thumbnail.image = (new Uint8Array(result.expanded.Thumbnail.image)).map((char) => Number(char)).toString();
        }
        return result;
    } catch (error) {
        if (error instanceof ExifReader.errors.MetadataMissingError) {
            return 'No Exif data found';
        }
        return error.toString();
    }
}
