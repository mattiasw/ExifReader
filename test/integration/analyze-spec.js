/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const {expect} = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {collectImagePaths, loadFullParser, resolveDomParser, analyzeImages, deriveConfig} = require('../../bin/analyze.js');

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'images');

describe('analyze - real fixtures', function () {
    this.timeout(30000);

    let parser;
    let domParser;

    before(async () => {
        parser = await loadFullParser();
        domParser = resolveDomParser(process.cwd());
    });

    it('derives the configuration for test.jpg', async () => {
        const include = await includeFor([path.join(FIXTURES, 'test.jpg')]);
        expect(Object.keys(include)).to.deep.equal(['jpeg', 'file', 'jfif', 'exif', 'xmp', 'thumbnail']);
        expect(include.exif).to.include.members(['ExifVersion', 'DateTimeDigitized']);
        expect(include.exif).to.not.include.members(['Exif IFD Pointer']);
        expect(include.exif).to.not.include.members(['JPEGInterchangeFormat']);
    });

    it('derives the iptc tag names for test-iptc.jpg', async () => {
        const include = await includeFor([path.join(FIXTURES, 'test-iptc.jpg')]);
        expect(include.iptc).to.include.members(['Record Version', 'Sub-location']);
        expect(include.exif).to.not.include.members(['IPTC-NAA']);
    });

    it('derives the exif array for test.tiff, keeping the tags the build does not add', async () => {
        const include = await includeFor([path.join(FIXTURES, 'test.tiff')]);
        expect(include.tiff).to.equal(true);
        expect(include.exif).to.include.members(['ImageWidth', 'StripOffsets', 'PhotoshopSettings']);
        expect(include.exif).to.not.include.members(['IPTC-NAA']);
        expect(include.exif).to.not.include.members(['ApplicationNotes']);
        expect(include).to.not.have.property('photoshop');
    });

    it('derives the thumbnail of a PNG text chunk raw profile in test.png', async () => {
        const include = await includeFor([path.join(FIXTURES, 'test.png')]);
        expect(include).to.include({png: true, png_file: true, thumbnail: true});
        expect(include.exif).to.not.include.members(['Thumbnail']);
    });

    it('derives icc for test.heic', async () => {
        const include = await includeFor([path.join(FIXTURES, 'test.heic')]);
        expect(include).to.include({heic: true, icc: true});
    });

    it('derives the union of the images in a directory tree', async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-analyze-'));
        try {
            fs.mkdirSync(path.join(directory, 'nested'));
            fs.copyFileSync(path.join(FIXTURES, 'test-iptc.jpg'), path.join(directory, 'test-iptc.jpg'));
            fs.copyFileSync(path.join(FIXTURES, 'test.heic'), path.join(directory, 'nested', 'test.heic'));
            const include = await includeFor([directory]);
            expect(include).to.include({jpeg: true, heic: true, icc: true});
            expect(include.iptc).to.include.members(['Record Version']);
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    async function includeFor(paths) {
        const collected = collectImagePaths(paths, fs);
        const {results, skipped} = await analyzeImages(collected.paths, {fs, parser, domParser});
        expect(skipped).to.deep.equal([]);
        return deriveConfig(results.map((result) => result.tags)).config.include;
    }
});
