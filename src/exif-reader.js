/**
 * ExifReader
 * http://github.com/mattiasw/exifreader
 * Copyright (C) 2011-2026  Mattias Wallander <mattias@wallander.eu>
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {objectAssign, decompress, withDecompressBudget, getCompressionMethod, getDataView, getDataViewFromBytes, getByteString, getStringValueFromArray, assertPromiseSupport, setProperty, isThenable, MAX_METADATA_BLOCKS} from './utils.js';
import {isFilePathOrURL, isBrowserFileObject, loadFile, loadFileObject} from './file-loaders.js';
import {makeLoadAuto, validateAutoOptions} from './load-auto.js';
import Constants from './constants.js';
import {getCalculatedGpsValue} from './tag-names-utils.js';
import ByteOrder from './byte-order.js';
import {getTiffHeaderOffset} from './image-header-iso-bmff.js';
import ImageHeader from './image-header.js';
import {TYPE_ZTXT} from './image-header-png.js';
import Tags from './tags.js';
import TagNames0thIfd from './tag-names-0th-ifd.js';
import TagNamesExifIfd from './tag-names-exif-ifd.js';
import TagNamesGpsIfd from './tag-names-gps-ifd.js';
import TagNamesInteroperabilityIfd from './tag-names-interoperability-ifd.js';
import {IFD_TYPE_0TH, IFD_TYPE_1ST, IFD_TYPE_EXIF, IFD_TYPE_GPS, IFD_TYPE_INTEROPERABILITY} from './ifd-types.js';
import {getValueBudget, addDecompressedValueAllowance, takeEmbeddedExifThumbnail} from './tags-helpers.js';
import MpfTags from './mpf-tags.js';
import FileTags from './file-tags.js';
import JxlFileTags from './jxl-file-tags.js';
import IsoBmffFileTags from './iso-bmff-file-tags.js';
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
import {buildTagsFromMergeBlocks, CARRIED_GROUP_SLOTS} from './loadview-pipeline.js';
import exifErrors from './errors.js';

// Brob XMP is bounded by the file size, as brob Exif is, plus room for one JPEG
// standard XMP segment so that a small file can still carry a typical packet.
const BROB_XMP_SIZE_PER_INPUT_SIZE = 4;
const BROB_XMP_SIZE_ALLOWANCE = 64 * 1024;
// An embedded thumbnail is sliced from a decoded or decompressed view that can be
// far larger than the file. A real JPEG thumbnail shrinks only a little when
// compressed, so bound the embedded thumbnails of a file by twice its size in
// total, plus room for a typical thumbnail.
const EMBEDDED_THUMBNAIL_SIZE_PER_INPUT_SIZE = 2;
const EMBEDDED_THUMBNAIL_SIZE_ALLOWANCE = 64 * 1024;
// The USE_EXIF gate is what lets a build without Exif drop the dictionaries.
const TAG_NAMES_0TH_AND_EXIF_IFDS = Constants.USE_EXIF ? objectAssign({}, TagNames0thIfd, TagNamesExifIfd) : {};

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
    if (isFilePathOrURL(data) || isBrowserFileObject(data)) {
        assertPromiseSupport();
        const loadFileFunction = isFilePathOrURL(data) ? loadFile : loadFileObject;
        const asyncOptions = objectAssign({}, options, {async: true});

        return loadFileFunction(data, asyncOptions).then((fileContents) => loadFromData(fileContents, asyncOptions));
    }
    return loadFromData(data, options);
}

function loadFromData(data, options) {
    return loadView(getDataViewFromBytes(data), options);
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
    dataView = getSelfContainedDataView(dataView);
    decompressConfig = withDecompressBudget(decompressConfig);

    const tagFilter = createTagFilter({includeTags, excludeTags});
    const parsedGroups = Object.create(null);
    const mergeBlocks = [];
    const deferredResults = Object.create(null);
    const deferredPromises = [];
    let pngTextIsAsync = false;
    let thumbnailIfdTags = undefined;
    let valueBudget = undefined;
    let decompressedApplicationNotesSize = 0;

    const {fileType, blocks: allBlocks, ranges, truncated} = ImageHeader.parseAppMarkers(dataView, expanded && includeOffsets);
    const blocks = async ? allBlocks : allBlocks.filter((block) => !isHiddenInSyncMode(block));

    const fileHasMetaData = hasPotentialMetaData({fileType, blocks});

    const fileBlock = getBlock(blocks, 'file');
    const jfifBlock = getBlock(blocks, 'jfif');
    const exifBlock = getBlock(blocks, 'exif');
    const iptcBlock = getBlock(blocks, 'iptc');
    const xmpBlock = getBlock(blocks, 'xmp');
    const iccBlock = getBlock(blocks, 'icc');
    const mpfBlock = getBlock(blocks, 'mpf');
    const pngFileBlock = getBlock(blocks, 'pngFile');
    const pngTextBlocks = getPngTextChunkBlocks(blocks);
    const pngChunkBlocks = getBlocks(blocks, 'pngChunk');
    const riffBlock = getBlock(blocks, 'riff');
    const gifBlock = getBlock(blocks, 'gif');
    const jxlFileBlock = getBlock(blocks, 'jxlFile');
    const isoBmffFileBlock = getBlock(blocks, 'isoBmffFile');
    const tiffHeaderOffset = exifBlock !== undefined ? exifBlock.tiffHeaderOffset : undefined;
    const exifDataView = exifBlock !== undefined ? exifBlock.dataView : undefined;

    if (
        Constants.USE_JPEG
        && Constants.USE_FILE
        && fileBlock !== undefined
        && tagFilter.shouldParseGroup('file')
        && shouldReadFileTagsForFileTypeOnlyOptimization(includeTags)
    ) {
        const readTags = FileTags.read(dataView, fileBlock.dataOffset);
        const parsedFileTags = filterTagsForParse('file', readTags, tagFilter);
        parsedGroups.file = parsedFileTags;

        if (tagFilter.shouldReturnGroup('file')) {
            mergeBlocks.push({slot: 'file', group: 'file', mode: 'assign', tags: parsedFileTags});
        }
    }

    if (
        Constants.USE_JPEG
        && Constants.USE_JFIF
        && jfifBlock !== undefined
        && tagFilter.shouldParseGroup('jfif')
    ) {
        const readTags = JfifTags.read(dataView, jfifBlock.dataOffset);
        const parsedJfifTags = filterTagsForParse('jfif', readTags, tagFilter);
        parsedGroups.jfif = parsedJfifTags;

        if (tagFilter.shouldReturnGroup('jfif')) {
            mergeBlocks.push({slot: 'jfif', group: 'jfif', mode: 'assign', tags: parsedJfifTags});
        }
    }

    if (
        Constants.USE_EXIF
        && tiffHeaderOffset !== undefined
        && tagFilter.shouldParseGroup('exif')
    ) {
        const {tags: readTags, byteOrder, valueBudget: exifValueBudget} = readExifTagsSafely(
            exifDataView || dataView,
            tiffHeaderOffset,
            includeUnknown,
            computed,
            tagFilter
        );
        valueBudget = exifValueBudget;
        if (readTags.Thumbnail) {
            thumbnailIfdTags = readTags.Thumbnail;
            delete readTags.Thumbnail;
        }

        const parsedExifTags = filterTagsForParse('exif', readTags, tagFilter);
        parsedGroups.exif = parsedExifTags;

        const carriedGroups = readExifCarriedGroups(
            parsedExifTags,
            exifDataView || dataView,
            tiffHeaderOffset,
            byteOrder,
            valueBudget,
            {decompressed: false, hasIptcBlock: iptcBlock !== undefined}
        );
        const carriedGroupKeys = Object.keys(CARRIED_GROUP_SLOTS);
        for (let i = 0; i < carriedGroupKeys.length; i++) {
            const groupKey = carriedGroupKeys[i];
            if (carriedGroups[groupKey] === undefined) {
                continue;
            }
            parsedGroups[groupKey] = carriedGroups[groupKey];
            if (tagFilter.shouldReturnGroup(groupKey)) {
                mergeBlocks.push({slot: CARRIED_GROUP_SLOTS[groupKey], group: groupKey, mode: 'assign', tags: carriedGroups[groupKey]});
            }
        }

        if (tagFilter.shouldReturnGroup('exif')) {
            mergeBlocks.push({slot: 'exif', group: 'exif', mode: 'assign', tags: parsedExifTags});
        }
    }

    if (valueBudget === undefined && dataView !== undefined) {
        valueBudget = getValueBudget(dataView);
    }

    if (
        Constants.USE_JPEG
        && Constants.USE_IPTC
        && iptcBlock !== undefined
        && tagFilter.shouldParseGroup('iptc')
    ) {
        const readTags = IptcTags.read(dataView, iptcBlock.dataOffset, includeUnknown, tagFilter, valueBudget);
        const parsedIptcTags = filterTagsForParse('iptc', readTags, tagFilter);
        parsedGroups.iptc = parsedIptcTags;

        if (tagFilter.shouldReturnGroup('iptc')) {
            mergeBlocks.push({slot: 'iptc', group: 'iptc', mode: 'assign', tags: parsedIptcTags});
        }
    }

    if (
        Constants.USE_XMP
        && hasXmpData(xmpBlock)
        && tagFilter.shouldParseGroup('xmp')
    ) {
        const readTags = XmpTags.read(xmpBlock.dataView || dataView, xmpBlock.chunks, domParser);
        const parsedXmpTags = filterTagsForParse('xmp', readTags, tagFilter);
        parsedGroups.xmp = parsedXmpTags;

        if (tagFilter.shouldReturnGroup('xmp')) {
            mergeBlocks.push({slot: 'xmp', group: 'xmp', mode: 'assign', tags: parsedXmpTags});
        }
    }

    const readEmbeddedExifThumbnail = getEmbeddedExifThumbnailReader(tagFilter, dataView);

    if (
        Constants.USE_JXL
        && Constants.USE_EXIF
        && exifBlock !== undefined
        && exifBlock.compression === 'brotli'
        && tagFilter.shouldParseGroup('exif')
        && async
    ) {
        const compressedExifData = getBrobDataView(dataView, exifBlock);
        deferredPromises.push(
            decompress(compressedExifData, getCompressionMethod(exifBlock.compression), undefined, 'dataview', decompressConfig)
                .then((decompressedDataView) => {
                    const brobTiffHeaderOffset = getTiffHeaderOffset(decompressedDataView, 0);
                    addDecompressedValueAllowance(valueBudget, decompressedDataView.byteLength);
                    const {tags: readTags, byteOrder: brobByteOrder} = readExifTags(
                        decompressedDataView,
                        brobTiffHeaderOffset,
                        includeUnknown,
                        computed,
                        tagFilter,
                        valueBudget
                    );
                    const thumbnail = takeEmbeddedExifThumbnail(
                        readTags,
                        decompressedDataView,
                        brobTiffHeaderOffset,
                        readEmbeddedExifThumbnail
                    );
                    const carriedGroups = readEmbeddedExifCarriedGroups(
                        decompressedDataView,
                        readTags,
                        brobTiffHeaderOffset,
                        brobByteOrder,
                        valueBudget,
                        {decompressed: true, hasIptcBlock: false}
                    );
                    deferredResults.brobExif = {exifTags: readTags, carriedGroups, thumbnail};
                })
                .catch(() => {
                    deferredResults.brobExif = undefined;
                })
        );
        mergeBlocks.push({slot: 'brobExif', group: 'exif', mode: 'embeddedExif', deferredKey: 'brobExif'});
    }

    if (
        Constants.USE_JXL
        && Constants.USE_XMP
        && xmpBlock !== undefined
        && xmpBlock.compression === 'brotli'
        && tagFilter.shouldParseGroup('xmp')
        && async
    ) {
        const compressedXmpData = getBrobDataView(dataView, xmpBlock);
        deferredPromises.push(
            decompress(compressedXmpData, getCompressionMethod(xmpBlock.compression), undefined, 'dataview', decompressConfig)
                .then((decompressedDataView) => {
                    if (exceedsBrobXmpSizeBound(decompressedDataView.byteLength, dataView)) {
                        deferredResults.brobXmp = {};
                        return;
                    }
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
        mergeBlocks.push({slot: 'brobXmp', group: 'xmp', mode: 'brobXmp', deferredKey: 'brobXmp'});
    }

    if (
        Constants.USE_ICC
        && hasIccData(iccBlock)
        && tagFilter.shouldParseGroup('icc')
    ) {
        const readTags = IccTags.read(dataView, iccBlock.chunks, async, decompressConfig);
        if (isThenable(readTags)) {
            if (!async) {
                throw new Error('Promise is required when async mode is enabled.');
            }

            deferredPromises.push(readTags.then((resolvedTags) => {
                deferredResults.iccApp = resolvedTags;
            }));
            mergeBlocks.push({slot: 'icc', group: 'icc', mode: 'assign', deferredKey: 'iccApp'});
        } else {
            const parsedIccTags = filterTagsForParse('icc', readTags, tagFilter);
            parsedGroups.icc = parsedIccTags;
            if (tagFilter.shouldReturnGroup('icc')) {
                mergeBlocks.push({slot: 'icc', group: 'icc', mode: 'assign', tags: parsedIccTags});
            }
        }
    }

    if (
        Constants.USE_MPF
        && mpfBlock !== undefined
        && tagFilter.shouldParseGroup('mpf')
    ) {
        const readMpfTags = MpfTags.read(
            dataView,
            mpfBlock.dataOffset,
            includeUnknown,
            computed,
            tagFilter,
            valueBudget
        );
        const parsedMpfTags = filterTagsForParse('mpf', readMpfTags, tagFilter);
        parsedGroups.mpf = parsedMpfTags;

        if (tagFilter.shouldReturnGroup('mpf')) {
            mergeBlocks.push({slot: 'mpf', group: 'mpf', mode: 'assign', tags: parsedMpfTags});
        }
    }

    if (
        Constants.USE_PNG
        && Constants.USE_PNG_FILE
        && pngFileBlock !== undefined
        && tagFilter.shouldParseGroup('png')
    ) {
        const readTags = PngFileTags.read(dataView, pngFileBlock.dataOffset);
        const parsedPngFileTags = filterTagsForParse('png', readTags, tagFilter);
        parsedGroups.pngFile = parsedPngFileTags;

        if (tagFilter.shouldReturnGroup('png')) {
            mergeBlocks.push({slot: 'pngFile', group: 'png', mode: 'pngFile', tags: parsedPngFileTags});
        }
    }

    if (
        Constants.USE_PNG
        && hasPngTextData(pngTextBlocks)
        && (
            tagFilter.shouldParseGroup('png')
            || tagFilter.shouldParseGroup('exif')
            || tagFilter.shouldParseGroup('iptc')
        )
    ) {
        const {readTags, embeddedExifTags, embeddedIptcTags, embeddedExifThumbnail, exifCarriedGroups, readTagsPromise} = PngTextTags.read(
            dataView,
            pngTextBlocks,
            async,
            includeUnknown,
            computed,
            tagFilter,
            decompressConfig,
            valueBudget,
            readEmbeddedExifThumbnail,
            readEmbeddedExifCarriedGroups,
            {
                exif: Constants.USE_EXIF ? readExifTags : undefined,
                iptc: Constants.USE_IPTC ? IptcTags.read : undefined,
            }
        );
        pngTextIsAsync = !!readTagsPromise;

        mergeBlocks.push({
            slot: 'pngText',
            group: 'png',
            mode: 'pngText',
            item: {readTags, embeddedExifTags, embeddedIptcTags, embeddedExifThumbnail, exifCarriedGroups},
        });

        if (readTagsPromise) {
            deferredPromises.push(readTagsPromise.then((tagList) => {
                deferredResults.pngTextTagList = tagList;
            }));
            mergeBlocks.push({slot: 'deferredPngText', group: 'png', mode: 'pngText', deferredKey: 'pngTextTagList'});
        }
    }

    if (
        Constants.USE_PNG
        && pngChunkBlocks.length > 0
        && tagFilter.shouldParseGroup('png')
    ) {
        const readTags = PngTags.read(dataView, pngChunkBlocks.map((block) => block.dataOffset));
        const parsedPngChunkTags = filterTagsForParse('png', readTags, tagFilter);
        parsedGroups.pngChunk = parsedPngChunkTags;

        if (tagFilter.shouldReturnGroup('png')) {
            mergeBlocks.push({slot: 'pngChunk', group: 'png', mode: 'merge', tags: parsedPngChunkTags});
        }
    }

    if (
        Constants.USE_WEBP
        && riffBlock !== undefined
        && tagFilter.shouldParseGroup('riff')
    ) {
        const readTags = Vp8xTags.read(dataView, riffBlock.dataOffset);
        const parsedRiffTags = filterTagsForParse('riff', readTags, tagFilter);
        parsedGroups.riff = parsedRiffTags;

        if (tagFilter.shouldReturnGroup('riff')) {
            mergeBlocks.push({slot: 'riff', group: 'riff', mode: 'merge', tags: parsedRiffTags});
        }
    }

    if (
        Constants.USE_GIF
        && gifBlock !== undefined
        && tagFilter.shouldParseGroup('gif')
    ) {
        const readTags = GifFileTags.read(dataView, gifBlock.dataOffset);
        const parsedGifTags = filterTagsForParse('gif', readTags, tagFilter);
        parsedGroups.gif = parsedGifTags;

        if (tagFilter.shouldReturnGroup('gif')) {
            mergeBlocks.push({slot: 'gif', group: 'gif', mode: 'merge', tags: parsedGifTags});
        }
    }

    if (
        Constants.USE_JXL
        && jxlFileBlock !== undefined
        && tagFilter.shouldParseGroup('file')
    ) {
        const readTags = JxlFileTags.read(dataView, jxlFileBlock.codestreamOffset);
        const parsedJxlFileTags = filterTagsForParse('file', readTags, tagFilter);
        parsedGroups.file = parsedJxlFileTags;

        if (tagFilter.shouldReturnGroup('file')) {
            mergeBlocks.push({slot: 'jxlFile', group: 'file', mode: 'assign', tags: parsedJxlFileTags});
        }
    }

    if (
        (Constants.USE_HEIC || Constants.USE_AVIF)
        && isoBmffFileBlock !== undefined
        && tagFilter.shouldParseGroup('file')
    ) {
        const readTags = IsoBmffFileTags.read(dataView, isoBmffFileBlock.imageDimensionsOffset, isoBmffFileBlock.pixelInformationOffset);
        const parsedIsoBmffFileTags = filterTagsForParse('file', readTags, tagFilter);
        parsedGroups.file = parsedIsoBmffFileTags;

        if (tagFilter.shouldReturnGroup('file')) {
            mergeBlocks.push({slot: 'isoBmffFile', group: 'file', mode: 'assign', tags: parsedIsoBmffFileTags});
        }
    }

    if (Constants.USE_EXIF) {
        mergeBlocks.push({slot: 'gps', mode: 'gps'});
    }
    if (Constants.USE_EXIF || Constants.USE_XMP) {
        mergeBlocks.push({slot: 'composite', mode: 'composite'});
    }
    mergeBlocks.push({slot: 'thumbnail', mode: 'thumbnail'});
    mergeBlocks.push({slot: 'fileType', mode: 'fileType'});

    if (expanded && includeOffsets) {
        mergeBlocks.push({
            slot: 'metadataRange',
            mode: 'metadataRange',
            metadataBlocks: getMetadataRangeBlocks(ranges, async),
            metadataTruncated: !!truncated,
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
        // A plain property here would keep the function alive for the bundler,
        // so a build without Exif would still carry getGpsGroupFromExifTags.
        getGpsGroupFromExifTags: Constants.USE_EXIF ? getGpsGroupFromExifTags : undefined,
        // A plain property here would keep the import alive for the bundler, so
        // a build with neither Exif nor XMP would still carry composite.js.
        Composite: (Constants.USE_EXIF || Constants.USE_XMP) ? Composite : undefined,
        // A plain property here would keep the import alive for the bundler, so
        // a build without Exif thumbnails would still carry thumbnail.js.
        Thumbnail: (Constants.USE_EXIF && Constants.USE_THUMBNAIL) ? Thumbnail : undefined,
    };

    if (async) {
        assertPromiseSupport();

        return Promise.all(deferredPromises).then(() => {
            const tags = buildTagsFromMergeBlocks({
                mergeBlocks,
                deferredResults,
                parsedGroups,
                expanded,
                tagFilter,
                dataView,
                tiffHeaderOffset,
                exifDataView,
                fileType,
                pngTextBlocks,
                pngTextIsAsync,
                thumbnailIfdTags,
                deps: pipelineDependencies,
            });

            return tags;
        });
    }

    return buildTagsFromMergeBlocks({
        mergeBlocks,
        deferredResults,
        parsedGroups,
        expanded,
        tagFilter,
        dataView,
        tiffHeaderOffset,
        exifDataView,
        fileType,
        pngTextBlocks,
        pngTextIsAsync,
        thumbnailIfdTags,
        deps: pipelineDependencies,
    });

    function shouldReadFileTagsForFileTypeOnlyOptimization(includeTagsOptions) {
        if (!includeTagsOptions) {
            return true;
        }
        const {composite, file} = includeTagsOptions;
        if (composite === true || (Array.isArray(composite) && composite.length > 0)) {
            return true;
        }
        return !(Array.isArray(file) && file.length === 1 && file[0] === 'FileType');
    }

    // Drops MakerNote.__offset once the maker note has been read, even when a
    // reader throws.
    function readExifCarriedGroups(parsedExifTags, exifTiffDataView, exifTiffHeaderOffset, exifByteOrder, exifValueBudget, source) {
        const groups = {};

        try {
            if (
                Constants.USE_IPTC
                && parsedExifTags['IPTC-NAA']
                && !source.hasIptcBlock
                && tagFilter.shouldParseGroup('iptc')
            ) {
                const readIptcTags = IptcTags.read(
                    parsedExifTags['IPTC-NAA'].value,
                    0,
                    includeUnknown,
                    tagFilter,
                    exifValueBudget
                );
                groups.iptc = filterTagsForParse('iptc', readIptcTags, tagFilter);
            }

            if (
                Constants.USE_XMP
                && parsedExifTags['ApplicationNotes']
                && isNumberArray(parsedExifTags['ApplicationNotes'].value)
                && !hasXmpData(xmpBlock)
                && tagFilter.shouldParseGroup('xmp')
                && (!source.decompressed || takeDecompressedApplicationNotesAllowance(parsedExifTags['ApplicationNotes'].value.length))
            ) {
                const readXmpTags = XmpTags.read(
                    getByteString(parsedExifTags['ApplicationNotes'].value),
                    undefined,
                    domParser
                );
                groups.xmp = filterTagsForParse('xmp', readXmpTags, tagFilter);
            }

            if (
                Constants.USE_PHOTOSHOP
                && parsedExifTags['ImageSourceData']
                && parsedExifTags['PhotoshopSettings']
                && Array.isArray(parsedExifTags['PhotoshopSettings'].value)
                && tagFilter.shouldParseGroup('photoshop')
            ) {
                const readPhotoshopTags = PhotoshopTags.read(
                    parsedExifTags['PhotoshopSettings'].value,
                    includeUnknown,
                    tagFilter
                );
                groups.photoshop = filterTagsForParse('photoshop', readPhotoshopTags, tagFilter);
            }

            if (
                Constants.USE_ICC
                && parsedExifTags['ICC_Profile']
                && !hasIccData(iccBlock)
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
                groups.icc = filterTagsForParse('icc', readIccTags, tagFilter);
            }

            if (
                Constants.USE_MAKER_NOTES
                && parsedExifTags['MakerNote']
                && tagFilter.shouldParseGroup('makerNotes')
            ) {
                if (hasCanonData(parsedExifTags)) {
                    groups.makerNotes = CanonTags.read(
                        exifTiffDataView,
                        exifTiffHeaderOffset,
                        parsedExifTags['MakerNote'].__offset,
                        exifByteOrder,
                        includeUnknown,
                        computed,
                        tagFilter,
                        exifValueBudget
                    );
                } else if (hasPentaxType1Data(parsedExifTags)) {
                    groups.makerNotes = PentaxTags.read(
                        exifTiffDataView,
                        exifTiffHeaderOffset,
                        parsedExifTags['MakerNote'].__offset,
                        includeUnknown,
                        computed,
                        tagFilter,
                        exifValueBudget
                    );
                }
            }
        } finally {
            if (parsedExifTags['MakerNote']) {
                delete parsedExifTags['MakerNote'].__offset;
            }
        }

        return groups;
    }

    // The brob XMP bound covers the decompressed Exif blocks of a file together,
    // so that several cannot each pass it.
    function takeDecompressedApplicationNotesAllowance(byteLength) {
        if (exceedsBrobXmpSizeBound(decompressedApplicationNotesSize + byteLength, dataView)) {
            return false;
        }
        decompressedApplicationNotesSize += byteLength;
        return true;
    }

    // A maker note that throws must drop the groups, not the Exif tags already read.
    function readEmbeddedExifCarriedGroups(exifTiffDataView, readTags, exifTiffHeaderOffset, exifByteOrder, exifValueBudget, source) {
        try {
            return readExifCarriedGroups(
                filterTagsForParse('exif', readTags, tagFilter),
                exifTiffDataView,
                exifTiffHeaderOffset,
                exifByteOrder,
                exifValueBudget,
                source
            );
        } catch (error) {
            return {};
        }
    }
}

// A caller-supplied DataView can be a window into a larger buffer. Extractors
// slice dataView.buffer, so copy the window out to keep them inside the image.
function getSelfContainedDataView(dataView) {
    if (isWindowIntoLargerBuffer(dataView)) {
        return getDataView(dataView.buffer.slice(dataView.byteOffset, dataView.byteOffset + dataView.byteLength));
    }
    return dataView;
}

function isWindowIntoLargerBuffer(dataView) {
    return isDataViewLike(dataView)
        && ((dataView.byteOffset > 0) || (dataView.byteLength < dataView.buffer.byteLength));
}

// A DataView from another realm, an iframe for example, fails instanceof, so
// match on the shape instead. A typed array has no getUint8, so it is not
// treated as a window here.
function isDataViewLike(dataView) {
    return !!dataView
        && (typeof dataView.getUint8 === 'function')
        && (typeof dataView.byteOffset === 'number')
        && (typeof dataView.byteLength === 'number')
        && !!dataView.buffer
        && (typeof dataView.buffer.slice === 'function');
}

function getBrobDataView(dataView, brobBlock) {
    // The box length is untrusted, so bound the view by the bytes present. The
    // JXL header parser never reports a dataOffset past the end of the view.
    const length = Math.max(0, Math.min(brobBlock.length, dataView.byteLength - brobBlock.dataOffset));
    return new DataView(dataView.buffer, dataView.byteOffset + brobBlock.dataOffset, length);
}

function exceedsBrobXmpSizeBound(byteLength, inputDataView) {
    return byteLength > BROB_XMP_SIZE_PER_INPUT_SIZE * inputDataView.byteLength + BROB_XMP_SIZE_ALLOWANCE;
}

function readExifTagsSafely(dataView, tiffHeaderOffset, includeUnknown, computed, tagFilter) {
    // Created outside the try so values decoded before a throw still count
    // against the budget that the maker note and MPF reads draw from. The data
    // view is only missing in unit tests that fake the tag readers.
    const valueBudget = dataView === undefined ? undefined : getValueBudget(dataView);
    try {
        const {tags, byteOrder} = readExifTags(dataView, tiffHeaderOffset, includeUnknown, computed, tagFilter, valueBudget);
        return {tags, byteOrder, valueBudget};
    } catch (error) {
        // A malformed TIFF header (an out-of-bounds offset or an invalid byte
        // order marker, e.g. from a HEIC/AVIF iloc that does not point at real
        // Exif) must not abort the whole parse. Skip Exif instead, but keep the
        // same {tags, byteOrder, valueBudget} shape so callers can destructure
        // safely.
        return {tags: {}, byteOrder: ByteOrder.BIG_ENDIAN, valueBudget};
    }
}

function readExifTags(dataView, tiffHeaderOffset, includeUnknown, computed, tagFilter, valueBudget) {
    return Tags.read(
        dataView,
        tiffHeaderOffset,
        includeUnknown,
        computed,
        tagFilter,
        valueBudget,
        getExifTagNames(),
        shouldReadThumbnailIfd(tagFilter)
    );
}

// Only the IFDs Tags.read walks; the MPF and maker note readers carry their own
// dictionaries. The thumbnail one must be there whenever shouldReadThumbnailIfd
// is true, since reading an IFD without its dictionary throws.
function getExifTagNames() {
    // Assigned rather than computed keys, which Babel compiles to a helper call each.
    const tagNames = {};
    tagNames[IFD_TYPE_0TH] = TAG_NAMES_0TH_AND_EXIF_IFDS;
    tagNames[IFD_TYPE_EXIF] = TAG_NAMES_0TH_AND_EXIF_IFDS;
    tagNames[IFD_TYPE_GPS] = TagNamesGpsIfd;
    tagNames[IFD_TYPE_INTEROPERABILITY] = TagNamesInteroperabilityIfd;
    if (Constants.USE_THUMBNAIL) {
        tagNames[IFD_TYPE_1ST] = TagNames0thIfd;
    }
    return tagNames;
}

function shouldReadThumbnailIfd(tagFilter) {
    return Constants.USE_THUMBNAIL && tagFilter.shouldParseGroup('thumbnail');
}

// Finders report every kind they find; list only the kinds this build parses,
// and in sync mode only the blocks it reads (isHiddenInSyncMode).
function getMetadataRangeBlocks(ranges, async) {
    const entries = ranges || [];
    const isCapped = entries.length >= MAX_METADATA_BLOCKS;
    const lastIndex = entries.length - 1;
    const metadataBlocks = [];
    for (let i = 0; i < entries.length; i++) {
        const {block, start, end} = entries[i];
        // At the cap the last entry was widened over every later block, so it
        // stays whatever its own block is, hidden in sync mode or not parsed.
        const isWidenedLast = isCapped && i === lastIndex;
        if (isWidenedLast || ((async || !isHiddenInSyncMode(block)) && isParsedRangeType(block))) {
            metadataBlocks.push({type: getRangeType(block), start, end});
        }
    }
    return metadataBlocks;
}

// The range types predate the block kinds and stay as they are.
function getRangeType(block) {
    if (isPngTextChunkBlock(block) || block.kind === 'pngChunk') {
        return 'png';
    }
    if (block.kind === 'pngFile') {
        return 'file';
    }
    return block.kind;
}

function isParsedRangeType(block) {
    if (isPngTextChunkBlock(block)) {
        return true;
    }
    switch (block.kind) {
        case 'file':
            return Constants.USE_FILE;
        case 'pngFile':
            return Constants.USE_PNG_FILE;
        case 'exif':
            return Constants.USE_EXIF;
        case 'jfif':
            return Constants.USE_JFIF;
        case 'xmp':
            return Constants.USE_XMP;
        case 'iptc':
            return Constants.USE_IPTC;
        case 'icc':
            return Constants.USE_ICC;
        case 'mpf':
            return Constants.USE_MPF;
        default:
            return true;
    }
}

function getEmbeddedExifThumbnailReader(tagFilter, inputDataView) {
    if (
        !Constants.USE_EXIF
        || !Constants.USE_THUMBNAIL
        || !tagFilter.shouldReturnTag('thumbnail', 'Thumbnail')
    ) {
        return undefined;
    }
    let copiedThumbnailSize = 0;
    return (dataView, thumbnailIfdTags, tiffHeaderOffset) => {
        const parsedThumbnailIfdTags = filterTagsForParse('thumbnail', thumbnailIfdTags, tagFilter);
        const lengthTag = parsedThumbnailIfdTags.JPEGInterchangeFormatLength;
        const sizeBound =
            EMBEDDED_THUMBNAIL_SIZE_PER_INPUT_SIZE * inputDataView.byteLength + EMBEDDED_THUMBNAIL_SIZE_ALLOWANCE;
        if (!hasLengthWithin(lengthTag, sizeBound - copiedThumbnailSize)) {
            return parsedThumbnailIfdTags;
        }
        const thumbnail = Thumbnail.get(dataView, parsedThumbnailIfdTags, tiffHeaderOffset);
        if (thumbnail.image) {
            copiedThumbnailSize += lengthTag.value;
        }
        return thumbnail;
    };
}

function hasLengthWithin(lengthTag, maxLength) {
    return !!lengthTag
        && typeof lengthTag.value === 'number'
        && lengthTag.value <= maxLength;
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
            setProperty(filteredTags, tagName, tagValue);
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

function hasPotentialMetaData({fileType, blocks}) {
    return !!fileType || blocks.some(isPotentialMetadataBlock);
}

// The same gates as the read branches above, keyed by block kind.
function isPotentialMetadataBlock(block) {
    if (isPngTextChunkBlock(block)) {
        return Constants.USE_PNG;
    }
    switch (block.kind) {
        case 'file':
            return Constants.USE_JPEG && Constants.USE_FILE;
        case 'jfif':
            return Constants.USE_JPEG && Constants.USE_JFIF;
        case 'exif':
            return Constants.USE_EXIF && block.tiffHeaderOffset !== undefined;
        case 'iptc':
            return Constants.USE_JPEG && Constants.USE_IPTC;
        case 'xmp':
            return Constants.USE_XMP && hasXmpData(block);
        case 'icc':
            return Constants.USE_ICC && hasIccData(block);
        case 'mpf':
            return Constants.USE_MPF;
        case 'pngFile':
            return Constants.USE_PNG && Constants.USE_PNG_FILE;
        case 'pngChunk':
            return Constants.USE_PNG;
        case 'riff':
            return Constants.USE_WEBP;
        case 'gif':
            return Constants.USE_GIF;
        case 'jxlFile':
            return Constants.USE_JXL;
        case 'isoBmffFile':
            return Constants.USE_HEIC || Constants.USE_AVIF;
        default:
            return false;
    }
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

// ASCII values hold strings and holes, values of two or more rationals hold
// number pairs: neither converts to the character codes of an XMP packet.
function isNumberArray(value) {
    return Array.isArray(value) && typeof value[0] === 'number';
}

// A brob block carries compressed XMP, not chunks.
function hasXmpData(xmpBlock) {
    return xmpBlock !== undefined && xmpBlock.compression === undefined && xmpBlock.chunks.length > 0;
}

function hasIccData(iccBlock) {
    return iccBlock !== undefined && iccBlock.chunks.length > 0;
}

function hasCanonData(tags) {
    return tags['Make'] && tags['Make'].value && Array.isArray(tags['Make'].value) && tags['Make'].value[0] === 'Canon'
        && tags['MakerNote'] && tags['MakerNote'].__offset;
}

function hasPentaxType1Data(tags) {
    const PENTAX_ID_STRING = 'PENTAX ';
    return Array.isArray(tags['MakerNote'].value)
        && tags['MakerNote'].value.length > PENTAX_ID_STRING.length
        && getStringValueFromArray(tags['MakerNote'].value.slice(0, PENTAX_ID_STRING.length)) === PENTAX_ID_STRING
        && tags['MakerNote'].__offset;
}

function hasPngTextData(pngTextBlocks) {
    return Array.isArray(pngTextBlocks) && pngTextBlocks.length > 0;
}

/**
 * The first block of a kind that is not a PNG text chunk, or undefined. After
 * a finder's duplicate policy there is at most one such block per kind.
 * @param {Array<Object>} blocks
 * @param {string} kind
 * @returns {Object|undefined}
 */
