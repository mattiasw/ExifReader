/**
 * ExifReader
 * http://github.com/mattiasw/exifreader
 * Copyright (C) 2011-2026  Mattias Wallander <mattias@wallander.eu>
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/* global Buffer */

import {objectAssign, decompress, COMPRESSION_METHOD_BROTLI, getDataView, getStringValueFromArray} from './utils.js';
import {isFilePathOrURL, isBrowserFileObject, loadFile, loadFileObject} from './file-loaders.js';
import {makeLoadAuto, validateAutoOptions} from './load-auto.js';
import Constants from './constants.js';
import {getCalculatedGpsValue} from './tag-names-utils.js';
import ByteOrder from './byte-order.js';
import {getTiffHeaderOffset} from './image-header-iso-bmff.js';
import ImageHeader from './image-header.js';
import Tags from './tags.js';
import MpfTags from './mpf-tags.js';
import FileTags from './file-tags.js';
import JxlFileTags from './jxl-file-tags.js';
import JfifTags from './jfif-tags.js';
import IptcTags from './iptc-tags.js';
import XmpTags from './xmp-tags.js';
import PhotoshopTags from './photoshop-tags.js';
import IccTags from './icc-tags.js';
import CanonTags from './canon-tags.js';
import PentaxTags from './pentax-tags.js';
import PngFileTags from './png-file-tags.js';
import PngTextTags from './png-text-tags.js';
import PngTags from './png-tags.js';
import Vp8xTags from './vp8x-tags.js';
import GifFileTags from './gif-file-tags.js';
import Thumbnail from './thumbnail.js';
import Composite from './composite.js';
import {createTagFilter} from './tag-filter.js';
import {buildTagsFromMergeSteps, isThenable} from './loadview-pipeline.js';
import exifErrors from './errors.js';

export default {
    load,
    loadView,
    errors: exifErrors,
};

export const errors = exifErrors;

export function load(data, options = {}) {
    if (options.length === 'auto') {
        validateAutoOptions(options);
        return makeLoadAuto(loadFromData)(data, options);
    }
    if (isFilePathOrURL(data)) {
        if (typeof Promise === 'undefined') {
            throw new Error('Promise is required when async mode is enabled.');
        }
        const asyncOptions = objectAssign({}, options, {async: true});

        return loadFile(data, asyncOptions).then((fileContents) => loadFromData(fileContents, asyncOptions));
    }
    if (isBrowserFileObject(data)) {
        if (typeof Promise === 'undefined') {
            throw new Error('Promise is required when async mode is enabled.');
        }
        const asyncOptions = objectAssign({}, options, {async: true});

        return loadFileObject(data, asyncOptions).then((fileContents) => loadFromData(fileContents, asyncOptions));
    }
    return loadFromData(data, options);
}

function loadFromData(data, options) {
    if (isNodeBuffer(data)) {
        // File data read in Node can share the underlying buffer with other
        // data. Therefore it's safest to get a new one to avoid weird bugs.
        data = (new Uint8Array(data)).buffer;
    }
    return loadView(getDataView(data), options);
}

function isNodeBuffer(data) {
    try {
        return Buffer.isBuffer(data);
    } catch (error) {
        return false;
    }
}

