/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {createRequire} from 'module';

const require = createRequire(import.meta.url);
const {buildSite} = require('../../bin/build-pages.js');

describe('build-pages', () => {
    let root;
    let outputDirectory;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-pages-'));
        outputDirectory = path.join(root, 'gh-pages');
        write('examples/index.html', '<html></html>');
        write('examples/style.css', 'body {}');
        write('examples/esm/example.js', 'export {};');
        write('examples/notes.txt', 'not published');
        write('src/exif-reader.js', 'export default {};');
        write('src/writer/exif-tag-table.js', 'export default [];');
        write('dist/exif-reader.js', 'bundle');
        write('dist/exif-reader.js.map', '{}');
    });

    afterEach(() => {
        fs.rmSync(root, {recursive: true, force: true});
    });

    it('copies the examples, the source tree and the bundle into the output directory', () => {
        buildSite(root, outputDirectory);

        expect(published('index.html')).to.equal('<html></html>');
        expect(published('style.css')).to.equal('body {}');
        expect(published('esm/example.js')).to.equal('export {};');
        expect(published('src/exif-reader.js')).to.equal('export default {};');
        expect(published('exif-reader.js')).to.equal('bundle');
        expect(published('exif-reader.js.map')).to.equal('{}');
    });

    it('creates the directory of a source file in a subdirectory it has not seen before', () => {
        buildSite(root, outputDirectory);

        expect(published('src/writer/exif-tag-table.js')).to.equal('export default [];');
    });

    it('leaves out example files with other extensions', () => {
        buildSite(root, outputDirectory);

        expect(fs.existsSync(path.join(outputDirectory, 'notes.txt'))).to.equal(false);
    });

    it('can run again into an existing output directory', () => {
        buildSite(root, outputDirectory);
        write('src/writer/exif-tag-table.js', 'export default [1];');

        buildSite(root, outputDirectory);

        expect(published('src/writer/exif-tag-table.js')).to.equal('export default [1];');
    });

    function write(relativePath, content) {
        const filePath = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(filePath), {recursive: true});
        fs.writeFileSync(filePath, content);
    }

    function published(relativePath) {
        return fs.readFileSync(path.join(outputDirectory, relativePath), 'utf8');
    }
});