function getBlock(blocks, kind) {
    for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].kind === kind && !isPngTextChunkBlock(blocks[i])) {
            return blocks[i];
        }
    }
    return undefined;
}

/**
 * Every block of a kind that is not a PNG text chunk, in file order.
 * @param {Array<Object>} blocks
 * @param {string} kind
 * @returns {Array<Object>}
 */
function getBlocks(blocks, kind) {
    return blocks.filter((block) => block.kind === kind && !isPngTextChunkBlock(block));
}

/**
 * Every PNG text-chunk block (kind exif, iptc or pngText with `text`), in file order.
 * @param {Array<Object>} blocks
 * @returns {Array<Object>}
 */
function getPngTextChunkBlocks(blocks) {
    return blocks.filter(isPngTextChunkBlock);
}

function isPngTextChunkBlock(block) {
    return block.text !== undefined;
}

// Decision 2026-10-21: sync mode keeps leaving PNG compressed-text chunks
// (TYPE_ZTXT, whatever their header says) and the iCCP chunk out of
// metadataRange, the potential-metadata check and the readers, as the PNG
// finder did while it took the async flag; the iCCP block is always
// compressed. A compressed iTXt and a brob box stay listed, and unread, in
// sync mode, as before. The USE_PNG gate keeps the PNG finder's constant out
// of a build without PNG.
function isHiddenInSyncMode(block) {
    return (Constants.USE_PNG && isPngTextChunkBlock(block) && block.text.chunkType === TYPE_ZTXT)
        || (block.kind === 'icc' && block.compression !== undefined);
}
