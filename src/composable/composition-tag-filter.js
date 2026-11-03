/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {NOOP_TAG_FILTER} from '../tag-filter.js';
import {FILTER_GROUPS, EXIF_POINTER_TAGS, addExifTagNamePointers} from '../tag-filter-config.js';

/**
 * Builds the filter a reader composed without the tag filter runs with. For
 * the includeTags configs createReader builds from a composition it gives the
 * verdicts createTagFilter gives with includeTagsIsLimit, without its
 * name-based selection of the caller's includeTags and excludeTags.
 *
 * @param {object|undefined} includeTags `file` and the composed format
 *     readers' and groups' keys set to true, and `exif` set to true or to the
 *     tag descriptors' names.
 * @param {Array<string>} exifDependencies The Exif tag names the composed
 *     groups read their data from.
 * @returns {object} The filter, NOOP_TAG_FILTER without includeTags.
 */
export function createCompositionTagFilter(includeTags, exifDependencies) {
    if (!includeTags) {
        return NOOP_TAG_FILTER;
    }

    const exifNames = Array.isArray(includeTags.exif) ? includeTags.exif : [];
    const exifReturnNames = getLowercasedNames(exifNames);
    const exifParseNames = getLowercasedNames(exifNames.concat(exifDependencies, getExifPointerNames(includeTags, exifNames)));

    return {
        isActive: true,
        shouldReturnGroup,
        shouldParseGroup,
        shouldReturnTag,
        shouldParseTag,
    };

    function shouldReturnGroup(groupKey) {
        return !FILTER_GROUPS[groupKey] || Object.prototype.hasOwnProperty.call(includeTags, groupKey);
    }

    function shouldParseGroup(groupKey) {
        return shouldReturnGroup(groupKey) || (groupKey === 'exif' && exifDependencies.length > 0);
    }

    function shouldReturnTag(groupKey, tagName) {
        if (!FILTER_GROUPS[groupKey]) {
            return true;
        }
        return shouldReturnGroup(groupKey) && matchesNames(includeTags[groupKey], exifReturnNames, tagName);
    }

    function shouldParseTag(groupKey, tagName) {
        if (!FILTER_GROUPS[groupKey]) {
            return true;
        }
        if (groupKey !== 'exif') {
            return includeTags[groupKey] === true;
        }
        return shouldParseGroup(groupKey) && matchesNames(includeTags.exif, exifParseNames, tagName);
    }
}

function getLowercasedNames(names) {
    const lowercased = Object.create(null);
    for (let i = 0; i < names.length; i++) {
        lowercased[names[i].toLowerCase()] = true;
    }
    return lowercased;
}

// The pointers to the IFDs the descriptors and the groups' dependencies are in.
// The parse names are read only when there are descriptors or dependencies, so
// the Exif IFD pointer needs no condition.
function getExifPointerNames(includeTags, exifNames) {
    const pointers = Object.create(null);
    pointers[EXIF_POINTER_TAGS.exifIfdPointer] = true;
    if (Object.prototype.hasOwnProperty.call(includeTags, 'gps')) {
        pointers[EXIF_POINTER_TAGS.gpsInfoIfdPointer] = true;
    }
    for (let i = 0; i < exifNames.length; i++) {
        addExifTagNamePointers(pointers, exifNames[i]);
    }
    return Object.keys(pointers);
}

function matchesNames(includeValue, lowercasedNames, tagName) {
    return includeValue === true || (!!tagName && lowercasedNames[String(tagName).toLowerCase()] === true);
}
