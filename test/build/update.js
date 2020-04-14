const path = require('path');
const fs = require('fs');
const {execSync} = require('child_process');
const Exif = require('./exif');
const configurations = require('./custom-builds.json');

const FIXTURES_PATH = path.join(__dirname, '..', 'fixtures');

updateForCustomBuilds();
updateForRegularBuild();

function updateForCustomBuilds() {
    configurations.forEach((configuration) => {
        process.env.EXIFREADER_CUSTOM_BUILD = JSON.stringify(configuration.config);
        execSync('npm run build');
        fs.readdirSync(path.join(FIXTURES_PATH, 'images')).forEach((imageName) => {
            saveOutput(`${imageName}_${configuration.id}`, Exif.parse(path.join(FIXTURES_PATH, 'images', imageName)));
        });
    });
}

function updateForRegularBuild() {
    delete process.env.EXIFREADER_CUSTOM_BUILD;
    execSync('npm run build');
    fs.readdirSync(path.join(FIXTURES_PATH, 'images')).forEach((imageName) => {
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
