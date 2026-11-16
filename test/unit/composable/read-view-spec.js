/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {DOMParser} from '@xmldom/xmldom';
import {readView} from '../../../src/composable/read-view.js';
import Composition from '../../../src/composable/composition.js';
import Errors from '../../../src/errors.js';
import {allFormats, jpeg as jpegFormat, png as pngFormat} from '../../../src/composable/formats.js';
import {allGroups, exif, iptc} from '../../../src/composable/groups.js';
import {createTagFilter, NOOP_TAG_FILTER} from '../../../src/tag-filter.js';
import Composite from '../../../src/composite.js';
import {decompression} from '../../../src/decompression.js';
import {getDataView, swapProperties} from '../test-utils.js';
import {recordCalls} from './test-context.js';
import {
    ascii,
    getTiff,
    getJpeg,
    getExifSegment,
    getXmpSegment,
    getXmpPacket,
    getPng,
    getTextChunk,
    getZtxtChunk,
    getExifRawProfile,
    TAG_MAKE,
    TAG_MODEL,
} from '../loadview-inventory-images.js';

const ALL = Composition.createComposition({formats: allFormats, groups: allGroups});
const FORMATS_BUT_XML = allFormats.filter((format) => format.header.fileType.value !== 'xml');
const THUMBNAIL_IMAGE = '\xff\xd8\xff\xd9';
const JPEG = getJpeg(
    getExifSegment(getTiff({ifd0: [ascii(TAG_MAKE, 'Make')], thumbnail: {image: THUMBNAIL_IMAGE}})),
    getXmpSegment(getXmpPacket({Label: 'xmp'}))
);

