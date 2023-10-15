const {expect} = require('chai');
const path = require('path');
const fs = require('fs');
const Exif = require('./exif');

const FIXTURES_PATH = path.join(__dirname, '..', 'fixtures');

describe('image outputs', () => {
    const filter = getFilter(process.argv);

    fs.readdirSync(path.join(FIXTURES_PATH, 'images')).forEach((imageName) => {
        if (!filter || (path.resolve(path.join(FIXTURES_PATH, 'images', imageName)) === filter)) {
            describe(imageName, () => {
                const storedResult = JSON.parse(fs.readFileSync(path.join(FIXTURES_PATH, 'outputs', `${imageName}.out`)));
                // The process needs to be the same as when the stored result was
                // created and now retrieved, i.e. first stringified and then parsed,
                // since some values can't be correctly represented in JSON format.
                const result = JSON.parse(JSON.stringify(
                    Exif.parse(path.join(FIXTURES_PATH, 'images', imageName))
                ));

                // deep.equal can't handle too large objects so we have to split them up.
                describe('combined', () => {
                    if (result.combined) {
                        checkTags(result.combined, storedResult.combined);
                    } else {
                        it('matches', () => {
                            expect(result.combined).to.equal(storedResult.combined);
                        });
                    }
                });

                describe('expanded', () => {
                    if (result.expanded) {
                        it('matches in number of groups', () => {
                            expect(Object.keys(result.expanded)).to.have.lengthOf(Object.keys(storedResult.expanded).length);
                        });

                        for (const group in result.expanded) {
                            describe(`group "${group}"`, () => {
                                checkTags(result.expanded && result.expanded[group], storedResult.expanded && storedResult.expanded[group]);
                            });
                        }
                    } else {
                        it('matches', () => {
                            expect(result.expanded).to.equal(storedResult.expanded);
                        });
                    }
                });
            });
        }
    });

    function getFilter(argv) {
        return argv
            .filter((arg) => arg.startsWith('--image='))
            .map((arg) => path.resolve(arg.replace(/^--image=/, '')))[0];
    }

    function checkTags(tags, storedTags) {
        it('matches in number of tags', () => {
            expect(Object.keys(tags)).to.have.lengthOf(Object.keys(storedTags).length);
        });

        for (const tagName in tags) {
            it(`matches for tag "${tagName}"`, () => {
                expect(tags[tagName]).to.deep.equal(storedTags[tagName]);
            });
        }
    }
});
