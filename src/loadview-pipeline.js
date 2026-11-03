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

// Every Constants.USE_* guard sits inside the function, since the table is
// built once at import.
const MERGE_MODES = {
    assign: assignGroupTags,
    merge: mergeGroupTags,
    brobXmp: assignBrobXmpTags,
    pngFile: mergePngFileTags,
    pngTextTags: mergePngTextTags,
    nested: mergeNestedBlocks,
    thumbnailCandidate: addThumbnailCandidate,
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
 * A block has a `slot` (its place in MERGE_ORDER) and a `mode` (a key of
 * MERGE_MODES). A tag block also has the `group` it merges into and its parsed
 * `tags`; a `nested` container has `blocks`, merged among themselves in slot
 * order at the container's position; a `thumbnailCandidate` has `rank` (main
 * or embedded) and the thumbnail as `tags`. A metadataRange block carries
 * `metadataBlocks` and `metadataTruncated`.
 *
 * The top level merges in place, so a PNG with thousands of text chunk blocks
 * stays linear.
 *
 * @returns {object} The tags.
 */
export function buildTagsFromMergeBlocks({
    mergeBlocks,
    parsedGroups,
    expanded,
    tagFilter,
    dataView,
    fileType,
    pngTextBlocks,
    pngTextIsAsync,
    deps,
}) {
    const context = {
        parsedGroups,
        expanded,
        tagFilter,
        dataView,
        fileType,
        thumbnails: [],
        deps,
        merge: createInPlaceMerge(deps),
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
 * merge and `thumbnails` to a new list.
 * @returns {object} The tags, which flat output replaces rather than mutates.
 */
export function mergeBlock({
    block,
    tags,
    parsedGroups,
    expanded,
    tagFilter,
    dataView,
    fileType,
    thumbnails = [],
    deps,
    merge = createCopyingMerge(deps),
}) {
    return applyMergeMode(tags, block, {
        parsedGroups,
        expanded,
        tagFilter,
        dataView,
        fileType,
        thumbnails,
        deps,
        merge,
    });
}

// Every tag block writes its parsed group as it merges, since gps, composite
// and metadataRange read them, whether or not the group is returned.
function assignGroupTags(tags, block, context) {
    context.parsedGroups[block.group] = block.tags;
    if (!context.tagFilter.shouldReturnGroup(block.group)) {
        return tags;
    }
    const returnedTags = context.deps.filterTagsForReturn(block.group, block.tags, context.tagFilter);

    return mergeAssignGroup(tags, block.group, returnedTags, context.expanded, context.deps);
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
    context.merge.group(context.parsedGroups, block.group, block.tags);
    if (!context.tagFilter.shouldReturnGroup(block.group)) {
        return tags;
    }
    const returnedTags = context.deps.filterTagsForReturn(block.group, block.tags, context.tagFilter);

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
    if (!block.tags || Object.keys(block.tags).length === 0) {
        return tags;
    }

    return assignGroupTags(tags, block, context);
}

// The png group gathers the file, text and chunk tags; pngFile keeps the file
// tags alone.
function mergePngFileTags(tags, block, context) {
    if (!Constants.USE_PNG) {
        return tags;
    }
    context.parsedGroups.pngFile = block.tags;
    if (!context.tagFilter.shouldReturnGroup('png')) {
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

// The blocks of one container (an Exif block with the groups it carries, or
// the uncompressed text chunks of a PNG) merge among themselves in slot order.
function mergeNestedBlocks(tags, block, context) {
    return mergeEmbeddedBlocks(tags, block.blocks, context);
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

function addThumbnailCandidate(tags, block, context) {
    context.thumbnails.push({rank: block.rank, thumbnail: block.tags});
    return tags;
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

    const thumbnail = selectThumbnail(context.thumbnails);
    if (thumbnail) {
        tags.Thumbnail = thumbnail;
    }

    return tags;
}

function selectThumbnail(candidates) {
    if (!(Constants.USE_EXIF && Constants.USE_THUMBNAIL)) {
        return undefined;
    }
    const main = candidates.filter((candidate) => candidate.rank === 'main')[0];
    if (main && hasImage(main.thumbnail)) {
        return main.thumbnail;
    }
    const embedded = candidates.filter((candidate) => candidate.rank === 'embedded' && hasImage(candidate.thumbnail))[0];
    if (embedded) {
        return embedded.thumbnail;
    }
    return main ? main.thumbnail : undefined;
}

function hasImage(thumbnail) {
    return !!thumbnail && !!thumbnail.image;
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