export function loadView(
    dataView,
    {
        expanded = false,
        async = false,
        computed = false,
        includeUnknown = false,
        includeOffsets = false,
        domParser = undefined,
        includeTags = undefined,
        excludeTags = undefined,
        decompress: decompressConfig = undefined
    } = {}
) {
    const tagFilter = createTagFilter({includeTags, excludeTags});
    const parsedGroups = Object.create(null);
    const mergeSteps = [];
    const deferredResults = Object.create(null);
    const deferredPromises = [];
    let pngTextIsAsync = false;
    let thumbnailIfdTags = undefined;
    let embeddedXmpStepForFlat = undefined;

    const {
        fileType,
        fileDataOffset,
        jfifDataOffset,
        tiffHeaderOffset,
        iptcDataOffset,
        xmpChunks,
        iccChunks,
        mpfDataOffset,
        pngHeaderOffset,
        pngTextChunks,
        pngChunkOffsets,
        vp8xChunkOffset,
        gifHeaderOffset,
        brobExifChunk,
        brobXmpChunk,
        jxlCodestreamOffset,
        metadataBlocks,
        metadataTruncated,
        exifDataView,
        xmpDataView
    } = ImageHeader.parseAppMarkers(dataView, async, expanded && includeOffsets);

    const fileHasMetaData = hasPotentialMetaData({
        fileType,
        fileDataOffset,
        jfifDataOffset,
        tiffHeaderOffset,
        iptcDataOffset,
        xmpChunks,
        iccChunks,
        mpfDataOffset,
        pngHeaderOffset,
        pngTextChunks,
        pngChunkOffsets,
        vp8xChunkOffset,
        gifHeaderOffset,
        jxlCodestreamOffset,
    });

    if (
        Constants.USE_JPEG
        && Constants.USE_FILE
        && fileDataOffset !== undefined
        && tagFilter.shouldParseGroup('file')
        && shouldReadFileTagsForFileTypeOnlyOptimization(includeTags)
    ) {
        const readTags = FileTags.read(dataView, fileDataOffset);
        const parsedFileTags = filterTagsForParse('file', readTags, tagFilter);
        parsedGroups.file = parsedFileTags;

        if (tagFilter.shouldReturnGroup('file')) {
            mergeSteps.push({
                type: 'mergeGroupAssign',
                groupKey: 'file',
                parsedTags: parsedFileTags,
            });
        }
    }

    if (
        Constants.USE_JPEG
        && Constants.USE_JFIF
        && jfifDataOffset !== undefined
        && tagFilter.shouldParseGroup('jfif')
    ) {
        const readTags = JfifTags.read(dataView, jfifDataOffset);
        const parsedJfifTags = filterTagsForParse('jfif', readTags, tagFilter);
        parsedGroups.jfif = parsedJfifTags;

        if (tagFilter.shouldReturnGroup('jfif')) {
            mergeSteps.push({
                type: 'mergeGroupAssign',
                groupKey: 'jfif',
                parsedTags: parsedJfifTags,
            });
        }
    }

    if (
        Constants.USE_EXIF
        && tiffHeaderOffset !== undefined
        && tagFilter.shouldParseGroup('exif')
    ) {
        const {tags: readTags, byteOrder} = readExifTagsSafely(
            exifDataView || dataView,
            tiffHeaderOffset,
            includeUnknown,
            computed,
            tagFilter
        );
        if (readTags.Thumbnail) {
            thumbnailIfdTags = readTags.Thumbnail;
            delete readTags.Thumbnail;
        }

        const parsedExifTags = filterTagsForParse('exif', readTags, tagFilter);
        parsedGroups.exif = parsedExifTags;

        if (
            Constants.USE_TIFF
            && Constants.USE_IPTC
            && parsedExifTags['IPTC-NAA']
            && iptcDataOffset === undefined
            && tagFilter.shouldParseGroup('iptc')
        ) {
            const readIptcTags = IptcTags.read(
                parsedExifTags['IPTC-NAA'].value,
                0,
                includeUnknown,
                tagFilter
            );
            const parsedIptcTags =
                filterTagsForParse('iptc', readIptcTags, tagFilter);
            parsedGroups.iptc = parsedIptcTags;

            if (tagFilter.shouldReturnGroup('iptc')) {
                mergeSteps.push({
                    type: 'mergeGroupAssign',
                    groupKey: 'iptc',
                    parsedTags: parsedIptcTags,
                });
            }
        }

        if (
            Constants.USE_TIFF
            && Constants.USE_XMP
            && parsedExifTags['ApplicationNotes']
            && !hasXmpData(xmpChunks)
            && tagFilter.shouldParseGroup('xmp')
        ) {
            const readXmpTags = XmpTags.read(
                getStringValueFromArray(parsedExifTags['ApplicationNotes'].value),
                undefined,
                domParser
            );
            const parsedXmpTags = filterTagsForParse('xmp', readXmpTags, tagFilter);
            parsedGroups.xmp = parsedXmpTags;

            if (tagFilter.shouldReturnGroup('xmp')) {
                const step = {
                    type: 'mergeXmpGroupAssign',
                    parsedTags: parsedXmpTags,
                };

                if (expanded) {
                    mergeSteps.push(step);
                } else {
                    embeddedXmpStepForFlat = step;
                }
            }
        }

        if (
            Constants.USE_PHOTOSHOP
            && parsedExifTags['ImageSourceData']
            && parsedExifTags['PhotoshopSettings']
            && tagFilter.shouldParseGroup('photoshop')
        ) {
            const readPhotoshopTags = PhotoshopTags.read(
                parsedExifTags['PhotoshopSettings'].value,
                includeUnknown,
                tagFilter
            );
            const parsedPhotoshopTags =
                filterTagsForParse('photoshop', readPhotoshopTags, tagFilter);
            parsedGroups.photoshop = parsedPhotoshopTags;

            if (tagFilter.shouldReturnGroup('photoshop')) {
                mergeSteps.push({
                    type: 'mergeGroupAssign',
                    groupKey: 'photoshop',
                    parsedTags: parsedPhotoshopTags,
                });
            }
        }

        if (
            Constants.USE_TIFF
            && Constants.USE_ICC
            && parsedExifTags['ICC_Profile']
            && !hasIccData(iccChunks)
            && tagFilter.shouldParseGroup('icc')
        ) {
            const readIccTags = IccTags.read(
                parsedExifTags['ICC_Profile'].value,
                [{
                    offset: 0,
                    length: parsedExifTags['ICC_Profile'].value.length,
                    chunkNumber: 1,
                    chunksTotal: 1
                }]
            );
            const parsedIccTags = filterTagsForParse('icc', readIccTags, tagFilter);
            parsedGroups.icc = parsedIccTags;

            if (tagFilter.shouldReturnGroup('icc')) {
                mergeSteps.push({
                    type: 'mergeGroupAssign',
                    groupKey: 'icc',
                    parsedTags: parsedIccTags,
                });
            }
        }

        if (
            Constants.USE_MAKER_NOTES
            && parsedExifTags['MakerNote']
            && tagFilter.shouldParseGroup('makerNotes')
        ) {
            if (hasCanonData(parsedExifTags)) {
                const readCanonTags = CanonTags.read(
                    exifDataView || dataView,
                    tiffHeaderOffset,
                    parsedExifTags['MakerNote'].__offset,
                    byteOrder,
                    includeUnknown,
                    computed,
                    tagFilter
                );
                parsedGroups.makerNotes = readCanonTags;
                if (tagFilter.shouldReturnGroup('makerNotes')) {
                    mergeSteps.push({
                        type: 'mergeGroupAssign',
                        groupKey: 'makerNotes',
                        parsedTags: readCanonTags,
                    });
                }
            } else if (hasPentaxType1Data(parsedExifTags)) {
                const readPentaxTags = PentaxTags.read(
                    exifDataView || dataView,
                    tiffHeaderOffset,
                    parsedExifTags['MakerNote'].__offset,
                    includeUnknown,
                    computed,
                    tagFilter
                );
                parsedGroups.makerNotes = readPentaxTags;
                if (tagFilter.shouldReturnGroup('makerNotes')) {
                    mergeSteps.push({
                        type: 'mergeGroupAssign',
                        groupKey: 'makerNotes',
                        parsedTags: readPentaxTags,
                    });
                }
            }
        }

        if (parsedExifTags['MakerNote']) {
            delete parsedExifTags['MakerNote'].__offset;
        }

        if (tagFilter.shouldReturnGroup('exif')) {
            mergeSteps.push({
                type: 'mergeGroupAssign',
                groupKey: 'exif',
                parsedTags: parsedExifTags,
            });
        }

        if (!expanded && embeddedXmpStepForFlat) {
            mergeSteps.push(embeddedXmpStepForFlat);
            embeddedXmpStepForFlat = undefined;
        }
    }

    if (
        Constants.USE_JPEG
        && Constants.USE_IPTC
        && iptcDataOffset !== undefined
        && tagFilter.shouldParseGroup('iptc')
    ) {
        const readTags = IptcTags.read(dataView, iptcDataOffset, includeUnknown, tagFilter);
        const parsedIptcTags = filterTagsForParse('iptc', readTags, tagFilter);
        parsedGroups.iptc = parsedIptcTags;

        if (tagFilter.shouldReturnGroup('iptc')) {
            mergeSteps.push({
                type: 'mergeGroupAssign',
                groupKey: 'iptc',
                parsedTags: parsedIptcTags,
            });
        }
    }

    if (
        Constants.USE_XMP
        && hasXmpData(xmpChunks)
        && tagFilter.shouldParseGroup('xmp')
    ) {
        const readTags = XmpTags.read(xmpDataView || dataView, xmpChunks, domParser);
        const parsedXmpTags = filterTagsForParse('xmp', readTags, tagFilter);
        parsedGroups.xmp = parsedXmpTags;

        if (tagFilter.shouldReturnGroup('xmp')) {
            mergeSteps.push({
                type: 'mergeXmpGroupAssign',
                parsedTags: parsedXmpTags,
            });
        }
    }

    if (
        Constants.USE_JXL
        && Constants.USE_EXIF
        && brobExifChunk
        && tiffHeaderOffset === undefined
        && tagFilter.shouldParseGroup('exif')
        && async
    ) {
        const compressedExifData = new DataView(
            dataView.buffer,
            dataView.byteOffset + brobExifChunk.dataOffset,
            brobExifChunk.length
        );
        deferredPromises.push(
            decompress(compressedExifData, COMPRESSION_METHOD_BROTLI, undefined, 'dataview', decompressConfig)
                .then((decompressedDataView) => {
                    const brobTiffHeaderOffset = getTiffHeaderOffset(decompressedDataView, 0);
                    const {tags: readTags} = Tags.read(
                        decompressedDataView,
                        brobTiffHeaderOffset,
                        includeUnknown,
                        computed,
                        tagFilter
                    );
                    if (readTags.Thumbnail) {
                        delete readTags.Thumbnail;
                    }
                    deferredResults.brobExif = readTags;
                })
                .catch(() => {
                    deferredResults.brobExif = {};
                })
        );
        mergeSteps.push({
            type: 'mergeBrobExifDeferred',
            deferredKey: 'brobExif',
        });
    }

    if (
        Constants.USE_JXL
        && Constants.USE_XMP
        && brobXmpChunk
        && !hasXmpData(xmpChunks)
        && tagFilter.shouldParseGroup('xmp')
        && async
    ) {
        const compressedXmpData = new DataView(
            dataView.buffer,
            dataView.byteOffset + brobXmpChunk.dataOffset,
            brobXmpChunk.length
        );
        deferredPromises.push(
            decompress(compressedXmpData, COMPRESSION_METHOD_BROTLI, undefined, 'dataview', decompressConfig)
                .then((decompressedDataView) => {
                    deferredResults.brobXmp = XmpTags.read(
                        decompressedDataView,
                        [{dataOffset: 0, length: decompressedDataView.byteLength}],
                        domParser
                    );
                })
                .catch(() => {
                    deferredResults.brobXmp = {};
                })
        );
        mergeSteps.push({
            type: 'mergeBrobXmpDeferred',
            deferredKey: 'brobXmp',
        });
    }

    if (
        (Constants.USE_JPEG || Constants.USE_WEBP)
        && Constants.USE_ICC
        && hasIccData(iccChunks)
        && tagFilter.shouldParseGroup('icc')
    ) {
        const readTags = IccTags.read(dataView, iccChunks, async, decompressConfig);
        if (isThenable(readTags)) {
            if (!async) {
                throw new Error('Promise is required when async mode is enabled.');
            }

            deferredPromises.push(readTags.then((resolvedTags) => {
                deferredResults.iccApp = resolvedTags;
            }));
            mergeSteps.push({
                type: 'mergeIccDeferred',
                deferredKey: 'iccApp',
            });
        } else {
            const parsedIccTags = filterTagsForParse('icc', readTags, tagFilter);
            parsedGroups.icc = parsedIccTags;
            if (tagFilter.shouldReturnGroup('icc')) {
                mergeSteps.push({
                    type: 'mergeGroupAssign',
                    groupKey: 'icc',
                    parsedTags: parsedIccTags,
                });
            }
        }
    }

    if (
        Constants.USE_MPF
        && mpfDataOffset !== undefined
        && tagFilter.shouldParseGroup('mpf')
    ) {
        const readMpfTags = MpfTags.read(
            dataView,
            mpfDataOffset,
            includeUnknown,
            computed,
            tagFilter
        );
        const parsedMpfTags = filterTagsForParse('mpf', readMpfTags, tagFilter);
        parsedGroups.mpf = parsedMpfTags;

        if (tagFilter.shouldReturnGroup('mpf')) {
            mergeSteps.push({
                type: 'mergeGroupAssign',
                groupKey: 'mpf',
                parsedTags: parsedMpfTags,
            });
        }
    }

    if (
        Constants.USE_PNG
        && Constants.USE_PNG_FILE
        && pngHeaderOffset !== undefined
        && tagFilter.shouldParseGroup('png')
    ) {
        const readTags = PngFileTags.read(dataView, pngHeaderOffset);
        const parsedPngFileTags = filterTagsForParse('png', readTags, tagFilter);
        parsedGroups.pngFile = parsedPngFileTags;

        if (tagFilter.shouldReturnGroup('png')) {
            mergeSteps.push({
                type: 'mergePngFile',
                parsedTags: parsedPngFileTags,
            });
        }
    }

    if (
        Constants.USE_PNG
        && hasPngTextData(pngTextChunks)
        && (
            tagFilter.shouldParseGroup('png')
            || tagFilter.shouldParseGroup('exif')
            || tagFilter.shouldParseGroup('iptc')
        )
    ) {
        const {readTags, readTagsPromise} = PngTextTags.read(
            dataView,
            pngTextChunks,
            async,
            includeUnknown,
            computed,
            tagFilter,
            decompressConfig
        );
        pngTextIsAsync = !!readTagsPromise;

        mergeSteps.push({
            type: 'processPngTextReadTags',
            readTags,
        });

        if (readTagsPromise) {
            deferredPromises.push(readTagsPromise.then((tagList) => {
                deferredResults.pngTextTagList = tagList;
            }));
            mergeSteps.push({
                type: 'processPngTextReadTagsDeferredList',
                deferredKey: 'pngTextTagList',
            });
        }
    }

    if (
        Constants.USE_PNG
        && pngChunkOffsets !== undefined
        && tagFilter.shouldParseGroup('png')
    ) {
        const readTags = PngTags.read(dataView, pngChunkOffsets);
        const parsedPngChunkTags = filterTagsForParse('png', readTags, tagFilter);
        parsedGroups.pngChunk = parsedPngChunkTags;

        if (tagFilter.shouldReturnGroup('png')) {
            mergeSteps.push({
                type: 'mergePngChunk',
                parsedTags: parsedPngChunkTags,
            });
        }
    }

    if (
        Constants.USE_WEBP
        && vp8xChunkOffset !== undefined
        && tagFilter.shouldParseGroup('riff')
    ) {
        const readTags = Vp8xTags.read(dataView, vp8xChunkOffset);
        const parsedRiffTags = filterTagsForParse('riff', readTags, tagFilter);
        parsedGroups.riff = parsedRiffTags;

        if (tagFilter.shouldReturnGroup('riff')) {
            mergeSteps.push({
                type: 'mergeGroupMerge',
                groupKey: 'riff',
                parsedTags: parsedRiffTags,
            });
        }
    }

    if (
        Constants.USE_GIF
        && gifHeaderOffset !== undefined
        && tagFilter.shouldParseGroup('gif')
    ) {
        const readTags = GifFileTags.read(dataView, gifHeaderOffset);
        const parsedGifTags = filterTagsForParse('gif', readTags, tagFilter);
        parsedGroups.gif = parsedGifTags;

        if (tagFilter.shouldReturnGroup('gif')) {
            mergeSteps.push({
                type: 'mergeGroupMerge',
                groupKey: 'gif',
                parsedTags: parsedGifTags,
            });
        }
    }

    if (
        Constants.USE_JXL
        && jxlCodestreamOffset !== undefined
        && tagFilter.shouldParseGroup('file')
    ) {
        const readTags = JxlFileTags.read(dataView, jxlCodestreamOffset);
        const parsedJxlFileTags = filterTagsForParse('file', readTags, tagFilter);
        parsedGroups.file = parsedJxlFileTags;

        if (tagFilter.shouldReturnGroup('file')) {
            mergeSteps.push({
                type: 'mergeGroupAssign',
                groupKey: 'file',
                parsedTags: parsedJxlFileTags,
            });
        }
    }

    mergeSteps.push({type: 'gps'});
    mergeSteps.push({type: 'composite'});
    mergeSteps.push({type: 'thumbnail'});
    mergeSteps.push({type: 'fileType'});

    if (expanded && includeOffsets) {
        mergeSteps.push({
            type: 'metadataRange',
            metadataBlocks,
            metadataTruncated: !!metadataTruncated,
        });
    }

    if (!fileHasMetaData) {
        throw new exifErrors.MetadataMissingError();
    }

    const pipelineDependencies = {
        objectAssign,
        hasPngTextData,
        filterTagsForParse,
        filterTagsForReturn,
        getGpsGroupFromExifTags,
        Composite,
        Thumbnail,
    };

    if (async) {
        if (typeof Promise === 'undefined') {
            throw new Error('Promise is required when async mode is enabled.');
        }

        return Promise.all(deferredPromises).then(() => {
            const tags = buildTagsFromMergeSteps({
                mergeSteps,
                deferredResults,
                parsedGroups,
                expanded,
                tagFilter,
                dataView,
                tiffHeaderOffset,
                exifDataView,
                fileType,
                pngTextChunks,
                pngTextIsAsync,
                thumbnailIfdTags,
                deps: pipelineDependencies,
            });

            return tags;
        });
    }

    return buildTagsFromMergeSteps({
        mergeSteps,
        deferredResults,
        parsedGroups,
        expanded,
        tagFilter,
        dataView,
        tiffHeaderOffset,
        exifDataView,
        fileType,
        pngTextChunks,
        pngTextIsAsync,
        thumbnailIfdTags,
        deps: pipelineDependencies,
    });

    function shouldReadFileTagsForFileTypeOnlyOptimization(includeTagsOptions) {
        if (!includeTagsOptions) {
            return true;
        }

        if (includeTagsOptions.composite === true) {
            return true;
        }

        if (
            Array.isArray(includeTagsOptions.composite)
            && includeTagsOptions.composite.length > 0
        ) {
            return true;
        }

        if (!includeTagsOptions.file || includeTagsOptions.file === true) {
            return true;
        }

        if (!Array.isArray(includeTagsOptions.file)) {
            return true;
        }

        const isFileTypeOnly =
            includeTagsOptions.file.length === 1
            && includeTagsOptions.file[0] === 'FileType';

        return !isFileTypeOnly;
    }
}

