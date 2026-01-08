const {expect} = require('chai');
const path = require('path');
const fs = require('fs');
const Exif = require('./exif');

const FIXTURES_PATH = path.join(__dirname, '..', 'fixtures');

describe('image outputs', () => {
    const filter = getFilter(process.argv);
    const images = fs.readdirSync(path.join(FIXTURES_PATH, 'images'));

    for (const imageName of images) {
        const resolvedImagePath = path.resolve(path.join(FIXTURES_PATH, 'images', imageName));
        const shouldRunImage = !filter || (resolvedImagePath === filter);

        if (!shouldRunImage) {
            continue;
        }

        const storedResult = JSON.parse(fs.readFileSync(path.join(FIXTURES_PATH, 'outputs', `${imageName}.out`)));
        const imagePath = path.join(FIXTURES_PATH, 'images', imageName);

        describe(imageName, function () {
            this.timeout(20000);

            let result;

            before(async () => {
                // The process needs to be the same as when the stored result was
                // created and now retrieved, i.e. first stringified and then
                // parsed, since some values can't be correctly represented in
                // JSON format.

                result = JSON.parse(JSON.stringify(
                    await Exif.parse(imagePath)
                ));
            });

            if (typeof storedResult !== 'object' || storedResult === null) {
                it('matches', () => {
                    expect(result).to.equal(storedResult);
                });
            } else {
                // deep.equal can't handle too large objects so we have to split them up.
                describe('combined', () => {
                    if (storedResult.combined) {
                        checkTags(getCombinedTags, storedResult.combined);
                    } else {
                        it('matches', () => {
                            expect(getCombinedTags()).to.equal(storedResult.combined);
                        });
                    }
                });

                describe('expanded', () => {
                    if (storedResult.expanded) {
                        it('matches in number of groups', () => {
                            const expandedGroups = getExpandedGroups();

                            expect(Object.keys(expandedGroups)).to.have.lengthOf(Object.keys(storedResult.expanded).length);
                        });

                        for (const group in storedResult.expanded) {
                            describe(`group "${group}"`, () => {
                                checkTags(getExpandedGroupTags(group), storedResult.expanded[group]);
                            });
                        }
                    } else {
                        it('matches', () => {
                            expect(getExpandedGroups()).to.equal(storedResult.expanded);
                        });
                    }
                });
            }

            function getCombinedTags() {
                if (!result || typeof result !== 'object') {
                    return result;
                }

                return result.combined;
            }

            function getExpandedGroups() {
                if (!result || typeof result !== 'object') {
                    return result;
                }

                return result.expanded;
            }

            function getExpandedGroupTags(groupName) {
                return function () {
                    const expandedGroups = getExpandedGroups();
                    if (!expandedGroups || typeof expandedGroups !== 'object') {
                        return expandedGroups;
                    }

                    return expandedGroups[groupName];
                };
            }
        });
    }

    function getFilter(argv) {
        return argv
            .filter((arg) => arg.startsWith('--image='))
            .map((arg) => path.resolve(arg.replace(/^--image=/, '')))[0];
    }

    function checkTags(getTags, storedTags) {
        it('matches in number of tags', () => {
            const tags = getTags();
            const storedTagsObject = storedTags || {};

            expect(Object.keys(tags)).to.have.lengthOf(Object.keys(storedTagsObject).length);
        });

        for (const tagName in storedTags) {
            it(`matches for tag "${tagName}"`, () => {
                const tags = getTags();

                expect(tags[tagName]).to.deep.equal(storedTags[tagName]);
            });
        }
    }
});
