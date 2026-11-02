/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Constants from './constants.js';

// A block's position in each mode is the index of its slot. Expanded output
// takes its key order from the first block of each group: discovery order,
// with the groups an Exif block carries just before it. In flat output a later
// block wins a key clash, so Exif wins over the groups it carries except an
// ApplicationNotes XMP packet.
export const MERGE_ORDER = {
    expanded: [
        'file', 'jfif',
        'carriedIptc', 'carriedXmp', 'carriedPhotoshop', 'carriedIcc', 'carriedMakerNotes', 'exif',
        'iptc', 'xmp', 'brobExif', 'brobXmp', 'icc', 'mpf',
        'pngFile', 'pngText', 'deferredPngText', 'pngChunk', 'riff', 'gif', 'jxlFile', 'isoBmffFile',
        'gps', 'composite', 'thumbnail', 'fileType', 'metadataRange',
    ],
    flat: [
        'file', 'jfif',
        'carriedIptc', 'carriedPhotoshop', 'carriedIcc', 'carriedMakerNotes', 'exif', 'carriedXmp',
        'iptc', 'xmp', 'brobExif', 'brobXmp', 'icc', 'mpf',
        'pngFile', 'pngText', 'deferredPngText', 'pngChunk', 'riff', 'gif', 'jxlFile', 'isoBmffFile',
        'gps', 'composite', 'thumbnail', 'fileType', 'metadataRange',
    ],
};

// The slot of each group an Exif block carries.
export const CARRIED_GROUP_SLOTS = {
    iptc: 'carriedIptc',
    xmp: 'carriedXmp',
    photoshop: 'carriedPhotoshop',
    icc: 'carriedIcc',
    makerNotes: 'carriedMakerNotes',
};

// Every Constants.USE_* guard sits inside the function, since the table is
// built once at import.
const MERGE_MODES = {
    assign: assignGroupTags,
    merge: mergeGroupTags,
    brobXmp: assignBrobXmpTags,
    pngFile: mergePngFileTags,
    pngText: mergePngTextItems,
    pngTextTags: mergePngTextTags,
    embeddedExif: mergeEmbeddedExif,
    gps: addGpsGroup,
    composite: addCompositeGroup,
    thumbnail: addThumbnail,
    fileType: addFileType,
    metadataRange: addMetadataRange,
};

/**
 * Merges the blocks into the returned tags, in the order MERGE_ORDER gives the
 * current mode, whatever order they were pushed in.
 *
 * A block has a `slot` (its place in MERGE_ORDER), a `mode` (a key of
 * MERGE_MODES), the `group` it merges into (tag blocks only) and its payload:
 * `tags`, `item` (one PNG text item) or `deferredKey` (the deferredResults key
 * of a payload that resolved later). A metadataRange block also carries
 * `metadataBlocks` and `metadataTruncated`.
 *
 * @returns {object} The tags.
 */
export function buildTagsFromMergeBlocks({
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
    deps,
}) {
    const context = {
        deferredResults,
        parsedGroups,
        expanded,
        tagFilter,
        dataView,
        tiffHeaderOffset,
        exifDataView,
        fileType,
        thumbnailIfdTags,
        embeddedExifThumbnails: [],
        deps,
        merge: createCopyingMerge(deps),
    };
    const orderedBlocks = getBlocksInMergeOrder(mergeBlocks, expanded);
    let tags = {};

    for (let i = 0; i < orderedBlocks.length; i++) {
        tags = applyMergeMode(tags, orderedBlocks[i], context);
    }

    return addPngTextCopyOfPng(tags, {expanded, tagFilter, pngTextBlocks, pngTextIsAsync, deps});
}

// Sorts by position, then push order, without relying on a stable sort.
function getBlocksInMergeOrder(blocks, expanded) {
    const order = expanded ? MERGE_ORDER.expanded : MERGE_ORDER.flat;

    return blocks
        .map((block, index) => ({block, index, position: order.indexOf(block.slot)}))
        .sort((a, b) => (a.position - b.position) || (a.index - b.index))
        .map((entry) => entry.block);
}

function applyMergeMode(tags, block, context) {
    return MERGE_MODES[block.mode](tags, block, context);
}

