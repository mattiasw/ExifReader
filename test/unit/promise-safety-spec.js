/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import * as ExifReader from '../../src/exif-reader';
import {__RewireAPI__ as ExifReaderRewireAPI} from '../../src/exif-reader';

describe('promise safety', function () {
    beforeEach(function () {
        this.originalPromise = global.Promise;
    });

    afterEach(function () {
        global.Promise = this.originalPromise;
        resetAllDependencies();
    });

    it('should not require Promise in sync loadView', function () {
        global.Promise = undefined;
        rewireConstantsForIcc();
        rewireImageHeader({
            fileType: {value: 'jpeg', description: 'JPEG'},
            iccChunks: [1],
        });
        rewireIccTagsRead({MyIccTag: {value: 42}});

        expect(() => ExifReader.loadView({}, {async: false})).to.not.throw();
        expect(ExifReader.loadView({}, {async: false}).MyIccTag.value).to.equal(42);
    });

    it('should throw a clear error when Promise is missing in async loadView', function () {
        global.Promise = undefined;
        rewireImageHeader({
            fileType: {value: 'jpeg', description: 'JPEG'},
        });

        expect(() => ExifReader.loadView({}, {async: true})).to.throw(
            'Promise is required when async mode is enabled.'
        );
    });

    it('should throw a clear error for implicit async load when Promise is missing', function () {
        global.Promise = undefined;

        expect(() => ExifReader.load('https://domain.example/image.jpg')).to.throw(
            'Promise is required when async mode is enabled.'
        );
    });
});

function rewireConstantsForIcc() {
    ExifReaderRewireAPI.__Rewire__('Constants', {
        USE_JPEG: true,
        USE_WEBP: true,
        USE_ICC: true,
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

function rewireIccTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('IccTags', {
        read() {
            return tagsValue;
        },
    });
}

function resetAllDependencies() {
    ExifReaderRewireAPI.__ResetDependency__('Constants');
    ExifReaderRewireAPI.__ResetDependency__('ImageHeader');
    ExifReaderRewireAPI.__ResetDependency__('IccTags');
}
