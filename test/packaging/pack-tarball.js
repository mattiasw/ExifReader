/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_PATH = path.join(__dirname, '..', '..');
const PACK_TIMEOUT_MS = 60000;

module.exports = {
    packAndExtract
};

/**
 * Packs the working tree (or takes an existing tarball) and extracts it into a
 * consumer project as node_modules/exifreader.
 *
 * @param {string} tempRoot Directory that receives the pack output and the consumer.
 * @param {{tarball?: string}} [options] An existing .tgz to extract instead of packing.
 * @returns {{consumerDir: string, installedDir: string, packedFiles: string[] | null}}
 *     packedFiles is the pack's file list, or null when a tarball was given.
 */
function packAndExtract(tempRoot, {tarball} = {}) {
    const pack = tarball ? describeTarball(tarball) : packTarball(tempRoot);

    // The tarball is extracted, not installed: npm install would reach for the
    // network and run postinstall on every commit.
    const projectDir = path.join(tempRoot, 'consumer');
    const nodeModulesDir = path.join(projectDir, 'node_modules');
    fs.mkdirSync(nodeModulesDir, {recursive: true});
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({private: true}));
    // A bare archive name: GNU tar reads a Windows drive path as a remote host.
    execFileSync('tar', ['-xzf', pack.tarballName, '-C', nodeModulesDir], {
        cwd: pack.directory,
        timeout: PACK_TIMEOUT_MS
    });
    fs.renameSync(path.join(nodeModulesDir, 'package'), path.join(nodeModulesDir, 'exifreader'));

    const consumerDir = fs.realpathSync(projectDir);
    return {
        consumerDir,
        installedDir: path.join(consumerDir, 'node_modules', 'exifreader'),
        packedFiles: pack.files
    };
}

function describeTarball(tarball) {
    return {
        directory: path.dirname(path.resolve(tarball)),
        tarballName: path.basename(tarball),
        files: null
    };
}

// The throwaway cache and the destination go in as environment variables so
// no path passes through a shell, and skipping scripts keeps stdout parseable
// as JSON. Windows needs the .cmd name and a shell to run npm.
function packTarball(directory) {
    const isWindows = process.platform === 'win32';
    const packDestination = path.join(directory, 'pack');
    fs.mkdirSync(packDestination);
    const output = execFileSync(
        isWindows ? 'npm.cmd' : 'npm',
        ['pack', '--json', '--ignore-scripts'],
        {
            cwd: ROOT_PATH,
            shell: isWindows,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: PACK_TIMEOUT_MS,
            env: {
                ...process.env,
                npm_config_cache: path.join(directory, 'cache'),
                npm_config_pack_destination: packDestination
            }
        }
    ).toString();
    const [packResult] = JSON.parse(output);
    return {
        directory: packDestination,
        tarballName: packResult.filename,
        files: packResult.files.map((file) => file.path)
    };
}
