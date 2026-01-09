process.env.BABEL_ENV = process.env.BABEL_ENV || 'test';
require('@babel/register');

const path = require('path');
const fs = require('fs');
const Exif = require('./exif');
const configurations = require('./tag-filtering-configs.json');

const FIXTURES_PATH = path.join(__dirname, '..', 'fixtures');
const OUTPUTS_PATH = path.join(FIXTURES_PATH, 'tag-filtering-outputs');

const configurationFilter = getConfigurationFilter(process.argv);
const imageFilter = getImageFilter(process.argv);

main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    await updateOutputs();
}

async function updateOutputs() {
    const images = fs.readdirSync(path.join(FIXTURES_PATH, 'images'));
    fs.mkdirSync(OUTPUTS_PATH, {recursive: true});

    for (const configuration of configurations) {
        if (configurationFilter && configuration.id !== configurationFilter) {
            continue;
        }

        for (const imageName of images) {
            if (!shouldRunImage(imageName)) {
                continue;
            }

            const imagePath = path.join(FIXTURES_PATH, 'images', imageName);
            const result = await Exif.parse(imagePath, configuration.options);
            const outputFileName = `${imageName}_${configuration.id}.out`;
            const fileName = path.join(OUTPUTS_PATH, outputFileName);
            fs.writeFileSync(fileName, JSON.stringify(result));
        }
    }
}

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

function shouldRunImage(imageName) {
    if (!imageFilter) {
        return true;
    }

    return imageFilter === imageName;
}
