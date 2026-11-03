/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Jpeg from '../../image-header-jpeg.js';
import FileTags from '../../file-tags.js';
import JfifTags from '../../jfif-tags.js';
import {parsedTags} from '../group-helpers.js';

export const jpegHeader = {
    fileType: {value: 'jpeg', description: 'JPEG'},
    detect: (dataView) => Jpeg.isJpegFile(dataView),
    find: (dataView, ranges) => Jpeg.findJpegOffsets(dataView, ranges),
};

export const file = {
    key: 'file',
    consumes: ['file'],
    emits: [],
    read: readFileBlock,
    merge: () => ({slot: 'file', mode: 'assign'}),
};

export const jfif = {
    key: 'jfif',
    consumes: ['jfif'],
    emits: [],
    read: (block, ctx) => parsedTags('jfif', JfifTags.read(ctx.dataView, block.dataOffset), ctx),
    merge: () => ({slot: 'jfif', mode: 'assign'}),
};

export const jpeg = {
    header: jpegHeader,
    readers: [file, jfif],
};

function readFileBlock(block, ctx) {
    if (!shouldReadFileTagsForFileTypeOnlyOptimization(ctx.options.includeTags)) {
        return undefined;
    }
    return parsedTags('file', FileTags.read(ctx.dataView, block.dataOffset), ctx);
}

function shouldReadFileTagsForFileTypeOnlyOptimization(includeTagsOptions) {
    if (!includeTagsOptions) {
        return true;
    }
    const {composite, file: fileTagNames} = includeTagsOptions;
    if (composite === true || (Array.isArray(composite) && composite.length > 0)) {
        return true;
    }
    return !(Array.isArray(fileTagNames) && fileTagNames.length === 1 && fileTagNames[0] === 'FileType');
}
