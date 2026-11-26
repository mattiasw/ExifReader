/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {expect} from 'chai';
import {getDataView} from '../test-utils.js';
import {
    getTiff,
    getJpeg,
    getExifSegment,
    ascii,
    undefinedBytes,
    canonMakerNote,
    TAG_MAKE,
    TAG_MODEL,
    TAG_MAKER_NOTE,
    TAG_CANON_LENS_MODEL,
} from '../loadview-inventory-images.js';

// test/unit/package.json has no name, so a bare exifreader/... import from here
// is not a self-reference; resolving it from the root package.json goes through
// the exports map as a user's import does.
const requireFromRoot = createRequire(new URL('../../../package.json', import.meta.url));
const {createReader, tagFilter} = await importPublic('exifreader/core');
const {jpeg, tiff} = await importPublic('exifreader/formats');
const {exif, canon, pentax, makerNotes, createMakerNoteDecoder} = await importPublic('exifreader/groups');

const README_EXAMPLE_START = '// README example start';
const README_EXAMPLE_END = '// README example end';

// README example start
// A made-up camera whose maker note starts with a 16-bit version number.
const exampleCam = createMakerNoteDecoder({
    matches: ({make, bytes}) => make === 'ExampleCam' && bytes.length >= 2,
    read: ({tiffView, tiffHeaderOffset, makerNoteOffset, byteOrder}) => {
        const version = tiffView.getUint16(tiffHeaderOffset + makerNoteOffset, byteOrder === 0x4949);
        return {ExampleVersion: {value: version, description: `Version ${version}`}};
    },
});
// README example end

const EXAMPLE_TAGS = {ExampleVersion: {value: 0x0102, description: 'Version 258'}};
const EXAMPLE_MAKER_NOTE = '\x01\x02 maker';
const CANON_TAGS = {LensModel: {id: TAG_CANON_LENS_MODEL, value: ['canon lens'], description: 'canon lens'}};
const MY_TAGS = {Mine: {value: 1, description: 'mine'}};
const DECODER_DEFINITION_MESSAGE = 'createMakerNoteDecoder: takes {matches, read}, two functions';
const IFD_TYPE_SBYTE = 6;

