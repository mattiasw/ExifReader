/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
    FILTER_GROUPS,
    ID_CAPABLE_GROUPS,
    COMPOSITE_DEPENDENCY_TAGS,
    getExifTagDependenciesForInclude,
} from './tag-filter-config.js';

export function createTagFilter({includeTags, excludeTags} = {}) {
    const hasIncludeTags = Boolean(includeTags);
    const hasExcludeTags = Boolean(excludeTags);
    const isActive = hasIncludeTags || hasExcludeTags;

    const shouldReturn = Object.create(null);
    const returnSelections = Object.create(null);
    const parseSelections = Object.create(null);

    if (!isActive) {
        return createNoopFilter();
    }

    const shouldParseExif = hasIncludeTags
        && (
            isGroupRequested(includeTags, 'iptc')
            || isGroupRequested(includeTags, 'xmp')
            || isGroupRequested(includeTags, 'icc')
            || isGroupRequested(includeTags, 'photoshop')
            || isGroupRequested(includeTags, 'makerNotes')
            || isGroupRequested(includeTags, 'thumbnail')
            || isGroupRequested(includeTags, 'gps')
            || isGroupRequested(includeTags, 'composite')
        );
    const shouldParseFile = hasIncludeTags && isGroupRequested(includeTags, 'composite');

    let exifIncludeDependencies = Object.create(null);
    if (hasIncludeTags) {
        exifIncludeDependencies = getExifIncludeDependencies(includeTags);
    }

    let fileIncludeDependencies = Object.create(null);
    if (hasIncludeTags && shouldParseFile) {
        fileIncludeDependencies = buildLowercasedNameMap(
            COMPOSITE_DEPENDENCY_TAGS.file
        );
    }

    for (const groupKey in FILTER_GROUPS) {
        const hasIncludeEntry =
            hasIncludeTags && Object.prototype.hasOwnProperty.call(includeTags, groupKey);
        const hasExcludeEntry =
            hasExcludeTags && Object.prototype.hasOwnProperty.call(excludeTags, groupKey);

        let excludeValue = undefined;
        if (hasExcludeEntry && !hasIncludeEntry) {
            excludeValue = excludeTags[groupKey];
        }

        const returnSelection = buildSelection({
            groupKey,
            includeValue: hasIncludeEntry ? includeTags[groupKey] : undefined,
            excludeValue,
            extraIncludeNames: Object.create(null),
        });

        shouldReturn[groupKey] = hasIncludeTags ? hasIncludeEntry : true;
        if (hasIncludeEntry && isEmptyArray(includeTags[groupKey])) {
            shouldReturn[groupKey] = false;
        }
        if (returnSelection.excludeAll) {
            shouldReturn[groupKey] = false;
        }

        returnSelections[groupKey] = returnSelection;

        const parseSelection = buildSelection({
            groupKey,
            includeValue: getParseIncludeValue({
                groupKey,
                hasIncludeTags,
                hasIncludeEntry,
                includeTags,
                shouldParseExif,
                shouldParseFile,
            }),
            excludeValue,
            extraIncludeNames: getExtraParseIncludeNames({
                groupKey,
                hasIncludeTags,
                hasIncludeEntry,
                shouldParseExif,
                shouldParseFile,
                exifIncludeDependencies,
                fileIncludeDependencies,
            }),
        });

        parseSelections[groupKey] = parseSelection;
    }

    return {
        isActive,
        shouldReturnGroup,
        shouldParseGroup,
        shouldReturnTag,
        shouldParseTag,
    };

    function shouldReturnGroup(groupKey) {
        if (!FILTER_GROUPS[groupKey]) {
            return true;
        }

        return !!shouldReturn[groupKey];
    }

    function shouldParseGroup(groupKey) {
        if (!FILTER_GROUPS[groupKey]) {
            return true;
        }

        if (shouldReturnGroup(groupKey)) {
            return true;
        }

        if (groupKey === 'exif') {
            return shouldParseExif;
        }
        if (groupKey === 'file') {
            return shouldParseFile;
        }

        return false;
    }

    function shouldReturnTag(groupKey, tagName, tagId) {
        if (!FILTER_GROUPS[groupKey]) {
            return true;
        }

        if (!shouldReturnGroup(groupKey)) {
            return false;
        }

        return matchesSelection(returnSelections[groupKey], tagName, tagId);
    }

    function shouldParseTag(groupKey, tagName, tagId) {
        if (!FILTER_GROUPS[groupKey]) {
            return true;
        }

        if (!shouldParseGroup(groupKey)) {
            return false;
        }

        return matchesSelection(parseSelections[groupKey], tagName, tagId);
    }
}

function createNoopFilter() {
    return {
        isActive: false,
        shouldReturnGroup: alwaysTrue,
        shouldParseGroup: alwaysTrue,
        shouldReturnTag: alwaysTrue,
        shouldParseTag: alwaysTrue,
    };

    function alwaysTrue() {
        return true;
    }
}

export const NOOP_TAG_FILTER = createNoopFilter();

function getExifIncludeDependencies(includeTags) {
    const requiredTags = getExifTagDependenciesForInclude(includeTags);

    if (isGroupRequested(includeTags, 'composite')) {
        addRequiredTags(requiredTags, COMPOSITE_DEPENDENCY_TAGS.exif);
    }

    return requiredTags;
}

