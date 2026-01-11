/**
 * ExifReader
 * http://github.com/mattiasw/exifreader
 * Copyright (C) 2011-2026  Mattias Wallander <mattias@wallander.eu>
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/* global Buffer, __non_webpack_require__ */

import {objectAssign, dataUriToBuffer} from './utils.js';
import DataViewWrapper from './dataview.js';
import Constants from './constants.js';
import {getStringValueFromArray} from './utils.js';
import {getCalculatedGpsValue} from './tag-names-utils.js';
import ImageHeader from './image-header.js';
import Tags from './tags.js';
import MpfTags from './mpf-tags.js';
import FileTags from './file-tags.js';
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
import exifErrors from './errors.js';

export default {
    load,
    loadView,
    errors: exifErrors,
};

export const errors = exifErrors;

export function load(data, options = {}) {
    if (isFilePathOrURL(data)) {
        options.async = true;

        if (typeof Promise === 'undefined') {
            throw new Error('Promise is required when async mode is enabled.');
        }

        return loadFile(data, options).then((fileContents) => loadFromData(fileContents, options));
    }
    if (isBrowserFileObject(data)) {
        options.async = true;

        if (typeof Promise === 'undefined') {
            throw new Error('Promise is required when async mode is enabled.');
        }

        return loadFileObject(data, options).then((fileContents) => loadFromData(fileContents, options));
    }
    return loadFromData(data, options);
}

function isFilePathOrURL(data) {
    return typeof data === 'string';
}

function loadFile(filename, options) {
    if (/^\w+:\/\//.test(filename)) {
        if (typeof fetch !== 'undefined') {
            return fetchRemoteFile(filename, options);
        }

        return nodeGetRemoteFile(filename, options);
    }

    if (isDataUri(filename)) {
        return Promise.resolve(dataUriToBuffer(filename));
    }

    return loadLocalFile(filename, options);
}

function fetchRemoteFile(url, {length} = {}) {
    const options = {method: 'GET'};
    if (Number.isInteger(length) && length >= 0) {
        options.headers = {
            range: `bytes=0-${length - 1}`,
        };
    }
    return fetch(url, options).then((response) => response.arrayBuffer());
}

function nodeGetRemoteFile(url, {length} = {}) {
    return new Promise((resolve, reject) => {
        const options = {};
        if (Number.isInteger(length) && length >= 0) {
            options.headers = {
                range: `bytes=0-${length - 1}`,
            };
        }

        const get = requireNodeGet(url);
        get(url, options, (response) => {
            if ((response.statusCode >= 200) && (response.statusCode <= 299)) {
                const data = [];
                response.on('data', (chunk) => data.push(Buffer.from(chunk)));
                response.on('error', (error) => reject(error));
                response.on('end', () => resolve(Buffer.concat(data)));
            } else {
                reject(`Could not fetch file: ${response.statusCode} ${response.statusMessage}`);
                response.resume();
            }
        }).on('error', (error) => reject(error));
    });
}

function requireNodeGet(url) {
    if (/^https:\/\//.test(url)) {
        return __non_webpack_require__('https').get;
    }
    return __non_webpack_require__('http').get;
}

function isDataUri(filename) {
    return /^data:[^;,]*(;base64)?,/.test(filename);
}

function loadLocalFile(filename, {length} = {}) {
    return new Promise((resolve, reject) => {
        const fs = requireNodeFs();
        fs.open(filename, (error, fd) => {
            if (error) {
                reject(error);
            } else {
                fs.stat(filename, (error, stat) => {
                    if (error) {
                        reject(error);
                    } else {
                        const size = Math.min(stat.size, length !== undefined ? length : stat.size);
                        const buffer = Buffer.alloc(size);
                        const options = {
                            buffer,
                            length: size
                        };
                        fs.read(fd, options, (error) => {
                            if (error) {
                                reject(error);
                            } else {
                                fs.close(fd, (error) => {
                                    if (error) {
                                        console.warn(`Could not close file ${filename}:`, error); // eslint-disable-line no-console
                                    }
                                    resolve(buffer);
                                });
                            }
                        });
                    }
                });
            }
        });
    });
}

