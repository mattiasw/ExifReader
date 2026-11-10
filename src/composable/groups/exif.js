/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign} from '../../utils.js';
import TagNames0thIfd from '../../tag-names-0th-ifd.js';
import TagNamesExifIfd from '../../tag-names-exif-ifd.js';
import TagNamesGpsIfd from '../../tag-names-gps-ifd.js';
import TagNamesInteroperabilityIfd from '../../tag-names-interoperability-ifd.js';
import {IFD_TYPE_0TH, IFD_TYPE_1ST, IFD_TYPE_EXIF, IFD_TYPE_GPS, IFD_TYPE_INTEROPERABILITY} from '../../ifd-types.js';
import {EXIF_EMITTED_KINDS, readExifBlock, getExifMergeDescriptor} from '../exif-block-reader.js';
import {GROUP_BRAND} from '../brand.js';

// Merged on the first read rather than at import, so that a bundle without
// this group drops the dictionaries.
let tagNames0thAndExifIfds;

export const exif = {
    key: 'exif',
    consumes: ['exif'],
    emits: EXIF_EMITTED_KINDS,
    read: (block, ctx) => readExifBlock(block, ctx, getExifTagNames(ctx)),
    merge: getExifMergeDescriptor,
    brand: GROUP_BRAND,
};

// Only the IFDs Tags.read walks; the MPF and maker note readers carry their own
// dictionaries. The thumbnail one must be there whenever the thumbnail IFD is
// read, since reading an IFD without its dictionary throws.
function getExifTagNames(ctx) {
    // Assigned rather than computed keys, which Babel compiles to a helper call each.
    const tagNames = {};
    tagNames[IFD_TYPE_0TH] = getTagNames0thAndExifIfds();
    tagNames[IFD_TYPE_EXIF] = getTagNames0thAndExifIfds();
    tagNames[IFD_TYPE_GPS] = TagNamesGpsIfd;
    tagNames[IFD_TYPE_INTEROPERABILITY] = TagNamesInteroperabilityIfd;
    if (ctx.composed.groups.thumbnail) {
        tagNames[IFD_TYPE_1ST] = TagNames0thIfd;
    }
    return tagNames;
}

function getTagNames0thAndExifIfds() {
    if (tagNames0thAndExifIfds === undefined) {
        tagNames0thAndExifIfds = objectAssign({}, TagNames0thIfd, TagNamesExifIfd);
    }
    return tagNames0thAndExifIfds;
}