function readExifTagsSafely(dataView, tiffHeaderOffset, includeUnknown, computed, tagFilter) {
    try {
        return Tags.read(dataView, tiffHeaderOffset, includeUnknown, computed, tagFilter);
    } catch (error) {
        // A malformed TIFF header (an out-of-bounds offset or an invalid byte
        // order marker, e.g. from a HEIC/AVIF iloc that does not point at real
        // Exif) must not abort the whole parse. Skip Exif instead, but keep the
        // same {tags, byteOrder} shape so callers can destructure safely.
        return {tags: {}, byteOrder: ByteOrder.BIG_ENDIAN};
    }
}

function filterTagsForParse(groupKey, readTags, tagFilter) {
    if (!tagFilter.isActive) {
        return readTags;
    }

    return filterTags(groupKey, readTags, tagFilter.shouldParseTag);
}

function filterTagsForReturn(groupKey, readTags, tagFilter) {
    if (!tagFilter.isActive) {
        return readTags;
    }

    return filterTags(groupKey, readTags, tagFilter.shouldReturnTag);
}

function filterTags(groupKey, readTags, matchesTag) {
    if (!readTags) {
        return readTags;
    }

    const filteredTags = {};

    for (const tagName in readTags) {
        const tagValue = readTags[tagName];
        const tagId = getTagId(tagValue);

        if (matchesTag(groupKey, tagName, tagId)) {
            filteredTags[tagName] = tagValue;
        }
    }

    return filteredTags;

    function getTagId(tagValue) {
        if (!tagValue) {
            return undefined;
        }

        if (Array.isArray(tagValue)) {
            if (tagValue.length === 0) {
                return undefined;
            }

            return tagValue[0].id;
        }

        return tagValue.id;
    }
}