function getParseIncludeValue({
    groupKey,
    hasIncludeTags,
    hasIncludeEntry,
    includeTags,
    shouldParseExif,
    shouldParseFile,
}) {
    if (!hasIncludeTags) {
        return true;
    }

    if (hasIncludeEntry) {
        if (
            groupKey === 'thumbnail'
            && Array.isArray(includeTags[groupKey])
        ) {
            return true;
        }

        return includeTags[groupKey];
    }

    if (groupKey === 'exif' && shouldParseExif) {
        return [];
    }
    if (groupKey === 'file' && shouldParseFile) {
        return [];
    }

    return undefined;
}

function getExtraParseIncludeNames({
    groupKey,
    hasIncludeTags,
    hasIncludeEntry,
    shouldParseExif,
    shouldParseFile,
    exifIncludeDependencies,
    fileIncludeDependencies,
}) {
    if (!hasIncludeTags) {
        return Object.create(null);
    }

    if (groupKey === 'exif') {
        if (shouldParseExif || (hasIncludeEntry && Object.keys(exifIncludeDependencies).length > 0)) {
            return exifIncludeDependencies;
        }
    }

    if (groupKey === 'file' && !hasIncludeEntry && shouldParseFile) {
        return fileIncludeDependencies;
    }

    return Object.create(null);
}

function isGroupRequested(includeTags, groupKey) {
    if (!includeTags || !Object.prototype.hasOwnProperty.call(includeTags, groupKey)) {
        return false;
    }

    const includeValue = includeTags[groupKey];
    if (includeValue === true) {
        return true;
    }

    return Array.isArray(includeValue) && includeValue.length > 0;
}

function isEmptyArray(value) {
    return Array.isArray(value) && value.length === 0;
}

function buildSelection({groupKey, includeValue, excludeValue, extraIncludeNames}) {
    const isIdCapable = !!ID_CAPABLE_GROUPS[groupKey];

    const selection = {
        includeAll: false,
        includeNames: undefined,
        includeIds: undefined,
        excludeAll: false,
        excludeNames: undefined,
        excludeIds: undefined,
    };

    if (includeValue === true) {
        selection.includeAll = true;
    } else if (Array.isArray(includeValue)) {
        selection.includeNames = Object.create(null);
        if (isIdCapable) {
            selection.includeIds = Object.create(null);
        }

        for (let i = 0; i < includeValue.length; i++) {
            addSelector(selection, includeValue[i]);
        }

        for (const extraName in extraIncludeNames) {
            selection.includeNames[extraName.toLowerCase()] = true;
        }
    } else if (extraIncludeNames && Object.keys(extraIncludeNames).length > 0) {
        selection.includeNames = Object.create(null);
        for (const extraName in extraIncludeNames) {
            selection.includeNames[extraName.toLowerCase()] = true;
        }
    }

    if (excludeValue === true) {
        selection.excludeAll = true;

        return selection;
    }

    if (Array.isArray(excludeValue)) {
        selection.excludeNames = Object.create(null);
        if (isIdCapable) {
            selection.excludeIds = Object.create(null);
        }

        for (let i = 0; i < excludeValue.length; i++) {
            addExcludeSelector(selection, excludeValue[i]);
        }
    }

    return selection;

    function addSelector(targetSelection, selector) {
        if (typeof selector === 'number' && targetSelection.includeIds) {
            targetSelection.includeIds[String(selector)] = true;

            return;
        }

        if (typeof selector === 'string') {
            targetSelection.includeNames[selector.toLowerCase()] = true;
        }
    }

    function addExcludeSelector(targetSelection, selector) {
        if (typeof selector === 'number' && targetSelection.excludeIds) {
            targetSelection.excludeIds[String(selector)] = true;

            return;
        }

        if (typeof selector === 'string') {
            targetSelection.excludeNames[selector.toLowerCase()] = true;
        }
    }
}

function matchesSelection(selection, tagName, tagId) {
    if (selection.excludeAll) {
        return false;
    }

    if (selection.includeAll) {
        return !isExcluded(selection, tagName, tagId);
    }

    if (!selection.includeNames && !selection.includeIds) {
        return !isExcluded(selection, tagName, tagId);
    }

    if (isIncluded(selection, tagName, tagId)) {
        return !isExcluded(selection, tagName, tagId);
    }

    return false;
}

function isIncluded(selection, tagName, tagId) {
    if (tagId !== undefined && selection.includeIds) {
        if (selection.includeIds[String(tagId)]) {
            return true;
        }
    }

    if (tagName && selection.includeNames) {
        if (selection.includeNames[String(tagName).toLowerCase()]) {
            return true;
        }
    }

    return false;
}

function isExcluded(selection, tagName, tagId) {
    if (tagId !== undefined && selection.excludeIds) {
        if (selection.excludeIds[String(tagId)]) {
            return true;
        }
    }

    if (tagName && selection.excludeNames) {
        if (selection.excludeNames[String(tagName).toLowerCase()]) {
            return true;
        }
    }

    return false;
}

function buildLowercasedNameMap(names) {
    const map = Object.create(null);

    for (let i = 0; i < names.length; i++) {
        map[names[i].toLowerCase()] = true;
    }

    return map;
}

function addRequiredTags(requiredTags, tags) {
    for (let i = 0; i < tags.length; i++) {
        requiredTags[tags[i]] = true;
    }
}
