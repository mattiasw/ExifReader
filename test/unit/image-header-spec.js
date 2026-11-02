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
import Xml from '../../src/xml.js';
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
        const blocks = [{kind: 'exif', tiffHeaderOffset: 0}];

        beforeEach(() => {
            restores.push(swapProperties(Tiff, {
                isTiffFile: (_dataView) => _dataView === dataView,
                findTiffOffsets: () => blocks
            }));
        });

        it('should handle TIFF files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({fileType: {value: 'tiff', description: 'TIFF'}, blocks});
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

        it('should give TIFF files no ranges (no leading metadata container)', () => {
            const result = ImageHeader.parseAppMarkers(dataView, true);
            expect(result.ranges).to.deep.equal([]);
            expect(result.truncated).to.equal(false);
        });

        it('should not include ranges when they are not asked for', () => {
            const result = ImageHeader.parseAppMarkers(dataView);
            expect(result).to.not.have.property('ranges');
            expect(result).to.not.have.property('truncated');
        });
    });

    describe('JPEG files', () => {
        const dataView = {};
        const blocks = [{kind: 'exif', tiffHeaderOffset: 12}];

        beforeEach(() => {
            restores.push(swapProperties(Jpeg, {
                isJpegFile: (_dataView) => _dataView === dataView,
                findJpegOffsets: (_dataView) => _dataView === dataView ? blocks : undefined
            }));
        });

        it('should handle JPEG files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({fileType: {value: 'jpeg', description: 'JPEG'}, blocks});
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
        const blocks = [{kind: 'pngFile', dataOffset: 16}];
        let receivedRanges;

        beforeEach(() => {
            receivedRanges = undefined;
            restores.push(swapProperties(Png, {
                isPngFile: (_dataView) => _dataView === dataView,
                findPngOffsets: (_dataView, ranges) => {
                    receivedRanges = ranges;
                    if (ranges) {
                        ranges.push({block: blocks[0], start: 8, end: 33});
                        ranges.truncated = true;
                    }
                    return _dataView === dataView ? blocks : undefined;
                }
            }));
        });

        it('should handle PNG files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({fileType: {value: 'png', description: 'PNG'}, blocks});
            expect(receivedRanges).to.equal(undefined);
        });

        it('should give the PNG finder the range list and surface its truncated flag', () => {
            const result = ImageHeader.parseAppMarkers(dataView, true);
            expect(result).to.deep.equal({
                fileType: {value: 'png', description: 'PNG'},
                blocks,
                ranges: [{block: blocks[0], start: 8, end: 33}],
                truncated: true,
            });
            expect(result.ranges).to.equal(receivedRanges);
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
        const blocks = [{kind: 'icc', chunks: []}];

        beforeEach(() => {
            restores.push(swapProperties(Heic, {
                isHeicFile: (_dataView) => _dataView === dataView,
                findHeicOffsets: (_dataView) => _dataView === dataView ? blocks : undefined
            }));
        });

        it('should handle HEIC files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({fileType: {value: 'heic', description: 'HEIC'}, blocks});
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
        const blocks = [{kind: 'icc', chunks: []}];

        beforeEach(() => {
            restores.push(swapProperties(Avif, {
                isAvifFile: (_dataView) => _dataView === dataView,
                findAvifOffsets: (_dataView) => _dataView === dataView ? blocks : undefined
            }));
        });

        it('should handle AVIF files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({fileType: {value: 'avif', description: 'AVIF'}, blocks});
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
        const blocks = [{kind: 'jxlFile', codestreamOffset: 0}];

        beforeEach(() => {
            restores.push(swapProperties(Jxl, {
                isJxlFile: (_dataView) => _dataView === dataView,
                findJxlOffsets: (_dataView) => _dataView === dataView ? blocks : undefined
            }));
        });

        it('should handle JXL files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({fileType: {value: 'jxl', description: 'JPEG XL'}, blocks});
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
        const blocks = [{kind: 'riff', dataOffset: 20}];

        beforeEach(() => {
            restores.push(swapProperties(Webp, {
                isWebpFile: (_dataView) => _dataView === dataView,
                findOffsets: (_dataView) => _dataView === dataView ? blocks : undefined
            }));
        });

        it('should handle WebP files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({fileType: {value: 'webp', description: 'WebP'}, blocks});
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
        const blocks = [{kind: 'gif', dataOffset: 0}];

        beforeEach(() => {
            restores.push(swapProperties(Gif, {
                isGifFile: (_dataView) => _dataView === dataView,
                findOffsets: (_dataView) => _dataView === dataView ? blocks : undefined
            }));
        });

        it('should handle GIF files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({fileType: {value: 'gif', description: 'GIF'}, blocks});
        });

        it('should ignore file when it\'s not a GIF image', () => {
            restores.push(swapProperties(Gif, {
                isGifFile: () => false,
                findOffsets: (_dataView) => _dataView === dataView ? blocks : undefined
            }));

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when Gif files have been excluded in a custom build', () => {
            restores.push(swapProperties(Constants, {USE_GIF: false}));
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });

    describe('XML files', () => {
        const dataView = {};
        const blocks = [{kind: 'xmp', chunks: [{dataOffset: 0, length: 15}]}];

        beforeEach(() => {
            restores.push(swapProperties(Xml, {
                isXMLFile: (_dataView) => _dataView === dataView,
                findOffsets: (_dataView) => _dataView === dataView ? blocks : undefined
            }));
        });

        it('should handle XML files', () => {
            expect(ImageHeader.parseAppMarkers(dataView)).to.deep.equal({fileType: {value: 'xml', description: 'XML'}, blocks});
        });

        it('should ignore file when it\'s not an XML file', () => {
            restores.push(swapProperties(Xml, {
                isXMLFile: () => false
            }));

            expect(() => ImageHeader.parseAppMarkers({})).to.throw(/Invalid image format/);
        });

        it('should handle when XMP has been excluded in a custom build', () => {
            restores.push(swapProperties(Constants, {USE_XMP: false}));
            expect(() => ImageHeader.parseAppMarkers(dataView)).to.throw(/Invalid image format/);
        });
    });
});
