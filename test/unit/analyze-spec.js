/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {execFileSync} from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {fileURLToPath} from 'url';
import {
    collectImagePaths,
    loadFullParser,
    loadTagBindingName,
    loadIptcTagExportNames,
    loadMakerNoteDecoders,
    resolveDomParser,
    analyzeImages,
    deriveConfig,
    deriveImports,
    writeConfigToPackageJson
} from '../../bin/analyze.js';
import * as Core from '../../src/composable/core.js';
import * as Formats from '../../src/composable/formats.js';
import * as Groups from '../../src/composable/groups.js';
import * as ExifTags from '../../src/composable/tags/exif.js';
import * as IptcTags from '../../src/composable/tags/iptc.js';
import IptcTagNames from '../../src/iptc-tag-names.js';
import {getTagBindingName} from '../../src/composable/tag-binding-name.js';
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
    });

    describe('deriveImports', () => {
        const CORE_IMPORT = 'import {createReader} from \'exifreader/core\';';
        const DOM_PARSER_COMMENT = '// Outside browsers, xmp needs a domParser in createReader, for example '
            + 'new DOMParser({onError: onErrorStopParsing}) from @xmldom/xmldom.';
        const MAKER_NOTE_COMMENT = (name) => `// ${name} decodes the maker notes in these images but no other make. `
            + 'Use makerNotes instead to get every maker note decoder, including the ones later releases add.';
        let iptcTagExportNames;
        let makerNoteDecoders;

        before(async () => {
            iptcTagExportNames = await loadIptcTagExportNames();
            makerNoteDecoders = Groups.makerNotes.decoders;
        });

        it('imports the xml format and the xmp group for an XMP sidecar file, even without an xmp key', () => {
            expect(snippetOf([image('xml')])).to.equal([
                CORE_IMPORT,
                'import {xml} from \'exifreader/formats\';',
                'import {xmp} from \'exifreader/groups\';',
                '',
                DOM_PARSER_COMMENT,
                'const reader = createReader({formats: [xml], groups: [xmp]});'
            ].join('\n'));
        });

        it('orders the formats like allFormats, whatever the input order', () => {
            const results = ['xml', 'gif', 'webp', 'jxl', 'avif', 'heic', 'png', 'jpeg', 'tiff'].map((fileType) => image(fileType));
            const expected = 'formats: [tiff, jpeg, png, heic, avif, jxl, webp, gif, xml]';
            expect(snippetOf(results)).to.contain(expected);
            expect(snippetOf(results.slice().reverse())).to.contain(expected);
        });

        it('imports nothing for SOF tags, jfif and pngFile', () => {
            const results = [
                image('jpeg', {file: fileGroup('jpeg', {'Image Width': {}}), jfif: {}}),
                image('png', {pngFile: {}})
            ];
            expect(snippetOf(results)).to.equal([
                CORE_IMPORT,
                'import {jpeg, png} from \'exifreader/formats\';',
                '',
                'const reader = createReader({formats: [jpeg, png]});'
            ].join('\n'));
        });

        it('imports the exif tag names as tags, as JavaScript names, distinct and sorted, leaving out a nested Thumbnail', () => {
            const results = [
                image('jpeg', {exif: {'IPTC-NAA': {}, 'DateTime': {}, 'Thumbnail': {Compression: {}}}}),
                image('jpeg', {exif: {'GPS Info IFD Pointer': {}, 'DateTime': {}}})
            ];
            expect(snippetOf(results)).to.equal([
                CORE_IMPORT,
                'import {jpeg} from \'exifreader/formats\';',
                'import {thumbnail} from \'exifreader/groups\';',
                'import {DateTime, GPSInfoIFDPointer, IPTCNAA} from \'exifreader/tags/exif\';',
                '',
                'const reader = createReader({formats: [jpeg], groups: [thumbnail], tags: [DateTime, GPSInfoIFDPointer, IPTCNAA]});'
            ].join('\n'));
        });

        it('imports the IPTC names as tags after the exif ones, without the iptc group', () => {
            const results = [
                image('jpeg', {exif: {DateTime: {}}, iptc: {'By-line': {}, 'Keywords': {}}}),
                image('jpeg', {iptc: {'Caption/Abstract': {}, 'By-line': {}}})
            ];
            expect(snippetOf(results)).to.equal([
                CORE_IMPORT,
                'import {jpeg} from \'exifreader/formats\';',
                'import {DateTime} from \'exifreader/tags/exif\';',
                'import {ByLine, CaptionAbstract, Keywords} from \'exifreader/tags/iptc\';',
                '',
                'const reader = createReader({formats: [jpeg], tags: [DateTime, ByLine, CaptionAbstract, Keywords]});'
            ].join('\n'));
        });

        it('imports the IPTC names as tags next to other groups', () => {
            const snippet = snippetOf([image('jpeg', {iptc: {'By-line': {}}, xmp: {}})]);

            expect(snippet).to.contain('import {xmp} from \'exifreader/groups\';');
            expect(snippet).to.contain('import {ByLine} from \'exifreader/tags/iptc\';');
            expect(snippet).to.contain('groups: [xmp], tags: [ByLine]');
        });

        it('keeps the iptc group for a name that has no tag of its own', () => {
            const snippet = snippetOf([image('jpeg', {iptc: {'By-line': {}}}), image('jpeg', {iptc: {'Record 2 destination': {}}})]);

            expect(snippet).to.contain('import {iptc} from \'exifreader/groups\';');
            expect(snippet).to.contain('groups: [iptc]');
            expect(snippet).to.not.contain('exifreader/tags/iptc');
            expect(snippet).to.not.contain('ByLine');
        });

        it('imports an IPTC name as a tag when the given export names hold its binding', () => {
            const results = [image('jpeg', {iptc: {'Record 2 destination': {}}})];
            const snippet = deriveImports(results, getTagBindingName, ['Record2Destination'], makerNoteDecoders);

            expect(IptcTags).to.not.have.property('Record2Destination');
            expect(snippet).to.contain('import {Record2Destination} from \'exifreader/tags/iptc\';');
            expect(snippet).to.contain('tags: [Record2Destination]');
            expect(snippet).to.not.contain('exifreader/groups');
        });

        it('keeps the iptc group for a name whose binding the given export names lack', () => {
            const snippet = deriveImports([image('jpeg', {iptc: {'By-line': {}}})], getTagBindingName, ['Keywords'], makerNoteDecoders);

            expect(IptcTags).to.have.property('ByLine');
            expect(snippet).to.contain('import {iptc} from \'exifreader/groups\';');
            expect(snippet).to.contain('groups: [iptc]');
            expect(snippet).to.not.contain('exifreader/tags/iptc');
        });

        it('imports the IPTC names as tags exactly when exifreader/tags/iptc exports them', () => {
            const names = [];
            for (const id of Object.keys(IptcTagNames.iptc)) {
                const entry = IptcTagNames.iptc[id];
                if (typeof entry === 'string') {
                    names.push(entry);
                } else if (typeof entry.name === 'function') {
                    names.push(entry.name([0, 0]), entry.name([0]));
                } else {
                    names.push(entry.name);
                }
            }
            expect(names.length).to.be.above(Object.keys(IptcTags).length);
            for (const name of names) {
                const snippet = snippetOf([image('jpeg', {iptc: {[name]: {}}})]);
                const isExported = Object.prototype.hasOwnProperty.call(IptcTags, getTagBindingName(name));

                expect(snippet.includes(`import {${getTagBindingName(name)}} from 'exifreader/tags/iptc';`), name).to.equal(isExported);
                expect(snippet.includes('groups: [iptc]'), name).to.equal(!isExported);
            }
        });

        it('keeps the tags a group reads in tags, since the reader returns them only then', () => {
            const results = [image('jpeg', {exif: {Make: {}, MakerNote: {}, DateTime: {}}, makerNotes: {}})];
            expect(snippetOf(results)).to.contain('tags: [DateTime, Make, MakerNote]');
        });

        [
            ['iptc', {iptc: {'Record 2 destination': {}}}, 'iptc'],
            ['xmp', {xmp: {}}, 'xmp'],
            ['icc', {icc: {}}, 'icc'],
            ['photoshop', {photoshop: {}}, 'photoshop'],
            ['mpf', {mpf: {}}, 'mpf'],
            ['makerNotes', {makerNotes: {}}, 'makerNotes'],
            ['gps', {gps: {Latitude: 1}}, 'gps'],
            ['composite', {composite: {}}, 'composite'],
            ['Thumbnail', {Thumbnail: {Compression: {}}}, 'thumbnail']
        ].forEach(([key, groups, group]) => {
            it(`imports the ${group} group for a ${key} key`, () => {
                const snippet = snippetOf([image('jpeg', groups)]);
                expect(snippet).to.contain(`import {${group}} from 'exifreader/groups';`);
                expect(snippet).to.contain(`groups: [${group}]`);
                expect(snippet).to.not.contain('exifreader/tags/');
            });
        });

        it('orders the groups like allGroups, whatever the input order', () => {
            const results = [
                image('jpeg', {Thumbnail: {}, composite: {}, gps: {}}),
                image('tiff', {makerNotes: {}, mpf: {}, photoshop: {}, icc: {}, xmp: {}, iptc: {}})
            ];
            const expected = 'groups: [iptc, xmp, icc, photoshop, mpf, makerNotes, gps, composite, thumbnail]';
            expect(snippetOf(results)).to.contain(expected);
            expect(snippetOf(results.slice().reverse())).to.contain(expected);
        });

        it('imports xmp once for an XMP sidecar and an image with XMP', () => {
            expect(snippetOf([image('xml', {xmp: {}}), image('jpeg', {xmp: {}})])).to.contain('groups: [xmp]');
        });

        it('says that xmp needs a domParser outside browsers only when xmp is composed', () => {
            expect(snippetOf([image('jpeg', {xmp: {}})]).split('\n')).to.include(DOM_PARSER_COMMENT);
            expect(snippetOf([image('jpeg', {icc: {}})])).to.not.contain('domParser');
        });

        describe('maker notes', () => {
            let canonResult;
            let pentaxResult;

            before(async () => {
                const parser = await loadFullParser();
                const analyzed = await analyzeImages(
                    ['canon', 'pentax'].map((make) => path.join(FIXTURES, `test-maker-note-${make}.jpg`)),
                    {fs, parser, domParser: resolveDomParser(process.cwd())}
                );
                [canonResult, pentaxResult] = analyzed.results.map((entry) => entry.tags);
            });

            ['canon', 'pentax'].forEach((name) => {
                it(`imports ${name} in place of makerNotes when it decodes every maker note, and says what that means`, () => {
                    const snippet = snippetOf([name === 'canon' ? canonResult : pentaxResult]);
                    const lines = snippet.split('\n');

                    expect(lines).to.include(`import {${name}} from 'exifreader/groups';`);
                    expect(snippet).to.contain(`groups: [${name}]`);
                    expect(lines.filter((line) => !line.startsWith('// ')).join('\n')).to.not.contain('makerNotes');
                    expect(lines.filter((line) => line.startsWith('// '))).to.deep.equal([MAKER_NOTE_COMMENT(name)]);
                    expect(lines[lines.length - 2]).to.equal(MAKER_NOTE_COMMENT(name));
                });
            });

            it('imports one decoder for several images of its make', () => {
                const snippet = snippetOf([canonResult, canonResult]);

                expect(snippet).to.contain('groups: [canon]');
                expect(snippet.split('\n')).to.include(MAKER_NOTE_COMMENT('canon'));
            });

            it('prints the maker note comment after the DOM parser comment', () => {
                const snippet = snippetOf([image('jpeg', {xmp: {}}), canonResult]);
                const lines = snippet.split('\n');

                expect(snippet).to.contain('groups: [xmp, canon]');
                expect(lines.slice(-3, -1)).to.deep.equal([DOM_PARSER_COMMENT, MAKER_NOTE_COMMENT('canon')]);
                expect(lines[lines.length - 1]).to.match(/^const reader = createReader\(/);
            });

            it('keeps the position of makerNotes among the groups', () => {
                const snippet = snippetOf([image('jpeg', {mpf: {}, gps: {}}), canonResult]);

                expect(snippet).to.contain('groups: [mpf, canon, gps]');
            });

            it('keeps makerNotes, with no comment, when two decoders are needed', () => {
                const snippet = snippetOf([canonResult, pentaxResult]);

                expect(snippet).to.contain('import {makerNotes} from \'exifreader/groups\';');
                expect(snippet).to.contain('groups: [makerNotes]');
                expect(snippet).to.not.contain('canon');
                expect(snippet).to.not.contain('pentax');
                expect(snippet).to.not.contain('//');
            });

            it('keeps makerNotes, with no comment, when a maker note no decoder reads is found too', () => {
                const snippet = snippetOf([canonResult, undecodedMakerNote()]);

                expect(snippet).to.contain('groups: [makerNotes]');
                expect(snippet).to.not.contain('//');
            });

            it('keeps makerNotes when a maker note has no Make tag and no decoder reads its bytes', () => {
                const snippet = snippetOf([canonResult, image('jpeg', {exif: {MakerNote: {value: [1, 2, 3]}}})]);

                expect(snippet).to.contain('groups: [makerNotes]');
                expect(snippet).to.not.contain('//');
            });

            it('keeps makerNotes when a result has makerNotes but no MakerNote tag to tell the make from', () => {
                const snippet = snippetOf([canonResult, image('jpeg', {makerNotes: {}})]);

                expect(snippet).to.contain('groups: [makerNotes]');
                expect(snippet).to.not.contain('//');
            });

            it('adds no maker note group for a maker note no decoder reads when no result has makerNotes', () => {
                const snippet = snippetOf([undecodedMakerNote(false)]);

                expect(snippet).to.not.contain('makerNotes');
                expect(snippet).to.not.contain('canon');
                expect(snippet).to.not.contain('pentax');
                expect(snippet).to.not.contain('//');
            });

            it('adds no decoder group for a Canon maker note when no result has makerNotes', () => {
                const canonTags = {exif: canonResult.exif};
                const snippet = snippetOf([image('jpeg', canonTags)]);

                expect(snippet).to.not.contain('exifreader/groups');
                expect(snippet).to.not.contain('//');
            });

            it('uses the first decoder that matches, as the reader does', () => {
                const first = {name: 'first', matches: () => true};
                const second = {name: 'second', matches: () => true};

                expect(deriveImports([canonResult], getTagBindingName, iptcTagExportNames, [first, second]))
                    .to.contain('groups: [first]');
            });

            it('gives each decoder the first strings of Make and Model and the MakerNote value, and takes only true as a match', () => {
                const inputs = [];
                const truthy = {name: 'truthy', matches: (input) => {
                    inputs.push(input);
                    return 1;
                }};
                const claiming = {name: 'claiming', matches: ({make, model}) => make === 'Canon' && model === 'EOS'};
                const result = image('jpeg', {exif: {Make: {value: ['Canon', 'Other']}, Model: {value: ['EOS']}, MakerNote: {value: [1, 2]}}, makerNotes: {}});

                expect(deriveImports([result], getTagBindingName, iptcTagExportNames, [truthy, claiming])).to.contain('groups: [claiming]');
                expect(inputs).to.deep.equal([{make: 'Canon', model: 'EOS', bytes: [1, 2]}]);
            });

            it('gives undefined for a Make or Model that is absent or does not start with a string', () => {
                const inputs = [];
                const recording = {name: 'recording', matches: (input) => {
                    inputs.push(input);
                    return true;
                }};
                const results = [
                    image('jpeg', {exif: {MakerNote: {value: [1]}}, makerNotes: {}}),
                    image('jpeg', {exif: {Make: {value: 'Canon'}, Model: {value: [5]}, MakerNote: {value: [1]}}, makerNotes: {}}),
                ];

                deriveImports(results, getTagBindingName, iptcTagExportNames, [recording]);

                expect(inputs.map(({make, model}) => [make, model])).to.deep.equal([[undefined, undefined], [undefined, undefined]]);
            });

            it('reads the same maker notes from a Canon image as the full library', async () => {
                const snippet = snippetOf([canonResult]);
                const modules = {
                    'exifreader/core': Core,
                    'exifreader/formats': Formats,
                    'exifreader/groups': Groups,
                    'exifreader/tags/exif': ExifTags
                };
                const bindings = {};
                for (const [, names, specifier] of snippet.matchAll(/^import \{([^}]+)\} from '([^']+)';$/gm)) {
                    for (const name of names.split(', ')) {
                        bindings[name] = modules[specifier][name];
                    }
                }
                const call = /^const reader = createReader\(\{(.+)\}\);$/m.exec(snippet)[1];
                const tables = {};
                for (const [, key, names] of call.matchAll(/(\w+): \[([^\]]*)\]/g)) {
                    tables[key] = names.split(', ').map((name) => bindings[name]);
                }
                const bytes = fs.readFileSync(path.join(FIXTURES, 'test-maker-note-canon.jpg'));
                const parser = await loadFullParser();
                const expected = await parser.load(bytes, {expanded: true, async: true});

                const tags = await Core.createReader(tables).load(bytes);

                expect(Object.keys(expected.makerNotes)).to.not.be.empty;
                expect(tags.makerNotes).to.deep.equal(expected.makerNotes);
            });

            it('names, for every decoder, an exifreader/groups export that decodes the same make', () => {
                expect(makerNoteDecoders).to.not.be.empty;
                for (const decoder of makerNoteDecoders) {
                    expect(Groups, decoder.name).to.have.own.property(decoder.name);
                    expect(Groups[decoder.name].decoders, decoder.name).to.deep.equal([decoder]);
                }
            });

            function undecodedMakerNote(withMakerNotes = true) {
                const groups = {exif: {Make: {value: ['NIKON CORPORATION']}, MakerNote: {value: [78, 105, 107, 111, 110, 0]}}};
                return image('jpeg', withMakerNotes ? Object.assign({makerNotes: {}}, groups) : groups);
            }
        });

        describe('every printed import', () => {
            const MODULES = {
                'exifreader/core': Core,
                'exifreader/formats': Formats,
                'exifreader/groups': Groups,
                'exifreader/tags/exif': ExifTags,
                'exifreader/tags/iptc': IptcTags
            };
            const RESULTS = [
                image('tiff', {
                    exif: {
                        'DateTime': {},
                        'Make': {},
                        'MakerNote': {},
                        'IPTC-NAA': {},
                        'GPS Info IFD Pointer': {},
                        'Interoperability IFD Pointer': {},
                        'Thumbnail': {Compression: {}}
                    },
                    iptc: {'By-line': {}},
                    makerNotes: {},
                    photoshop: {},
                    icc: {},
                    gps: {Latitude: 1},
                    composite: {}
                }),
                image('jpeg', {file: fileGroup('jpeg', {'Image Width': {}}), jfif: {}, mpf: {}, xmp: {}}),
                image('png', {pngFile: {}}),
                image('heic'),
                image('avif'),
                image('jxl'),
                image('webp'),
                image('gif'),
                image('xml', {xmp: {}})
            ];
            let directory;

            beforeEach(() => {
                directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-imports-'));
            });

            afterEach(() => {
                fs.rmSync(directory, {recursive: true, force: true});
            });

            it('is an export of the module it is imported from, and createReader accepts them', () => {
                const snippet = snippetOf(RESULTS);
                const bindings = {};
                for (const [, names, specifier] of snippet.matchAll(/^import \{([^}]+)\} from '([^']+)';$/gm)) {
                    expect(MODULES, specifier).to.have.own.property(specifier);
                    for (const name of names.split(', ')) {
                        expect(Object.keys(MODULES[specifier]), `${name} from ${specifier}`).to.include(name);
                        bindings[name] = MODULES[specifier][name];
                    }
                }
                expect(Object.keys(bindings)).to.include.members(['createReader', 'xml', 'xmp', 'GPSInfoIFDPointer', 'ByLine']);
                expect(Object.keys(bindings)).to.not.include('iptc');

                const call = /^const reader = createReader\(\{(.+)\}\);$/m.exec(snippet)[1];
                const tables = {};
                for (const [, key, names] of call.matchAll(/(\w+): \[([^\]]*)\]/g)) {
                    tables[key] = names.split(', ').map((name) => {
                        expect(bindings, name).to.have.own.property(name);
                        return bindings[name];
                    });
                }
                expect(Object.keys(tables)).to.deep.equal(['formats', 'groups', 'tags']);
                expect(tables.formats).to.deep.equal(Formats.allFormats);
                expect(() => Core.createReader(tables)).to.not.throw();
            });

            it('is valid JavaScript', () => {
                const file = path.join(directory, 'snippet.mjs');
                fs.writeFileSync(file, snippetOf(RESULTS));
                expect(() => execFileSync(process.execPath, ['--check', file], {stdio: 'pipe'})).to.not.throw();
            });
        });

        function snippetOf(results) {
            return deriveImports(results, getTagBindingName, iptcTagExportNames, makerNoteDecoders);
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

    describe('loadTagBindingName', () => {
        it('loads the tag binding name function of the composable source', async () => {
            expect(await loadTagBindingName()).to.equal(getTagBindingName);
        });
    });

    describe('loadMakerNoteDecoders', () => {
        it('loads the maker note decoders of the composable makerNotes group, in the order the reader tries them', async () => {
            const decoders = await loadMakerNoteDecoders();

            expect(decoders).to.equal(Groups.makerNotes.decoders);
            expect(decoders.map((decoder) => decoder.name)).to.deep.equal(['canon', 'pentax']);
        });
    });

    describe('loadIptcTagExportNames', () => {
        it('loads the names the composable iptc tag module exports', async () => {
            const names = await loadIptcTagExportNames();

            expect(names).to.include('ByLine');
            expect(names).to.have.members(Object.keys(IptcTags));
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

    function image(fileType, groups) {
        return Object.assign({file: fileGroup(fileType)}, groups);
    }

    function fileGroup(fileType, tags) {
        return Object.assign({}, tags, {FileType: {value: fileType, description: fileType.toUpperCase()}});
    }
});
