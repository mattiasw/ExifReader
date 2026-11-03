/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {TYPE_TEXT, TYPE_ZTXT} from '../../../src/image-header-png.js';
import IsoBmffFileTags from '../../../src/iso-bmff-file-tags.js';
import CanonTags from '../../../src/canon-tags.js';
import PentaxTags from '../../../src/pentax-tags.js';
import {run} from '../../../src/engine.js';
import Composition from '../../../src/composable/composition.js';
import {allFormats, tiff, jpeg, png, heic, avif, jxl, webp, gif, xml} from '../../../src/composable/formats.js';
import {allGroups, exif, iptc, xmp, icc, canon, pentax, makerNotes, gps, composite, thumbnail} from '../../../src/composable/groups.js';
import {canonDecoder} from '../../../src/composable/groups/canon.js';
import {pentaxDecoder} from '../../../src/composable/groups/pentax.js';
import {pngText} from '../../../src/composable/formats/png.js';
import {getContext, recordCalls} from './test-context.js';
import {getMakerNoteBlock, getPentaxType1Bytes} from './groups/maker-note-test-data.js';

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

        it('should reject xml without the xmp group', () => {
            expect(() => createComposition({formats: [xml], groups: [exif]})).to.throw(Error, /xml.*xmp/);
            expect(() => createComposition({formats: [xml, jpeg]})).to.throw(Error, /xml.*xmp/);
        });

        it('should take xml with the xmp group, and the xmp group without xml', () => {
            expect(createComposition({formats: [xml], groups: [xmp]}).formats).to.deep.equal([xml]);
            expect(createComposition({formats: [jpeg], groups: [xmp]}).formats).to.deep.equal([jpeg]);
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

            it('should merge canon and pentax into one group with both decoders, Canon first', () => {
                for (const groups of [[canon, pentax], [pentax, canon], [pentax, makerNotes], [makerNotes, canon, pentax]]) {
                    const composition = createComposition({groups});

                    expect(composition.groups, groups.map((group) => group.decoders[0].name).join()).to.have.lengthOf(1);
                    const merged = composition.groups[0];
                    expect(merged.key).to.equal('makerNotes');
                    expect(merged.consumes).to.deep.equal(['makerNote']);
                    expect(merged.emits).to.deep.equal([]);
                    expect(merged.descriptors).to.equal(groups[0].descriptors);
                    expect(merged.merge).to.equal(groups[0].merge);
                    expect(merged.decoders).to.deep.equal([canonDecoder, pentaxDecoder]);
                }
            });

            it('should read with the merged decoders, Canon by Make before Pentax by prefix', () => {
                const [merged] = createComposition({groups: [pentax, canon]}).groups;
                const canonReads = recordCalls(CanonTags, 'read', {Canon: {value: 1}});
                const pentaxReads = recordCalls(PentaxTags, 'read', {Pentax: {value: 1}});
                restores.push(canonReads.restore, pentaxReads.restore);

                expect(merged.read(getMakerNoteBlock({make: ['Canon'], bytes: getPentaxType1Bytes()}), getContext())).to.deep.equal({tags: {Canon: {value: 1}}});
                expect(merged.read(getMakerNoteBlock({make: ['PENTAX'], bytes: getPentaxType1Bytes()}), getContext())).to.deep.equal({tags: {Pentax: {value: 1}}});
                expect(merged.read(getMakerNoteBlock({make: ['Nikon']}), getContext())).to.equal(undefined);
                expect(canonReads.calls).to.have.lengthOf(1);
                expect(pentaxReads.calls).to.have.lengthOf(1);
            });

            it('should sort the merged group into its dispatch position', () => {
                const composition = createComposition({groups: [thumbnail, canon, pentax, exif]});

                expect(composition.groups.map((group) => group.consumes[0])).to.deep.equal(['exif', 'makerNote', 'thumbnail']);
            });
        });

        it('should reject a composition whose emission graph has a cycle', () => {
            const looping = {key: 'loop', consumes: ['exif'], emits: ['exif'], read: () => undefined, merge: () => ({})};

            expect(() => createComposition({groups: [looping]})).to.throw('The group emission graph has a cycle through exif');
        });
    });

    describe('the derived groups', () => {
        it('should be gps then composite whatever order they are listed in, and not engine groups', () => {
            const composition = createComposition({groups: [composite, exif, gps, composite]});

            expect(composition.derived).to.deep.equal([gps, composite]);
            expect(composition.groups).to.deep.equal([exif]);
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
});

function createComposition({formats = [], groups = []}) {
    return Composition.createComposition({formats, groups});
}
