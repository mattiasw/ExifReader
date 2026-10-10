/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Specification: https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/

import {getByteString, getDataView, getStringFromDataView, getPascalStringFromDataView, getTagKey, setProperty} from './utils.js';
import Types from './types.js';
import TagNames, {MAX_PATH_RECORDS} from './photoshop-tag-names.js';
import {NOOP_TAG_FILTER} from './tag-filter.js';

export default {
    read
};

const SIGNATURE = '8BIM';
const TAG_ID_SIZE = 2;
const RESOURCE_LENGTH_SIZE = 4;

const SIGNATURE_SIZE = SIGNATURE.length;
const TAG_NAME_MIN_SIZE = 2;
const RESOURCE_BLOCK_MIN_HEADER_SIZE = SIGNATURE_SIZE + TAG_ID_SIZE + TAG_NAME_MIN_SIZE + RESOURCE_LENGTH_SIZE;

// Photoshop defines about 2,100 resource ids and real files carry a few dozen,
// so the cap never cuts a genuine file.
export const MAX_RESOURCES = 4096;

function read(bytes, includeUnknown, tagFilter = NOOP_TAG_FILTER) {
    if (!Array.isArray(bytes)) {
        return {};
    }
    const byteArray = new Uint8Array(bytes);
    const dataView = getDataView(byteArray.buffer);
    const pathRecordBudget = {remaining: MAX_PATH_RECORDS};
    const tags = {};
    let offset = 0;

    for (
        let resourceCount = 0;
        resourceCount < MAX_RESOURCES && offset + RESOURCE_BLOCK_MIN_HEADER_SIZE <= dataView.byteLength;
        resourceCount++
    ) {
        const signature = getStringFromDataView(dataView, offset, SIGNATURE_SIZE);
        offset += SIGNATURE_SIZE;
        const tagId = Types.getShortAt(dataView, offset);
        offset += TAG_ID_SIZE;
        const {tagName, tagNameSize} = getTagName(dataView, offset);
        offset += tagNameSize;
        if (offset + RESOURCE_LENGTH_SIZE > dataView.byteLength) {
            break;
        }
        const declaredResourceSize = Types.getLongAt(dataView, offset);
        offset += RESOURCE_LENGTH_SIZE;
        // The declared size comes from the file and is not trusted, so bound
        // it by the bytes that are actually present.
        const resourceSize = Math.min(declaredResourceSize, dataView.byteLength - offset);
        if (signature === SIGNATURE) {
            const tagKey = getResourceTagKey(tagId, tagName);
            if (!tagFilter.shouldParseTag('photoshop', tagKey, tagId)) {
                offset += resourceSize + (resourceSize % 2);
                continue;
            }

            const valueDataView = getDataView(dataView.buffer, offset, resourceSize);
            const tag = {
                id: tagId,
                value: getByteString(byteArray, offset, offset + resourceSize),
            };
            if (TagNames[tagId]) {
                try {
                    tag.description = TagNames[tagId].description(valueDataView, pathRecordBudget);
                } catch (error) {
                    tag.description = '<no description formatter>';
                }
                setProperty(tags, tagKey, tag);
            } else if (includeUnknown) {
                tags[tagKey] = tag;
            }
        }
        offset += resourceSize + (resourceSize % 2);
    }

    return tags;
}

function getResourceTagKey(tagId, tagName) {
    if (TagNames[tagId]) {
        return getTagKey(tagName || TagNames[tagId].name);
    }
    return `undefined-${tagId}`;
}

function getTagName(dataView, offset) {
    // The name is encoded as a Pascal string (the string is prefixed with one
    // byte containing the length of the string) and everything is padded with a
    // null byte to make the size even.
    const [stringSize, string] = getPascalStringFromDataView(dataView, offset);
    return {
        tagName: string,
        tagNameSize: 1 + stringSize + (stringSize % 2 === 0 ? 1 : 0)
    };
}
