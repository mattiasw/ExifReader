/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Specification: https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/

import {getDataView, getStringFromDataView, getPascalStringFromDataView} from './utils.js';
import Types from './types.js';
import TagNames from './photoshop-tag-names.js';

export default {
    read
};

const SIGNATURE = '8BIM';
const TAG_ID_SIZE = 2;
const RESOURCE_LENGTH_SIZE = 4;

const SIGNATURE_SIZE = SIGNATURE.length;

function read(bytes, includeUnknown) {
    const dataView = getDataView(new Uint8Array(bytes).buffer);
    const tags = {};
    let offset = 0;

    while (offset < bytes.length) {
        const signature = getStringFromDataView(dataView, offset, SIGNATURE_SIZE);
        offset += SIGNATURE_SIZE;
        const tagId = Types.getShortAt(dataView, offset);
        offset += TAG_ID_SIZE;
        const {tagName, tagNameSize} = getTagName(dataView, offset);
        offset += tagNameSize;
        const resourceSize = Types.getLongAt(dataView, offset);
        offset += RESOURCE_LENGTH_SIZE;
        if (signature === SIGNATURE) {
            const valueDataView = getDataView(dataView.buffer, offset, resourceSize);
            const tag = {
                id: tagId,
                value: getStringFromDataView(valueDataView, 0, resourceSize),
            };
            if (TagNames[tagId]) {
                try {
                    tag.description = TagNames[tagId].description(valueDataView);
                } catch (error) {
                    tag.description = '<no description formatter>';
                }
                tags[tagName ? tagName : TagNames[tagId].name] = tag;
            } else if (includeUnknown) {
                tags[`undefined-${tagId}`] = tag;
            }
        }
        offset += resourceSize + (resourceSize % 2);
    }

    return tags;
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
