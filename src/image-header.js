/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Constants from './constants.js';
import Tiff from './image-header-tiff.js';
import Jpeg from './image-header-jpeg.js';
import Png from './image-header-png.js';
import Heic from './image-header-heic.js';
import Avif from './image-header-avif.js';
import Jxl from './image-header-jxl.js';
import Webp from './image-header-webp.js';
import Gif from './image-header-gif.js';
import Xml from './xml.js';

export default {
    parseAppMarkers
};

/**
 * Detects the image format and delegates to the matching finder.
 *
 * @param {DataView} dataView The data view to inspect.
 * @param {boolean=} includeRanges When true, the finder also records where
 *     each block's bytes sit in the file. The result then gains `ranges`, a
 *     list of `{block, start, end}` in file order, and `truncated`, true when
 *     the finder never reached the end of the file's metadata.
 * @returns {{fileType: {value: string, description: string}, blocks: Array<Object>, ranges: (Array<Object>|undefined), truncated: (boolean|undefined)}}
 *     The blocks the finder found, each `{kind, ...payload}`.
 * @throws {Error} When the data view is not a recognized image format.
 */
function parseAppMarkers(dataView, includeRanges) {
    const ranges = includeRanges ? [] : undefined;

    if (Constants.USE_TIFF && Tiff.isTiffFile(dataView)) {
        return finalize(Tiff.findTiffOffsets(), 'tiff', 'TIFF', ranges);
    }

    if (Constants.USE_JPEG && Jpeg.isJpegFile(dataView)) {
        return finalize(Jpeg.findJpegOffsets(dataView, ranges), 'jpeg', 'JPEG', ranges);
    }

    if (Constants.USE_PNG && Png.isPngFile(dataView)) {
        return finalize(Png.findPngOffsets(dataView, ranges), 'png', 'PNG', ranges);
    }

    if (Constants.USE_HEIC && Heic.isHeicFile(dataView)) {
        return finalize(Heic.findHeicOffsets(dataView, ranges), 'heic', 'HEIC', ranges);
    }

    if (Constants.USE_AVIF && Avif.isAvifFile(dataView)) {
        return finalize(Avif.findAvifOffsets(dataView, ranges), 'avif', 'AVIF', ranges);
    }

    if (Constants.USE_JXL && Jxl.isJxlFile(dataView)) {
        return finalize(Jxl.findJxlOffsets(dataView, ranges), 'jxl', 'JPEG XL', ranges);
    }

    if (Constants.USE_WEBP && Webp.isWebpFile(dataView)) {
        return finalize(Webp.findOffsets(dataView, ranges), 'webp', 'WebP', ranges);
    }

    if (Constants.USE_GIF && Gif.isGifFile(dataView)) {
        return finalize(Gif.findOffsets(dataView, ranges), 'gif', 'GIF', ranges);
    }

    if (Constants.USE_XMP && Xml.isXMLFile(dataView)) {
        return finalize(Xml.findOffsets(dataView, ranges), 'xml', 'XML', ranges);
    }

    throw new Error('Invalid image format');
}

function finalize(blocks, fileType, fileTypeDescription, ranges) {
    const result = {fileType: {value: fileType, description: fileTypeDescription}, blocks};
    if (ranges !== undefined) {
        result.ranges = ranges;
        // Surface the finder's .truncated array convention as a sibling
        // field so consumers don't depend on properties on the array.
        result.truncated = !!ranges.truncated;
    }
    return result;
}
