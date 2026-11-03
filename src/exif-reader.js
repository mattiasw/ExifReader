/**
 * ExifReader
 * http://github.com/mattiasw/exifreader
 * Copyright (C) 2011-2026  Mattias Wallander <mattias@wallander.eu>
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {objectAssign, withDecompressBudget, getCompressionMethod, getDataView, getDataViewFromBytes, getByteString, getStringValueFromArray, assertPromiseSupport, isThenable, MAX_METADATA_BLOCKS} from './utils.js';
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
import {addDecompressedValueAllowance, addDecompressedIptcAllowance} from './tags-helpers.js';
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
import PngTextTags, {hasRawIptcProfile} from './png-text-tags.js';
import PngTags from './png-tags.js';
import Vp8xTags from './vp8x-tags.js';
import GifFileTags from './gif-file-tags.js';
import Thumbnail from './thumbnail.js';
import Composite from './composite.js';
import {createTagFilter, filterTagsForParse, filterTagsForReturn} from './tag-filter.js';
import {getBase64Image} from './base64-image.js';
import DOMParser from './dom-parser.js';
import {buildTagsFromMergeBlocks} from './loadview-pipeline.js';
import {run, createContext, validateComposition} from './engine.js';
import exifErrors from './errors.js';

// The USE_EXIF gate is what lets a build without Exif drop the dictionaries.
const TAG_NAMES_0TH_AND_EXIF_IFDS = Constants.USE_EXIF ? objectAssign({}, TagNames0thIfd, TagNamesExifIfd) : {};

export default {
    load,
    loadView,
    errors: exifErrors,
};

validateComposition(getDefaultComposition());

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

export function loadView(dataView, options = {}) {
    const {
        expanded = false,
        async = false,
        computed = false,
        includeUnknown = false,
        includeOffsets = false,
        domParser = undefined,
        includeTags = undefined,
        excludeTags = undefined,
        decompress: decompressConfig = undefined
    } = options;
    dataView = getSelfContainedDataView(dataView);

    const {fileType, blocks: allBlocks, ranges, truncated} = ImageHeader.parseAppMarkers(dataView, expanded && includeOffsets);
    if (async) {
        assertPromiseSupport();
    }
    const blocks = async ? allBlocks : allBlocks.filter((block) => !isHiddenInSyncMode(block));

    const tagFilter = createTagFilter({includeTags, excludeTags});
    const context = createContext({
        dataView,
        options: {expanded, async, computed, includeUnknown, includeOffsets, domParser, includeTags, excludeTags},
        tagFilter,
        decompressConfig: withDecompressBudget(decompressConfig),
        getBase64Image,
        getDomParser: DOMParser.get,
    });
    // The pipeline copies png into pngText only when png is returned, so the
    // filter needs no check here.
    const pngTextBlocks = blocks.filter(isPngTextChunkBlock);
    const pngTextIsAsync = async && Constants.USE_PNG && pngTextBlocks.some(isNamedCompressedPngTextChunk);

    const result = run(getDefaultComposition(), blocks, context);

    return async ? result.then(finish) : finish(result);

    function finish({mergeBlocks}) {
        return buildTagsFromMergeBlocks({
            mergeBlocks: combineUncompressedPngTextBlocks(mergeBlocks).concat(getDerivedBlocks({expanded, includeOffsets, async, ranges, truncated})),
            parsedGroups: Object.create(null),
            expanded,
            tagFilter,
            dataView,
            fileType,
            pngTextBlocks,
            pngTextIsAsync,
            deps: {
                objectAssign,
                hasPngTextData,
                filterTagsForReturn,
                // A plain property here would keep the function alive for the bundler,
                // so a build without Exif would still carry getGpsGroupFromExifTags.
                getGpsGroupFromExifTags: Constants.USE_EXIF ? getGpsGroupFromExifTags : undefined,
                // A plain property here would keep the import alive for the bundler, so
                // a build with neither Exif nor XMP would still carry composite.js.
                Composite: (Constants.USE_EXIF || Constants.USE_XMP) ? Composite : undefined,
            },
        });
    }
}

function isNamedCompressedPngTextChunk(block) {
    return block.compression !== undefined && block.text.name !== undefined;
}

// The groups in dispatch order, each inside its build gate so that a custom
// build folds the reader import away. Built per load, since the unit tests
// swap the Constants at runtime.
function getDefaultComposition() {
    return {
        groups: [
            Constants.USE_JPEG && Constants.USE_FILE ? {
                key: 'file',
                consumes: ['file'],
                emits: [],
                read: readFileBlock,
                merge: () => ({slot: 'file', mode: 'assign'}),
            } : undefined,
            Constants.USE_JPEG && Constants.USE_JFIF ? {
                key: 'jfif',
                consumes: ['jfif'],
                emits: [],
                read: (block, ctx) => parsedTags('jfif', JfifTags.read(ctx.dataView, block.dataOffset), ctx),
                merge: () => ({slot: 'jfif', mode: 'assign'}),
            } : undefined,
            Constants.USE_EXIF ? {
                key: 'exif',
                consumes: ['exif'],
                emits: ['iptc', 'xmp', 'photoshop', 'icc', 'makerNote', 'thumbnail'],
                read: readExifBlock,
                merge: getExifMergeDescriptor,
            } : undefined,
            Constants.USE_IPTC ? {
                key: 'iptc',
                consumes: ['iptc'],
                emits: [],
                read: readIptcBlock,
                merge: (block) => getEmbeddableMergeDescriptor(block, 'iptc', 'carriedIptc'),
            } : undefined,
            Constants.USE_XMP ? {
                key: 'xmp',
                consumes: ['xmp'],
                emits: [],
                read: readXmpBlock,
                merge: getXmpMergeDescriptor,
            } : undefined,
            Constants.USE_ICC ? {
                key: 'icc',
                consumes: ['icc'],
                emits: [],
                read: readIccBlock,
                merge: (block) => getEmbeddableMergeDescriptor(block, 'icc', 'carriedIcc'),
            } : undefined,
            Constants.USE_MPF ? {
                key: 'mpf',
                consumes: ['mpf'],
                emits: [],
                read: (block, ctx) => parsedTags('mpf', MpfTags.read(
                    ctx.dataView,
                    block.dataOffset,
                    ctx.options.includeUnknown,
                    ctx.options.computed,
                    ctx.tagFilter,
                    ctx.getValueBudget(),
                    ctx.getBase64Image
                ), ctx),
                merge: () => ({slot: 'mpf', mode: 'assign'}),
            } : undefined,
            Constants.USE_PNG && Constants.USE_PNG_FILE ? {
                key: 'png',
                consumes: ['pngFile'],
                emits: [],
                read: (block, ctx) => parsedTags('png', PngFileTags.read(ctx.dataView, block.dataOffset), ctx),
                merge: () => ({slot: 'pngFile', mode: 'pngFile'}),
            } : undefined,
            Constants.USE_PNG ? {
                key: 'png',
                consumes: ['pngText'],
                emits: ['exif', 'iptc'],
                read: (block, ctx) => PngTextTags.read(block, ctx),
                merge: (block) => ({slot: block.compression !== undefined ? 'deferredPngText' : 'pngText', mode: 'pngTextTags'}),
            } : undefined,
            Constants.USE_PNG ? {
                key: 'png',
                consumes: ['pngChunk'],
                emits: [],
                read: (block, ctx) => parsedTags('png', PngTags.read(ctx.dataView, [block.dataOffset]), ctx),
                merge: () => ({slot: 'pngChunk', mode: 'merge'}),
            } : undefined,
            Constants.USE_WEBP ? {
                key: 'riff',
                consumes: ['riff'],
                emits: [],
                read: (block, ctx) => parsedTags('riff', Vp8xTags.read(ctx.dataView, block.dataOffset), ctx),
                merge: () => ({slot: 'riff', mode: 'merge'}),
            } : undefined,
            Constants.USE_GIF ? {
                key: 'gif',
                consumes: ['gif'],
                emits: [],
                read: (block, ctx) => parsedTags('gif', GifFileTags.read(ctx.dataView, block.dataOffset), ctx),
                merge: () => ({slot: 'gif', mode: 'merge'}),
            } : undefined,
            Constants.USE_JXL ? {
                key: 'file',
                consumes: ['jxlFile'],
                emits: [],
                read: (block, ctx) => parsedTags('file', JxlFileTags.read(ctx.dataView, block.codestreamOffset), ctx),
                merge: () => ({slot: 'jxlFile', mode: 'assign'}),
            } : undefined,
            Constants.USE_HEIC || Constants.USE_AVIF ? {
                key: 'file',
                consumes: ['isoBmffFile'],
                emits: [],
                read: (block, ctx) => parsedTags('file', IsoBmffFileTags.read(ctx.dataView, block.imageDimensionsOffset, block.pixelInformationOffset), ctx),
                merge: () => ({slot: 'isoBmffFile', mode: 'assign'}),
            } : undefined,
            Constants.USE_PHOTOSHOP ? {
                key: 'photoshop',
                consumes: ['photoshop'],
                emits: [],
                read: (block, ctx) => parsedTags('photoshop', PhotoshopTags.read(block.value, ctx.options.includeUnknown, ctx.tagFilter), ctx),
                merge: (block) => getEmbeddableMergeDescriptor(block, 'photoshop', 'carriedPhotoshop'),
            } : undefined,
            Constants.USE_MAKER_NOTES ? {
                key: 'makerNotes',
                consumes: ['makerNote'],
                emits: [],
                read: readMakerNoteBlock,
                merge: (block) => getEmbeddableMergeDescriptor(block, 'makerNotes', 'carriedMakerNotes'),
            } : undefined,
            Constants.USE_EXIF && Constants.USE_THUMBNAIL ? {
                key: 'thumbnail',
                consumes: ['thumbnail'],
                emits: [],
                read: readThumbnailBlock,
                merge: (block) => ({slot: 'thumbnail', mode: 'thumbnailCandidate', rank: block.rank}),
            } : undefined,
        ].filter(Boolean),
        dispatchKind,
        rank,
        suppressions: [
            {kind: 'iptc', isSuppressed: isCarriedIptcSuppressed},
            {kind: 'xmp', isSuppressed: isCarriedXmpSuppressed},
            {kind: 'icc', isSuppressed: isCarriedIccSuppressed},
        ],
    };
}

function parsedTags(groupKey, readTags, ctx) {
    return {tags: filterTagsForParse(groupKey, readTags, ctx.tagFilter)};
}

function readFileBlock(block, ctx) {
    if (!shouldReadFileTagsForFileTypeOnlyOptimization(ctx.options.includeTags)) {
        return undefined;
    }
    return parsedTags('file', FileTags.read(ctx.dataView, block.dataOffset), ctx);
}

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

// A raw-profile text chunk keeps its exif or iptc kind, which the suppression
// rules key on, but dispatches with the other text chunks.
function dispatchKind(block) {
    return isPngTextChunkBlock(block) ? 'pngText' : block.kind;
}

// A brob Exif box ranks below an Exif box; a compressed raw-profile text chunk
// is not a brob, so it ranks with the eXIf chunk and the uncompressed profiles.
function rank(block) {
    return block.kind === 'exif' && block.compression !== undefined && !isPngTextChunkBlock(block) ? 0 : 1;
}

// The main block's IPTC-NAA gives way to an IPTC segment, a raw profile's to a
// raw IPTC chunk the text reader will read, compressed or not; a brob's never
// gives way. The USE_PNG gate keeps the text reader out of a build without PNG.
// The raw IPTC scan decodes text chunks, so its verdict is kept on the context:
// the finder blocks do not change within a load, and a PNG can hold thousands
// of raw profiles.
function isCarriedIptcSuppressed(block, finderBlocks, ctx) {
    if (block.carried === 'main') {
        return finderBlocks.some((finderBlock) => finderBlock.kind === 'iptc' && !isPngTextChunkBlock(finderBlock));
    }
    if (Constants.USE_PNG && block.carried === 'rawProfile') {
        if (ctx.hasRawIptcProfile === undefined) {
            ctx.hasRawIptcProfile = hasRawIptcProfile(finderBlocks, ctx.dataView);
        }
        return ctx.hasRawIptcProfile;
    }
    return false;
}

// A brob XMP box has no chunks, so it does not suppress.
function isCarriedXmpSuppressed(block, finderBlocks) {
    return block.carried !== undefined && finderBlocks.some((finderBlock) => finderBlock.kind === 'xmp' && hasXmpData(finderBlock));
}

function isCarriedIccSuppressed(block, finderBlocks) {
    return block.carried !== undefined && finderBlocks.some((finderBlock) => finderBlock.kind === 'icc' && hasIccData(finderBlock));
}

function getEmbeddableMergeDescriptor(block, slot, carriedSlot) {
    if (block.carried !== undefined) {
        return {slot: carriedSlot, mode: block.carried === 'main' ? 'assign' : 'merge'};
    }
    return {slot, mode: block.origin !== undefined ? 'merge' : 'assign'};
}

function getXmpMergeDescriptor(block) {
    if (block.compression !== undefined) {
        return {slot: 'brobXmp', mode: 'brobXmp'};
    }
    return getEmbeddableMergeDescriptor(block, 'xmp', 'carriedXmp');
}

function getExifMergeDescriptor(block) {
    if (block.compression !== undefined) {
        return {slot: 'exif', mode: 'merge', outerSlot: 'brobExif'};
    }
    return {slot: 'exif', mode: block.origin !== undefined ? 'merge' : 'assign'};
}

function getBlockDataView(block, ctx) {
    if (block.getDataView) {
        return block.getDataView();
    }
    return block.dataView || ctx.dataView;
}

// A brob Exif box decompresses through the pool; a decompression failure or a
// bad header rejects, which drops the block. A JXL Exif box too short for its
// header has no tiffHeaderOffset and reads nothing.
function readExifBlock(block, ctx) {
    if (block.compression !== undefined) {
        if (!Constants.USE_JXL) {
            return undefined;
        }
        return ctx.decompress(getBrobDataView(ctx.dataView, block), getCompressionMethod(block.compression), undefined, 'dataview')
            .then((view) => readExifView(view, getTiffHeaderOffset(view, 0), ctx, {carried: 'brob', decompressed: true}));
    }
    if (block.tiffHeaderOffset === undefined) {
        return undefined;
    }
    return readExifView(getBlockDataView(block, ctx), block.tiffHeaderOffset, ctx, {
        carried: block.origin || 'main',
        decompressed: block.decompressed === true,
    });
}

// The main block creates the value budget from its view; an embedded block
// draws from the shared one and, when decompressed, adds its allowance.
function readExifView(view, tiffHeaderOffset, ctx, {carried, decompressed}) {
    const isMain = carried === 'main';
    const valueBudget = isMain ? ctx.getValueBudget(view) : ctx.getValueBudget();
    if (decompressed) {
        addDecompressedValueAllowance(valueBudget, view.byteLength);
    }
    const read = isMain ? readExifTagsSafely : readExifTags;
    const {tags, byteOrder, makerNoteOffset} = read(view, tiffHeaderOffset, ctx, valueBudget);
    const thumbnailIfdTags = tags.Thumbnail;
    delete tags.Thumbnail;

    const parsed = filterTagsForParse('exif', tags, ctx.tagFilter);
    const blocks = getExifEmittedBlocks(parsed, {view, tiffHeaderOffset, byteOrder, makerNoteOffset, thumbnailIfdTags, carried, decompressed});
    if (carried === 'brob' && Object.keys(parsed).length === 0) {
        return {tags: undefined, blocks};
    }
    return {tags: parsed, blocks};
}

// In emission order; the engine drops a kind no composed group consumes.
function getExifEmittedBlocks(parsed, {view, tiffHeaderOffset, byteOrder, makerNoteOffset, thumbnailIfdTags, carried, decompressed}) {
    const blocks = [];

    if (parsed['IPTC-NAA']) {
        blocks.push({kind: 'iptc', dataView: parsed['IPTC-NAA'].value, dataOffset: 0, carried});
    }
    if (parsed['ApplicationNotes'] && isNumberArray(parsed['ApplicationNotes'].value)) {
        const applicationNotes = parsed['ApplicationNotes'].value;
        blocks.push({kind: 'xmp', carried, decompressed, byteLength: applicationNotes.length, getDataView: () => getByteString(applicationNotes)});
    }
    if (parsed['ImageSourceData'] && parsed['PhotoshopSettings'] && Array.isArray(parsed['PhotoshopSettings'].value)) {
        blocks.push({kind: 'photoshop', value: parsed['PhotoshopSettings'].value, carried});
    }
    if (parsed['ICC_Profile']) {
        const profile = parsed['ICC_Profile'].value;
        blocks.push({kind: 'icc', dataView: profile, chunks: [{offset: 0, length: profile.length, chunkNumber: 1, chunksTotal: 1}], carried});
    }
    if (parsed['MakerNote'] && makerNoteOffset !== undefined) {
        blocks.push({
            kind: 'makerNote',
            tiffView: view,
            tiffHeaderOffset,
            makerNoteOffset,
            byteOrder,
            make: parsed['Make'] && parsed['Make'].value,
            bytes: parsed['MakerNote'].value,
            carried,
        });
    }
    if (thumbnailIfdTags) {
        blocks.push({kind: 'thumbnail', dataView: view, tiffHeaderOffset, ifd1Tags: thumbnailIfdTags, decompressed, rank: carried === 'main' ? 'main' : 'embedded'});
    }

    return blocks;
}

// A carried IPTC-NAA draws no allowance; a decompressed raw profile does.
function readIptcBlock(block, ctx) {
    const view = getBlockDataView(block, ctx);
    const valueBudget = ctx.getValueBudget();
    if (block.origin === 'rawProfile' && block.decompressed) {
        addDecompressedIptcAllowance(valueBudget, view.byteLength);
    }
    return parsedTags('iptc', IptcTags.read(view, block.dataOffset, ctx.options.includeUnknown, ctx.tagFilter, valueBudget), ctx);
}

function readXmpBlock(block, ctx) {
    const {domParser} = ctx.options;
    if (block.compression !== undefined) {
        if (!Constants.USE_JXL) {
            return undefined;
        }
        return ctx.decompress(getBrobDataView(ctx.dataView, block), getCompressionMethod(block.compression), undefined, 'dataview')
            .then((view) => readBrobXmpView(view, ctx));
    }
    if (block.carried !== undefined) {
        if (block.decompressed && !ctx.takeDecompressedApplicationNotesAllowance(block.byteLength)) {
            return undefined;
        }
        return parsedTags('xmp', XmpTags.read(getBlockDataView(block, ctx), undefined, domParser, ctx.getDomParser), ctx);
    }
    if (!hasXmpData(block)) {
        return undefined;
    }
    return parsedTags('xmp', XmpTags.read(block.dataView || ctx.dataView, block.chunks, domParser, ctx.getDomParser), ctx);
}

function readBrobXmpView(view, ctx) {
    if (ctx.exceedsBrobXmpSizeBound(view.byteLength)) {
        return parsedTags('xmp', {}, ctx);
    }
    return parsedTags('xmp', XmpTags.read(view, [{dataOffset: 0, length: view.byteLength}], ctx.options.domParser, ctx.getDomParser), ctx);
}

// A compressed iCCP gives a thenable in async mode, which defers the block.
function readIccBlock(block, ctx) {
    if (!hasIccData(block)) {
        return undefined;
    }
    const readTags = IccTags.read(block.dataView || ctx.dataView, block.chunks, ctx.options.async, ctx.decompressConfig);
    if (isThenable(readTags)) {
        return readTags.then((resolvedTags) => parsedTags('icc', resolvedTags, ctx));
    }
    return parsedTags('icc', readTags, ctx);
}

// The maker note readers filter their own tags.
function readMakerNoteBlock(block, ctx) {
    const {includeUnknown, computed} = ctx.options;
    if (Array.isArray(block.make) && block.make[0] === 'Canon') {
        return {tags: CanonTags.read(block.tiffView, block.tiffHeaderOffset, block.makerNoteOffset, block.byteOrder, includeUnknown, computed, ctx.tagFilter, ctx.getValueBudget())};
    }
    if (hasPentaxType1Prefix(block.bytes)) {
        return {tags: PentaxTags.read(block.tiffView, block.tiffHeaderOffset, block.makerNoteOffset, includeUnknown, computed, ctx.tagFilter, ctx.getValueBudget())};
    }
    return undefined;
}

function hasPentaxType1Prefix(makerNoteBytes) {
    const PENTAX_ID_STRING = 'PENTAX ';
    return Array.isArray(makerNoteBytes)
        && makerNoteBytes.length > PENTAX_ID_STRING.length
        && getStringValueFromArray(makerNoteBytes.slice(0, PENTAX_ID_STRING.length)) === PENTAX_ID_STRING;
}

// The main block's thumbnail is a candidate with or without an image. An
// embedded one is a candidate only with an image, within the copy bound, and
// not once an uncompressed block gave one; the decompressed blocks of a file
// all get to try, since they are read after the uncompressed ones.
function readThumbnailBlock(block, ctx) {
    if (!ctx.tagFilter.shouldReturnTag('thumbnail', 'Thumbnail')) {
        return undefined;
    }
    const parsed = filterTagsForParse('thumbnail', block.ifd1Tags, ctx.tagFilter);
    if (block.rank === 'main') {
        return {tags: Thumbnail.get(block.dataView, parsed, block.tiffHeaderOffset, ctx.getBase64Image)};
    }
    if (ctx.hasEmbeddedThumbnailImage) {
        return undefined;
    }
    const lengthTag = parsed.JPEGInterchangeFormatLength;
    if (!lengthTag || typeof lengthTag.value !== 'number' || lengthTag.value > ctx.embeddedThumbnailSizeBound - ctx.copiedThumbnailSize) {
        return undefined;
    }
    const thumbnail = Thumbnail.get(block.dataView, parsed, block.tiffHeaderOffset, ctx.getBase64Image);
    if (!thumbnail.image) {
        return undefined;
    }
    ctx.copiedThumbnailSize += lengthTag.value;
    if (!block.decompressed) {
        ctx.hasEmbeddedThumbnailImage = true;
    }
    return {tags: thumbnail};
}

// Every uncompressed text chunk of a PNG merges as one tier, so that the text
// tags sort after an uncompressed raw-profile Exif whatever the chunk order and
// two raw profiles merge group by group. A compressed chunk stays its own tier.
function combineUncompressedPngTextBlocks(mergeBlocks) {
    const combined = [];
    const leaves = [];
    let tierIndex = -1;

    for (let i = 0; i < mergeBlocks.length; i++) {
        if (mergeBlocks[i].slot !== 'pngText') {
            combined.push(mergeBlocks[i]);
            continue;
        }
        if (tierIndex === -1) {
            tierIndex = combined.length;
            combined.push(undefined);
        }
        collectLeafBlocks(mergeBlocks[i], leaves);
    }

    if (tierIndex !== -1) {
        combined[tierIndex] = {slot: 'pngText', mode: 'nested', blocks: leaves};
    }
    return combined;
}

function collectLeafBlocks(block, leaves) {
    if (block.mode !== 'nested') {
        leaves.push(block);
        return;
    }
    for (let i = 0; i < block.blocks.length; i++) {
        collectLeafBlocks(block.blocks[i], leaves);
    }
}

function getDerivedBlocks({expanded, includeOffsets, async, ranges, truncated}) {
    const blocks = [];
    if (Constants.USE_EXIF) {
        blocks.push({slot: 'gps', mode: 'gps'});
    }
    if (Constants.USE_EXIF || Constants.USE_XMP) {
        blocks.push({slot: 'composite', mode: 'composite'});
    }
    blocks.push({slot: 'thumbnail', mode: 'thumbnail'});
    blocks.push({slot: 'fileType', mode: 'fileType'});
    if (expanded && includeOffsets) {
        blocks.push({
            slot: 'metadataRange',
            mode: 'metadataRange',
            metadataBlocks: getMetadataRangeBlocks(ranges, async),
            metadataTruncated: !!truncated,
        });
    }
    return blocks;
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

function readExifTagsSafely(dataView, tiffHeaderOffset, ctx, valueBudget) {
    try {
        return readExifTags(dataView, tiffHeaderOffset, ctx, valueBudget);
    } catch (error) {
        // A malformed TIFF header (an out-of-bounds offset or an invalid byte
        // order marker, e.g. from a HEIC/AVIF iloc that does not point at real
        // Exif) must not abort the whole parse. Skip Exif instead, but keep the
        // same shape so callers can destructure safely.
        return {tags: {}, byteOrder: ByteOrder.BIG_ENDIAN, makerNoteOffset: undefined};
    }
}

function readExifTags(dataView, tiffHeaderOffset, ctx, valueBudget) {
    return Tags.read(
        dataView,
        tiffHeaderOffset,
        ctx.options.includeUnknown,
        ctx.options.computed,
        ctx.tagFilter,
        valueBudget,
        getExifTagNames(),
        shouldReadThumbnailIfd(ctx.tagFilter)
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

function hasPngTextData(pngTextBlocks) {
    return Array.isArray(pngTextBlocks) && pngTextBlocks.length > 0;
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
