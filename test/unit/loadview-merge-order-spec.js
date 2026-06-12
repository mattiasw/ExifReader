/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {swapProperties} from './test-utils.js';
import * as ExifReader from '../../src/exif-reader.js';
import Constants from '../../src/constants.js';
import ImageHeader from '../../src/image-header.js';
import FileTags from '../../src/file-tags.js';
import JfifTags from '../../src/jfif-tags.js';
import Tags from '../../src/tags.js';
import IptcTags from '../../src/iptc-tags.js';
import XmpTags from '../../src/xmp-tags.js';
import IccTags from '../../src/icc-tags.js';
import MpfTags from '../../src/mpf-tags.js';
import PngFileTags from '../../src/png-file-tags.js';
import PngTextTags from '../../src/png-text-tags.js';
import PngTags from '../../src/png-tags.js';
import Vp8xTags from '../../src/vp8x-tags.js';
import GifFileTags from '../../src/gif-file-tags.js';
import Composite from '../../src/composite.js';

const restoreFunctions = [];

describe('loadView merge order', function () {
    afterEach(function () {
        restoreAllFakes();
    });

    it('should overwrite duplicate flat tags by merge precedence', function () {
        fakeConstantsForMergeOrderTests();
        fakeImageHeader({
            fileType: {value: 'jpeg', description: 'JPEG'},
            fileDataOffset: 1,
            jfifDataOffset: 1,
            tiffHeaderOffset: 1,
            iptcDataOffset: 1,
            xmpChunks: [{dataOffset: 0, length: 1}],
            iccChunks: [1, 2],
            mpfDataOffset: 1,
            pngHeaderOffset: 1,
            pngTextChunks: [{type: 'tEXt', offset: 1, length: 1}],
            pngChunkOffsets: [1],
            vp8xChunkOffset: 1,
            gifHeaderOffset: 1,
        });

        fakeSimpleReader(FileTags, {
            Collision: {value: 'file'},
            FileType: {value: 'fromFileTags'},
        });
        fakeSimpleReader(JfifTags, {Collision: {value: 'jfif'}});
        fakeExifTagsRead({Collision: {value: 'exif'}});
        fakeSimpleReader(IptcTags, {Collision: {value: 'iptc'}});
        fakeSimpleReader(XmpTags, {
            Collision: {value: 'xmp'},
            _raw: '<xml/>',
        });
        fakeSimpleReader(IccTags, {Collision: {value: 'icc'}});
        fakeSimpleReader(MpfTags, {Collision: {value: 'mpf'}});
        fakeSimpleReader(PngFileTags, {Collision: {value: 'pngFile'}});
        fakePngTextTagsRead({Collision: {value: 'pngText'}});
        fakeSimpleReader(PngTags, {Collision: {value: 'pngChunk'}});
        fakeSimpleReader(Vp8xTags, {Collision: {value: 'riff'}});
        fakeSimpleReader(GifFileTags, {Collision: {value: 'gif'}});
        fakeCompositeGet({Collision: {value: 'composite'}});

        const tags = ExifReader.loadView({}, {});

        expect(tags.Collision.value).to.equal('composite');
        expect(tags._raw).to.equal(undefined);
        expect(tags.FileType.value).to.equal('jpeg');
    });

    it('should be deterministic in async mode regardless of promise resolution order', async function () {
        const tagsA = await loadAsyncWithDelays({
            iccDelayMs: 20,
            pngTextDelayMs: 0,
        });
        const tagsB = await loadAsyncWithDelays({
            iccDelayMs: 0,
            pngTextDelayMs: 20,
        });

        expect(tagsA).to.deep.equal(tagsB);
        expect(tagsA.Collision.value).to.equal('pngTextAsync');
    });
});

function loadAsyncWithDelays({iccDelayMs, pngTextDelayMs}) {
    restoreAllFakes();
    fakeConstantsForMergeOrderTests();
    fakeImageHeader({
        fileType: {value: 'png', description: 'PNG'},
        iccChunks: [1],
        pngTextChunks: [{type: 'tEXt', offset: 1, length: 1}],
    });

    fakeIccTagsReadAsync({Collision: {value: 'icc'}}, iccDelayMs);
    fakePngTextTagsReadAsync(
        {Collision: {value: 'pngTextSync'}},
        [{Collision: {value: 'pngTextAsync'}}],
        pngTextDelayMs
    );

    return ExifReader.loadView({}, {async: true});
}

function fakeConstantsForMergeOrderTests() {
    // The rewire version replaced the whole Constants object, leaving every
    // unlisted flag undefined. The flags set to false keep that meaning.
    restoreFunctions.push(swapProperties(Constants, {
        USE_JPEG: true,
        USE_FILE: true,
        USE_JFIF: true,
        USE_EXIF: true,
        USE_IPTC: true,
        USE_XMP: true,
        USE_ICC: true,
        USE_MPF: true,
        USE_PNG: true,
        USE_PNG_FILE: true,
        USE_WEBP: true,
        USE_GIF: true,
        USE_THUMBNAIL: true,
        USE_PHOTOSHOP: false,
        USE_TIFF: false,
        USE_HEIC: false,
        USE_AVIF: false,
        USE_JXL: false,
        USE_MAKER_NOTES: false,
    }));
}

function fakeImageHeader(overrides) {
    restoreFunctions.push(swapProperties(ImageHeader, {
        parseAppMarkers() {
            return Object.assign(
                {
                    fileType: undefined,
                    fileDataOffset: undefined,
                    jfifDataOffset: undefined,
                    tiffHeaderOffset: undefined,
                    iptcDataOffset: undefined,
                    xmpChunks: undefined,
                    iccChunks: undefined,
                    mpfDataOffset: undefined,
                    pngHeaderOffset: undefined,
                    pngTextChunks: undefined,
                    pngChunkOffsets: undefined,
                    vp8xChunkOffset: undefined,
                    gifHeaderOffset: undefined,
                },
                overrides
            );
        },
    }));
}

function fakeSimpleReader(module, tagsValue) {
    restoreFunctions.push(swapProperties(module, {
        read() {
            return tagsValue;
        },
    }));
}

function fakeExifTagsRead(tagsValue) {
    restoreFunctions.push(swapProperties(Tags, {
        read() {
            return {tags: tagsValue, byteOrder: undefined};
        },
    }));
}

function fakeIccTagsReadAsync(tagsValue, delayMs) {
    restoreFunctions.push(swapProperties(IccTags, {
        read() {
            return createDelayedPromise(tagsValue, delayMs);
        },
    }));
}

function fakePngTextTagsRead(tagsValue) {
    restoreFunctions.push(swapProperties(PngTextTags, {
        read() {
            return {readTags: tagsValue};
        },
    }));
}

function fakePngTextTagsReadAsync(readTags, asyncTagList, delayMs) {
    restoreFunctions.push(swapProperties(PngTextTags, {
        read(dataView, pngTextChunks, async) {
            if (!async) {
                return {readTags};
            }

            return {
                readTags,
                readTagsPromise: createDelayedPromise(asyncTagList, delayMs),
            };
        },
    }));
}

function fakeCompositeGet(tagsValue) {
    restoreFunctions.push(swapProperties(Composite, {
        get() {
            return tagsValue;
        },
    }));
}

function createDelayedPromise(value, delayMs) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(value), delayMs);
    });
}

function restoreAllFakes() {
    while (restoreFunctions.length > 0) {
        restoreFunctions.pop()();
    }
}
