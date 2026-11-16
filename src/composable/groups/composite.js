/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Composite from '../../composite.js';
import {GROUP_BRAND} from '../brand.js';
import {mergeAssignGroup} from '../../loadview-pipeline.js';

// Derived from the Exif and XMP tags, so it reads no block.
export const composite = {
    key: 'composite',
    consumes: [],
    emits: [],
    merge: () => ({slot: 'composite', mode: 'composite'}),
    mergeModes: {composite: addCompositeGroup},
    brand: GROUP_BRAND,
};

// Composite reads the merged tags, or with an active tag filter the parsed exif
// and file groups, or in a flat load under a read cap every parsed tag block.
function addCompositeGroup(tags, block, context) {
    if (!context.tagFilter.shouldReturnGroup('composite')) {
        return tags;
    }

    let compositeInput = tags;
    let compositeInputExpanded = context.expanded;
    if (context.compositeInput) {
        compositeInput = context.compositeInput;
    } else if (context.tagFilter.isActive) {
        compositeInput = {exif: context.parsedGroups.exif, file: context.parsedGroups.file};
        compositeInputExpanded = true;
    }

    const compositeTags = Composite.get(compositeInput, compositeInputExpanded);
    if (!compositeTags) {
        return tags;
    }

    const returnedCompositeTags = context.deps.filterTagsForReturn('composite', compositeTags, context.tagFilter);

    return mergeAssignGroup(tags, 'composite', returnedCompositeTags, context.expanded, context.deps);
}
