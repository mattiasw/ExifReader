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
import {objectAssign} from './utils.js';

export default {
    parseAppMarkers
};

/**
 * Detects the image format and delegates to the matching finder.
 *
 * @param {DataView} dataView The data view to inspect.
 * @param {boolean=} async Whether async parsing is enabled.
 * @param {boolean=} includeMetadataBlocks When true, the finder collects a
 *     block list describing where metadata sits in the file. The result
 *     gains `metadataBlocks` and `metadataTruncated` fields.
 * @returns {Object} Per-format offsets plus `fileType`.
 * @throws {Error} When the data view is not a recognized image format.
 */
function parseAppMarkers(dataView, async, includeMetadataBlocks) {
    const metadataBlocks = includeMetadataBlocks ? [] : undefined;

    if (Constants.USE_TIFF && Tiff.isTiffFile(dataView)) {
        return finalize(Tiff.findTiffOffsets(), 'tiff', 'TIFF', metadataBlocks);
    }

    if (Constants.USE_JPEG && Jpeg.isJpegFile(dataView)) {
        return finalize(Jpeg.findJpegOffsets(dataView, metadataBlocks), 'jpeg', 'JPEG', metadataBlocks);
    }

    if (Constants.USE_PNG && Png.isPngFile(dataView)) {
        return finalize(Png.findPngOffsets(dataView, async, metadataBlocks), 'png', 'PNG', metadataBlocks);
    }

    if (Constants.USE_HEIC && Heic.isHeicFile(dataView)) {
        return finalize(Heic.findHeicOffsets(dataView, metadataBlocks), 'heic', 'HEIC', metadataBlocks);
    }

    if (Constants.USE_AVIF && Avif.isAvifFile(dataView)) {
        return finalize(Avif.findAvifOffsets(dataView, metadataBlocks), 'avif', 'AVIF', metadataBlocks);
    }

    if (Constants.USE_JXL && Jxl.isJxlFile(dataView)) {
        return finalize(Jxl.findJxlOffsets(dataView, metadataBlocks), 'jxl', 'JPEG XL', metadataBlocks);
    }

    if (Constants.USE_WEBP && Webp.isWebpFile(dataView)) {
        return finalize(Webp.findOffsets(dataView, metadataBlocks), 'webp', 'WebP', metadataBlocks);
    }

    if (Constants.USE_GIF && Gif.isGifFile(dataView)) {
        return finalize(Gif.findOffsets(dataView, metadataBlocks), 'gif', 'GIF', metadataBlocks);
    }

    if (Constants.USE_XMP && Xml.isXMLFile(dataView)) {
        return finalize(Xml.findOffsets(dataView, metadataBlocks), 'xml', 'XML', metadataBlocks);
    }

    throw new Error('Invalid image format');
}

function finalize(offsets, fileType, fileTypeDescription, metadataBlocks) {
    const result = objectAssign({}, offsets, {fileType: {value: fileType, description: fileTypeDescription}});
    if (metadataBlocks !== undefined) {
        result.metadataBlocks = metadataBlocks;
        // Surface the finder's .truncated array convention as a sibling
        // field so consumers don't depend on properties on the array.
        result.metadataTruncated = !!metadataBlocks.truncated;
    }
    return result;
}
