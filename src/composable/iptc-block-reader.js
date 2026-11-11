/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign} from '../utils.js';
import {readIptcTags} from '../iptc-tags.js';
import {createIptcGroup, withRepeatableAsArrays} from './groups/iptc.js';
import {IPTCNAA} from './tags/exif.js';

// The generated IPTC tag descriptors link to this, so a createReader bundle
// carries IPTC parsing only when it composes one.
export const iptcBlockReader = {createParseOnlyGroup, isDescriptor};

/**
 * An iptc group that reads and returns the datasets of the given descriptors
 * only, with the unknown datasets left out whatever includeUnknown says.
 *
 * @param {Array<object>} descriptors Generated IPTC tag descriptors.
 * @returns {object} An engine group keyed iptc, with the Exif tag that carries
 *     IPTC as its Exif dependency.
 */
function createParseOnlyGroup(descriptors) {
    const tagNames = getTagNames(descriptors);
    const readWithTagNames = (view, dataOffset, includeUnknown, tagFilter, valueBudget) => withRepeatableAsArrays(
        readIptcTags(view, dataOffset, tagNames, false, tagFilter, valueBudget),
        tagNames
    );
    return objectAssign(createIptcGroup(readWithTagNames), {exifDependencies: [IPTCNAA]});
}

// In the iptc dictionary's own shape.
function getTagNames(descriptors) {
    const tagNames = {};
    descriptors.forEach((descriptor) => {
        descriptor.ids.forEach((id) => {
            tagNames[id] = {name: descriptor.name, description: descriptor.description, repeatable: descriptor.repeatable};
        });
    });
    return tagNames;
}

function isDescriptor(tag) {
    return tag.group === 'iptc' && tag.dictionary === 'iptc';
}
