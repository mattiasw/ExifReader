/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {swapProperties} from './test-utils.js';
import * as ExifReader from '../../src/exif-reader.js';
import Constants from '../../src/constants.js';
import ImageHeader from '../../src/image-header.js';
import IccTags from '../../src/icc-tags.js';

const restoreFunctions = [];

describe('promise safety', function () {
    beforeEach(function () {
        this.originalPromise = global.Promise;
    });

    afterEach(function () {
        global.Promise = this.originalPromise;
        restoreAllFakes();
    });

    it('should not require Promise in sync loadView', function () {
        global.Promise = undefined;
        fakeConstantsForIcc();
        fakeImageHeader({
            fileType: {value: 'jpeg', description: 'JPEG'},
            iccChunks: [1],
        });
        fakeIccTagsRead({MyIccTag: {value: 42}});

        expect(() => ExifReader.loadView({}, {async: false})).to.not.throw();
        expect(ExifReader.loadView({}, {async: false}).MyIccTag.value).to.equal(42);
    });

    it('should throw a clear error when Promise is missing in async loadView', function () {
        global.Promise = undefined;
        fakeImageHeader({
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

function fakeConstantsForIcc() {
    // The rewire version replaced the whole Constants object, leaving every
    // unlisted flag undefined. The flags set to false keep that meaning.
    restoreFunctions.push(swapProperties(Constants, {
        USE_JPEG: true,
        USE_WEBP: true,
        USE_ICC: true,
        USE_FILE: false,
        USE_JFIF: false,
        USE_PNG_FILE: false,
        USE_EXIF: false,
        USE_IPTC: false,
        USE_XMP: false,
        USE_MPF: false,
        USE_PHOTOSHOP: false,
        USE_THUMBNAIL: false,
        USE_TIFF: false,
        USE_PNG: false,
        USE_HEIC: false,
        USE_AVIF: false,
        USE_JXL: false,
        USE_GIF: false,
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

function fakeIccTagsRead(tagsValue) {
    restoreFunctions.push(swapProperties(IccTags, {
        read() {
            return tagsValue;
        },
    }));
}

function restoreAllFakes() {
    while (restoreFunctions.length > 0) {
        restoreFunctions.pop()();
    }
}
