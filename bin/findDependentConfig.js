const path = require('path');

module.exports = getConfigFromParent.bind(null, path.join(__dirname, '..'));

function getConfigFromParent(directory) {
    const parentDirectory = path.join(directory, '..');
    if (parentDirectory === directory) {
        return false;
    }

    try {
        const packageJson = require(path.join(parentDirectory, 'package.json'));
        return packageJson.exifreader;
    } catch (error) {
        return getConfigFromParent(parentDirectory);
    }
}
