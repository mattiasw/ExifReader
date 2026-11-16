/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {TYPE_TEXT, TYPE_ZTXT} from '../../../src/image-header-png.js';
import IsoBmffFileTags from '../../../src/iso-bmff-file-tags.js';
import CanonTags from '../../../src/canon-tags.js';
import {run, validateComposition} from '../../../src/engine.js';
import Composition from '../../../src/composable/composition.js';
import {allFormats, tiff, jpeg, png, heic, avif, jxl, webp, gif, xml} from '../../../src/composable/formats.js';
import * as Groups from '../../../src/composable/groups.js';
import {allGroups, exif, iptc, xmp, icc, canon, pentax, makerNotes, gps, composite, thumbnail} from '../../../src/composable/groups.js';
import {pngFile, pngText, pngHeader} from '../../../src/composable/formats/png.js';
import {xmp as xmpModule} from '../../../src/composable/groups/xmp.js';
import {thumbnail as thumbnailModule} from '../../../src/composable/groups/thumbnail.js';
import {gps as gpsModule} from '../../../src/composable/groups/gps.js';
import {composite as compositeModule} from '../../../src/composable/groups/composite.js';
import {exifBlockReader} from '../../../src/composable/exif-block-reader.js';
import {iptcBlockReader} from '../../../src/composable/iptc-block-reader.js';
import {CORE_MERGE_MODES} from '../../../src/loadview-pipeline.js';
import {jxlHeader} from '../../../src/composable/formats/jxl.js';
import {decompression} from '../../../src/decompression.js';
import {getContext, recordCalls} from './test-context.js';
import {getMakerNoteBlock} from './groups/maker-note-test-data.js';

const DISPATCH_ORDER = [
    'file', 'jfif', 'exif', 'iptc', 'xmp', 'icc', 'mpf', 'pngFile', 'pngText', 'pngChunk',
    'riff', 'gif', 'jxlFile', 'isoBmffFile', 'photoshop', 'makerNote', 'thumbnail',
];

