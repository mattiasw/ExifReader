/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {diffResults, verifyImages, loadCustomParser} from '../../bin/verify-build.js';

describe('verify-build', () => {
    describe('diffResults', () => {
        it('gives no differences for identical results', () => {
            expect(diffResults(result(), result())).to.deep.equal([]);
        });

        it('reports a changed value with both values', () => {
            const custom = result();
            custom.exif.FillOrder.description = 'Unknown';
            expect(diffResults(result(), custom)).to.deep.equal([
                'exif.FillOrder.description: "Normal" in the full parser, "Unknown" in the custom build'
            ]);
        });

        it('reports a tag missing from the custom build', () => {
            const custom = result();
            delete custom.exif.DateTime;
            expect(diffResults(result(), custom)).to.deep.equal(['exif.DateTime: missing from the custom build']);
        });

        it('reports a tag only in the custom build', () => {
            const custom = result();
            custom.exif.Extra = {value: 1};
            expect(diffResults(result(), custom)).to.deep.equal(['exif.Extra: only in the custom build']);
        });

        it('reports a whole group missing from the custom build once', () => {
            const custom = result();
            delete custom.exif;
            expect(diffResults(result(), custom)).to.deep.equal(['exif: missing from the custom build']);
        });

        it('reports differing thumbnail bytes without printing them', () => {
            const custom = result();
            custom.Thumbnail.image = new Uint8Array([1, 2, 4]).buffer;
            expect(diffResults(result(), custom)).to.deep.equal(['Thumbnail.image: bytes differ']);
        });

        it('reports thumbnail bytes of a different length', () => {
            const custom = result();
            custom.Thumbnail.image = new Uint8Array([1, 2]).buffer;
            expect(diffResults(result(), custom)).to.deep.equal(['Thumbnail.image: bytes differ']);
        });

        it('reports thumbnail bytes that the full ones are the start of', () => {
            expect(diffResults({image: new Uint8Array([1, 2]).buffer}, {image: new Uint8Array([1, 2, 3]).buffer})).to.deep.equal(['image: bytes differ']);
        });

        it('treats equal bytes in different buffers as equal', () => {
            expect(diffResults({image: new Uint8Array([1, 2]).buffer}, {image: new Uint8Array([1, 2]).buffer})).to.deep.equal([]);
        });

        it('compares typed arrays and data views by their bytes', () => {
            const bytes = new Uint8Array([9, 1, 2, 9]);
            expect(diffResults({image: new DataView(bytes.buffer, 1, 2)}, {image: new Uint8Array([1, 2])})).to.deep.equal([]);
            expect(diffResults({image: new DataView(bytes.buffer, 1, 2)}, {image: new Uint8Array([1, 3])})).to.deep.equal(['image: bytes differ']);
        });

        it('names array entries by index', () => {
            const full = {mpf: {Images: [{image: new Uint8Array([1]).buffer}, {image: new Uint8Array([1]).buffer}]}};
            const custom = {mpf: {Images: [{image: new Uint8Array([1]).buffer}, {image: new Uint8Array([2]).buffer}]}};
            expect(diffResults(full, custom)).to.deep.equal(['mpf.Images[1].image: bytes differ']);
        });

        it('reports an array entry missing from the custom build', () => {
            expect(diffResults({list: [1, 2]}, {list: [1]})).to.deep.equal(['list[1]: missing from the custom build']);
        });

        it('treats NaN as equal to NaN', () => {
            expect(diffResults({value: NaN}, {value: NaN})).to.deep.equal([]);
        });

        it('reports bytes against something else as a changed value', () => {
            expect(diffResults({image: new Uint8Array([1, 2]).buffer}, {image: 'x'})).to.deep.equal([
                'image: <2 bytes> in the full parser, "x" in the custom build'
            ]);
        });

        it('reports an object against a primitive as a changed value', () => {
            expect(diffResults({value: {a: 1}}, {value: 1})).to.deep.equal([
                'value: {"a":1} in the full parser, 1 in the custom build'
            ]);
        });

        it('reports an array against an object as a changed value', () => {
            expect(diffResults({value: [1]}, {value: {0: 1}})).to.deep.equal([
                'value: [1] in the full parser, {"0":1} in the custom build'
            ]);
        });

        it('reports undefined against null as a changed value', () => {
            expect(diffResults({value: undefined}, {value: null})).to.deep.equal([
                'value: undefined in the full parser, null in the custom build'
            ]);
        });

        it('cuts long values short', () => {
            const long = 'x'.repeat(200);
            const [difference] = diffResults({value: long}, {value: 'y'});
            const shown = difference.slice('value: '.length, difference.indexOf(' in the full parser'));
            expect(shown).to.have.lengthOf(80);
            expect(shown).to.equal(JSON.stringify(long).slice(0, 77) + '...');
        });

        it('shows a value of exactly 80 characters in full', () => {
            const value = 'x'.repeat(78);
            expect(diffResults({value}, {value: 'y'})[0]).to.equal(`value: ${JSON.stringify(value)} in the full parser, "y" in the custom build`);
        });

        function result() {
            return {
                file: {FileType: {value: 'jpeg', description: 'JPEG'}},
                exif: {
                    DateTime: {value: ['2020:01:01 00:00:00'], description: '2020:01:01 00:00:00'},
                    FillOrder: {value: 1, description: 'Normal'}
                },
                Thumbnail: {Compression: {value: 6}, image: new Uint8Array([1, 2, 3]).buffer, type: 'image/jpeg'}
            };
        }
    });

    describe('verifyImages', () => {
        const buffers = {'/a.jpg': Buffer.from('a'), '/b.jpg': Buffer.from('b')};
        const fakeFs = {
            readFileSync: (filePath) => {
                if (!buffers[filePath]) {
                    throw new Error(`ENOENT: ${filePath}`);
                }
                return buffers[filePath];
            }
        };

        it('gives no differences when both parsers agree', async () => {
            const parser = fakeParser((data) => ({file: {name: data.toString()}}));
            const result = await verifyImages(['/a.jpg', '/b.jpg'], {fs: fakeFs, fullParser: parser, customParser: parser, domParser: undefined});
            expect(result).to.deep.equal({
                results: [{path: '/a.jpg', differences: []}, {path: '/b.jpg', differences: []}],
                skipped: []
            });
        });

        it('lists the differences per file', async () => {
            const fullParser = fakeParser(() => ({exif: {Make: {value: 'x'}}}));
            const customParser = fakeParser((data) => (data.toString() === 'a' ? {exif: {}} : {exif: {Make: {value: 'x'}}}));
            const result = await verifyImages(['/a.jpg', '/b.jpg'], {fs: fakeFs, fullParser, customParser, domParser: undefined});
            expect(result.results).to.deep.equal([
                {path: '/a.jpg', differences: ['exif.Make: missing from the custom build']},
                {path: '/b.jpg', differences: []}
            ]);
        });

        it('parses with the same options and DOM parser on both sides', async () => {
            const domParser = {};
            const fullParser = fakeParser(() => ({}));
            const customParser = fakeParser(() => ({}));
            await verifyImages(['/a.jpg'], {fs: fakeFs, fullParser, customParser, domParser});
            expect(fullParser.calls).to.have.lengthOf(1);
            expect(customParser.calls).to.have.lengthOf(1);
            expect(fullParser.calls[0].options).to.deep.equal({expanded: true, async: true, domParser});
            expect(customParser.calls[0].options).to.deep.equal({expanded: true, async: true, domParser});
            expect(fullParser.calls[0].options.domParser).to.equal(domParser);
            expect(customParser.calls[0].options.domParser).to.equal(domParser);
            expect(fullParser.calls[0].data).to.equal(buffers['/a.jpg']);
            expect(customParser.calls[0].data).to.equal(buffers['/a.jpg']);
        });

        it('skips a file the full parser cannot read, without asking the custom build', async () => {
            const fullParser = fakeParser((data) => {
                if (data.toString() === 'a') {
                    throw new Error('Invalid image format');
                }
                return {};
            });
            const customParser = fakeParser(() => ({}));
            const result = await verifyImages(['/a.jpg', '/b.jpg'], {fs: fakeFs, fullParser, customParser, domParser: undefined});
            expect(result).to.deep.equal({
                results: [{path: '/b.jpg', differences: []}],
                skipped: [{path: '/a.jpg', message: 'Invalid image format'}]
            });
            expect(customParser.calls).to.have.lengthOf(1);
        });

        it('skips a file that cannot be read', async () => {
            const parser = fakeParser(() => ({}));
            const result = await verifyImages(['/missing.jpg'], {fs: fakeFs, fullParser: parser, customParser: parser, domParser: undefined});
            expect(result).to.deep.equal({results: [], skipped: [{path: '/missing.jpg', message: 'ENOENT: /missing.jpg'}]});
        });

        it('reports a custom build that fails where the full parser succeeds as one difference', async () => {
            const fullParser = fakeParser(() => ({}));
            const customParser = fakeParser(() => {
                throw new Error('Invalid image format');
            });
            const result = await verifyImages(['/a.jpg'], {fs: fakeFs, fullParser, customParser, domParser: undefined});
            expect(result.results).to.deep.equal([{path: '/a.jpg', differences: ['the custom build failed: Invalid image format']}]);
        });

        function fakeParser(parse) {
            const parser = {
                calls: [],
                load: (data, options) => {
                    parser.calls.push({data, options});
                    return new Promise((resolve) => resolve(parse(data)));
                }
            };
            return parser;
        }
    });

    describe('loadCustomParser', () => {
        let directory;

        beforeEach(() => {
            directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-verify-'));
        });

        afterEach(() => {
            fs.rmSync(directory, {recursive: true, force: true});
        });

        it('loads the bundle again after it changed', () => {
            const bundlePath = path.join(directory, 'exif-reader.js');
            fs.writeFileSync(bundlePath, 'module.exports = {build: 1};');
            expect(loadCustomParser(bundlePath)).to.deep.equal({build: 1});
            fs.writeFileSync(bundlePath, 'module.exports = {build: 2};');
            expect(loadCustomParser(bundlePath)).to.deep.equal({build: 2});
        });
    });
});
