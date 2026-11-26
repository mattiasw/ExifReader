/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import * as Groups from '../../../src/composable/groups.js';
import {GROUP_BRAND} from '../../../src/composable/brand.js';
import {EXIF_DEPENDENCY_TAGS, COMPOSITE_DEPENDENCY_TAGS} from '../../../src/tag-filter-config.js';
import {EXIF_EMITTED_KINDS} from '../../../src/composable/exif-block-reader.js';
import {getTagBindingName} from '../../../src/composable/tag-binding-name.js';
import * as ExifTags from '../../../src/composable/tags/exif.js';
import TagNames0thIfd from '../../../src/tag-names-0th-ifd.js';
import {allFormats} from '../../../src/composable/formats.js';
import {exif} from '../../../src/composable/groups/exif.js';
import {composedIptc} from '../../../src/composable/groups/iptc.js';
import {xmp} from '../../../src/composable/groups/xmp.js';
import {icc} from '../../../src/composable/groups/icc.js';
import {photoshop} from '../../../src/composable/groups/photoshop.js';
import {mpf} from '../../../src/composable/groups/mpf.js';
import {canon} from '../../../src/composable/groups/canon.js';
import {pentax} from '../../../src/composable/groups/pentax.js';
import {makerNotes} from '../../../src/composable/groups/maker-notes.js';
import {gps} from '../../../src/composable/groups/gps.js';
import {composite} from '../../../src/composable/groups/composite.js';
import {thumbnail} from '../../../src/composable/groups/thumbnail.js';
import {swapProperties} from '../test-utils.js';
import {createTagFilter} from '../../../src/tag-filter.js';
import {mergeMakerNoteGroups, getMakerNoteBlockFromExif} from '../../../src/composable/group-helpers.js';
import {getContext} from './test-context.js';
import {getMakerNoteBlock} from './groups/maker-note-test-data.js';

const MODULE_GROUPS = {exif, iptc: composedIptc, xmp, icc, photoshop, mpf, canon, pentax, makerNotes, gps, composite, thumbnail};
const GROUP_NAMES = Object.keys(MODULE_GROUPS);
const COPIED_NAMES = GROUP_NAMES.filter((name) => name !== 'exif');
const EXIF_DEPENDENT_NAMES = COPIED_NAMES.filter((name) => name !== 'mpf');
const ADDED_KEYS = {
    xmp: ['exifDependencies', 'environment', 'assertEnvironment'],
    thumbnail: ['exifDependencies', 'ifd1TagNames', 'environment'],
    mpf: ['environment'],
};
const DECODER_DEFINITION_MESSAGE = 'createMakerNoteDecoder: takes {matches, read}, two functions';
const DOM_PARSER_MESSAGE = 'reader.load: xmp is in groups but no DOM parser is available: pass domParser to createReader, for example new DOMParser({onError: onErrorStopParsing}) from @xmldom/xmldom, or leave xmp out of groups';

