/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import * as ExifReader from '../../src/exif-reader';
import {__RewireAPI__ as ExifReaderRewireAPI} from '../../src/exif-reader';

describe('loadView merge order', function () {
    afterEach(function () {
        resetAllDependencies();
    });

    it('should overwrite duplicate flat tags by merge precedence', function () {
        rewireConstantsForMergeOrderTests();
        rewireImageHeader({
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

        rewireSimpleReader('FileTags', {
            Collision: {value: 'file'},
            FileType: {value: 'fromFileTags'},
        });
        rewireSimpleReader('JfifTags', {Collision: {value: 'jfif'}});
        rewireExifTagsRead({Collision: {value: 'exif'}});
        rewireSimpleReader('IptcTags', {Collision: {value: 'iptc'}});
        rewireXmpTagsRead({
            Collision: {value: 'xmp'},
            _raw: '<xml/>',
        });
        rewireIccTagsRead({Collision: {value: 'icc'}});
        rewireSimpleReader('MpfTags', {Collision: {value: 'mpf'}});
        rewireSimpleReader('PngFileTags', {Collision: {value: 'pngFile'}});
        rewirePngTextTagsRead({Collision: {value: 'pngText'}});
        rewireSimpleReader('PngTags', {Collision: {value: 'pngChunk'}});
        rewireSimpleReader('Vp8xTags', {Collision: {value: 'riff'}});
        rewireSimpleReader('GifFileTags', {Collision: {value: 'gif'}});
        rewireCompositeGet({Collision: {value: 'composite'}});

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
    resetAllDependencies();
    rewireConstantsForMergeOrderTests();
    rewireImageHeader({
        fileType: {value: 'png', description: 'PNG'},
        iccChunks: [1],
        pngTextChunks: [{type: 'tEXt', offset: 1, length: 1}],
    });

    rewireIccTagsReadAsync({Collision: {value: 'icc'}}, iccDelayMs);
    rewirePngTextTagsReadAsync(
        {Collision: {value: 'pngTextSync'}},
        [{Collision: {value: 'pngTextAsync'}}],
        pngTextDelayMs
    );

    return ExifReader.loadView({}, {async: true});
}

function rewireConstantsForMergeOrderTests() {
    ExifReaderRewireAPI.__Rewire__('Constants', {
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
    });
}

function rewireImageHeader(overrides) {
    ExifReaderRewireAPI.__Rewire__('ImageHeader', {
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
    });
}

function rewireSimpleReader(dependencyName, tagsValue) {
    ExifReaderRewireAPI.__Rewire__(dependencyName, {
        read() {
            return tagsValue;
        },
    });
}

function rewireExifTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('Tags', {
        read() {
            return {tags: tagsValue, byteOrder: undefined};
        },
    });
}

function rewireXmpTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('XmpTags', {
        read() {
            return tagsValue;
        },
    });
}

function rewireIccTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('IccTags', {
        read() {
            return tagsValue;
        },
    });
}

function rewireIccTagsReadAsync(tagsValue, delayMs) {
    ExifReaderRewireAPI.__Rewire__('IccTags', {
        read() {
            return createDelayedPromise(tagsValue, delayMs);
        },
    });
}

function rewirePngTextTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('PngTextTags', {
        read() {
            return {readTags: tagsValue};
        },
    });
}

function rewirePngTextTagsReadAsync(readTags, asyncTagList, delayMs) {
    ExifReaderRewireAPI.__Rewire__('PngTextTags', {
        read(dataView, pngTextChunks, async) {
            if (!async) {
                return {readTags};
            }

            return {
                readTags,
                readTagsPromise: createDelayedPromise(asyncTagList, delayMs),
            };
        },
    });
}

function rewireCompositeGet(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('Composite', {
        get() {
            return tagsValue;
        },
    });
}

function createDelayedPromise(value, delayMs) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(value), delayMs);
    });
}

function resetAllDependencies() {
    ExifReaderRewireAPI.__ResetDependency__('Constants');
    ExifReaderRewireAPI.__ResetDependency__('ImageHeader');
    ExifReaderRewireAPI.__ResetDependency__('FileTags');
    ExifReaderRewireAPI.__ResetDependency__('JfifTags');
    ExifReaderRewireAPI.__ResetDependency__('Tags');
    ExifReaderRewireAPI.__ResetDependency__('IptcTags');
    ExifReaderRewireAPI.__ResetDependency__('XmpTags');
    ExifReaderRewireAPI.__ResetDependency__('IccTags');
    ExifReaderRewireAPI.__ResetDependency__('MpfTags');
    ExifReaderRewireAPI.__ResetDependency__('PngFileTags');
    ExifReaderRewireAPI.__ResetDependency__('PngTextTags');
    ExifReaderRewireAPI.__ResetDependency__('PngTags');
    ExifReaderRewireAPI.__ResetDependency__('Vp8xTags');
    ExifReaderRewireAPI.__ResetDependency__('GifFileTags');
    ExifReaderRewireAPI.__ResetDependency__('Composite');
}