function hasPotentialMetaData({
    fileType,
    fileDataOffset,
    jfifDataOffset,
    tiffHeaderOffset,
    iptcDataOffset,
    xmpChunks,
    iccChunks,
    mpfDataOffset,
    pngHeaderOffset,
    pngTextChunks,
    pngChunkOffsets,
    vp8xChunkOffset,
    gifHeaderOffset,
    jxlCodestreamOffset,
}) {
    return !!fileType
        || (
            Constants.USE_JPEG
            && Constants.USE_FILE
            && fileDataOffset !== undefined
        )
        || (
            Constants.USE_JPEG
            && Constants.USE_JFIF
            && jfifDataOffset !== undefined
        )
        || (
            Constants.USE_EXIF
            && tiffHeaderOffset !== undefined
        )
        || (
            Constants.USE_JPEG
            && Constants.USE_IPTC
            && iptcDataOffset !== undefined
        )
        || (
            Constants.USE_XMP
            && hasXmpData(xmpChunks)
        )
        || (
            (Constants.USE_JPEG || Constants.USE_WEBP)
            && Constants.USE_ICC
            && hasIccData(iccChunks)
        )
        || (
            Constants.USE_MPF
            && mpfDataOffset !== undefined
        )
        || (
            Constants.USE_PNG
            && Constants.USE_PNG_FILE
            && pngHeaderOffset !== undefined
        )
        || (
            Constants.USE_PNG
            && hasPngTextData(pngTextChunks)
        )
        || (
            Constants.USE_PNG
            && pngChunkOffsets !== undefined
        )
        || (
            Constants.USE_WEBP
            && vp8xChunkOffset !== undefined
        )
        || (
            Constants.USE_GIF
            && gifHeaderOffset !== undefined
        )
        || (
            Constants.USE_JXL
            && jxlCodestreamOffset !== undefined
        );
}

