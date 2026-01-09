const {expect} = require('chai');
const path = require('path');
const fs = require('fs');
const Exif = require('./exif');
const configurations = require('./tag-filtering-configs.json');

const FIXTURES_PATH = path.join(__dirname, '..', 'fixtures');
const OUTPUTS_PATH = path.join(FIXTURES_PATH, 'tag-filtering-outputs');

describe('tag filtering integration outputs', () => {
    const configurationFilter = getConfigurationFilter(process.argv);
    const imageFilter = getImageFilter(process.argv);

    const images = fs.readdirSync(path.join(FIXTURES_PATH, 'images'));

    configurations
        .filter((configuration) => {
            if (!configurationFilter) {
                return true;
            }

            return configuration.id === configurationFilter;
        })
        .forEach((configuration) => {
            describe(`configuration "${configuration.id}"`, function () {
                this.timeout(60000);

                for (const imageName of images) {
                    if (!shouldRunImage(imageName)) {
                        continue;
                    }

                    const outputFileName = `${imageName}_${configuration.id}.out`;
                    const storedOutputPath = path.join(
                        OUTPUTS_PATH,
                        outputFileName
                    );

                    describe(imageName, function () {
                        this.timeout(20000);

                        let result;
                        let storedResult;

                        before(async () => {
                            storedResult = readStoredResult(storedOutputPath);
                            const imagePath = path.join(
                                FIXTURES_PATH,
                                'images',
                                imageName
                            );

                            result = JSON.parse(JSON.stringify(
                                await Exif.parse(imagePath, configuration.options)
                            ));
                        });

                        it('matches', () => {
                            assertResultMatches(result, storedResult);
                        });
                    });
                }
            });

            function shouldRunImage(imageName) {
                if (!imageFilter) {
                    return true;
                }

                return imageFilter === imageName;
            }
        });

    function getConfigurationFilter(argv) {
        return argv
            .filter((argument) => argument.indexOf('--name=') === 0)
            .map((argument) => argument.replace(/^--name=/, ''))[0];
    }

    function getImageFilter(argv) {
        return argv
            .filter((argument) => argument.indexOf('--image=') === 0)
            .map((argument) => argument.replace(/^--image=/, ''))[0];
    }

    function assertStoredOutputExists(storedOutputPath) {
        if (fs.existsSync(storedOutputPath)) {
            return;
        }

        const fileName = path.basename(storedOutputPath);
        const fileMatch = fileName.match(/^(.+)_([^_]+)\.out$/);
        const imageName = fileMatch ? fileMatch[1] : '<image>';
        const configurationId = fileMatch ? fileMatch[2] : '<config>';

        throw new Error(
            'Missing expected output file: '
            + storedOutputPath
            + '\nRun: npm run test:integration:update -- '
            + `--image=${imageName} --name=${configurationId}`
        );
    }

    function readStoredResult(storedOutputPath) {
        assertStoredOutputExists(storedOutputPath);

        return JSON.parse(fs.readFileSync(storedOutputPath));
    }

    function assertResultMatches(result, storedResult) {
        if (typeof storedResult !== 'object' || storedResult === null) {
            expect(result).to.equal(storedResult);

            return;
        }

        expect(typeof result).to.equal('object');
        expect(result).to.not.equal(null);

        assertObjectMatches(result.combined, storedResult.combined, 'combined');
        assertExpandedMatches(result.expanded, storedResult.expanded);
    }

    function assertExpandedMatches(expandedGroups, storedExpandedGroups) {
        if (typeof storedExpandedGroups !== 'object' || storedExpandedGroups === null) {
            expect(expandedGroups).to.equal(storedExpandedGroups);

            return;
        }

        expect(typeof expandedGroups).to.equal('object');
        expect(expandedGroups).to.not.equal(null);

        expect(Object.keys(expandedGroups)).to.have.lengthOf(
            Object.keys(storedExpandedGroups).length
        );

        for (const groupName in storedExpandedGroups) {
            assertObjectMatches(
                expandedGroups[groupName],
                storedExpandedGroups[groupName],
                `expanded.${groupName}`
            );
        }
    }

    function assertObjectMatches(actualObject, expectedObject, label) {
        if (typeof expectedObject !== 'object' || expectedObject === null) {
            expect(actualObject, label).to.equal(expectedObject);

            return;
        }

        expect(typeof actualObject, label).to.equal('object');
        expect(actualObject, label).to.not.equal(null);

        expect(Object.keys(actualObject), label).to.have.lengthOf(
            Object.keys(expectedObject).length
        );

        for (const key in expectedObject) {
            expect(actualObject[key], `${label}.${key}`).to.deep.equal(expectedObject[key]);
        }
    }
});