function requireNodeFs() {
    try {
        return __non_webpack_require__('fs');
    } catch (error) {
        return undefined;
    }
}

function isBrowserFileObject(data) {
    return (typeof File !== 'undefined') && (data instanceof File);
}

function loadFileObject(file, {length}) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (readerEvent) => resolve(readerEvent.target.result);
        reader.onerror = () => reject(reader.error);
        if (Number.isInteger(length) && length >= 0 && file.slice !== undefined) {
            reader.readAsArrayBuffer(file.slice(0, length));
        } else {
            reader.readAsArrayBuffer(file);
        }
    });
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

function getDataView(data) {
    try {
        return new DataView(data);
    } catch (error) {
        return new DataViewWrapper(data);
    }
}

export function loadView(
    dataView,
    {
        expanded = false,
        async = false,
        computed = false,
        includeUnknown = false,
        domParser = undefined,
        includeTags = undefined,
        excludeTags = undefined,
    } = {
        expanded: false,
        async: false,
        computed: false,
        includeUnknown: false,
        domParser: undefined,
        includeTags: undefined,
        excludeTags: undefined,
    }
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
        gifHeaderOffset
    } = ImageHeader.parseAppMarkers(dataView, async);

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
    });

    if (
        Constants.USE_JPEG
        && Constants.USE_FILE
        && hasFileData(fileDataOffset)
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
        && hasJfifData(jfifDataOffset)
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
        && hasExifData(tiffHeaderOffset)
        && tagFilter.shouldParseGroup('exif')
    ) {
        const {tags: readTags, byteOrder} = Tags.read(
            dataView,
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
            && !hasIptcData(iptcDataOffset)
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
                    dataView,
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
                    dataView,
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
        && hasIptcData(iptcDataOffset)
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
        const readTags = XmpTags.read(dataView, xmpChunks, domParser);
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
        (Constants.USE_JPEG || Constants.USE_WEBP)
        && Constants.USE_ICC
        && hasIccData(iccChunks)
        && tagFilter.shouldParseGroup('icc')
    ) {
        const readTags = IccTags.read(dataView, iccChunks, async);
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
        && hasMpfData(mpfDataOffset)
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
        && hasPngFileData(pngHeaderOffset)
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
            tagFilter
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
        && hasPngData(pngChunkOffsets)
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
        && hasVp8xData(vp8xChunkOffset)
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
        && hasGifFileData(gifHeaderOffset)
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

    mergeSteps.push({type: 'gps'});
    mergeSteps.push({type: 'composite'});
    mergeSteps.push({type: 'thumbnail'});
    mergeSteps.push({type: 'fileType'});

    if (!fileHasMetaData) {
        throw new exifErrors.MetadataMissingError();
    }

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
                fileType,
                pngTextChunks,
                pngTextIsAsync,
                thumbnailIfdTags,
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
        fileType,
        pngTextChunks,
        pngTextIsAsync,
        thumbnailIfdTags,
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

function buildTagsFromMergeSteps({
    mergeSteps,
    deferredResults,
    parsedGroups,
    expanded,
    tagFilter,
    dataView,
    tiffHeaderOffset,
    fileType,
    pngTextChunks,
    pngTextIsAsync,
    thumbnailIfdTags,
}) {
    let tags = {};

    for (let i = 0; i < mergeSteps.length; i++) {
        tags = applyMergeStep({
            step: mergeSteps[i],
            deferredResults,
            parsedGroups,
            expanded,
            tagFilter,
            dataView,
            tiffHeaderOffset,
            fileType,
            thumbnailIfdTags,
            tags,
        });
    }

    if (
        expanded
        && pngTextIsAsync
        && tagFilter.shouldReturnGroup('png')
        && tags.png
    ) {
        tags.pngText = objectAssign({}, tags.png);
    }

    if (
        expanded
        && tagFilter.shouldReturnGroup('png')
        && hasPngTextData(pngTextChunks)
        && tags.png
        && !tags.pngText
    ) {
        tags.pngText = objectAssign({}, tags.png);
    }

    return tags;
}

function applyMergeStep({
    step,
    deferredResults,
    parsedGroups,
    expanded,
    tagFilter,
    dataView,
    tiffHeaderOffset,
    fileType,
    thumbnailIfdTags,
    tags,
}) {
    if (step.type === 'mergeGroupAssign') {
        const returnedTags = filterTagsForReturn(step.groupKey, step.parsedTags, tagFilter);

        return mergeAssignGroup(tags, step.groupKey, returnedTags, expanded);
    }

    if (step.type === 'mergeGroupMerge') {
        const returnedTags = filterTagsForReturn(step.groupKey, step.parsedTags, tagFilter);

        return mergeMergeGroup(tags, step.groupKey, returnedTags, expanded);
    }

    if (step.type === 'mergeXmpGroupAssign') {
        const returnedTags = filterTagsForReturn('xmp', step.parsedTags, tagFilter);

        if (expanded) {
            tags.xmp = returnedTags;
            return tags;
        }

        const returnedTagsForFlat = objectAssign({}, returnedTags);
        delete returnedTagsForFlat._raw;

        return objectAssign({}, tags, returnedTagsForFlat);
    }

    if (step.type === 'mergeIccDeferred') {
        const resolvedReadTags = deferredResults[step.deferredKey];
        const parsedIccTags = filterTagsForParse('icc', resolvedReadTags, tagFilter);
        parsedGroups.icc = parsedIccTags;

        if (!tagFilter.shouldReturnGroup('icc')) {
            return tags;
        }

        const returnedIccTags = filterTagsForReturn('icc', parsedIccTags, tagFilter);

        return mergeAssignGroup(tags, 'icc', returnedIccTags, expanded);
    }

    if (step.type === 'mergePngFile') {
        const returnedPngFileTags = filterTagsForReturn('png', step.parsedTags, tagFilter);

        if (!tagFilter.shouldReturnGroup('png')) {
            return tags;
        }

        if (expanded) {
            tags.png = !tags.png ? returnedPngFileTags : objectAssign(
                {},
                tags.png,
                returnedPngFileTags
            );
            tags.pngFile = returnedPngFileTags;

            return tags;
        }

        return objectAssign({}, tags, returnedPngFileTags);
    }

    if (step.type === 'mergePngChunk') {
        const returnedPngChunkTags = filterTagsForReturn('png', step.parsedTags, tagFilter);

        if (!tagFilter.shouldReturnGroup('png')) {
            return tags;
        }

        if (expanded) {
            tags.png = !tags.png ? returnedPngChunkTags : objectAssign(
                {},
                tags.png,
                returnedPngChunkTags
            );

            return tags;
        }

        return objectAssign({}, tags, returnedPngChunkTags);
    }

    if (step.type === 'processPngTextReadTags') {
        return addPngTextReadTagsToTagsAndGroups({
            readTags: step.readTags,
            parsedGroups,
            expanded,
            tagFilter,
            tags,
        });
    }

    if (step.type === 'processPngTextReadTagsDeferredList') {
        const tagList = deferredResults[step.deferredKey] || [];

        for (let i = 0; i < tagList.length; i++) {
            tags = addPngTextReadTagsToTagsAndGroups({
                readTags: tagList[i],
                parsedGroups,
                expanded,
                tagFilter,
                tags,
            });
        }

        return tags;
    }

    if (step.type === 'gps') {
        if (
            expanded
            && tagFilter.shouldReturnGroup('gps')
            && parsedGroups.exif
        ) {
            const gpsGroup = getGpsGroupFromExifTags(parsedGroups.exif);
            if (gpsGroup) {
                const returnedGpsGroup = filterTagsForReturn('gps', gpsGroup, tagFilter);
                tags.gps = returnedGpsGroup;
            }
        }

        return tags;
    }

    if (step.type === 'composite') {
        if (!tagFilter.shouldReturnGroup('composite')) {
            return tags;
        }

        let compositeInput = tags;
        let compositeInputExpanded = expanded;
        if (tagFilter.isActive) {
            compositeInput = {exif: parsedGroups.exif, file: parsedGroups.file};
            compositeInputExpanded = true;
        }

        const composite = Composite.get(compositeInput, compositeInputExpanded);
        if (!composite) {
            return tags;
        }

        const returnedCompositeTags =
            filterTagsForReturn('composite', composite, tagFilter);

        return mergeAssignGroup(tags, 'composite', returnedCompositeTags, expanded);
    }

    if (step.type === 'thumbnail') {
        if (
            !tagFilter.shouldReturnGroup('thumbnail')
            || !tagFilter.shouldReturnTag('thumbnail', 'Thumbnail')
        ) {
            delete tags.Thumbnail;

            return tags;
        }

        if (!thumbnailIfdTags) {
            return tags;
        }

        const parsedThumbnailIfdTags = thumbnailIfdTags ? filterTagsForParse(
            'thumbnail',
            thumbnailIfdTags,
            tagFilter
        ) : undefined;
        if (parsedThumbnailIfdTags) {
            parsedGroups.thumbnail = parsedThumbnailIfdTags;
        }

        const thumbnail = (Constants.USE_JPEG || Constants.USE_WEBP)
            && Constants.USE_EXIF
            && Constants.USE_THUMBNAIL
            && Thumbnail.get(dataView, parsedThumbnailIfdTags, tiffHeaderOffset);
        if (thumbnail) {
            tags.Thumbnail = thumbnail;
        } else {
            delete tags.Thumbnail;
        }

        return tags;
    }

    if (step.type === 'fileType') {
        if (
            fileType
            && tagFilter.shouldReturnGroup('file')
            && tagFilter.shouldReturnTag('file', 'FileType')
        ) {
            if (expanded) {
                if (!tags.file) {
                    tags.file = {};
                }
                tags.file.FileType = fileType;
            } else {
                tags.FileType = fileType;
            }
        }

        return tags;
    }

    return tags;
}

function mergeAssignGroup(tags, groupKey, returnedTags, expanded) {
    if (expanded) {
        tags[groupKey] = returnedTags;

        return tags;
    }

    return objectAssign({}, tags, returnedTags);
}

function mergeMergeGroup(tags, groupKey, returnedTags, expanded) {
    if (expanded) {
        if (!tags[groupKey]) {
            tags[groupKey] = returnedTags;
        } else {
            tags[groupKey] = objectAssign({}, tags[groupKey], returnedTags);
        }

        return tags;
    }

    return objectAssign({}, tags, returnedTags);
}

function addPngTextReadTagsToTagsAndGroups({readTags, parsedGroups, expanded, tagFilter, tags}) {
    const embeddedExifTags = readTags.__exif;
    const embeddedIptcTags = readTags.__iptc;
    delete readTags.__exif;
    delete readTags.__iptc;

    if (embeddedExifTags) {
        const parsedEmbeddedExifTags =
            filterTagsForParse('exif', embeddedExifTags, tagFilter);
        parsedGroups.exif = !parsedGroups.exif ? parsedEmbeddedExifTags : objectAssign(
            {},
            parsedGroups.exif,
            parsedEmbeddedExifTags
        );

        if (tagFilter.shouldReturnGroup('exif')) {
            const returnedEmbeddedExifTags = filterTagsForReturn(
                'exif',
                parsedEmbeddedExifTags,
                tagFilter
            );
            if (expanded) {
                tags.exif = !tags.exif ? returnedEmbeddedExifTags : objectAssign(
                    {},
                    tags.exif,
                    returnedEmbeddedExifTags
                );
            } else {
                tags = objectAssign({}, tags, returnedEmbeddedExifTags);
            }
        }
    }

    if (embeddedIptcTags) {
        const parsedEmbeddedIptcTags =
            filterTagsForParse('iptc', embeddedIptcTags, tagFilter);
        parsedGroups.iptc = !parsedGroups.iptc ? parsedEmbeddedIptcTags : objectAssign(
            {},
            parsedGroups.iptc,
            parsedEmbeddedIptcTags
        );

        if (tagFilter.shouldReturnGroup('iptc')) {
            const returnedEmbeddedIptcTags = filterTagsForReturn(
                'iptc',
                parsedEmbeddedIptcTags,
                tagFilter
            );
            if (expanded) {
                tags.iptc = !tags.iptc ? returnedEmbeddedIptcTags : objectAssign(
                    {},
                    tags.iptc,
                    returnedEmbeddedIptcTags
                );
            } else {
                tags = objectAssign({}, tags, returnedEmbeddedIptcTags);
            }
        }
    }

    if (tagFilter.shouldReturnGroup('png')) {
        const parsedPngTextTags = filterTagsForParse('png', readTags, tagFilter);
        const returnedPngTextTags =
            filterTagsForReturn('png', parsedPngTextTags, tagFilter);
        parsedGroups.pngText = parsedPngTextTags;

        if (expanded) {
            tags.png = !tags.png ? returnedPngTextTags : objectAssign(
                {},
                tags.png,
                returnedPngTextTags
            );
            // Historical behavior in build fixtures:
            // - if PNG text chunks yield actual "png" tags, `pngText` should contain only those
            // - otherwise (e.g. only embedded Exif/IPTC), `pngText` should represent the full `png` group
            //   and will be filled in later as a fallback from `tags.png`
            if (returnedPngTextTags && Object.keys(returnedPngTextTags).length > 0) {
                tags.pngText = !tags.pngText ? returnedPngTextTags : objectAssign(
                    {},
                    tags.pngText,
                    returnedPngTextTags
                );
            }
        } else {
            tags = objectAssign({}, tags, returnedPngTextTags);
        }
    }

    return tags;
}

function isThenable(value) {
    return !!value && typeof value.then === 'function';
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
}) {
    return !!fileType
        || (
            Constants.USE_JPEG
            && Constants.USE_FILE
            && hasFileData(fileDataOffset)
        )
        || (
            Constants.USE_JPEG
            && Constants.USE_JFIF
            && hasJfifData(jfifDataOffset)
        )
        || (
            Constants.USE_EXIF
            && hasExifData(tiffHeaderOffset)
        )
        || (
            Constants.USE_JPEG
            && Constants.USE_IPTC
            && hasIptcData(iptcDataOffset)
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
            && hasMpfData(mpfDataOffset)
        )
        || (
            Constants.USE_PNG
            && Constants.USE_PNG_FILE
            && hasPngFileData(pngHeaderOffset)
        )
        || (
            Constants.USE_PNG
            && hasPngTextData(pngTextChunks)
        )
        || (
            Constants.USE_PNG
            && hasPngData(pngChunkOffsets)
        )
        || (
            Constants.USE_WEBP
            && hasVp8xData(vp8xChunkOffset)
        )
        || (
            Constants.USE_GIF
            && hasGifFileData(gifHeaderOffset)
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

function hasFileData(fileDataOffset) {
    return fileDataOffset !== undefined;
}

function hasJfifData(jfifDataOffset) {
    return jfifDataOffset !== undefined;
}

function hasExifData(tiffHeaderOffset) {
    return tiffHeaderOffset !== undefined;
}

function hasIptcData(iptcDataOffset) {
    return iptcDataOffset !== undefined;
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

function hasMpfData(mpfDataOffset) {
    return mpfDataOffset !== undefined;
}

function hasPngFileData(pngFileDataOffset) {
    return pngFileDataOffset !== undefined;
}

function hasPngTextData(pngTextChunks) {
    return Array.isArray(pngTextChunks) && pngTextChunks.length > 0;
}

function hasPngData(pngChunkOffsets) {
    return pngChunkOffsets !== undefined;
}

function hasVp8xData(vp8xChunkOffset) {
    return vp8xChunkOffset !== undefined;
}

function hasGifFileData(gifHeaderOffset) {
    return gifHeaderOffset !== undefined;
}