// Expanded output gets a pngText group that copies png when the text chunks
// are read asynchronously, or when there are text chunks (raw profiles
// included) but none of them gave PNG text tags.
function addPngTextCopyOfPng(tags, {expanded, tagFilter, pngTextBlocks, pngTextIsAsync, deps}) {
    if (
        Constants.USE_PNG
        && expanded
        && pngTextIsAsync
        && tagFilter.shouldReturnGroup('png')
        && tags.png
    ) {
        tags.pngText = deps.objectAssign({}, tags.png);
    }

    if (
        Constants.USE_PNG
        && expanded
        && tagFilter.shouldReturnGroup('png')
        && deps.hasPngTextData(pngTextBlocks)
        && tags.png
        && !tags.pngText
    ) {
        tags.pngText = deps.objectAssign({}, tags.png);
    }

    return tags;
}

/**
 * Merges one block into the tags with the function its mode names.
 *
 * @param {object} context The block, the tags so far and the merge state; see
 * buildTagsFromMergeBlocks for the block shape. `merge` defaults to a copying
 * merge and `embeddedExifThumbnails` to a new list.
 * @returns {object} The tags, which flat output replaces rather than mutates.
 */
export function mergeBlock({
    block,
    tags,
    deferredResults,
    parsedGroups,
    expanded,
    tagFilter,
    dataView,
    tiffHeaderOffset,
    exifDataView,
    fileType,
    thumbnailIfdTags,
    embeddedExifThumbnails = [],
    deps,
    merge = createCopyingMerge(deps),
}) {
    return applyMergeMode(tags, block, {
        deferredResults,
        parsedGroups,
        expanded,
        tagFilter,
        dataView,
        tiffHeaderOffset,
        exifDataView,
        fileType,
        thumbnailIfdTags,
        embeddedExifThumbnails,
        deps,
        merge,
    });
}

function assignGroupTags(tags, block, context) {
    const parsedTags = getParsedTags(block, context);
    if (!context.tagFilter.shouldReturnGroup(block.group)) {
        return tags;
    }
    const returnedTags = context.deps.filterTagsForReturn(block.group, parsedTags, context.tagFilter);

    return mergeAssignGroup(tags, block.group, returnedTags, context.expanded, context.deps);
}

// A deferred block writes the parsed groups when it merges, since gps,
// composite and metadataRange read them.
function getParsedTags(block, context) {
    if (block.deferredKey === undefined) {
        return block.tags;
    }
    const parsedTags = context.deps.filterTagsForParse(
        block.group,
        context.deferredResults[block.deferredKey],
        context.tagFilter
    );
    context.parsedGroups[block.group] = parsedTags;

    return parsedTags;
}

export function mergeAssignGroup(tags, groupKey, returnedTags, expanded, deps) {
    if (expanded) {
        tags[groupKey] = returnedTags;

        return tags;
    }

    return deps.objectAssign({}, tags, getTagsForFlat(groupKey, returnedTags, deps));
}

// Every XMP block drops the raw packet in flat output.
function getTagsForFlat(groupKey, returnedTags, deps) {
    if (!(Constants.USE_XMP && groupKey === 'xmp')) {
        return returnedTags;
    }
    const xmpTagsWithoutRaw = deps.objectAssign({}, returnedTags);
    delete xmpTagsWithoutRaw._raw;

    return xmpTagsWithoutRaw;
}

function mergeGroupTags(tags, block, context) {
    const parsedTags = getParsedTags(block, context);
    if (!context.tagFilter.shouldReturnGroup(block.group)) {
        return tags;
    }
    const returnedTags = context.deps.filterTagsForReturn(block.group, parsedTags, context.tagFilter);

    if (context.expanded) {
        context.merge.group(tags, block.group, returnedTags);

        return tags;
    }

    return context.merge.topLevel(tags, getTagsForFlat(block.group, returnedTags, context.deps));
}

// In expanded output a brob XMP replaces the xmp group, in flat output it
// merges key by key, and an empty, failed or over-bound one leaves the earlier
// xmp group as it is.
function assignBrobXmpTags(tags, block, context) {
    if (!Constants.USE_JXL) {
        return tags;
    }
    const resolvedReadTags = context.deferredResults[block.deferredKey];
    if (!resolvedReadTags || Object.keys(resolvedReadTags).length === 0) {
        return tags;
    }

    return assignGroupTags(tags, block, context);
}

