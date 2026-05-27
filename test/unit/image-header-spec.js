/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import {__RewireAPI__ as ImageHeaderRewireAPI} from '../../src/image-header';
import ImageHeader from '../../src/image-header';

describe('image-header', () => {
    afterEach(() => {
        ImageHeaderRewireAPI.__ResetDependency__('Constants');
        ImageHeaderRewireAPI.__ResetDependency__('Tiff');
        ImageHeaderRewireAPI.__ResetDependency__('Jpeg');
        ImageHeaderRewireAPI.__ResetDependency__('Png');
        ImageHeaderRewireAPI.__ResetDependency__('Heic');
        ImageHeaderRewireAPI.__ResetDependency__('Avif');
        ImageHeaderRewireAPI.__ResetDependency__('Jxl');
        ImageHeaderRewireAPI.__ResetDependency__('Webp');
        ImageHeaderRewireAPI.__ResetDependency__('Gif');
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
            ImageHeaderRewireAPI.__Rewire__('Tiff', {
                isTiffFile: (_dataView) => _dataView === dataView,
                findTiffOffsets: () => offsets
            });
        });

        it('should handle TIFF files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'tiff', description: 'TIFF'}});
        });

        it('should ignore file when it\'s not a TIFF image', () => {
            ImageHeaderRewireAPI.__Rewire__('Tiff', {
                isTiffFile: () => false
            });

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when TIFF files have been excluded in a custom build', () => {
            ImageHeaderRewireAPI.__Rewire__('Constants', {USE_TIFF: false});
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
            ImageHeaderRewireAPI.__Rewire__('Jpeg', {
                isJpegFile: (_dataView) => _dataView === dataView,
                findJpegOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            });
        });

        it('should handle JPEG files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'jpeg', description: 'JPEG'}});
        });

        it('should ignore file when it\'s not a JPEG image', () => {
            ImageHeaderRewireAPI.__Rewire__('Jpeg', {
                isJpegFile: () => false
            });

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when JPEG files have been excluded in a custom build', () => {
            ImageHeaderRewireAPI.__Rewire__('Constants', {USE_JPEG: false});
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('PNG files', () => {
        const dataView = {};
        const offsets = {hasAppMarkers: true};

        beforeEach(() => {
            ImageHeaderRewireAPI.__Rewire__('Png', {
                isPngFile: (_dataView) => _dataView === dataView,
                findPngOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            });
        });

        it('should handle PNG files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'png', description: 'PNG'}});
        });

        it('should ignore file when it\'s not a PNG image', () => {
            ImageHeaderRewireAPI.__Rewire__('Png', {
                isPngFile: () => false
            });

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when PNG files have been excluded in a custom build', () => {
            ImageHeaderRewireAPI.__Rewire__('Constants', {USE_PNG: false});
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('HEIC files', () => {
        const dataView = {};
        const offsets = {};

        beforeEach(() => {
            ImageHeaderRewireAPI.__Rewire__('Heic', {
                isHeicFile: (_dataView) => _dataView === dataView,
                findHeicOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            });
        });

        it('should handle HEIC files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'heic', description: 'HEIC'}});
        });

        it('should ignore file when it\'s not a HEIC image', () => {
            ImageHeaderRewireAPI.__Rewire__('Heic', {
                isHeicFile: () => false
            });

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when HEIC files have been excluded in a custom build', () => {
            ImageHeaderRewireAPI.__Rewire__('Constants', {USE_HEIC: false});
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('AVIF files', () => {
        const dataView = {};
        const offsets = {};

        beforeEach(() => {
            ImageHeaderRewireAPI.__Rewire__('Avif', {
                isAvifFile: (_dataView) => _dataView === dataView,
                findAvifOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            });
        });

        it('should handle AVIF files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'avif', description: 'AVIF'}});
        });

        it('should ignore file when it\'s not a AVIF image', () => {
            ImageHeaderRewireAPI.__Rewire__('Avif', {
                isAvifFile: () => false
            });

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when AVIF files have been excluded in a custom build', () => {
            ImageHeaderRewireAPI.__Rewire__('Constants', {USE_AVIF: false});
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('JXL files', () => {
        const dataView = {};
        const offsets = {};

        beforeEach(() => {
            ImageHeaderRewireAPI.__Rewire__('Jxl', {
                isJxlFile: (_dataView) => _dataView === dataView,
                findJxlOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            });
        });

        it('should handle JXL files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'jxl', description: 'JPEG XL'}});
        });

        it('should ignore file when it\'s not a JXL image', () => {
            ImageHeaderRewireAPI.__Rewire__('Jxl', {
                isJxlFile: () => false
            });

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when JXL files have been excluded in a custom build', () => {
            ImageHeaderRewireAPI.__Rewire__('Constants', {USE_JXL: false});
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('WebP files', () => {
        const dataView = {};
        const offsets = {};

        beforeEach(() => {
            ImageHeaderRewireAPI.__Rewire__('Webp', {
                isWebpFile: (_dataView) => _dataView === dataView,
                findOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            });
        });

        it('should handle WebP files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'webp', description: 'WebP'}});
        });

        it('should ignore file when it\'s not a WebP image', () => {
            ImageHeaderRewireAPI.__Rewire__('Webp', {
                isWebpFile: () => false
            });

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when WebP files have been excluded in a custom build', () => {
            ImageHeaderRewireAPI.__Rewire__('Constants', {USE_WEBP: false});
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('GIF files', () => {
        const dataView = {};
        const offsets = {};

        beforeEach(() => {
            ImageHeaderRewireAPI.__Rewire__('Gif', {
                isGifFile: (_dataView) => _dataView === dataView,
                findOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            });
        });

        it('should handle GIF files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({...offsets, fileType: {value: 'gif', description: 'GIF'}});
        });

        it('should ignore file when it\'s not a GIF image', () => {
            ImageHeaderRewireAPI.__Rewire__('Gif', {
                isGifFile: () => false,
                findOffsets: (_dataView) => _dataView === dataView ? offsets : undefined
            });

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when Gif files have been excluded in a custom build', () => {
            ImageHeaderRewireAPI.__Rewire__('Constants', {USE_GIF: false});
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });
});
