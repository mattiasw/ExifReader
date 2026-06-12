/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, swapProperties} from './test-utils.js';
import Constants from '../../src/constants.js';
import Tiff from '../../src/image-header-tiff.js';
import Jpeg from '../../src/image-header-jpeg.js';
import Png from '../../src/image-header-png.js';
import Heic from '../../src/image-header-heic.js';
import Avif from '../../src/image-header-avif.js';
import Jxl from '../../src/image-header-jxl.js';
import Webp from '../../src/image-header-webp.js';
import Gif from '../../src/image-header-gif.js';
import ImageHeader from '../../src/image-header.js';

describe('image-header', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should fail for too short data buffer', () => {
        const dataView = getDataView('\x00');
        expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
    });

    it('should fail for invalid image format', () => {
        const dataView = getDataView('------------');
        expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
    });

    it('should fail for undefined input value', () => {
        expect(() => ImageHeader.parseAppMarkers(undefined)).to.throw(/Invalid image format/);
    });

    describe('TIFF files', () => {
        const dataView = {};
        const offsets = {tiffHeaderOffset: 0, hasAppMarkers: true};

        beforeEach(() => {
            restores.push(swapProperties(Tiff, {
                isTiffFile: (_dataView) => _dataView === dataView,
                findTiffOffsets: () => offsets
            }));
        });

        it('should handle TIFF files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'tiff', description: 'TIFF'}});
        });

        it('should ignore file when it\'s not a TIFF image', () => {
            restores.push(swapProperties(Tiff, {
                isTiffFile: () => false
            }));

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when TIFF files have been excluded in a custom build', () => {
            restores.push(swapProperties(Constants, {USE_TIFF: false}));
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });

        it('should omit metadataBlocks for TIFF files (no leading metadata container)', () => {
            const result = ImageHeader.parseAppMarkers(dataView, false, true);
            expect(result.metadataBlocks).to.deep.equal([]);
        });
    });

    describe('JPEG files', () => {
        const dataView = {};
        const offsets = {hasAppMarkers: true};

        beforeEach(() => {
            restores.push(swapProperties(Jpeg, {
                isJpegFile: (_dataView) => _dataView === dataView,
                findJpegOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            }));
        });

        it('should handle JPEG files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'jpeg', description: 'JPEG'}});
        });

        it('should ignore file when it\'s not a JPEG image', () => {
            restores.push(swapProperties(Jpeg, {
                isJpegFile: () => false
            }));

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when JPEG files have been excluded in a custom build', () => {
            restores.push(swapProperties(Constants, {USE_JPEG: false}));
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('PNG files', () => {
        const dataView = {};
        const offsets = {hasAppMarkers: true};

        beforeEach(() => {
            restores.push(swapProperties(Png, {
                isPngFile: (_dataView) => _dataView === dataView,
                findPngOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            }));
        });

        it('should handle PNG files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'png', description: 'PNG'}});
        });

        it('should ignore file when it\'s not a PNG image', () => {
            restores.push(swapProperties(Png, {
                isPngFile: () => false
            }));

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when PNG files have been excluded in a custom build', () => {
            restores.push(swapProperties(Constants, {USE_PNG: false}));
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('HEIC files', () => {
        const dataView = {};
        const offsets = {};

        beforeEach(() => {
            restores.push(swapProperties(Heic, {
                isHeicFile: (_dataView) => _dataView === dataView,
                findHeicOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            }));
        });

        it('should handle HEIC files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'heic', description: 'HEIC'}});
        });

        it('should ignore file when it\'s not a HEIC image', () => {
            restores.push(swapProperties(Heic, {
                isHeicFile: () => false
            }));

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when HEIC files have been excluded in a custom build', () => {
            restores.push(swapProperties(Constants, {USE_HEIC: false}));
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('AVIF files', () => {
        const dataView = {};
        const offsets = {};

        beforeEach(() => {
            restores.push(swapProperties(Avif, {
                isAvifFile: (_dataView) => _dataView === dataView,
                findAvifOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            }));
        });

        it('should handle AVIF files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'avif', description: 'AVIF'}});
        });

        it('should ignore file when it\'s not a AVIF image', () => {
            restores.push(swapProperties(Avif, {
                isAvifFile: () => false
            }));

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when AVIF files have been excluded in a custom build', () => {
            restores.push(swapProperties(Constants, {USE_AVIF: false}));
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('JXL files', () => {
        const dataView = {};
        const offsets = {};

        beforeEach(() => {
            restores.push(swapProperties(Jxl, {
                isJxlFile: (_dataView) => _dataView === dataView,
                findJxlOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            }));
        });

        it('should handle JXL files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'jxl', description: 'JPEG XL'}});
        });

        it('should ignore file when it\'s not a JXL image', () => {
            restores.push(swapProperties(Jxl, {
                isJxlFile: () => false
            }));

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when JXL files have been excluded in a custom build', () => {
            restores.push(swapProperties(Constants, {USE_JXL: false}));
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('WebP files', () => {
        const dataView = {};
        const offsets = {};

        beforeEach(() => {
            restores.push(swapProperties(Webp, {
                isWebpFile: (_dataView) => _dataView === dataView,
                findOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            }));
        });

        it('should handle WebP files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'webp', description: 'WebP'}});
        });

        it('should ignore file when it\'s not a WebP image', () => {
            restores.push(swapProperties(Webp, {
                isWebpFile: () => false
            }));

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when WebP files have been excluded in a custom build', () => {
            restores.push(swapProperties(Constants, {USE_WEBP: false}));
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('GIF files', () => {
        const dataView = {};
        const offsets = {};

        beforeEach(() => {
            restores.push(swapProperties(Gif, {
                isGifFile: (_dataView) => _dataView === dataView,
                findOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            }));
        });

        it('should handle GIF files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'gif', description: 'GIF'}});
        });

        it('should ignore file when it\'s not a GIF image', () => {
            restores.push(swapProperties(Gif, {
                isGifFile: () => false,
                findOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            }));

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when Gif files have been excluded in a custom build', () => {
            restores.push(swapProperties(Constants, {USE_GIF: false}));
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });
});