// The png group gathers the file, text and chunk tags; pngFile keeps the file
// tags alone.
function mergePngFileTags(tags, block, context) {
    if (!Constants.USE_PNG || !context.tagFilter.shouldReturnGroup('png')) {
        return tags;
    }
    const returnedTags = context.deps.filterTagsForReturn('png', block.tags, context.tagFilter);

    if (context.expanded) {
        context.merge.group(tags, 'png', returnedTags);
        tags.pngFile = returnedTags;

        return tags;
    }

    return context.merge.topLevel(tags, returnedTags);
}

// The deferred list merges in place with one strategy for all its items, which
// keeps it linear in the number of items.
function mergePngTextItems(tags, block, context) {
    if (!Constants.USE_PNG) {
        return tags;
    }
    const isDeferred = block.deferredKey !== undefined;
    const items = isDeferred ? context.deferredResults[block.deferredKey] || [] : [block.item];
    const merge = isDeferred ? createInPlaceMerge(context.deps) : context.merge;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        addEmbeddedExifThumbnail(context.embeddedExifThumbnails, item.embeddedExifThumbnail);
        tags = addPngTextReadTagsToTagsAndGroups({
            readTags: item.readTags || {},
            embeddedExifTags: item.embeddedExifTags,
            exifCarriedGroups: item.exifCarriedGroups,
            embeddedIptcTags: item.embeddedIptcTags,
            parsedGroups: context.parsedGroups,
            expanded: context.expanded,
            tagFilter: context.tagFilter,
            tags,
            deps: context.deps,
            merge,
        });
    }

    return tags;
}

function addEmbeddedExifThumbnail(embeddedExifThumbnails, embeddedExifThumbnail) {
    if (embeddedExifThumbnail) {
        embeddedExifThumbnails.push(embeddedExifThumbnail);
    }
}

/**
 * Merges one PNG text item: the Exif block of a raw profile with the groups it
 * carries, a raw IPTC profile and the text tags, in the order MERGE_ORDER
 * gives their slots.
 *
 * @returns {object} The tags, which flat output replaces rather than mutates.
 */
export function addPngTextReadTagsToTagsAndGroups({
    readTags,
    embeddedExifTags,
    exifCarriedGroups,
    embeddedIptcTags,
    parsedGroups,
    expanded,
    tagFilter,
    tags,
    deps,
    merge = createCopyingMerge(deps),
}) {
    const context = {parsedGroups, expanded, tagFilter, deps, merge};
    const blocks = embeddedExifTags ? getEmbeddedExifBlocks(embeddedExifTags, exifCarriedGroups || {}, context) : [];

    if (embeddedIptcTags) {
        const parsedEmbeddedIptcTags = deps.filterTagsForParse('iptc', embeddedIptcTags, tagFilter);
        merge.group(parsedGroups, 'iptc', parsedEmbeddedIptcTags);
        blocks.push({slot: 'iptc', group: 'iptc', mode: 'merge', tags: parsedEmbeddedIptcTags});
    }

    if (tagFilter.shouldReturnGroup('png')) {
        const parsedPngTextTags = deps.filterTagsForParse('png', readTags, tagFilter);
        parsedGroups.pngText = parsedPngTextTags;
        blocks.push({slot: 'pngText', group: 'png', mode: 'pngTextTags', tags: parsedPngTextTags});
    }

    return mergeEmbeddedBlocks(tags, blocks, context);
}

// The blocks of one Exif block: the groups it carries, which arrive parsed,
// then Exif. Each writes the parsed groups as it is built.
function getEmbeddedExifBlocks(exifTags, carriedGroups, context) {
    const blocks = [];
    const groupKeys = Object.keys(CARRIED_GROUP_SLOTS);

    for (let i = 0; i < groupKeys.length; i++) {
        const groupKey = groupKeys[i];
        const group = carriedGroups[groupKey];
        if (group === undefined) {
            continue;
        }
        context.merge.group(context.parsedGroups, groupKey, group);
        blocks.push({slot: CARRIED_GROUP_SLOTS[groupKey], group: groupKey, mode: 'merge', tags: group});
    }

    const parsedExifTags = context.deps.filterTagsForParse('exif', exifTags, context.tagFilter);
    context.merge.group(context.parsedGroups, 'exif', parsedExifTags);
    blocks.push({slot: 'exif', group: 'exif', mode: 'merge', tags: parsedExifTags});

    return blocks;
}

