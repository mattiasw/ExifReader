// Add/update a single file:
//     npm run test:build:update -- --image=<filename without path>
const path = require('path');
const fs = require('fs');
const {execSync} = require('child_process');
const Exif = require('./exif');
const configurations = require('./custom-builds.json');

const FIXTURES_PATH = path.join(__dirname, '..', 'fixtures');

const nameFilter = getNameFilter(process.argv);

updateForCustomBuilds(nameFilter);
updateForRegularBuild(nameFilter);

function getNameFilter(argv) {
    return argv
        .filter((arg) => arg.startsWith('--image='))
        .map((arg) => arg.replace(/^--image=/, ''))[0];
}

function updateForCustomBuilds(imageFilter) {
    configurations.forEach((configuration) => {
        process.env.EXIFREADER_CUSTOM_BUILD = JSON.stringify(configuration.config);
        execSync('npm run build');
        fs
            .readdirSync(path.join(FIXTURES_PATH, 'images'))
            .filter((imageName) => !imageFilter || (imageName === imageFilter))
            .forEach((imageName) => {
                saveOutput(`${imageName}_${configuration.id}`, Exif.parse(path.join(FIXTURES_PATH, 'images', imageName)));
            });
    });
}

function updateForRegularBuild(imageFilter) {
    delete process.env.EXIFREADER_CUSTOM_BUILD;
    execSync('npm run build');
    fs
        .readdirSync(path.join(FIXTURES_PATH, 'images'))
        .filter((imageName) => !imageFilter || (imageName === imageFilter))
        .forEach((imageName) => {
            saveOutput(imageName, Exif.parse(path.join(FIXTURES_PATH, 'images', imageName)));
        });
}

function saveOutput(imageName, result) {
    const fileName = path.join(FIXTURES_PATH, 'outputs', `${imageName}.out`);
    fs.writeFile(fileName, JSON.stringify(result), function (error) {
        if (error) {
            console.error('Could not save file:', fileName); // eslint-disable-line no-console
            process.exit(1);
        }
    });
}
