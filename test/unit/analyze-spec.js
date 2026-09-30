/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {fileURLToPath} from 'url';
import {
    collectImagePaths,
    loadFullParser,
    resolveDomParser,
    analyzeImages,
    deriveConfig,
    writeConfigToPackageJson
} from '../../bin/analyze.js';
import {getConsoleWarnSpy} from './test-utils.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'images');

describe('analyze', () => {
    describe('deriveConfig', () => {
        [
            ['jpeg', 'jpeg'],
            ['tiff', 'tiff'],
            ['png', 'png'],
            ['heic', 'heic'],
            ['avif', 'avif'],
            ['jxl', 'jxl'],
            ['webp', 'webp'],
            ['gif', 'gif']
        ].forEach(([fileType, format]) => {
            it(`includes the ${format} format for a ${fileType} image`, () => {
                expect(include([image(fileType)])).to.deep.equal({[format]: true});
            });
        });

        it('includes no format for a standalone XMP file', () => {
            expect(include([image('xml', {xmp: {}})])).to.deep.equal({xmp: true});
        });

        it('includes file for a JPEG with SOF tags', () => {
            expect(include([image('jpeg', {file: fileGroup('jpeg', {'Image Width': {value: 1}})})])).to.deep.equal({jpeg: true, file: true});
        });

        it('does not include file for a JPEG with only FileType', () => {
            expect(include([image('jpeg')])).to.deep.equal({jpeg: true});
        });

        it('does not include file for another format with extra file tags', () => {
            expect(include([image('jxl', {file: fileGroup('jxl', {'Image Width': {value: 1}})})])).to.deep.equal({jxl: true});
        });

        [
            ['jfif', 'jfif'],
            ['pngFile', 'png_file'],
            ['xmp', 'xmp'],
            ['icc', 'icc'],
            ['mpf', 'mpf']
        ].forEach(([group, module]) => {
            it(`includes ${module} for a ${group} group, even an empty one`, () => {
                expect(include([image('jpeg', {[group]: {}})])).to.deep.equal({jpeg: true, [module]: true});
            });
        });

        [
            ['photoshop', 'photoshop'],
            ['makerNotes', 'maker_notes']
        ].forEach(([group, module]) => {
            it(`includes ${module} and an empty exif array for a ${group} group`, () => {
                expect(include([image('jpeg', {[group]: {}})])).to.deep.equal({jpeg: true, exif: [], [module]: true});
            });
        });

        it('includes thumbnail and an empty exif array for a Thumbnail group', () => {
            expect(include([image('jpeg', {Thumbnail: {image: new ArrayBuffer(1), type: 'image/jpeg'}})])).to.deep.equal({jpeg: true, exif: [], thumbnail: true});
        });

        it('adds the Thumbnail group tag names to the exif array, leaving out image, base64 and type', () => {
            const Thumbnail = {Compression: {}, XResolution: {}, image: new ArrayBuffer(1), base64: 'AA==', type: 'image/jpeg'};
            expect(include([image('jpeg', {Thumbnail})]).exif).to.deep.equal(['Compression', 'XResolution']);
        });

        it('includes thumbnail and its tag names for a Thumbnail nested in the exif group', () => {
            const config = include([image('png', {exif: {ImageWidth: {}, Thumbnail: {Compression: {}}}})]);
            expect(config).to.deep.equal({png: true, exif: ['Compression', 'ImageWidth'], thumbnail: true});
        });

        it('includes an exif array with the union of the exif tag names', () => {
            const config = include([
                image('jpeg', {exif: {Make: {}, DateTime: {}}}),
                image('jpeg', {exif: {DateTime: {}, Artist: {}}})
            ]);
            expect(config.exif).to.deep.equal(['Artist', 'DateTime', 'Make']);
        });

        it('includes an empty exif array for an empty exif group', () => {
            expect(include([image('jpeg', {exif: {}})])).to.deep.equal({jpeg: true, exif: []});
        });

        it('includes an iptc array with the union of the iptc tag names', () => {
            const config = include([
                image('jpeg', {iptc: {'Record Version': {}, 'Object Name': {}}}),
                image('jpeg', {iptc: {'Object Name': {}, 'By-line': {}}})
            ]);
            expect(config.iptc).to.deep.equal(['By-line', 'Object Name', 'Record Version']);
        });

        it('includes an empty iptc array for an empty iptc group', () => {
            expect(include([image('jpeg', {iptc: {}})])).to.deep.equal({jpeg: true, iptc: []});
        });

        ['iptc', 'xmp', 'icc'].forEach((group) => {
            it(`includes an empty exif array for ${group} in a TIFF`, () => {
                expect(include([image('tiff', {[group]: {}})]).exif).to.deep.equal([]);
            });

            it(`does not include an exif array for ${group} in a JPEG`, () => {
                expect(include([image('jpeg', {[group]: {}})])).to.not.have.property('exif');
            });
        });

        it('does not include an exif array for mpf alone', () => {
            expect(include([image('jpeg', {mpf: {}})])).to.not.have.property('exif');
        });

        it('includes nothing for derived groups', () => {
            expect(include([image('jpeg', {gps: {Latitude: 1}, composite: {}, png: {}, pngText: {}, riff: {}, gif: {}})])).to.deep.equal({jpeg: true});
        });

        describe('tags that the build adds itself', () => {
            it('always leaves out Exif IFD Pointer', () => {
                expect(exifNames({'Exif IFD Pointer': {}, 'DateTime': {}})).to.deep.equal(['DateTime']);
            });

            it('leaves out GPS Info IFD Pointer when there is another GPS tag', () => {
                expect(exifNames({'GPS Info IFD Pointer': {}, 'GPSLatitude': {}})).to.deep.equal(['GPSLatitude']);
            });

            it('keeps GPS Info IFD Pointer when there is no other GPS tag', () => {
                expect(exifNames({'GPS Info IFD Pointer': {}})).to.deep.equal(['GPS Info IFD Pointer']);
            });

            it('leaves out Interoperability IFD Pointer when there is another Interoperability tag', () => {
                expect(exifNames({'Interoperability IFD Pointer': {}, 'InteroperabilityIndex': {}})).to.deep.equal(['InteroperabilityIndex']);
            });

            it('leaves out Interoperability IFD Pointer when there is a RelatedImage tag', () => {
                expect(exifNames({'Interoperability IFD Pointer': {}, 'RelatedImageWidth': {}})).to.deep.equal(['RelatedImageWidth']);
            });

            it('keeps Interoperability IFD Pointer when there is no other Interoperability tag', () => {
                expect(exifNames({'Interoperability IFD Pointer': {}})).to.deep.equal(['Interoperability IFD Pointer']);
            });

            [
                ['iptc', 'iptc', ['IPTC-NAA']],
                ['xmp', 'xmp', ['ApplicationNotes']],
                ['icc', 'icc', ['ICC_Profile']],
                ['photoshop', 'photoshop', ['ImageSourceData', 'PhotoshopSettings']],
                ['Thumbnail', 'thumbnail', ['JPEGInterchangeFormat', 'JPEGInterchangeFormatLength']],
                ['makerNotes', 'maker_notes', ['MakerNote', 'Make']]
            ].forEach(([group, module, names]) => {
                it(`leaves out ${names.join(' and ')} when ${module} is included`, () => {
                    const exif = Object.fromEntries(names.concat('DateTime').map((name) => [name, {}]));
                    expect(include([image('tiff', {exif, [group]: {}})]).exif).to.deep.equal(['DateTime']);
                });

                it(`keeps ${names.join(' and ')} when ${module} is not included`, () => {
                    const exif = Object.fromEntries(names.concat('DateTime').map((name) => [name, {}]));
                    expect(include([image('jpeg', {exif})]).exif).to.deep.equal(names.concat('DateTime').sort());
                });
            });

            function exifNames(exif) {
                return include([image('jpeg', {exif})]).exif;
            }
        });

        it('orders the modules like the custom build configuration and sorts the arrays, whatever the input order', () => {
            const results = [
                image('png', {exif: {Zeta: {}}, pngFile: {}, Thumbnail: {Compression: {}}}),
                image('jpeg', {
                    file: fileGroup('jpeg', {'Image Width': {}}),
                    mpf: {},
                    makerNotes: {},
                    photoshop: {},
                    icc: {},
                    xmp: {},
                    iptc: {B: {}, A: {}},
                    exif: {Alpha: {}},
                    jfif: {}
                }),
                image('gif'),
                image('webp'),
                image('jxl'),
                image('avif'),
                image('heic'),
                image('tiff')
            ];
            const expected = [
                'jpeg', 'tiff', 'png', 'heic', 'avif', 'jxl', 'webp', 'gif',
                'file', 'jfif', 'png_file', 'exif', 'iptc', 'xmp', 'icc', 'photoshop', 'maker_notes', 'mpf', 'thumbnail'
            ];
            expect(Object.keys(include(results))).to.deep.equal(expected);
            expect(Object.keys(include(results.slice().reverse()))).to.deep.equal(expected);
            expect(include(results).exif).to.deep.equal(['Alpha', 'Compression', 'Zeta']);
            expect(include(results).iptc).to.deep.equal(['A', 'B']);
        });

        it('returns the found file types, sorted and distinct', () => {
            expect(deriveConfig([image('png'), image('jpeg'), image('png')]).fileTypes).to.deep.equal(['jpeg', 'png']);
        });

        it('wraps the modules in an include section', () => {
            expect(deriveConfig([image('jpeg')]).config).to.deep.equal({include: {jpeg: true}});
        });

        it('warns about the formats that were not found, by name', () => {
            const {warnings} = deriveConfig([image('jpeg'), image('png'), image('heic'), image('avif'), image('webp')]);
            expect(warnings[0]).to.equal('No TIFF, JPEG XL or GIF images were found, so the build will not read those formats.');
        });

        it('names a single missing format', () => {
            const {warnings} = deriveConfig(['jpeg', 'tiff', 'png', 'heic', 'avif', 'jxl', 'webp'].map((fileType) => image(fileType)));
            expect(warnings[0]).to.equal('No GIF images were found, so the build will not read that format.');
        });

        it('does not warn about missing formats when all of them were found', () => {
            const {warnings} = deriveConfig(['jpeg', 'tiff', 'png', 'heic', 'avif', 'jxl', 'webp', 'gif'].map((fileType) => image(fileType)));
            expect(warnings).to.have.lengthOf(1);
            expect(warnings.join('\n')).to.not.contain('were found');
        });

        it('always warns that what is not in the images is left out', () => {
            const {warnings} = deriveConfig([image('jpeg')]);
            expect(warnings[warnings.length - 1]).to.equal('Tags and metadata groups that do not appear in these images '
                + 'are left out of the build, so pass a sample of every kind of image your app reads, all in one run.');
        });

        function include(results) {
            return deriveConfig(results).config.include;
        }

        function image(fileType, groups) {
            return Object.assign({file: fileGroup(fileType)}, groups);
        }

        function fileGroup(fileType, tags) {
            return Object.assign({}, tags, {FileType: {value: fileType, description: fileType.toUpperCase()}});
        }
    });

    describe('collectImagePaths', () => {
        let directory;

        beforeEach(() => {
            directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-analyze-')));
        });

        afterEach(() => {
            fs.rmSync(directory, {recursive: true, force: true});
        });

        it('takes a named file as it is', () => {
            const file = write('a.jpg');
            expect(collectImagePaths([file], fs)).to.deep.equal({paths: [file], skipped: []});
        });

        it('walks a directory recursively and sorts the files', () => {
            const files = [write('b.jpg'), write('sub/deeper/a.jpg'), write('a.png')];
            expect(collectImagePaths([directory], fs).paths).to.deep.equal(files.slice().sort());
        });

        it('lists a file named both directly and through its directory once', () => {
            const file = write('sub/a.jpg');
            expect(collectImagePaths([file, directory, path.join(directory, 'sub', '..', 'sub', 'a.jpg')], fs).paths).to.deep.equal([file]);
        });

        it('throws naming a named path that does not exist', () => {
            const missing = path.join(directory, 'missing');
            expect(() => collectImagePaths([missing], fs)).to.throw(missing);
        });

        it('follows a symlinked file and directory', () => {
            const target = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-analyze-target-')));
            try {
                fs.writeFileSync(path.join(target, 'linked.jpg'), '');
                fs.symlinkSync(target, path.join(directory, 'linked-dir'));
                fs.symlinkSync(path.join(target, 'linked.jpg'), path.join(directory, 'linked-file.jpg'));
                expect(collectImagePaths([directory], fs).paths).to.deep.equal([
                    path.join(directory, 'linked-dir', 'linked.jpg'),
                    path.join(directory, 'linked-file.jpg')
                ]);
            } finally {
                fs.rmSync(target, {recursive: true, force: true});
            }
        });

        it('skips a broken symlink met during the walk and keeps going', () => {
            const file = write('a.jpg');
            const broken = path.join(directory, 'broken.jpg');
            fs.symlinkSync(path.join(directory, 'nowhere'), broken);
            const result = collectImagePaths([directory], fs);
            expect(result.paths).to.deep.equal([file]);
            expect(result.skipped).to.have.lengthOf(1);
            expect(result.skipped[0].path).to.equal(broken);
            expect(result.skipped[0].message).to.contain('ENOENT');
        });

        it('skips a directory that cannot be listed and keeps going', () => {
            const file = write('a.jpg');
            const unreadable = path.join(directory, 'unreadable');
            fs.mkdirSync(unreadable);
            const fakeFs = Object.assign({}, fs, {
                readdirSync: (target) => {
                    if (target === unreadable) {
                        throw new Error('EACCES: permission denied');
                    }
                    return fs.readdirSync(target);
                }
            });
            const result = collectImagePaths([directory], fakeFs);
            expect(result.paths).to.deep.equal([file]);
            expect(result.skipped).to.deep.equal([{path: unreadable, message: 'EACCES: permission denied'}]);
        });

        it('does not walk a directory again through a symlink cycle', () => {
            const file = write('sub/a.jpg');
            fs.symlinkSync('..', path.join(directory, 'sub', 'up'));
            expect(collectImagePaths([directory], fs)).to.deep.equal({paths: [file], skipped: []});
        });

        function write(relativePath) {
            const filePath = path.join(directory, relativePath);
            fs.mkdirSync(path.dirname(filePath), {recursive: true});
            fs.writeFileSync(filePath, '');
            return filePath;
        }
    });

    describe('loadFullParser', () => {
        it('loads the ExifReader source', async () => {
            const parser = await loadFullParser();
            expect(parser.load).to.be.a('function');
            expect(parser.errors).to.have.property('MetadataMissingError');
        });
    });

    describe('resolveDomParser', () => {
        it('returns an xmldom DOM parser when it resolves', () => {
            const domParser = resolveDomParser(process.cwd());
            expect(domParser.parseFromString).to.be.a('function');
        });

        it('resolves xmldom from the exifreader directory, then the given directory, and passes onErrorStopParsing', () => {
            class FakeDomParser {
                constructor(options) {
                    this.options = options;
                }
            }
            const calls = [];
            const onErrorStopParsing = () => undefined;
            const domParser = resolveDomParser('/somewhere', {
                resolve: (request, options) => {
                    calls.push({request, options});
                    return '/resolved/xmldom.js';
                },
                require: (modulePath) => {
                    calls.push({modulePath});
                    return {DOMParser: FakeDomParser, onErrorStopParsing};
                }
            });
            expect(calls).to.deep.equal([
                {
                    request: '@xmldom/xmldom',
                    options: {paths: [path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), '/somewhere']}
                },
                {modulePath: '/resolved/xmldom.js'}
            ]);
            expect(domParser).to.be.an.instanceOf(FakeDomParser);
            expect(domParser.options).to.deep.equal({onError: onErrorStopParsing});
            expect(domParser.options.onError).to.equal(onErrorStopParsing);
        });

        it('returns undefined when xmldom does not resolve', () => {
            const domParser = resolveDomParser(process.cwd(), {
                resolve: () => {
                    throw new Error('Cannot find module');
                }
            });
            expect(domParser).to.equal(undefined);
        });

        it('returns undefined when xmldom cannot be loaded', () => {
            const domParser = resolveDomParser(process.cwd(), {
                resolve: () => 'xmldom',
                require: () => {
                    throw new Error('broken');
                }
            });
            expect(domParser).to.equal(undefined);
        });
    });

    describe('analyzeImages', () => {
        let parser;

        before(async () => {
            parser = await loadFullParser();
        });

        it('parses each image expanded, asynchronously and with the given DOM parser', async () => {
            const calls = [];
            const domParser = {};
            const buffer = Buffer.from('image');
            const fakeParser = {
                load: (data, options) => {
                    calls.push({data, options});
                    return Promise.resolve({file: {}});
                }
            };
            const result = await analyzeImages(['/a.jpg'], {fs: {readFileSync: () => buffer}, parser: fakeParser, domParser});
            expect(calls).to.have.lengthOf(1);
            expect(calls[0].data).to.equal(buffer);
            expect(calls[0].options).to.deep.equal({expanded: true, async: true, domParser});
            expect(calls[0].options.domParser).to.equal(domParser);
            expect(result).to.deep.equal({results: [{path: '/a.jpg', tags: {file: {}}}], skipped: []});
        });

        it('skips a file that cannot be read and one that is not an image, and keeps going', async () => {
            const missing = path.join(FIXTURES, 'missing.jpg');
            const notAnImage = path.join(FIXTURES, 'test-not-an-image.txt');
            const jpeg = path.join(FIXTURES, 'test.jpg');
            const result = await analyzeImages([missing, notAnImage, jpeg], {fs, parser, domParser: resolveDomParser(process.cwd())});
            expect(result.results.map((entry) => entry.path)).to.deep.equal([jpeg]);
            expect(result.results[0].tags.file.FileType.value).to.equal('jpeg');
            expect(result.skipped.map((entry) => entry.path)).to.deep.equal([missing, notAnImage]);
            expect(result.skipped[0].message).to.contain('ENOENT');
            expect(result.skipped[1].message).to.equal('Invalid image format');
        });

        it('still gives an xmp group without a DOM parser', async () => {
            const warnSpy = getConsoleWarnSpy();
            try {
                const result = await analyzeImages([path.join(FIXTURES, 'test-xmp-utf8.jpg')], {fs, parser, domParser: undefined});
                expect(result.results[0].tags).to.have.property('xmp');
                expect(deriveConfig([result.results[0].tags]).config.include.xmp).to.equal(true);
            } finally {
                warnSpy.reset();
            }
        });
    });

    describe('writeConfigToPackageJson', () => {
        const include = {jpeg: true, exif: ['DateTime']};
        let directory;
        let filePath;

        beforeEach(() => {
            directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-analyze-'));
            filePath = path.join(directory, 'package.json');
        });

        afterEach(() => {
            fs.rmSync(directory, {recursive: true, force: true});
        });

        it('replaces an include section and returns it', () => {
            fs.writeFileSync(filePath, '{\n  "name": "app",\n  "exifreader": {\n    "include": {\n      "png": true\n    }\n  }\n}\n');
            const outcome = writeConfigToPackageJson(filePath, include, fs);
            expect(outcome).to.deep.equal({created: false, replaced: {include: {png: true}}});
            expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).to.deep.equal({name: 'app', exifreader: {include}});
        });

        it('replaces an exclude section instead of merging with it', () => {
            fs.writeFileSync(filePath, JSON.stringify({exifreader: {exclude: {xmp: true}}}, null, 2));
            const outcome = writeConfigToPackageJson(filePath, include, fs);
            expect(outcome).to.deep.equal({created: false, replaced: {exclude: {xmp: true}}});
            expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).to.deep.equal({exifreader: {include}});
        });

        it('replaces both an include and an exclude section at the position of the first one', () => {
            fs.writeFileSync(filePath, JSON.stringify({exifreader: {a: 1, exclude: {xmp: true}, b: 2, include: {png: true}, c: 3}}));
            const outcome = writeConfigToPackageJson(filePath, include, fs);
            expect(outcome.replaced).to.deep.equal({exclude: {xmp: true}, include: {png: true}});
            const written = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            expect(Object.keys(written.exifreader)).to.deep.equal(['a', 'include', 'b', 'c']);
        });

        it('keeps the other keys and their order', () => {
            fs.writeFileSync(filePath, JSON.stringify({name: 'app', exifreader: {include: {}}, version: '1.0.0', scripts: {build: 'x'}}, null, 2));
            writeConfigToPackageJson(filePath, include, fs);
            const written = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            expect(Object.keys(written)).to.deep.equal(['name', 'exifreader', 'version', 'scripts']);
            expect(written.scripts).to.deep.equal({build: 'x'});
        });

        it('adds include to an exifreader section without a selection', () => {
            fs.writeFileSync(filePath, JSON.stringify({exifreader: {note: 'x'}}));
            const outcome = writeConfigToPackageJson(filePath, include, fs);
            expect(outcome).to.deep.equal({created: false, replaced: undefined});
            expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).to.deep.equal({exifreader: {note: 'x', include}});
        });

        it('creates the exifreader section when it is missing', () => {
            fs.writeFileSync(filePath, JSON.stringify({name: 'app'}, null, 2) + '\n');
            const outcome = writeConfigToPackageJson(filePath, include, fs);
            expect(outcome).to.deep.equal({created: true, replaced: undefined});
            expect(fs.readFileSync(filePath, 'utf8')).to.equal(JSON.stringify({name: 'app', exifreader: {include}}, null, 2) + '\n');
        });

        it('replaces an exifreader value that is not an object', () => {
            fs.writeFileSync(filePath, JSON.stringify({exifreader: 'jpeg'}));
            const outcome = writeConfigToPackageJson(filePath, include, fs);
            expect(outcome).to.deep.equal({created: true, replaced: undefined});
            expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).to.deep.equal({exifreader: {include}});
        });

        it('replaces an exifreader array', () => {
            fs.writeFileSync(filePath, JSON.stringify({exifreader: ['jpeg']}));
            expect(writeConfigToPackageJson(filePath, include, fs).created).to.equal(true);
            expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).to.deep.equal({exifreader: {include}});
        });

        it('replaces a null exifreader value', () => {
            fs.writeFileSync(filePath, JSON.stringify({exifreader: null}));
            expect(writeConfigToPackageJson(filePath, include, fs).created).to.equal(true);
        });

        [['tabs', '\t'], ['four spaces', '    '], ['two spaces', '  ']].forEach(([name, indent]) => {
            it(`keeps ${name} indentation`, () => {
                const pkg = {name: 'app', exifreader: {include: {}}};
                fs.writeFileSync(filePath, JSON.stringify(pkg, null, indent) + '\n');
                writeConfigToPackageJson(filePath, include, fs);
                expect(fs.readFileSync(filePath, 'utf8')).to.equal(JSON.stringify({name: 'app', exifreader: {include}}, null, indent) + '\n');
            });
        });

        it('uses two spaces for a file with no indented line', () => {
            fs.writeFileSync(filePath, '{"name":"app"}\n');
            writeConfigToPackageJson(filePath, include, fs);
            expect(fs.readFileSync(filePath, 'utf8')).to.equal(JSON.stringify({name: 'app', exifreader: {include}}, null, 2) + '\n');
        });

        it('keeps a byte order mark', () => {
            fs.writeFileSync(filePath, '\uFEFF{\n  "name": "app"\n}\n', 'utf8');
            writeConfigToPackageJson(filePath, include, fs);
            expect(fs.readFileSync(filePath, 'utf8')).to.equal('\uFEFF' + JSON.stringify({name: 'app', exifreader: {include}}, null, 2) + '\n');
        });

        it('keeps a missing trailing newline missing', () => {
            fs.writeFileSync(filePath, '{\n  "name": "app"\n}');
            writeConfigToPackageJson(filePath, include, fs);
            expect(fs.readFileSync(filePath, 'utf8')).to.equal(JSON.stringify({name: 'app', exifreader: {include}}, null, 2));
        });

        it('keeps CRLF line endings', () => {
            fs.writeFileSync(filePath, '{\r\n  "name": "app"\r\n}\r\n');
            writeConfigToPackageJson(filePath, include, fs);
            const expected = JSON.stringify({name: 'app', exifreader: {include}}, null, 2).replace(/\n/g, '\r\n') + '\r\n';
            expect(fs.readFileSync(filePath, 'utf8')).to.equal(expected);
        });

        it('throws on a file that is not valid JSON and leaves it alone', () => {
            fs.writeFileSync(filePath, '{name');
            expect(() => writeConfigToPackageJson(filePath, include, fs)).to.throw(SyntaxError);
            expect(fs.readFileSync(filePath, 'utf8')).to.equal('{name');
        });
    });
});