function mergeEmbeddedBlocks(tags, blocks, context) {
    const orderedBlocks = getBlocksInMergeOrder(blocks, context.expanded);

    for (let i = 0; i < orderedBlocks.length; i++) {
        tags = applyMergeMode(tags, orderedBlocks[i], context);
    }

    return tags;
}

// pngText holds the text tags only when there are any; otherwise
// addPngTextCopyOfPng may fill it with a copy of png.
function mergePngTextTags(tags, block, context) {
    if (!Constants.USE_PNG || !context.tagFilter.shouldReturnGroup('png')) {
        return tags;
    }
    const returnedTags = context.deps.filterTagsForReturn('png', block.tags, context.tagFilter);

    if (context.expanded) {
        context.merge.group(tags, 'png', returnedTags);
        if (Object.keys(returnedTags).length > 0) {
            context.merge.group(tags, 'pngText', returnedTags);
        }

        return tags;
    }

    return context.merge.topLevel(tags, returnedTags);
}

function mergeEmbeddedExif(tags, block, context) {
    if (!Constants.USE_JXL) {
        return tags;
    }
    const resolved = context.deferredResults[block.deferredKey];
    if (!resolved) {
        return tags;
    }
    addEmbeddedExifThumbnail(context.embeddedExifThumbnails, resolved.thumbnail);
    if (Object.keys(resolved.exifTags).length === 0) {
        return tags;
    }

    return mergeEmbeddedBlocks(tags, getEmbeddedExifBlocks(resolved.exifTags, resolved.carriedGroups, context), context);
}

// Expanded output only, derived from the parsed Exif group.
function addGpsGroup(tags, block, context) {
    if (
        Constants.USE_EXIF
        && context.expanded
        && context.tagFilter.shouldReturnGroup('gps')
        && context.parsedGroups.exif
    ) {
        const gpsGroup = context.deps.getGpsGroupFromExifTags(context.parsedGroups.exif);
        if (gpsGroup) {
            tags.gps = context.deps.filterTagsForReturn('gps', gpsGroup, context.tagFilter);
        }
    }

    return tags;
}

// Composite reads the merged tags, or with an active tag filter the parsed exif
// and file groups.
function addCompositeGroup(tags, block, context) {
    if (!(Constants.USE_EXIF || Constants.USE_XMP) || !context.tagFilter.shouldReturnGroup('composite')) {
        return tags;
    }

    let compositeInput = tags;
    let compositeInputExpanded = context.expanded;
    if (context.tagFilter.isActive) {
        compositeInput = {exif: context.parsedGroups.exif, file: context.parsedGroups.file};
        compositeInputExpanded = true;
    }

    const composite = context.deps.Composite.get(compositeInput, compositeInputExpanded);
    if (!composite) {
        return tags;
    }

    const returnedCompositeTags = context.deps.filterTagsForReturn('composite', composite, context.tagFilter);

    return mergeAssignGroup(tags, 'composite', returnedCompositeTags, context.expanded, context.deps);
}

// The main thumbnail when it has an image, else the first embedded Exif
// thumbnail with one, else the main thumbnail without an image.
function addThumbnail(tags, block, context) {
    // Flat output can already hold an XMP or PNG text tag named Thumbnail.
    delete tags.Thumbnail;

    if (
        !context.tagFilter.shouldReturnGroup('thumbnail')
        || !context.tagFilter.shouldReturnTag('thumbnail', 'Thumbnail')
    ) {
        return tags;
    }

    const mainThumbnail = getMainThumbnail(context);
    let thumbnail = mainThumbnail;
    if (!hasImage(mainThumbnail)) {
        thumbnail = getFirstEmbeddedExifThumbnailWithImage(context.embeddedExifThumbnails) || mainThumbnail;
    }
    if (thumbnail) {
        tags.Thumbnail = thumbnail;
    }

    return tags;
}