describe('maker note decoders through the public subpaths', () => {
    it('should be shown in the README exactly as this spec runs it', () => {
        const spec = readCommittedText(fileURLToPath(import.meta.url));
        const example = spec.slice(spec.indexOf(README_EXAMPLE_START + '\n') + README_EXAMPLE_START.length + 1, spec.indexOf(README_EXAMPLE_END + '\n'));

        expect(example).to.contain('createMakerNoteDecoder({');
        expect(readCommittedText(fileURLToPath(new URL('../../../README.md', import.meta.url)))).to.contain('```javascript\n'
            + 'import {createReader} from \'exifreader/core\';\n'
            + 'import {jpeg, tiff} from \'exifreader/formats\';\n'
            + 'import {createMakerNoteDecoder} from \'exifreader/groups\';\n'
            + '\n'
            + example
            + '\n'
            + 'const reader = createReader({formats: [jpeg, tiff], groups: [exampleCam]});\n'
            + 'const tags = await reader.load(file);\n'
            + '// tags.makerNotes.ExampleVersion\n'
            + '```\n');
    });

    describe('the README example', () => {
        it('should read its tag from a big-endian TIFF file', async () => {
            const tags = await load(getExampleTiff(), [exampleCam]);

            expect(tags.makerNotes).to.deep.equal(EXAMPLE_TAGS);
        });

        it('should read its tag from a little-endian TIFF file', async () => {
            const tags = await load(getLittleEndianTiff('ExampleCam', EXAMPLE_MAKER_NOTE), [exampleCam]);

            expect(tags.makerNotes).to.deep.equal({ExampleVersion: {value: 0x0201, description: 'Version 513'}});
        });

        it('should read its tag from a JPEG file', async () => {
            const tags = await load(getJpeg(getExifSegment(getExampleTiff())), [exampleCam]);

            expect(tags.makerNotes).to.deep.equal(EXAMPLE_TAGS);
        });

        it('should return only its tags when it is the only group', async () => {
            const tags = await load(getExampleTiff(), [exampleCam]);

            expect(Object.keys(tags).sort()).to.deep.equal(['file', 'makerNotes']);
        });

        it('should return no makerNotes for a file of another make', async () => {
            const tags = await load(getExampleTiff({make: 'OtherCam'}), [exampleCam]);

            expect(tags).to.not.have.property('makerNotes');
        });
    });

    it('should defer a read that returns a Promise', async () => {
        const later = createMakerNoteDecoder({
            matches: ({make}) => make === 'ExampleCam',
            read: () => new Promise((resolve) => setTimeout(() => resolve(MY_TAGS), 1)),
        });

        expect((await load(getExampleTiff(), [later])).makerNotes).to.deep.equal(MY_TAGS);
    });

    describe('the order the decoders are tried in', () => {
        it('should try a decoder of the caller before canon, whatever their order in groups, and read with it alone', async () => {
            const myCanon = createMakerNoteDecoder({matches: ({make}) => make === 'Canon', read: () => MY_TAGS});

            expect((await load(getCanonTiff(), [canon])).makerNotes).to.deep.equal(CANON_TAGS);
            expect((await load(getCanonTiff(), [myCanon, canon])).makerNotes).to.deep.equal(MY_TAGS);
            expect((await load(getCanonTiff(), [canon, myCanon])).makerNotes).to.deep.equal(MY_TAGS);
            expect((await load(getCanonTiff(), [makerNotes, myCanon])).makerNotes).to.deep.equal(MY_TAGS);
        });

        it('should read with the first of two matching decoders of the caller', async () => {
            const first = createMakerNoteDecoder({matches: () => true, read: () => ({First: {value: 1, description: '1'}})});
            const second = createMakerNoteDecoder({matches: () => true, read: () => ({Second: {value: 2, description: '2'}})});

            expect((await load(getExampleTiff(), [first, second])).makerNotes).to.deep.equal({First: {value: 1, description: '1'}});
            expect((await load(getExampleTiff(), [second, first])).makerNotes).to.deep.equal({Second: {value: 2, description: '2'}});
        });

        it('should try canon and pentax after the decoders of the caller that do not match', async () => {
            const nonMatching = createMakerNoteDecoder({matches: () => false, read: () => MY_TAGS});

            expect((await load(getCanonTiff(), [pentax, nonMatching, canon])).makerNotes).to.deep.equal(CANON_TAGS);
        });

        it('should try canon after a decoder of the caller whose matches throws', async () => {
            const thrower = createMakerNoteDecoder({matches: ({model}) => model.startsWith('X'), read: () => MY_TAGS});

            expect((await load(getCanonTiff(), [thrower, canon])).makerNotes).to.deep.equal(CANON_TAGS);
        });

        it('should take only true from matches as a claim', async () => {
            for (const matchResult of [1, 'yes', {}, Promise.resolve(true)]) {
                const decoder = createMakerNoteDecoder({matches: () => matchResult, read: () => MY_TAGS});

                expect((await load(getCanonTiff(), [decoder, canon])).makerNotes, String(matchResult)).to.deep.equal(CANON_TAGS);
            }
        });
    });

    describe('the arguments', () => {
        it('should give matches the Make, the Model and the maker note bytes', async () => {
            const inputs = recordMatches();

            await load(getExampleTiff({model: 'Model One'}), [inputs.decoder]);
            await load(getExampleTiff(), [inputs.decoder]);

            expect(inputs.calls).to.deep.equal([
                {make: 'ExampleCam', model: 'Model One', bytes: toBytes(EXAMPLE_MAKER_NOTE)},
                {make: 'ExampleCam', model: undefined, bytes: toBytes(EXAMPLE_MAKER_NOTE)},
            ]);
        });

        it('should give matches a maker note of one byte as an array', async () => {
            const inputs = recordMatches();

            await load(getExampleTiff({makerNote: '\x07'}), [inputs.decoder]);

            expect(inputs.calls).to.deep.equal([{make: 'ExampleCam', model: undefined, bytes: [7]}]);
        });

        it('should give matches a maker note stored as signed bytes as numbers from 0 to 255', async () => {
            const inputs = recordMatches();

            await load(getExampleTiff({makerNoteEntry: signedBytes(TAG_MAKER_NOTE, '\x01\x80\xff \x7f')}), [inputs.decoder]);

            expect(inputs.calls).to.deep.equal([{make: 'ExampleCam', model: undefined, bytes: [1, 128, 255, 32, 127]}]);
        });

        it('should give matches the Model also when the load includes only makerNotes', async () => {
            const byModel = createMakerNoteDecoder({matches: ({model}) => model === 'Model One', read: () => MY_TAGS});
            const reader = createReader({formats: [tiff], groups: [byModel], tagFilter});

            const tags = await reader.load(getDataView(getExampleTiff({model: 'Model One'})), {includeTags: {makerNotes: true}});

            expect(tags.makerNotes).to.deep.equal(MY_TAGS);
        });

        it('should give read a context of the load\'s includeUnknown and computed alone', async () => {
            const contexts = [];
            const decoder = createMakerNoteDecoder({matches: () => true, read: ({context}) => {
                contexts.push(context);
                return MY_TAGS;
            }});
            const reader = createReader({formats: [tiff], groups: [decoder]});

            await reader.load(getDataView(getExampleTiff()));
            await reader.load(getDataView(getExampleTiff()), {includeUnknown: true, computed: true});

            expect(contexts).to.deep.equal([{includeUnknown: false, computed: false}, {includeUnknown: true, computed: true}]);
            expect(Object.keys(contexts[0])).to.deep.equal(['includeUnknown', 'computed']);
        });

        it('should call matches and read without a this', async () => {
            const thisValues = [];
            const decoder = createMakerNoteDecoder({
                matches() {
                    thisValues.push(this);
                    return true;
                },
                read() {
                    thisValues.push(this);
                    return MY_TAGS;
                },
            });

            await load(getExampleTiff(), [decoder]);

            expect(thisValues).to.deep.equal([undefined, undefined]);
        });
    });

    describe('the tags read returns', () => {
        it('should be filtered by includeTags and excludeTags', async () => {
            const decoder = createMakerNoteDecoder({matches: () => true, read: () => ({
                Kept: {value: 1, description: '1'},
                ById: {value: 2, description: '2', id: 9},
                Dropped: {value: 3, description: '3'},
            })});
            const reader = createReader({formats: [tiff], groups: [decoder], tagFilter});
            const data = getDataView(getExampleTiff());

            expect((await reader.load(data, {includeTags: {makerNotes: ['Kept', 9]}})).makerNotes).to.deep.equal({
                Kept: {value: 1, description: '1'},
                ById: {value: 2, description: '2', id: 9},
            });
            expect((await reader.load(data, {excludeTags: {makerNotes: ['Dropped', 9]}})).makerNotes).to.deep.equal({
                Kept: {value: 1, description: '1'},
            });
        });

        it('should keep only the objects among the entries, and give no makerNotes for a result that is not an object', async () => {
            const mixed = createMakerNoteDecoder({matches: () => true, read: () => ({Kept: {value: 1, description: '1'}, Null: null, Array: [], Number: 5})});

            expect((await load(getExampleTiff(), [mixed])).makerNotes).to.deep.equal({Kept: {value: 1, description: '1'}});
            for (const result of [undefined, null, 5, 'tags', []]) {
                const decoder = createMakerNoteDecoder({matches: () => true, read: () => result});

                expect(await load(getExampleTiff(), [decoder]), String(result)).to.not.have.property('makerNotes');
            }
        });

        it('should give no makerNotes, grouped or flat, when no entry is an object', async () => {
            const decoder = createMakerNoteDecoder({matches: () => true, read: () => ({Null: null})});
            const reader = createReader({formats: [tiff], groups: [decoder]});

            expect(await reader.load(getDataView(getExampleTiff()))).to.not.have.property('makerNotes');
            expect(Object.keys(await reader.load(getDataView(getExampleTiff()), {expanded: false}))).to.deep.equal(['FileType']);
        });

        it('should keep __proto__ as a key of its own and append _ to the name of an Object.prototype property', async () => {
            const decoder = createMakerNoteDecoder({matches: () => true, read: () => JSON.parse(
                '{"__proto__": {"value": 1, "description": "1"}, "hasOwnProperty": {"value": 2, "description": "2"}}'
            )});

            const {makerNotes: tags} = await load(getExampleTiff(), [decoder]);

            expect(Object.keys(tags)).to.deep.equal(['__proto__', 'hasOwnProperty_']);
            expect(Object.getPrototypeOf(tags)).to.equal(Object.prototype);
            expect(tags.hasOwnProperty_).to.deep.equal({value: 2, description: '2'});
        });

        it('should not fail the load with a tag whose fields throw when read again', async () => {
            const decoder = createMakerNoteDecoder({matches: () => true, read: () => ({Getters: getReadOnceEntry(1, 9), Proxied: getReadOnceProxy(2, 10)})});
            const reader = createReader({formats: [tiff], groups: [decoder], tagFilter});

            for (const expanded of [true, false]) {
                const tags = await reader.load(getDataView(getExampleTiff()), {expanded, includeTags: {makerNotes: [9, 10]}});
                const makerNoteTags = expanded ? tags.makerNotes : {Getters: tags.Getters, Proxied: tags.Proxied};

                expect(makerNoteTags, String(expanded)).to.deep.equal({
                    Getters: {value: 1, description: '1', id: 9},
                    Proxied: {value: 2, description: '2', id: 10},
                });
            }
        });

        function getReadOnceEntry(value, id) {
            const fields = {value, description: String(value), id};
            const entry = {};
            for (const key of Object.keys(fields)) {
                let reads = 0;
                Object.defineProperty(entry, key, {enumerable: true, get: () => {
                    reads++;
                    if (reads > 1) {
                        throw new Error(key + ' read again');
                    }
                    return fields[key];
                }});
            }
            return entry;
        }

        function getReadOnceProxy(value, id) {
            const reads = {};
            return new Proxy({value, description: String(value), id}, {get: (target, key) => {
                reads[key] = (reads[key] || 0) + 1;
                if (reads[key] > 1) {
                    throw new Error(String(key) + ' read again');
                }
                return target[key];
            }});
        }
    });

    describe('a read that fails', () => {
        const FAILING_READS = {
            'throws': () => {
                throw new Error('read');
            },
            'returns a rejected Promise': () => Promise.reject(new Error('read')),
            'returns a thenable whose then getter throws': () => {
                let thenReads = 0;
                return {get then() {
                    thenReads++;
                    if (thenReads > 1) {
                        throw new Error('then');
                    }
                    return () => undefined;
                }};
            },
        };
        for (const [name, read] of Object.entries(FAILING_READS)) {
            it(`should leave out makerNotes and load the rest when read ${name}`, async () => {
                const decoder = createMakerNoteDecoder({matches: () => true, read});

                const tags = await load(getExampleTiff(), [exif, decoder]);

                expect(tags).to.not.have.property('makerNotes');
                expect(tags.exif.Make.value).to.deep.equal(['ExampleCam']);
            });
        }
    });

    describe('createMakerNoteDecoder', () => {
        it('should refuse a missing, null or incomplete definition', () => {
            const definitions = [null, {}, {matches: () => true}, {read: () => ({})}, {matches: 'yes', read: () => ({})}, {matches: () => true, read: {}}];

            expect(() => createMakerNoteDecoder()).to.throw(TypeError, DECODER_DEFINITION_MESSAGE);
            for (const definition of definitions) {
                expect(() => createMakerNoteDecoder(definition), JSON.stringify(definition)).to.throw(TypeError, DECODER_DEFINITION_MESSAGE);
            }
        });

        it('should refuse a key other than matches and read', () => {
            expect(() => createMakerNoteDecoder({matches: () => true, read: () => ({}), name: 'canon'}))
                .to.throw(TypeError, 'createMakerNoteDecoder: unknown key \'name\': the keys are matches and read');
        });

        it('should keep the functions it was made with when the definition changes', async () => {
            const definition = {matches: ({make}) => make === 'ExampleCam', read: () => MY_TAGS};
            const decoder = createMakerNoteDecoder(definition);

            definition.matches = () => false;
            definition.read = () => ({Other: {value: 2, description: '2'}});

            expect((await load(getExampleTiff(), [decoder])).makerNotes).to.deep.equal(MY_TAGS);
        });

        it('should make a value createReader takes in groups', () => {
            expect(() => createReader({formats: [tiff], groups: [exampleCam]})).to.not.throw();
            expect(() => createReader({formats: [tiff], groups: [{key: 'makerNotes', decoders: exampleCam.decoders}]})).to.throw(TypeError);
        });
    });

    function load(data, groups) {
        return createReader({formats: [jpeg, tiff], groups}).load(getDataView(data));
    }

    function getExampleTiff({make = 'ExampleCam', model, makerNote = EXAMPLE_MAKER_NOTE, makerNoteEntry = undefinedBytes(TAG_MAKER_NOTE, makerNote)} = {}) {
        const ifd0 = [ascii(TAG_MAKE, make)];
        if (model !== undefined) {
            ifd0.push(ascii(TAG_MODEL, model));
        }
        return getTiff({ifd0, exifIfd: [makerNoteEntry]});
    }

    function signedBytes(tag, data) {
        return {tag, type: IFD_TYPE_SBYTE, count: data.length, data};
    }

    function getCanonTiff() {
        return getTiff({ifd0: [ascii(TAG_MAKE, 'Canon')], exifIfd: [canonMakerNote([ascii(TAG_CANON_LENS_MODEL, 'canon lens')])]});
    }

    // getTiff writes its values big-endian, so the little-endian file is laid
    // out here: IFD0 with Make and the Exif IFD pointer, then the Make value,
    // the Exif IFD with MakerNote, and the maker note.
    function getLittleEndianTiff(make, makerNote) {
        const makeValue = make + '\x00';
        const makeOffset = 8 + 2 + 2 * 12 + 4;
        const exifIfdOffset = makeOffset + makeValue.length;
        const makerNoteOffset = exifIfdOffset + 2 + 12 + 4;
        return 'II\x2a\x00' + littleEndian(8, 4)
            + littleEndian(2, 2)
            + littleEndian(TAG_MAKE, 2) + littleEndian(2, 2) + littleEndian(makeValue.length, 4) + littleEndian(makeOffset, 4)
            + littleEndian(0x8769, 2) + littleEndian(4, 2) + littleEndian(1, 4) + littleEndian(exifIfdOffset, 4)
            + littleEndian(0, 4)
            + makeValue
            + littleEndian(1, 2)
            + littleEndian(TAG_MAKER_NOTE, 2) + littleEndian(7, 2) + littleEndian(makerNote.length, 4) + littleEndian(makerNoteOffset, 4)
            + littleEndian(0, 4)
            + makerNote;
    }

    function littleEndian(number, byteCount) {
        let bytes = '';
        for (let i = 0; i < byteCount; i++) {
            bytes += String.fromCharCode((number >> (8 * i)) & 0xff);
        }
        return bytes;
    }

    function recordMatches() {
        const calls = [];
        const decoder = createMakerNoteDecoder({matches: (input) => {
            calls.push(input);
            return false;
        }, read: () => MY_TAGS});
        return {calls, decoder};
    }

    function toBytes(text) {
        return Array.from(text).map((character) => character.charCodeAt(0));
    }

    function readCommittedText(file) {
        return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    }
});

function importPublic(specifier) {
    return import(pathToFileURL(requireFromRoot.resolve(specifier)).href);
}