describe('composable/composition', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    describe('the formats', () => {
        it('should be in detection order whatever order they are listed in', () => {
            const formats = [xml, gif, webp, jxl, avif, heic, png, jpeg, tiff];

            const composition = createComposition({formats, groups: [xmp]});

            expect(composition.formats).to.deep.equal(allFormats);
        });

        it('should use a format listed twice once', () => {
            const composition = createComposition({formats: [jpeg, tiff, jpeg]});

            expect(composition.formats).to.deep.equal([tiff, jpeg]);
        });
    });

    describe('the engine groups', () => {
        it('should be in dispatch order whatever order the formats and groups are listed in', () => {
            const composition = createComposition({
                formats: allFormats.slice().reverse(),
                groups: allGroups.slice().reverse(),
            });

            expect(composition.groups.map((group) => group.consumes[0])).to.deep.equal(DISPATCH_ORDER);
        });

        it('should be every format\'s readers and every block-reading group', () => {
            const composition = createComposition({formats: [jpeg, webp], groups: [thumbnail, iptc, gps]});

            expect(composition.groups).to.deep.equal([jpeg.readers[0], jpeg.readers[1], iptc, webp.readers[0], thumbnail]);
        });

        it('should keep list order between groups consuming the same kind', () => {
            const first = {key: 'a', consumes: ['exif'], emits: [], read: () => undefined, merge: () => ({})};
            const second = {key: 'b', consumes: ['exif'], emits: [], read: () => undefined, merge: () => ({})};

            expect(createComposition({groups: [first, iptc, second]}).groups).to.deep.equal([first, second, iptc]);
            expect(createComposition({groups: [second, iptc, first]}).groups).to.deep.equal([second, first, iptc]);
        });

        it('should leave out a reader a format lists as undefined', () => {
            const composition = createComposition({formats: [{header: jpeg.header, readers: [undefined, jpeg.readers[1]]}]});

            expect(composition.groups).to.deep.equal([jpeg.readers[1]]);
        });

        it('should give heic and avif one ISO-BMFF file reader, dispatched once', () => {
            const composition = createComposition({formats: [heic, avif]});
            const {calls, restore} = recordCalls(IsoBmffFileTags, 'read', {ImageWidth: {value: 1}});
            restores.push(restore);

            expect(composition.groups).to.deep.equal([heic.readers[0]]);
            const {mergeBlocks} = run(composition, [{kind: 'isoBmffFile'}], getContext({composed: composition.composed}));

            expect(calls).to.have.lengthOf(1);
            expect(mergeBlocks).to.have.lengthOf(1);
        });

        describe('the maker note groups', () => {
            it('should keep a single maker note group as it is', () => {
                expect(createComposition({groups: [canon]}).groups).to.deep.equal([canon]);
                expect(createComposition({groups: [makerNotes, makerNotes]}).groups).to.deep.equal([makerNotes]);
            });

            it('should read a Canon maker note once with makerNotes and canon', () => {
                const composition = createComposition({groups: [canon, makerNotes]});
                const {calls, restore} = recordCalls(CanonTags, 'read', {LensModel: {value: 'l'}});
                restores.push(restore);

                expect(composition.groups).to.have.lengthOf(1);
                const {mergeBlocks} = run(composition, [getMakerNoteBlock({make: ['Canon']})], getContext({composed: composition.composed}));

                expect(calls).to.have.lengthOf(1);
                expect(mergeBlocks).to.have.lengthOf(1);
                expect(mergeBlocks[0]).to.deep.equal({group: 'makerNotes', tags: {LensModel: {value: 'l'}}, slot: 'makerNotes', mode: 'assign'});
            });

            it('should sort the merged group into its dispatch position', () => {
                const composition = createComposition({groups: [thumbnail, canon, pentax, exif]});

                expect(composition.groups.map((group) => group.consumes[0])).to.deep.equal(['exif', 'makerNote', 'thumbnail']);
            });
        });

        describe('a group carrying combine', () => {
            it('should receive the unique engine groups and have its result dispatch-sorted', () => {
                const other = getStandInGroup('other', 'xmp');
                const replacement = getStandInGroup('replacement', 'exif');
                const received = [];
                const combining = getStandInGroup('combining', 'thumbnail', (groups) => {
                    received.push(groups);
                    return [groups[1], replacement, groups[0]];
                });

                const composition = createComposition({groups: [other, combining, other]});

                expect(received).to.have.lengthOf(1);
                expect(received[0]).to.deep.equal([other, combining]);
                expect(composition.groups).to.deep.equal([replacement, other, combining]);
            });

            it('should be the only one called when several groups carry a combine, the first listed', () => {
                const calls = [];
                const first = getStandInGroup('first', 'iptc', (groups) => {
                    calls.push('first');
                    return groups.slice(0, 1);
                });
                const second = getStandInGroup('second', 'exif', () => {
                    calls.push('second');
                    return [];
                });

                const composition = createComposition({groups: [first, second]});

                expect(calls).to.deep.equal(['first']);
                expect(composition.groups).to.deep.equal([first]);
            });

            it('should leave the groups as they are when no group carries one', () => {
                const first = getStandInGroup('a', 'xmp');
                const second = getStandInGroup('b', 'exif');

                expect(createComposition({groups: [first, second]}).groups).to.deep.equal([second, first]);
            });
        });

        it('should have no cycle or too deep a chain with every format and every group composed', () => {
            const groups = getExportedGroups().concat([
                exifBlockReader.createParseOnlyGroup([], undefined),
                iptcBlockReader.createParseOnlyGroup([]),
            ]);

            expect(() => validateComposition(createComposition({formats: allFormats, groups}))).to.not.throw();
        });
    });

    describe('the derived groups', () => {
        it('should be gps then composite whatever order they are listed in, and not engine groups', () => {
            const composition = createComposition({groups: [composite, exif, gps, composite]});

            expect(composition.derived).to.deep.equal([gps, composite]);
            expect(composition.groups).to.deep.equal([exif]);
        });

        it('should be the groups that read no block', () => {
            const derivedStandIn = {key: 'derived', consumes: [], emits: [], merge: () => ({})};
            const reading = getStandInGroup('reading', 'xmp');

            const composition = createComposition({groups: [derivedStandIn, reading]});

            expect(composition.derived).to.deep.equal([derivedStandIn]);
            expect(composition.groups).to.deep.equal([reading]);
        });

        it('should leave every exported reader and block-reading group an engine group', () => {
            const readingGroups = getExportedGroups().filter((group) => group !== gps && group !== composite);

            const composition = createComposition({formats: allFormats, groups: readingGroups});

            expect(composition.derived).to.deep.equal([]);
            for (const group of readingGroups) {
                expect(group.read, group.key).to.be.a('function');
            }
        });
    });

    describe('the merge modes', () => {
        it('should collect the modes of the engine and the derived groups into a table without a prototype', () => {
            const composition = createComposition({formats: [png], groups: [xmp, thumbnail, gps, composite]});

            expect(Object.getPrototypeOf(composition.mergeModes)).to.equal(null);
            expect(Object.assign({}, composition.mergeModes)).to.deep.equal({
                brobXmp: xmp.mergeModes.brobXmp,
                pngFile: pngFile.mergeModes.pngFile,
                pngTextTags: pngText.mergeModes.pngTextTags,
                thumbnailCandidate: thumbnail.mergeModes.thumbnailCandidate,
                thumbnail: thumbnail.mergeModes.thumbnail,
                gps: gps.mergeModes.gps,
                composite: composite.mergeModes.composite,
            });
        });

        it('should collect none from groups without modes, the merged maker note group included', () => {
            const composition = createComposition({formats: [jpeg, tiff], groups: [exif, iptc, canon, pentax, makerNotes]});

            expect(Object.keys(composition.mergeModes)).to.deep.equal([]);
        });

        it('should collect the steps of a format listed twice once', () => {
            const composition = createComposition({formats: [png, png]});

            expect(composition.prepareMergeBlocks).to.deep.equal([pngText.prepareMergeBlocks]);
            expect(composition.finishTags).to.deep.equal([pngText.finishTags]);
        });

        it('should collect the png text reader\'s steps around the merge, and none without png', () => {
            const withPng = createComposition({formats: [jpeg, png], groups: allGroups});
            const withoutPng = createComposition({formats: [jpeg, tiff], groups: allGroups});

            expect(withPng.prepareMergeBlocks).to.deep.equal([pngText.prepareMergeBlocks]);
            expect(withPng.finishTags).to.deep.equal([pngText.finishTags]);
            expect(withoutPng.prepareMergeBlocks).to.deep.equal([]);
            expect(withoutPng.finishTags).to.deep.equal([]);
        });

        it('should collect the steps of the engine groups in dispatch order', () => {
            const first = Object.assign(getStandInGroup('first', 'xmp'), {prepareMergeBlocks: () => [], finishTags: () => ({})});
            const second = Object.assign(getStandInGroup('second', 'exif'), {prepareMergeBlocks: () => []});

            const composition = createComposition({groups: [first, second]});

            expect(composition.prepareMergeBlocks).to.deep.equal([second.prepareMergeBlocks, first.prepareMergeBlocks]);
            expect(composition.finishTags).to.deep.equal([first.finishTags]);
        });

        describe('the guarantee', () => {
            // Every branch of every merge: the fields the merges read.
            const FINDER_BLOCKS = getCrossProduct({
                compression: [undefined, 'brob'],
                carried: [undefined, 'main', 'rawProfile'],
                origin: [undefined, 'x'],
                rank: ['main', 'embedded'],
                text: [undefined, {}],
            });
            // The blocks the engine, the png text step and read-view add.
            const ADDED_BLOCKS = [
                {slot: 'exif', mode: 'nested', blocks: []},
                {slot: 'pngText', mode: 'nested', blocks: []},
                {slot: 'thumbnail', mode: 'thumbnail'},
                {slot: 'fileType', mode: 'fileType'},
                {slot: 'metadataRange', mode: 'metadataRange'},
            ];

            it('should resolve every mode a reader or group composed alone returns', () => {
                const compositions = allFormats.map((format) => createComposition({formats: [format]}))
                    .concat(getExportedGroups().map((group) => createComposition({groups: [group]})))
                    .concat([
                        createComposition({groups: [exifBlockReader.createParseOnlyGroup([], undefined)]}),
                        createComposition({groups: [iptcBlockReader.createParseOnlyGroup([])]}),
                    ]);
                let checked = 0;

                for (const composition of compositions) {
                    const blocks = composition.groups.concat(composition.derived)
                        .reduce((modeBlocks, group) => modeBlocks.concat(FINDER_BLOCKS.map((block) => group.merge(block))), [])
                        .concat(ADDED_BLOCKS);
                    for (const block of blocks) {
                        const resolves = Object.hasOwn(CORE_MERGE_MODES, block.mode) || Object.hasOwn(composition.mergeModes, block.mode);
                        expect(resolves, `${block.mode} in ${getGroupKeys(composition)}`).to.equal(true);
                        checked++;
                    }
                }
                expect(checked).to.be.above(compositions.length * FINDER_BLOCKS.length);
            });

            it('should shadow only the core thumbnail mode, with the thumbnail group\'s, and bring each mode from one reader or group', () => {
                const groups = getExportedGroups();
                const composition = createComposition({formats: allFormats, groups});
                const sources = allFormats.reduce((readers, format) => readers.concat(format.readers), [])
                    .concat(groups)
                    .filter((group) => group.mergeModes !== undefined)
                    .map((group) => group.mergeModes)
                    .filter((modes, index, all) => all.indexOf(modes) === index);
                const names = sources.reduce((allNames, modes) => allNames.concat(Object.keys(modes)), []);

                expect(Object.keys(composition.mergeModes).filter((name) => Object.hasOwn(CORE_MERGE_MODES, name))).to.deep.equal(['thumbnail']);
                expect(composition.mergeModes.thumbnail).to.equal(thumbnailModule.mergeModes.thumbnail);
                expect(names.filter((name, index) => names.indexOf(name) !== index)).to.deep.equal([]);
                expect(sources).to.include.members([pngFile.mergeModes, pngText.mergeModes, xmpModule.mergeModes, thumbnailModule.mergeModes, gpsModule.mergeModes, compositeModule.mergeModes]);
            });

            function getCrossProduct(values) {
                return Object.keys(values).reduce((blocks, field) => {
                    const product = [];
                    for (const block of blocks) {
                        for (const value of values[field]) {
                            product.push(Object.assign({}, block, value === undefined ? {} : {[field]: value}));
                        }
                    }
                    return product;
                }, [{}]);
            }

            function getGroupKeys(composition) {
                return composition.groups.concat(composition.derived).map((group) => group.key).join();
            }
        });
    });

    describe('the composed facts', () => {
        it('should name the composed formats by file type', () => {
            const {formats} = createComposition({formats: [jxl, jpeg]}).composed;

            expect(Object.getPrototypeOf(formats)).to.equal(null);
            expect(Object.assign({}, formats)).to.deep.equal({jxl: true, jpeg: true});
        });

        it('should name the groups listed by key, not the format-bound readers', () => {
            const {groups} = createComposition({formats: [jxl, png], groups: [thumbnail, canon, gps]}).composed;

            expect(Object.getPrototypeOf(groups)).to.equal(null);
            expect(Object.assign({}, groups)).to.deep.equal({thumbnail: true, makerNotes: true, gps: true});
        });

        it('should name every kind an engine group consumes', () => {
            const {kinds} = createComposition({formats: [png], groups: [icc, gps]}).composed;

            expect(Object.getPrototypeOf(kinds)).to.equal(null);
            expect(Object.assign({}, kinds)).to.deep.equal({icc: true, pngFile: true, pngText: true, pngChunk: true});
        });
    });

    it('should collect every engine group\'s suppressions in dispatch order', () => {
        const composition = createComposition({formats: [png], groups: [icc, xmp, iptc, exif]});

        expect(composition.suppressions).to.deep.equal([iptc.suppressions[0], xmp.suppressions[0], icc.suppressions[0], pngText.suppressions[0]]);
    });

    describe('dispatchKind', () => {
        it('should dispatch a text chunk as pngText and any other block by its kind', () => {
            const {dispatchKind} = createComposition({});

            expect(dispatchKind({kind: 'exif', text: {}})).to.equal('pngText');
            expect(dispatchKind({kind: 'exif'})).to.equal('exif');
        });
    });

    describe('rank', () => {
        it('should rank a brob Exif box below every other block', () => {
            const {rank} = createComposition({});

            expect(rank({kind: 'exif', compression: 'brotli'})).to.equal(0);
            expect(rank({kind: 'exif'})).to.equal(1);
            expect(rank({kind: 'exif', compression: 'deflate', text: {}})).to.equal(1);
            expect(rank({kind: 'xmp', compression: 'brotli'})).to.equal(1);
        });
    });

    describe('isHiddenInSyncMode', () => {
        it('should hide a compressed ICC block whatever is composed', () => {
            const {isHiddenInSyncMode} = createComposition({});

            expect(isHiddenInSyncMode({kind: 'icc', compression: 'deflate'})).to.equal(true);
            expect(isHiddenInSyncMode({kind: 'icc'})).to.equal(false);
            expect(isHiddenInSyncMode({kind: 'xmp', compression: 'brotli'})).to.equal(false);
        });

        it('should hide a compressed-text chunk type block only with the png format', () => {
            const block = {kind: 'pngText', text: {chunkType: TYPE_ZTXT}};

            expect(createComposition({formats: [jpeg]}).isHiddenInSyncMode(block)).to.equal(false);
            expect(createComposition({formats: [jpeg, png]}).isHiddenInSyncMode(block)).to.equal(true);
            expect(createComposition({formats: [png]}).isHiddenInSyncMode({kind: 'pngText', text: {chunkType: TYPE_TEXT}})).to.equal(false);
        });
    });

    describe('decompression', () => {
        it('should be the one pooled decompression with both formats', () => {
            expect(createComposition({formats: [png, jxl]}).decompression).to.equal(decompression);
            expect(createComposition({formats: [jxl, png]}).decompression).to.equal(decompression);
        });

        it('should be taken from the first format that brings one, not only the first format', () => {
            expect(createComposition({formats: [jpeg, png]}).decompression).to.equal(pngHeader.decompression);
            expect(createComposition({formats: [jpeg, jxl]}).decompression).to.equal(jxlHeader.decompression);
        });

        it('should be undefined without the png and jxl formats', () => {
            const composition = createComposition({formats: [jpeg, tiff, heic, avif, webp, gif, xml]});

            expect(composition.decompression).to.equal(undefined);
        });
    });
});

function getStandInGroup(key, kind, combine) {
    const group = {key, consumes: [kind], emits: [], read: () => undefined, merge: () => ({})};
    if (combine !== undefined) {
        group.combine = combine;
    }
    return group;
}

function createComposition({formats = [], groups = []}) {
    return Composition.createComposition({formats, groups});
}

function getExportedGroups() {
    return Object.keys(Groups).filter((name) => !Array.isArray(Groups[name])).map((name) => Groups[name]);
}