function getGpsGroupFromExifTags(exifTags) {
    let gps = undefined;

    if (exifTags.GPSLatitude && exifTags.GPSLatitudeRef) {
        gps = gps || {};
        try {
            gps.Latitude = getCalculatedGpsValue(exifTags.GPSLatitude.value);
            if (exifTags.GPSLatitudeRef.value.join('') === 'S') {
                gps.Latitude = -gps.Latitude;
            }
        } catch (error) {
            // Ignore.
        }
    }

    if (exifTags.GPSLongitude && exifTags.GPSLongitudeRef) {
        gps = gps || {};
        try {
            gps.Longitude = getCalculatedGpsValue(exifTags.GPSLongitude.value);
            if (exifTags.GPSLongitudeRef.value.join('') === 'W') {
                gps.Longitude = -gps.Longitude;
            }
        } catch (error) {
            // Ignore.
        }
    }

    if (exifTags.GPSAltitude && exifTags.GPSAltitudeRef) {
        gps = gps || {};
        try {
            gps.Altitude =
                exifTags.GPSAltitude.value[0] / exifTags.GPSAltitude.value[1];
            if (exifTags.GPSAltitudeRef.value === 1) {
                gps.Altitude = -gps.Altitude;
            }
        } catch (error) {
            // Ignore.
        }
    }

    if (!gps) {
        return undefined;
    }

    return gps;
}

function hasXmpData(xmpChunks) {
    return Array.isArray(xmpChunks) && xmpChunks.length > 0;
}

function hasIccData(iccDataOffsets) {
    return Array.isArray(iccDataOffsets) && iccDataOffsets.length > 0;
}

function hasCanonData(tags) {
    return tags['Make'] && tags['Make'].value && Array.isArray(tags['Make'].value) && tags['Make'].value[0] === 'Canon'
        && tags['MakerNote'] && tags['MakerNote'].__offset;
}

function hasPentaxType1Data(tags) {
    const PENTAX_ID_STRING = 'PENTAX ';
    return tags['MakerNote'].value.length > PENTAX_ID_STRING.length
        && getStringValueFromArray(tags['MakerNote'].value.slice(0, PENTAX_ID_STRING.length)) === PENTAX_ID_STRING
        && tags['MakerNote'].__offset;
}

function hasPngTextData(pngTextChunks) {
    return Array.isArray(pngTextChunks) && pngTextChunks.length > 0;
}
