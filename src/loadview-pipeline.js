/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export function buildTagsFromMergeSteps({
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
    deps,
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
            deps,
        });
    }

    if (
        expanded
        && pngTextIsAsync
        && tagFilter.shouldReturnGroup('png')
        && tags.png
    ) {
        tags.pngText = deps.objectAssign({}, tags.png);
    }

    if (
        expanded
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
    fileType,
    thumbnailIfdTags,
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

    if (step.type === 'mergeXmpGroupAssign') {
        const returnedTags =
            deps.filterTagsForReturn('xmp', step.parsedTags, tagFilter);

        if (expanded) {
            tags.xmp = returnedTags;

            return tags;
        }

        const returnedTagsForFlat = deps.objectAssign({}, returnedTags);
        delete returnedTagsForFlat._raw;

        return deps.objectAssign({}, tags, returnedTagsForFlat);
    }

    if (step.type === 'mergeIccDeferred') {
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

    if (step.type === 'mergePngFile') {
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

    if (step.type === 'mergePngChunk') {
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

    if (step.type === 'processPngTextReadTags') {
        return addPngTextReadTagsToTagsAndGroups({
            readTags: step.readTags,
            parsedGroups,
            expanded,
            tagFilter,
            tags,
            deps,
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
                deps,
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
            const gpsGroup = deps.getGpsGroupFromExifTags(parsedGroups.exif);
            if (gpsGroup) {
                const returnedGpsGroup =
                    deps.filterTagsForReturn('gps', gpsGroup, tagFilter);
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

        const parsedThumbnailIfdTags = thumbnailIfdTags ? deps.filterTagsForParse(
            'thumbnail',
            thumbnailIfdTags,
            tagFilter
        ) : undefined;
        if (parsedThumbnailIfdTags) {
            parsedGroups.thumbnail = parsedThumbnailIfdTags;
        }

        const thumbnail = (deps.Constants.USE_JPEG || deps.Constants.USE_WEBP)
            && deps.Constants.USE_EXIF
            && deps.Constants.USE_THUMBNAIL
            && deps.Thumbnail.get(dataView, parsedThumbnailIfdTags, tiffHeaderOffset);
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

export function mergeAssignGroup(tags, groupKey, returnedTags, expanded, deps) {
    if (expanded) {
        tags[groupKey] = returnedTags;

        return tags;
    }

    return deps.objectAssign({}, tags, returnedTags);
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
    parsedGroups,
    expanded,
    tagFilter,
    tags,
    deps,
}) {
    const embeddedExifTags = readTags.__exif;
    const embeddedIptcTags = readTags.__iptc;
    delete readTags.__exif;
    delete readTags.__iptc;

    if (embeddedExifTags) {
        const parsedEmbeddedExifTags =
            deps.filterTagsForParse('exif', embeddedExifTags, tagFilter);
        parsedGroups.exif = !parsedGroups.exif ? parsedEmbeddedExifTags : deps.objectAssign(
            {},
            parsedGroups.exif,
            parsedEmbeddedExifTags
        );

        if (tagFilter.shouldReturnGroup('exif')) {
            const returnedEmbeddedExifTags = deps.filterTagsForReturn(
                'exif',
                parsedEmbeddedExifTags,
                tagFilter
            );
            if (expanded) {
                tags.exif = !tags.exif ? returnedEmbeddedExifTags : deps.objectAssign(
                    {},
                    tags.exif,
                    returnedEmbeddedExifTags
                );
            } else {
                tags = deps.objectAssign({}, tags, returnedEmbeddedExifTags);
            }
        }
    }

    if (embeddedIptcTags) {
        const parsedEmbeddedIptcTags =
            deps.filterTagsForParse('iptc', embeddedIptcTags, tagFilter);
        parsedGroups.iptc = !parsedGroups.iptc ? parsedEmbeddedIptcTags : deps.objectAssign(
            {},
            parsedGroups.iptc,
            parsedEmbeddedIptcTags
        );

        if (tagFilter.shouldReturnGroup('iptc')) {
            const returnedEmbeddedIptcTags = deps.filterTagsForReturn(
                'iptc',
                parsedEmbeddedIptcTags,
                tagFilter
            );
            if (expanded) {
                tags.iptc = !tags.iptc ? returnedEmbeddedIptcTags : deps.objectAssign(
                    {},
                    tags.iptc,
                    returnedEmbeddedIptcTags
                );
            } else {
                tags = deps.objectAssign({}, tags, returnedEmbeddedIptcTags);
            }
        }
    }

    if (tagFilter.shouldReturnGroup('png')) {
        const parsedPngTextTags = deps.filterTagsForParse('png', readTags, tagFilter);
        const returnedPngTextTags =
            deps.filterTagsForReturn('png', parsedPngTextTags, tagFilter);
        parsedGroups.pngText = parsedPngTextTags;

        if (expanded) {
            tags.png = !tags.png ? returnedPngTextTags : deps.objectAssign(
                {},
                tags.png,
                returnedPngTextTags
            );
            // Historical behavior in build fixtures:
            // - if PNG text chunks yield actual "png" tags, `pngText` should contain only those
            // - otherwise (e.g. only embedded Exif/IPTC), `pngText` should represent the full `png` group
            //   and will be filled in later as a fallback from `tags.png`
            if (returnedPngTextTags && Object.keys(returnedPngTextTags).length > 0) {
                tags.pngText = !tags.pngText ? returnedPngTextTags : deps.objectAssign(
                    {},
                    tags.pngText,
                    returnedPngTextTags
                );
            }
        } else {
            tags = deps.objectAssign({}, tags, returnedPngTextTags);
        }
    }

    return tags;
}

export function isThenable(value) {
    return !!value && typeof value.then === 'function';
}