describe('composable/groups', () => {
    it('should export each group by name', () => {
        expect(Object.keys(Groups).sort()).to.deep.equal(['allGroups', 'createMakerNoteDecoder'].concat(GROUP_NAMES).sort());
    });

    it('should export exif as its module\'s object', () => {
        expect(Groups.exif).to.equal(exif);
    });

    it('should export every other group as a copy of its module\'s object with what the composable reader needs added', () => {
        for (const name of COPIED_NAMES) {
            const moduleGroup = MODULE_GROUPS[name];
            const group = Groups[name];
            const added = ADDED_KEYS[name] || ['exifDependencies'];
            expect(group, name).to.not.equal(moduleGroup);
            expect(Object.keys(group).sort(), name).to.deep.equal(Object.keys(moduleGroup).concat(added).sort());
            for (const key of Object.keys(moduleGroup)) {
                expect(group[key], `${name}.${key}`).to.equal(moduleGroup[key]);
            }
        }
    });

    it('should give the thumbnail copy the full 0th dictionary for the thumbnail IFD', () => {
        expect(Groups.thumbnail.ifd1TagNames).to.equal(TagNames0thIfd);
    });

    it('should carry the generated descriptors of the Exif tags each group reads through Exif, in the order of the tag filter\'s lists', () => {
        for (const name of EXIF_DEPENDENT_NAMES) {
            const group = Groups[name];
            const expectedNames = group.key === 'composite' ? COMPOSITE_DEPENDENCY_TAGS.exif : EXIF_DEPENDENCY_TAGS[group.key];
            expect(expectedNames, name).to.be.an('array').that.is.not.empty;
            expect(group.exifDependencies.map((descriptor) => descriptor.name), name).to.deep.equal(expectedNames);
            for (const descriptor of group.exifDependencies) {
                expect(descriptor, `${name} ${descriptor.name}`).to.equal(ExifTags[getTagBindingName(descriptor.name)]);
            }
        }
    });

    it('should carry Exif dependencies exactly on the groups that consume a kind an Exif block carries or are derived', () => {
        for (const name of GROUP_NAMES) {
            const group = Groups[name];
            const readsThroughExif = group.consumes.some((kind) => EXIF_EMITTED_KINDS.indexOf(kind) !== -1) || group.read === undefined;
            const hasDependencies = Array.isArray(group.exifDependencies) && group.exifDependencies.length > 0;
            expect(hasDependencies, name).to.equal(readsThroughExif);
        }
    });

    it('should give exactly the groups that consume a kind an Exif block carries the extractor of its block', () => {
        for (const name of GROUP_NAMES) {
            const group = Groups[name];
            const consumesEmittedKind = group.consumes.some((kind) => EXIF_EMITTED_KINDS.indexOf(kind) !== -1);
            expect(typeof group.fromExif === 'function', name).to.equal(consumesEmittedKind);
        }
    });

    it('should carry an environment exactly on xmp, thumbnail and mpf and a check of it only on xmp', () => {
        for (const name of GROUP_NAMES) {
            expect(Groups[name].environment !== undefined, name + ' environment').to.equal(Object.hasOwn(ADDED_KEYS, name));
            expect(Groups[name].assertEnvironment !== undefined, name + ' assertEnvironment').to.equal(name === 'xmp');
        }
    });

    describe('the DOM parser getter of xmp', () => {
        let restores;

        beforeEach(() => {
            restores = [];
        });

        afterEach(() => {
            restores.forEach((restore) => restore());
        });

        it('should give the parser it is given', () => {
            const parser = {};

            expect(Groups.xmp.environment.getDomParser(parser).parser).to.equal(parser);
        });

        it('should construct the global DOMParser without a parser', () => {
            let constructed = 0;
            class CountingParser {
                constructor() {
                    constructed++;
                }
            }
            restores.push(swapProperties(globalThis, {DOMParser: CountingParser}));

            const {parser} = Groups.xmp.environment.getDomParser(undefined);

            expect(parser).to.be.an.instanceOf(CountingParser);
            expect(constructed).to.equal(1);
        });

        it('should refuse without a parser and without a global DOMParser, with the message of load', () => {
            restores.push(swapProperties(globalThis, {DOMParser: undefined}));

            expect(() => Groups.xmp.assertEnvironment(undefined)).to.throw(Error, DOM_PARSER_MESSAGE);
        });

        it('should accept a parser', () => {
            restores.push(swapProperties(globalThis, {DOMParser: undefined}));

            expect(() => Groups.xmp.assertEnvironment({})).to.not.throw();
        });

        it('should accept a global DOMParser', () => {
            restores.push(swapProperties(globalThis, {DOMParser: class {}}));

            expect(() => Groups.xmp.assertEnvironment(undefined)).to.not.throw();
        });
    });

    describe('the base64 helper of thumbnail and mpf', () => {
        let restores;

        beforeEach(() => {
            restores = [];
        });

        afterEach(() => {
            restores.forEach((restore) => restore());
        });

        it('should be one function shared by both', () => {
            expect(Groups.thumbnail.environment.getBase64Image).to.be.a('function');
            expect(Groups.mpf.environment.getBase64Image).to.equal(Groups.thumbnail.environment.getBase64Image);
        });

        it('should give btoa of the bytes of an ArrayBuffer', () => {
            const image = new Uint8Array([0xff, 0xd8, 0x00, 0x41, 0x80]).buffer;

            expect(Groups.mpf.environment.getBase64Image(image)).to.equal(btoa('\xff\xd8\x00A\x80'));
        });

        it('should give undefined without btoa', () => {
            restores.push(swapProperties(globalThis, {btoa: undefined}));

            expect(Groups.mpf.environment.getBase64Image(new ArrayBuffer(2))).to.equal(undefined);
        });
    });

    it('should list every group, with makerNotes standing for canon and pentax', () => {
        expect(Groups.allGroups).to.have.ordered.members([
            Groups.exif, Groups.iptc, Groups.xmp, Groups.icc, Groups.photoshop, Groups.mpf, Groups.makerNotes, Groups.gps, Groups.composite, Groups.thumbnail,
        ]);
        expect(Groups.allGroups).to.not.include(Groups.canon);
        expect(Groups.allGroups).to.not.include(Groups.pentax);
    });

    it('should brand every exported group, canon and pentax included', () => {
        for (const name of GROUP_NAMES) {
            expect(Groups[name].brand, name).to.equal(GROUP_BRAND);
        }
    });

    it('should have no format reader consume a kind an Exif block carries', () => {
        for (const format of allFormats) {
            for (const reader of format.readers) {
                for (const kind of reader.consumes) {
                    expect(EXIF_EMITTED_KINDS, `${format.header.fileType.value} ${reader.key}`).to.not.include(kind);
                }
            }
        }
    });

    describe('createMakerNoteDecoder', () => {
        it('should make a maker note group like canon\'s, with its one decoder', () => {
            const decoder = Groups.createMakerNoteDecoder({matches: () => false, read: () => ({})});

            expect(decoder.key).to.equal('makerNotes');
            expect(decoder.consumes).to.deep.equal(['makerNote']);
            expect(decoder.emits).to.deep.equal([]);
            expect(decoder.combine).to.equal(mergeMakerNoteGroups);
            expect(decoder.fromExif).to.equal(getMakerNoteBlockFromExif);
            expect(decoder.brand).to.equal(GROUP_BRAND);
            expect(decoder.decoders).to.have.lengthOf(1);
            expect(decoder.merge({})).to.deep.equal({slot: 'makerNotes', mode: 'assign'});
            expect(decoder.merge({carried: 'main'})).to.deep.equal({slot: 'carriedMakerNotes', mode: 'assign'});
            expect(decoder.merge({carried: 'rawProfile'})).to.deep.equal({slot: 'carriedMakerNotes', mode: 'merge'});
        });

        it('should give its decoder no name, so it is never taken for a built-in one', () => {
            const decoder = Groups.createMakerNoteDecoder({matches: () => false, read: () => ({})});

            expect(decoder.decoders[0]).to.not.have.property('name');
        });

        it('should carry the descriptors of MakerNote, Make and Model, the tag filter\'s list for makerNotes', () => {
            const decoder = Groups.createMakerNoteDecoder({matches: () => false, read: () => ({})});

            expect(decoder.exifDependencies).to.have.ordered.members([ExifTags.MakerNote, ExifTags.Make, ExifTags.Model]);
            expect(decoder.exifDependencies.map((descriptor) => descriptor.name)).to.deep.equal(EXIF_DEPENDENCY_TAGS.makerNotes);
        });

        it('should make a new group on each call', () => {
            const definition = {matches: () => false, read: () => ({})};

            expect(Groups.createMakerNoteDecoder(definition)).to.not.equal(Groups.createMakerNoteDecoder(definition));
        });

        it('should refuse a definition that is not an object holding matches and read as functions', () => {
            const definitions = [
                undefined,
                null,
                'matches',
                () => true,
                {},
                {read: () => ({})},
                {matches: () => true},
                {matches: true, read: () => ({})},
                {matches: () => true, read: {}},
            ];
            for (const definition of definitions) {
                expect(() => Groups.createMakerNoteDecoder(definition), String(definition)).to.throw(TypeError, DECODER_DEFINITION_MESSAGE);
            }
            expect(() => Groups.createMakerNoteDecoder()).to.throw(TypeError, DECODER_DEFINITION_MESSAGE);
        });

        it('should refuse a key other than matches and read, inherited ones included', () => {
            const inherited = Object.create({name: 'canon'});
            inherited.matches = () => true;
            inherited.read = () => ({});

            expect(() => Groups.createMakerNoteDecoder({matches: () => true, read: () => ({}), name: 'canon'}))
                .to.throw(TypeError, 'createMakerNoteDecoder: unknown key \'name\': the keys are matches and read');
            expect(() => Groups.createMakerNoteDecoder(inherited))
                .to.throw(TypeError, 'createMakerNoteDecoder: unknown key \'name\': the keys are matches and read');
        });

        it('should read matches and read once, when it is called', () => {
            let reads = 0;
            const definition = {
                get matches() {
                    reads++;
                    return reads === 1 ? () => true : 'not a function';
                },
                read: () => ({Tag: {value: 1, description: '1'}}),
            };

            const decoder = Groups.createMakerNoteDecoder(definition);
            definition.read = () => ({Other: {value: 2, description: '2'}});

            expect(decoder.read(getMakerNoteBlock({}), getContext())).to.deep.equal({tags: {Tag: {value: 1, description: '1'}}});
            expect(reads).to.equal(1);
        });

        it('should call matches and read without a this', () => {
            const thisValues = [];
            const definition = {
                matches() {
                    thisValues.push(this);
                    return true;
                },
                read() {
                    thisValues.push(this);
                    return {};
                },
            };

            Groups.createMakerNoteDecoder(definition).read(getMakerNoteBlock({}), getContext());

            expect(thisValues).to.deep.equal([undefined, undefined]);
        });

        it('should count a matches that throws as no match', () => {
            const decoder = Groups.createMakerNoteDecoder({matches: ({model}) => model.startsWith('X'), read: () => ({})});

            expect(decoder.decoders[0].matches({make: undefined, model: undefined, bytes: []})).to.equal(false);
            expect(decoder.read(getMakerNoteBlock({}), getContext())).to.equal(undefined);
        });

        it('should take only true from matches as a match', () => {
            for (const matchResult of [1, 'yes', {}, Promise.resolve(true), false]) {
                const decoder = Groups.createMakerNoteDecoder({matches: () => matchResult, read: () => ({})});

                expect(decoder.decoders[0].matches({make: undefined, model: undefined, bytes: []}), String(matchResult)).to.equal(false);
            }
            expect(Groups.createMakerNoteDecoder({matches: () => true, read: () => ({})}).decoders[0].matches({})).to.equal(true);
        });

        it('should give matches the make, the model and the bytes in an object of its own', () => {
            const inputs = [];
            const decoder = Groups.createMakerNoteDecoder({matches: (input) => inputs.push(input) < 0, read: () => ({})});
            const input = {make: 'Make', model: 'Model', bytes: [1], other: true};

            decoder.decoders[0].matches(input);

            expect(inputs).to.deep.equal([{make: 'Make', model: 'Model', bytes: [1]}]);
        });

        describe('the bytes given to matches', () => {
            it('should be the MakerNote value itself when it is an array of byte values', () => {
                const value = [0, 128, 255];
                const empty = [];

                expect(getBytesGivenToMatches(value)).to.equal(value);
                expect(getBytesGivenToMatches(empty)).to.equal(empty);
            });

            it('should hold a MakerNote value of one byte, which the Exif reader gives alone', () => {
                expect(getBytesGivenToMatches(7)).to.deep.equal([7]);
                expect(getBytesGivenToMatches(0)).to.deep.equal([0]);
                expect(getBytesGivenToMatches(255)).to.deep.equal([255]);
            });

            it('should hold the signed bytes of a MakerNote stored as SBYTE as numbers from 0 to 255, in a new array', () => {
                const value = [80, -1, -128, 127];

                expect(getBytesGivenToMatches(value)).to.deep.equal([80, 255, 128, 127]);
                expect(value).to.deep.equal([80, -1, -128, 127]);
                expect(getBytesGivenToMatches(-1)).to.deep.equal([255]);
                expect(getBytesGivenToMatches(-128)).to.deep.equal([128]);
            });

            it('should be empty for a MakerNote value that is not byte values', () => {
                const values = [256, -129, 1.5, NaN, '7', 'PENTAX ', ['text'], [1, 256], [1, -129], [1, 2.5], [1, '2'], [[1]], [1, undefined], {length: 1, 0: 1}, null, undefined];
                for (const value of values) {
                    expect(getBytesGivenToMatches(value), JSON.stringify(value)).to.deep.equal([]);
                }
            });

            function getBytesGivenToMatches(value) {
                let bytes;
                const decoder = Groups.createMakerNoteDecoder({matches: (input) => {
                    bytes = input.bytes;
                    return false;
                }, read: () => ({})});
                decoder.decoders[0].matches({make: undefined, model: undefined, bytes: value});
                return bytes;
            }
        });

        it('should give read the view fields and a context with only includeUnknown and computed', () => {
            const inputs = [];
            const decoder = Groups.createMakerNoteDecoder({matches: () => true, read: (input) => {
                inputs.push(input);
                return {};
            }});
            const block = getMakerNoteBlock({});

            decoder.read(block, getContext({options: {includeUnknown: true, computed: false}}));

            expect(inputs).to.have.lengthOf(1);
            expect(inputs[0]).to.deep.equal({
                tiffView: block.tiffView,
                tiffHeaderOffset: 6,
                makerNoteOffset: 100,
                byteOrder: 'byte order',
                context: {includeUnknown: true, computed: false},
            });
            expect(Object.keys(inputs[0].context)).to.deep.equal(['includeUnknown', 'computed']);
        });

        describe('the tags of read', () => {
            it('should keep value, description, a numeric id and a defined computed of each tag, in new objects', () => {
                const entry = {value: 1, description: 'one', id: 0x10, computed: false, extra: 'x'};
                const tags = readWith(() => ({Full: entry, Plain: {value: 2, description: 'two', id: '3', computed: undefined}}));

                expect(tags).to.deep.equal({
                    Full: {value: 1, description: 'one', id: 0x10, computed: false},
                    Plain: {value: 2, description: 'two'},
                });
                expect(tags.Full).to.not.equal(entry);
            });

            it('should read each field of a tag once', () => {
                const reads = {value: 0, description: 0, id: 0, computed: 0};
                const entry = {};
                for (const field of Object.keys(reads)) {
                    Object.defineProperty(entry, field, {enumerable: true, get: () => {
                        reads[field]++;
                        if (reads[field] > 1) {
                            throw new Error('read twice');
                        }
                        return field === 'id' ? 7 : field;
                    }});
                }

                const tags = readWith(() => ({Tag: entry}), getContext({tagFilter: createTagFilter({includeTags: {makerNotes: [7]}})}));

                expect(tags).to.deep.equal({Tag: {value: 'value', description: 'description', id: 7, computed: 'computed'}});
                expect(reads).to.deep.equal({value: 1, description: 1, id: 1, computed: 1});
            });

            it('should leave out entries that are not objects, and the own enumerable keys only', () => {
                const result = Object.create({Inherited: {value: 0, description: '0'}, undefined: {value: 0, description: '0'}});
                Object.assign(result, {Kept: {value: 1, description: '1'}, Null: null, Array: [{value: 2}], Number: 3, Text: 'four', Missing: undefined});
                Object.defineProperty(result, 'Hidden', {value: {value: 5, description: '5'}, enumerable: false});

                expect(readWith(() => result)).to.deep.equal({Kept: {value: 1, description: '1'}});
                expect(readWith(() => ({Null: null}))).to.deep.equal({});
            });

            it('should give no tags for a result that is not an object of tags', () => {
                for (const result of [undefined, null, 5, 'tags', true, [], [{value: 1}]]) {
                    expect(readWith(() => result), String(result)).to.equal(undefined);
                }
            });

            it('should store __proto__ as an own key and append _ to a name of an Object.prototype property', () => {
                const tags = readWith(() => JSON.parse('{"__proto__": {"value": 1, "description": "1"}, "hasOwnProperty": {"value": 2, "description": "2"}, "constructor": {"value": 3, "description": "3"}}'));

                expect(Object.getPrototypeOf(tags)).to.equal(Object.prototype);
                expect(Object.keys(tags)).to.deep.equal(['__proto__', 'hasOwnProperty_', 'constructor_']);
                expect(Object.getOwnPropertyDescriptor(tags, '__proto__').value).to.deep.equal({value: 1, description: '1'});
                expect(tags.hasOwnProperty).to.equal(Object.prototype.hasOwnProperty);
            });

            it('should filter the tags for parsing with the load\'s tag filter', () => {
                const read = () => ({Kept: {value: 1, description: '1'}, ById: {value: 2, description: '2', id: 9}, Dropped: {value: 3, description: '3'}});

                expect(readWith(read, getContext({tagFilter: createTagFilter({includeTags: {makerNotes: ['Kept', 9]}})}))).to.deep.equal({
                    Kept: {value: 1, description: '1'},
                    ById: {value: 2, description: '2', id: 9},
                });
                expect(readWith(read, getContext({tagFilter: createTagFilter({excludeTags: {makerNotes: ['Dropped']}})}))).to.deep.equal({
                    Kept: {value: 1, description: '1'},
                    ById: {value: 2, description: '2', id: 9},
                });
            });

            it('should copy and filter the tags a Promise from read resolves to', async () => {
                const decoder = Groups.createMakerNoteDecoder({matches: () => true, read: () => Promise.resolve({Kept: {value: 1, description: '1', extra: 1}, Dropped: {value: 2, description: '2'}})});
                const ctx = getContext({tagFilter: createTagFilter({includeTags: {makerNotes: ['Kept']}})});

                const result = decoder.read(getMakerNoteBlock({}), ctx);

                expect(result).to.be.an.instanceOf(Promise);
                expect(await result).to.deep.equal({tags: {Kept: {value: 1, description: '1'}}});
            });

            it('should give no tags when a Promise from read resolves to something other than an object of tags', async () => {
                const decoder = Groups.createMakerNoteDecoder({matches: () => true, read: () => Promise.resolve(5)});

                expect(await decoder.read(getMakerNoteBlock({}), getContext())).to.deep.equal({tags: undefined});
            });

            function readWith(read, ctx = getContext()) {
                const result = Groups.createMakerNoteDecoder({matches: () => true, read}).read(getMakerNoteBlock({}), ctx);
                return result.tags;
            }
        });
    });
});
