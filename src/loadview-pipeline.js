/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Constants from './constants.js';

// The order the main Exif block reads them in. It is the key order of expanded
// output, and in flat output later groups win a key clash, so Exif wins over
// all of them but an ApplicationNotes XMP packet.
export const EXIF_CARRIED_GROUP_ORDER = ['iptc', 'xmp', 'photoshop', 'icc', 'makerNotes'];

export function buildTagsFromMergeSteps({
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
    deps,
}) {
    let tags = {};
    const embeddedExifThumbnails = [];

    for (let i = 0; i < mergeSteps.length; i++) {
        tags = applyMergeStep({
            step: mergeSteps[i],
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
            tags,
            deps,
        });
    }

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
        && deps.hasPngTextData(pngTextChunks)
        && tags.png
        && !tags.pngText
    ) {
        tags.pngText = deps.objectAssign({}, tags.png);
    }

    return tags;
}

export function applyMergeStep({
    step,
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
    tags,
    deps,
}) {
    if (step.type === 'mergeGroupAssign') {
        const returnedTags =
            deps.filterTagsForReturn(step.groupKey, step.parsedTags, tagFilter);

        return mergeAssignGroup(tags, step.groupKey, returnedTags, expanded, deps);
    }

    if (step.type === 'mergeGroupMerge') {
        const returnedTags =
            deps.filterTagsForReturn(step.groupKey, step.parsedTags, tagFilter);

        return mergeMergeGroup(tags, step.groupKey, returnedTags, expanded, deps);
    }

    if (Constants.USE_XMP && step.type === 'mergeXmpGroupAssign') {
        const returnedTags =
            deps.filterTagsForReturn('xmp', step.parsedTags, tagFilter);

        return mergeXmpGroup(tags, returnedTags, expanded, deps);
    }

    if (Constants.USE_ICC && step.type === 'mergeIccDeferred') {
        const resolvedReadTags = deferredResults[step.deferredKey];
        const parsedIccTags =
            deps.filterTagsForParse('icc', resolvedReadTags, tagFilter);
        parsedGroups.icc = parsedIccTags;

        if (!tagFilter.shouldReturnGroup('icc')) {
            return tags;
        }

        const returnedIccTags =
            deps.filterTagsForReturn('icc', parsedIccTags, tagFilter);

        return mergeAssignGroup(tags, 'icc', returnedIccTags, expanded, deps);
    }

    if (Constants.USE_JXL && step.type === 'mergeBrobExifDeferred') {
        const resolved = deferredResults[step.deferredKey];
        if (!resolved) {
            return tags;
        }
        addEmbeddedExifThumbnail(embeddedExifThumbnails, resolved.thumbnail);
        if (Object.keys(resolved.exifTags).length === 0) {
            return tags;
        }

        return addExifAndCarriedGroupsToTagsAndGroups({
            exifTags: resolved.exifTags,
            carriedGroups: resolved.carriedGroups,
            parsedGroups,
            expanded,
            tagFilter,
            tags,
            deps,
            merge: createCopyingMerge(deps),
        });
    }

    if (Constants.USE_JXL && step.type === 'mergeBrobXmpDeferred') {
        const resolvedReadTags = deferredResults[step.deferredKey];
        if (!resolvedReadTags || Object.keys(resolvedReadTags).length === 0) {
            return tags;
        }
        const parsedXmpTags =
            deps.filterTagsForParse('xmp', resolvedReadTags, tagFilter);
        parsedGroups.xmp = parsedXmpTags;

        if (!tagFilter.shouldReturnGroup('xmp')) {
            return tags;
        }

        const returnedTags =
            deps.filterTagsForReturn('xmp', parsedXmpTags, tagFilter);

        return mergeXmpGroup(tags, returnedTags, expanded, deps);
    }

    if (Constants.USE_PNG && step.type === 'mergePngFile') {
        const returnedPngFileTags =
            deps.filterTagsForReturn('png', step.parsedTags, tagFilter);

        if (!tagFilter.shouldReturnGroup('png')) {
            return tags;
        }

        if (expanded) {
            tags.png = !tags.png ? returnedPngFileTags : deps.objectAssign(
                {},
                tags.png,
                returnedPngFileTags
            );
            tags.pngFile = returnedPngFileTags;

            return tags;
        }

        return deps.objectAssign({}, tags, returnedPngFileTags);
    }

    if (Constants.USE_PNG && step.type === 'mergePngChunk') {
        const returnedPngChunkTags =
            deps.filterTagsForReturn('png', step.parsedTags, tagFilter);

        if (!tagFilter.shouldReturnGroup('png')) {
            return tags;
        }

        if (expanded) {
            tags.png = !tags.png ? returnedPngChunkTags : deps.objectAssign(
                {},
                tags.png,
                returnedPngChunkTags
            );

            return tags;
        }

        return deps.objectAssign({}, tags, returnedPngChunkTags);
    }

    if (Constants.USE_PNG && step.type === 'processPngTextReadTags') {
        addEmbeddedExifThumbnail(embeddedExifThumbnails, step.embeddedExifThumbnail);
        return addPngTextReadTagsToTagsAndGroups({
            readTags: step.readTags,
            embeddedExifTags: step.embeddedExifTags,
            exifCarriedGroups: step.exifCarriedGroups,
            embeddedIptcTags: step.embeddedIptcTags,
            parsedGroups,
            expanded,
            tagFilter,
            tags,
            deps,
        });
    }

    if (Constants.USE_PNG && step.type === 'processPngTextReadTagsDeferredList') {
        const tagList = deferredResults[step.deferredKey] || [];
        const merge = createInPlaceMerge(deps);

        for (let i = 0; i < tagList.length; i++) {
            const entry = tagList[i];
            addEmbeddedExifThumbnail(embeddedExifThumbnails, entry.embeddedExifThumbnail);
            tags = addPngTextReadTagsToTagsAndGroups({
                readTags: entry.readTags || {},
                embeddedExifTags: entry.embeddedExifTags,
                exifCarriedGroups: entry.exifCarriedGroups,
                embeddedIptcTags: entry.embeddedIptcTags,
                parsedGroups,
                expanded,
                tagFilter,
                tags,
                deps,
                merge,
            });
        }

        return tags;
    }

    if (Constants.USE_EXIF && step.type === 'gps') {
        if (
            expanded
            && tagFilter.shouldReturnGroup('gps')
            && parsedGroups.exif
        ) {
            const gpsGroup = deps.getGpsGroupFromExifTags(parsedGroups.exif);
            if (gpsGroup) {
                const returnedGpsGroup =
                    deps.filterTagsForReturn('gps', gpsGroup, tagFilter);
                tags.gps = returnedGpsGroup;
            }
        }

        return tags;
    }

    if ((Constants.USE_EXIF || Constants.USE_XMP) && step.type === 'composite') {
        if (!tagFilter.shouldReturnGroup('composite')) {
            return tags;
        }

        let compositeInput = tags;
        let compositeInputExpanded = expanded;
        if (tagFilter.isActive) {
            compositeInput = {exif: parsedGroups.exif, file: parsedGroups.file};
            compositeInputExpanded = true;
        }

        const composite = deps.Composite.get(compositeInput, compositeInputExpanded);
        if (!composite) {
            return tags;
        }

        const returnedCompositeTags =
            deps.filterTagsForReturn('composite', composite, tagFilter);

        return mergeAssignGroup(
            tags,
            'composite',
            returnedCompositeTags,
            expanded,
            deps
        );
    }

    if (step.type === 'thumbnail') {
        // Flat output can already hold an XMP or PNG text tag named Thumbnail.
        delete tags.Thumbnail;

        if (
            !tagFilter.shouldReturnGroup('thumbnail')
            || !tagFilter.shouldReturnTag('thumbnail', 'Thumbnail')
        ) {
            return tags;
        }

        const mainThumbnail = getMainThumbnail({
            thumbnailIfdTags,
            tagFilter,
            dataView,
            exifDataView,
            tiffHeaderOffset,
            deps,
        });
        let thumbnail = mainThumbnail;
        if (!hasImage(mainThumbnail)) {
            thumbnail = getFirstEmbeddedExifThumbnailWithImage(embeddedExifThumbnails) || mainThumbnail;
        }
        if (thumbnail) {
            tags.Thumbnail = thumbnail;
        }

        return tags;
    }

    if (step.type === 'metadataRange') {
        if (!expanded) {
            return tags;
        }
        const metadataRange = buildMetadataRange(
            step.metadataBlocks,
            step.metadataTruncated,
            dataView,
            parsedGroups
        );
        if (metadataRange) {
            tags.metadataRange = metadataRange;
        }
        return tags;
    }

    if (step.type === 'fileType') {
        // Flat output can already hold an XMP or PNG text tag named FileType.
        delete tags.FileType;

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

function addEmbeddedExifThumbnail(embeddedExifThumbnails, embeddedExifThumbnail) {
    if (embeddedExifThumbnail) {
        embeddedExifThumbnails.push(embeddedExifThumbnail);
    }
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

export function mergeAssignGroup(tags, groupKey, returnedTags, expanded, deps) {
    if (expanded) {
        tags[groupKey] = returnedTags;

        return tags;
    }

    return deps.objectAssign({}, tags, returnedTags);
}

function mergeXmpGroup(tags, returnedTags, expanded, deps) {
    if (expanded) {
        tags.xmp = returnedTags;

        return tags;
    }

    const returnedTagsForFlat = deps.objectAssign({}, returnedTags);
    delete returnedTagsForFlat._raw;

    return deps.objectAssign({}, tags, returnedTagsForFlat);
}

export function mergeMergeGroup(tags, groupKey, returnedTags, expanded, deps) {
    if (expanded) {
        if (!tags[groupKey]) {
            tags[groupKey] = returnedTags;
        } else {
            tags[groupKey] = deps.objectAssign({}, tags[groupKey], returnedTags);
        }

        return tags;
    }

    return deps.objectAssign({}, tags, returnedTags);
}

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
    if (embeddedExifTags) {
        tags = addExifAndCarriedGroupsToTagsAndGroups({
            exifTags: embeddedExifTags,
            carriedGroups: exifCarriedGroups || {},
            parsedGroups,
            expanded,
            tagFilter,
            tags,
            deps,
            merge,
        });
    }

    if (embeddedIptcTags) {
        const parsedEmbeddedIptcTags =
            deps.filterTagsForParse('iptc', embeddedIptcTags, tagFilter);
        merge.group(parsedGroups, 'iptc', parsedEmbeddedIptcTags);

        if (tagFilter.shouldReturnGroup('iptc')) {
            const returnedEmbeddedIptcTags = deps.filterTagsForReturn(
                'iptc',
                parsedEmbeddedIptcTags,
                tagFilter
            );
            if (expanded) {
                merge.group(tags, 'iptc', returnedEmbeddedIptcTags);
            } else {
                tags = merge.topLevel(tags, returnedEmbeddedIptcTags);
            }
        }
    }

    if (tagFilter.shouldReturnGroup('png')) {
        const parsedPngTextTags = deps.filterTagsForParse('png', readTags, tagFilter);
        const returnedPngTextTags =
            deps.filterTagsForReturn('png', parsedPngTextTags, tagFilter);
        parsedGroups.pngText = parsedPngTextTags;

        if (expanded) {
            merge.group(tags, 'png', returnedPngTextTags);
            // Historical behavior in build fixtures:
            // - if PNG text chunks yield actual "png" tags, `pngText` should contain only those
            // - otherwise (e.g. only embedded Exif/IPTC), `pngText` should represent the full `png` group
            //   and will be filled in later as a fallback from `tags.png`
            if (returnedPngTextTags && Object.keys(returnedPngTextTags).length > 0) {
                merge.group(tags, 'pngText', returnedPngTextTags);
            }
        } else {
            tags = merge.topLevel(tags, returnedPngTextTags);
        }
    }

    return tags;
}

/**
 * Merges one Exif block and the groups it carries in the order the main Exif
 * block merges them: the carried groups, then Exif, then in flat output the
 * ApplicationNotes XMP. The carried groups arrive parsed and are not filtered
 * for parse again.
 *
 * @returns {object} The tags, which flat output replaces rather than mutates.
 */
export function addExifAndCarriedGroupsToTagsAndGroups({
    exifTags,
    carriedGroups,
    parsedGroups,
    expanded,
    tagFilter,
    tags,
    deps,
    merge,
}) {
    let flatXmpGroup = undefined;

    for (let i = 0; i < EXIF_CARRIED_GROUP_ORDER.length; i++) {
        const groupKey = EXIF_CARRIED_GROUP_ORDER[i];
        const group = carriedGroups[groupKey];
        if (group === undefined) {
            continue;
        }
        if (groupKey === 'xmp' && !expanded) {
            flatXmpGroup = group;
            continue;
        }
        tags = addCarriedGroup(groupKey, group);
    }

    if (exifTags) {
        const parsedExifTags = deps.filterTagsForParse('exif', exifTags, tagFilter);
        merge.group(parsedGroups, 'exif', parsedExifTags);

        if (tagFilter.shouldReturnGroup('exif')) {
            const returnedExifTags = deps.filterTagsForReturn('exif', parsedExifTags, tagFilter);
            if (expanded) {
                merge.group(tags, 'exif', returnedExifTags);
            } else {
                tags = merge.topLevel(tags, returnedExifTags);
            }
        }
    }

    if (flatXmpGroup !== undefined) {
        tags = addCarriedGroup('xmp', flatXmpGroup, true);
    }

    return tags;

    function addCarriedGroup(groupKey, group, isFlatXmp) {
        merge.group(parsedGroups, groupKey, group);
        if (!tagFilter.shouldReturnGroup(groupKey)) {
            return tags;
        }
        const returnedTags = deps.filterTagsForReturn(groupKey, group, tagFilter);
        if (expanded) {
            merge.group(tags, groupKey, returnedTags);
            return tags;
        }
        return merge.topLevel(tags, isFlatXmp ? getXmpTagsWithoutRaw(returnedTags) : returnedTags);
    }

    function getXmpTagsWithoutRaw(xmpTags) {
        const xmpTagsWithoutRaw = deps.objectAssign({}, xmpTags);
        delete xmpTagsWithoutRaw._raw;
        return xmpTagsWithoutRaw;
    }
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

    // Earlier steps can share these containers (tags.png can be tags.pngFile or the
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

export function isThenable(value) {
    return !!value && typeof value.then === 'function';
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
