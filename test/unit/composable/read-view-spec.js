/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {DOMParser} from '@xmldom/xmldom';
import {readView} from '../../../src/composable/read-view.js';
import Composition from '../../../src/composable/composition.js';
import Errors from '../../../src/errors.js';
import {allFormats} from '../../../src/composable/formats.js';
import {allGroups, exif, iptc} from '../../../src/composable/groups.js';
import {createTagFilter, NOOP_TAG_FILTER} from '../../../src/tag-filter.js';
import Composite from '../../../src/composite.js';
import {getDataView, swapProperties} from '../test-utils.js';
import {
    ascii,
    getTiff,
    getJpeg,
    getExifSegment,
    getXmpSegment,
    getXmpPacket,
    getPng,
    getTextChunk,
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
});

function getEnvironment({includeTagsIsLimit} = {}) {
    return {
        getDomParser: (domParser) => ({parser: domParser || new DOMParser()}),
        getBase64Image: () => undefined,
        createTagFilter,
        includeTagsIsLimit,
    };
}