describe('composable/read-view', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should read only the window of a DataView into a larger buffer', () => {
        const image = getDataView(JPEG);
        const buffer = new ArrayBuffer(image.byteLength + 20);
        new Uint8Array(buffer).set(new Uint8Array(image.buffer, image.byteOffset, image.byteLength), 10);
        const window = new DataView(buffer, 10, image.byteLength);

        const tags = readView(ALL, window, {expanded: true}, getEnvironment());

        expect(tags.exif.Make.description).to.equal('Make');
        expect(tags.Thumbnail.image.byteLength).to.equal(THUMBNAIL_IMAGE.length);
        expect(new Uint8Array(tags.Thumbnail.image)).to.deep.equal(new Uint8Array(getDataView(THUMBNAIL_IMAGE).buffer));
    });

    it('should list in metadataRange only the kinds the composition consumes', () => {
        const withoutXmp = Composition.createComposition({formats: FORMATS_BUT_XML, groups: [exif]});

        const all = readView(ALL, getDataView(JPEG), {expanded: true, includeOffsets: true}, getEnvironment());
        const exifOnly = readView(withoutXmp, getDataView(JPEG), {expanded: true, includeOffsets: true}, getEnvironment());

        expect(all.metadataRange.blocks.map((block) => block.type)).to.deep.equal(['exif', 'xmp']);
        expect(exifOnly.metadataRange.blocks.map((block) => block.type)).to.deep.equal(['exif']);
    });

    it('should merge the uncompressed PNG text chunks as one tier after a raw-profile Exif, whatever the chunk order', () => {
        const png = getPng(
            getTextChunk('Comment', 'Text'),
            getTextChunk('Raw profile type exif', getExifRawProfile(getTiff({ifd0: [ascii(TAG_MAKE, 'Make')]}))),
            getTextChunk('Raw profile type exif', getExifRawProfile(getTiff({ifd0: [ascii(TAG_MODEL, 'Model')]})))
        );

        const tags = readView(Composition.createComposition({formats: FORMATS_BUT_XML, groups: [exif, iptc]}), getDataView(png), {}, getEnvironment());

        expect(tags.Make.description).to.equal('Make');
        expect(tags.Model.description).to.equal('Model');
        const names = Object.keys(tags);
        expect(names.indexOf('Comment')).to.be.above(names.indexOf('Make'));
        expect(names.indexOf('Comment')).to.be.above(names.indexOf('Model'));
    });

    for (const async of [false, true]) {
        it(`should run the composition's steps on the engine's merge blocks and on the tags with the blocks it reads (async: ${async})`, async () => {
            const composition = Composition.createComposition({formats: [pngFormat], groups: []});
            const prepared = [];
            const finished = [];
            composition.prepareMergeBlocks = [
                (mergeBlocks) => {
                    prepared.push(mergeBlocks.map((block) => block.slot));
                    return mergeBlocks.filter((block) => block.slot !== 'pngText');
                },
                (mergeBlocks) => {
                    prepared.push(mergeBlocks.map((block) => block.slot));
                    return mergeBlocks;
                },
            ];
            composition.finishTags = [
                (tags, load) => {
                    finished.push({keys: Object.keys(tags), load});
                    return {first: tags};
                },
                (tags) => Object.assign({second: true}, tags),
            ];
            const tagFilter = createTagFilter();
            const environment = getEnvironment();
            environment.createTagFilter = () => tagFilter;
            const png = getPng(getTextChunk('Comment', 'Text'), getZtxtChunk('Title', 'compressed'));

            const tags = await readView(composition, getDataView(png), {expanded: true, async}, environment);

            const pngTextSlots = async ? ['pngText', 'deferredPngText'] : ['pngText'];
            expect(prepared).to.deep.equal([['pngFile'].concat(pngTextSlots), ['pngFile'].concat(pngTextSlots.slice(1))]);
            expect(finished).to.have.lengthOf(1);
            expect(finished[0].keys).to.deep.equal(async ? ['png', 'pngFile', 'pngText', 'file'] : ['png', 'pngFile', 'file']);
            expect(finished[0].load.expanded).to.equal(true);
            expect(finished[0].load.async).to.equal(async);
            expect(finished[0].load.tagFilter).to.equal(tagFilter);
            expect(finished[0].load.blocks.map((block) => block.kind)).to.deep.equal(async ? ['pngFile', 'pngText', 'pngText'] : ['pngFile', 'pngText']);
            expect(Object.keys(tags)).to.deep.equal(['second', 'first']);
        });
    }

    it('should take the DOM parser and the thumbnail base64 from the environment', () => {
        const calls = [];
        const domParser = new DOMParser();
        const environment = {
            getDomParser(given) {
                calls.push(['getDomParser', given]);
                return {parser: given};
            },
            getBase64Image(image) {
                calls.push(['getBase64Image', image.byteLength]);
                return 'base64';
            },
            createTagFilter,
        };

        const tags = readView(ALL, getDataView(JPEG), {expanded: true, domParser}, environment);

        expect(tags.xmp.Label.value).to.equal('xmp');
        expect(tags.Thumbnail.base64).to.equal('base64');
        expect(calls).to.deep.equal([['getDomParser', domParser], ['getBase64Image', THUMBNAIL_IMAGE.length]]);
    });

    it('should cap what is read with includeTags as a limit only when the environment says so', () => {
        const options = {expanded: true, includeTags: {exif: true}, excludeTags: {exif: ['Make']}};

        expect(readView(ALL, getDataView(JPEG), options, getEnvironment()).exif.Make.description).to.equal('Make');
        expect(readView(ALL, getDataView(JPEG), options, getEnvironment({includeTagsIsLimit: true})).exif.Make).to.equal(undefined);
    });

    it('should have flat Composite read the merged tags only when includeTags caps reading and no excludeTags is given', () => {
        const calls = [];
        restores.push(swapProperties(Composite, {get: (...args) => {
            calls.push(args);
            return undefined;
        }}));
        const includeTags = {exif: true, composite: true, file: true};
        const load = (excludeTags, environment) => {
            readView(ALL, getDataView(JPEG), {includeTags, excludeTags}, environment);
            return calls.pop();
        };

        for (const excludeTags of [undefined, null, '']) {
            const [compositeInput, compositeInputExpanded] = load(excludeTags, getEnvironment({includeTagsIsLimit: true}));
            expect(compositeInputExpanded, String(excludeTags)).to.equal(false);
            expect(compositeInput.Make.description, String(excludeTags)).to.equal('Make');
        }
        expect(load({xmp: ['Label']}, getEnvironment({includeTagsIsLimit: true}))[1]).to.equal(true);
        expect(load(undefined, getEnvironment())[1]).to.equal(true);
    });

    it('should build its filter with the environment\'s factory', () => {
        const calls = [];
        const includeTags = {exif: true};
        const excludeTags = {xmp: true};
        const environment = getEnvironment({includeTagsIsLimit: true});
        environment.createTagFilter = (options) => {
            calls.push(options);
            return Object.assign({}, NOOP_TAG_FILTER, {isActive: true, shouldReturnGroup: (groupKey) => groupKey !== 'exif'});
        };

        const tags = readView(ALL, getDataView(JPEG), {expanded: true, includeTags, excludeTags}, environment);

        expect(tags.exif).to.equal(undefined);
        expect(tags.Thumbnail.image.byteLength).to.equal(THUMBNAIL_IMAGE.length);
        expect(calls).to.deep.equal([{includeTags, excludeTags, includeTagsIsLimit: true}]);
        expect(calls[0].includeTags).to.equal(includeTags);
        expect(calls[0].excludeTags).to.equal(excludeTags);
    });

    it('should return a promise in async mode', async () => {
        const result = readView(ALL, getDataView(JPEG), {async: true}, getEnvironment());

        expect(result).to.be.an.instanceof(Promise);
        expect((await result).Make.description).to.equal('Make');
    });

    it('should throw an UnsupportedFormatError synchronously for a format the composition lacks', () => {
        const pngOnly = Composition.createComposition({formats: allFormats.filter((format) => format.header.fileType.value === 'png'), groups: []});

        expect(() => readView(pngOnly, getDataView(JPEG), {async: true}, getEnvironment())).to.throw(Errors.UnsupportedFormatError, 'Invalid image format');
    });

    describe('decompression', () => {
        const PNG_WITH_ZTXT = getPng(getZtxtChunk('Comment', 'compressed'));

        it('should give each load through one composition its own budget', async () => {
            const pngOnly = Composition.createComposition({formats: [pngFormat], groups: []});
            const options = {async: true, decompress: {deflate: () => getDataView('abcd'), maxDecompressedSize: 4}};

            const first = await readView(pngOnly, getDataView(PNG_WITH_ZTXT), options, getEnvironment());
            const second = await readView(pngOnly, getDataView(PNG_WITH_ZTXT), options, getEnvironment());

            expect(first.Comment.description).to.equal('abcd');
            expect(second.Comment.description).to.equal('abcd');
        });

        it('should hand the decompress option\'s limit to the decompressor', async () => {
            const pngOnly = Composition.createComposition({formats: [pngFormat], groups: []});
            const load = (text) => readView(pngOnly, getDataView(PNG_WITH_ZTXT), {async: true, decompress: {deflate: () => getDataView(text), maxDecompressedSize: 4}}, getEnvironment());
            const warnings = [];
            restores.push(swapProperties(console, {warn: (message) => warnings.push(message)}));

            const underLimit = await load('abcd');
            const overLimit = await load('abcde');

            expect(underLimit.Comment.description).to.equal('abcd');
            expect(overLimit.Comment.description).to.not.equal('abcde');
            expect(warnings.join()).to.include('maximum of 4 bytes');
        });

        it('should build the budget and the pool per load only for a composition with png or jxl', () => {
            const budgets = recordCalls(decompression, 'withDecompressBudget', decompression.withDecompressBudget);
            const pools = recordCalls(decompression, 'createPooledDecompress', decompression.createPooledDecompress);
            restores.push(budgets.restore, pools.restore);
            const jpegOnly = Composition.createComposition({formats: [jpegFormat], groups: [exif]});
            const pngOnly = Composition.createComposition({formats: [pngFormat], groups: []});
            const config = {maxDecompressedSize: 10};

            const tags = readView(jpegOnly, getDataView(JPEG), {decompress: config}, getEnvironment());
            expect(tags.Make.description).to.equal('Make');
            expect(budgets.calls).to.deep.equal([]);
            expect(pools.calls).to.deep.equal([]);

            readView(pngOnly, getDataView(getPng()), {decompress: config}, getEnvironment());
            readView(pngOnly, getDataView(getPng()), {decompress: config}, getEnvironment());
            expect(budgets.calls).to.deep.equal([[config], [config]]);
            expect(pools.calls).to.have.lengthOf(2);
            expect(pools.calls[0][0]).to.not.equal(config);
            expect(pools.calls[0][0].maxDecompressedSize).to.equal(10);
            expect(pools.calls[0][0].budget.remaining).to.equal(10);
            expect(pools.calls[1][0]).to.not.equal(pools.calls[0][0]);
        });
    });
});

function getEnvironment({includeTagsIsLimit} = {}) {
    return {
        getDomParser: (domParser) => ({parser: domParser || new DOMParser()}),
        getBase64Image: () => undefined,
        createTagFilter,
        includeTagsIsLimit,
    };
}