function getMainThumbnail({thumbnailIfdTags, tagFilter, dataView, exifDataView, tiffHeaderOffset, deps}) {
    if (!thumbnailIfdTags) {
        return undefined;
    }

    const parsedThumbnailIfdTags = deps.filterTagsForParse(
        'thumbnail',
        thumbnailIfdTags,
        tagFilter
    );

    return Constants.USE_EXIF
        && Constants.USE_THUMBNAIL
        && deps.Thumbnail.get(exifDataView || dataView, parsedThumbnailIfdTags, tiffHeaderOffset);
}

function hasImage(thumbnail) {
    return !!thumbnail && !!thumbnail.image;
}

function getFirstEmbeddedExifThumbnailWithImage(embeddedExifThumbnails) {
    if (!((Constants.USE_PNG || Constants.USE_JXL) && Constants.USE_EXIF && Constants.USE_THUMBNAIL)) {
        return undefined;
    }
    return embeddedExifThumbnails.filter(hasImage)[0];
}

function addFileType(tags, block, context) {
    // Flat output can already hold an XMP or PNG text tag named FileType.
    delete tags.FileType;

    if (
        context.fileType
        && context.tagFilter.shouldReturnGroup('file')
        && context.tagFilter.shouldReturnTag('file', 'FileType')
    ) {
        if (context.expanded) {
            if (!tags.file) {
                tags.file = {};
            }
            tags.file.FileType = context.fileType;
        } else {
            tags.FileType = context.fileType;
        }
    }

    return tags;
}

// Expanded output only.
function addMetadataRange(tags, block, context) {
    if (!context.expanded) {
        return tags;
    }
    const metadataRange = buildMetadataRange(
        block.metadataBlocks,
        block.metadataTruncated,
        context.dataView,
        context.parsedGroups
    );
    if (metadataRange) {
        tags.metadataRange = metadataRange;
    }
    return tags;
}

function createCopyingMerge(deps) {
    return {
        group(holder, key, source) {
            holder[key] = !holder[key] ? source : deps.objectAssign({}, holder[key], source);
        },
        topLevel(tags, source) {
            return deps.objectAssign({}, tags, source);
        },
    };
}

function createInPlaceMerge(deps) {
    const ownedContainers = [];

    return {
        group(holder, key, source) {
            holder[key] = own(holder[key]);
            deps.objectAssign(holder[key], source);
        },
        topLevel(tags, source) {
            return deps.objectAssign(own(tags), source);
        },
    };

    // Earlier blocks can share these containers (tags.png can be tags.pngFile or the
    // synchronous text chunks' tags), so each is copied once before merging in place.
    function own(container) {
        if (ownedContainers.indexOf(container) !== -1) {
            return container;
        }
        const copy = deps.objectAssign({}, container);
        ownedContainers.push(copy);
        return copy;
    }
}

function buildMetadataRange(metadataBlocks, metadataTruncated, dataView, parsedGroups) {
    const blocks = (metadataBlocks || []).slice();
    const finderTruncated = !!metadataTruncated;

    if (parsedGroups && parsedGroups.mpf && Array.isArray(parsedGroups.mpf.Images)) {
        for (let i = 0; i < parsedGroups.mpf.Images.length; i++) {
            const image = parsedGroups.mpf.Images[i];
            if (!image || !image.ImageOffset || !image.ImageSize) {
                continue;
            }
            const offset = image.ImageOffset.value;
            const size = image.ImageSize.value;
            // Skip the primary self-reference (offset 0), malformed entries,
            // and zero-length entries.
            if (typeof offset !== 'number' || offset <= 0
                || typeof size !== 'number' || size <= 0) {
                continue;
            }
            blocks.push({
                type: 'mpfImage',
                start: offset,
                end: offset + size,
            });
        }
    }

    if (blocks.length === 0) {
        return undefined;
    }

    blocks.sort((a, b) => a.start - b.start);

    const start = blocks[0].start;
    let end = blocks[0].end;
    for (let i = 1; i < blocks.length; i++) {
        if (blocks[i].end > end) {
            end = blocks[i].end;
        }
    }

    const byteLength = dataView && typeof dataView.byteLength === 'number' ? dataView.byteLength : 0;
    const complete = !finderTruncated && end <= byteLength;

    return {start, end, complete, blocks};
}
