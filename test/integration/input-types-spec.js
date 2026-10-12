/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const {expect} = require('chai');
const path = require('path');
const fs = require('fs');
const {DOMParser, onErrorStopParsing} = require('@xmldom/xmldom');

const ExifReader = require('../../src/exif-reader.js');
const FIXTURES = path.join(__dirname, '..', 'fixtures', 'images');
const domParser = new DOMParser({onError: onErrorStopParsing});

const PADDING_LENGTH = 37;
const OUTSIDE_BYTE = 0x5a;

const FIXTURE_CASES = [
    {file: 'test.jpg'},
    {file: 'test.png'},
    {file: 'test.tiff'},
    {file: 'test.heic'},
    {file: 'test.avif'},
    {file: 'test.jxl'},
    {file: 'test.gif'},
    {file: 'test-brotli.jxl', options: {async: true}}
];

describe('typed array inputs - real fixtures', function () {
    this.timeout(30000);

    for (const {file, options: fixtureOptions = {}} of FIXTURE_CASES) {
        describe(file, () => {
            const options = Object.assign({domParser, expanded: true}, fixtureOptions);
            let bytes;
            let expectedTags;

            before(async () => {
                bytes = new Uint8Array(fs.readFileSync(path.join(FIXTURES, file)));
                expectedTags = await ExifReader.load(bytes.slice().buffer, options);
            });

            it('gives tags for the ArrayBuffer', () => {
                expect(Object.keys(expectedTags)).to.not.be.empty;
            });

            it('gives the same tags for a Uint8Array copy', async () => {
                const tags = await ExifReader.load(bytes.slice(), options);
                expect(tags).to.deep.equal(expectedTags);
            });

            it('gives the same tags for a Uint8Array window into a padded buffer', async () => {
                const tags = await ExifReader.load(getPaddedWindow(bytes), options);
                expect(tags).to.deep.equal(expectedTags);
            });

            it('gives the same tags for a Node Buffer window', async () => {
                const paddedWindow = getPaddedWindow(bytes);
                const buffer = Buffer.from(paddedWindow.buffer, paddedWindow.byteOffset, paddedWindow.byteLength);
                expect(buffer.byteOffset).to.be.above(0);

                const tags = await ExifReader.load(buffer, options);
                expect(tags).to.deep.equal(expectedTags);
            });

            if (fs.statSync(path.join(FIXTURES, file)).size % 2 === 0) {
                it('gives the same tags for a Uint16Array', async () => {
                    const tags = await ExifReader.load(new Uint16Array(bytes.slice().buffer), options);
                    expect(tags).to.deep.equal(expectedTags);
                });
            }
        });
    }
});

function getPaddedWindow(bytes) {
    const padded = new Uint8Array(PADDING_LENGTH + bytes.length + PADDING_LENGTH).fill(OUTSIDE_BYTE);
    padded.set(bytes, PADDING_LENGTH);
    return padded.subarray(PADDING_LENGTH, PADDING_LENGTH + bytes.length);
}
