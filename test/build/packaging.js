/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const {expect} = require('chai');
const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT_PATH = path.join(__dirname, '..', '..');
const PACK_TIMEOUT_MS = 60000;

describe('packaging', function () {
    this.timeout(PACK_TIMEOUT_MS);

    it('ships src/package.json in the npm tarball', () => {
        // A separate cache (passed as an environment variable so the path
        // never goes through a shell) keeps the dry run from touching the
        // real npm cache, and skipping scripts keeps stdout parseable as
        // JSON. Windows needs the .cmd name and a shell to run npm.
        const isWindows = process.platform === 'win32';
        const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-pack-'));
        try {
            const output = execFileSync(
                isWindows ? 'npm.cmd' : 'npm',
                ['pack', '--dry-run', '--json', '--ignore-scripts'],
                {
                    cwd: ROOT_PATH,
                    shell: isWindows,
                    env: {...process.env, npm_config_cache: cachePath},
                }
            ).toString();
            const files = JSON.parse(output)[0].files.map((file) => file.path);
            expect(files).to.include('src/package.json');
        } finally {
            fs.rmSync(cachePath, {recursive: true, force: true});
        }
    });

    it('declares src as ES modules and nothing else', () => {
        const content = JSON.parse(fs.readFileSync(path.join(ROOT_PATH, 'src', 'package.json'), 'utf8'));
        expect(content).to.deep.equal({type: 'module'});
    });

    it('resolves require of the package root to the UMD bundle', () => {
        expect(require.resolve(ROOT_PATH)).to.equal(path.join(ROOT_PATH, 'dist', 'exif-reader.js'));

        const exifReader = require(ROOT_PATH);
        expect(typeof exifReader.load).to.equal('function');
    });
});
