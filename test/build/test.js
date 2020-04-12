const {expect} = require('chai');
const path = require('path');
const fs = require('fs');
const Exif = require('./exif');

const FIXTURES_PATH = path.join(__dirname, '..', 'fixtures');

describe('image outputs', () => {
    fs.readdirSync(path.join(FIXTURES_PATH, 'images')).forEach((imageName) => {
        it(`matches stored image output for "${imageName}"`, () => {
            const storedResult = JSON.parse(fs.readFileSync(path.join(FIXTURES_PATH, 'outputs', `${imageName}.out`)));
            // The process needs to be the same as when the stored result was
            // created and now retrieved, i.e. first stringified and then parsed,
            // since some values can't be correctly represented in JSON format.
            const result = JSON.parse(JSON.stringify(
                Exif.parse(path.join(FIXTURES_PATH, 'images', imageName))
            ));

            expect(result).to.deep.equal(storedResult);
        });
    });
});
