/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Types from './types.js';

export default {
    read
};

function read(dataView, jfifDataOffset) {
    const length = getLength(dataView, jfifDataOffset);
    const thumbnailWidth = getThumbnailWidth(dataView, jfifDataOffset, length);
    const thumbnailHeight = getThumbnailHeight(dataView, jfifDataOffset, length);
    const tags = {
        'JFIF Version': getVersion(dataView, jfifDataOffset, length),
        'Resolution Unit': getResolutionUnit(dataView, jfifDataOffset, length),
        'XResolution': getXResolution(dataView, jfifDataOffset, length),
        'YResolution': getYResolution(dataView, jfifDataOffset, length),
        'JFIF Thumbnail Width': thumbnailWidth,
        'JFIF Thumbnail Height': thumbnailHeight
    };

    if (thumbnailWidth !== undefined && thumbnailHeight !== undefined) {
        const thumbnail = getThumbnail(dataView, jfifDataOffset, 3 * thumbnailWidth.value * thumbnailHeight.value, length);
        if (thumbnail) {
            tags['JFIF Thumbnail'] = thumbnail;
        }
    }

    for (const tagName in tags) {
        if (tags[tagName] === undefined) {
            delete tags[tagName];
        }
    }

    return tags;
}

function getLength(dataView, jfifDataOffset) {
    return Types.getShortAt(dataView, jfifDataOffset);
}

function getVersion(dataView, jfifDataOffset, length) {
    const OFFSET = 7;
    const SIZE = 2;

    if (OFFSET + SIZE > length) {
        return undefined;
    }

    const majorVersion = Types.getByteAt(dataView, jfifDataOffset + OFFSET);
    const minorVersion = Types.getByteAt(dataView, jfifDataOffset + OFFSET + 1);
    return {
        value: majorVersion * 0x100 + minorVersion,
        description: majorVersion + '.' + minorVersion
    };
}

function getResolutionUnit(dataView, jfifDataOffset, length) {
    const OFFSET = 9;
    const SIZE = 1;

    if (OFFSET + SIZE > length) {
        return undefined;
    }

    const value = Types.getByteAt(dataView, jfifDataOffset + OFFSET);
    return {
        value,
        description: getResolutionUnitDescription(value)
    };
}

function getResolutionUnitDescription(value) {
    if (value === 0) {
        return 'None';
    }
    if (value === 1) {
        return 'inches';
    }
    if (value === 2) {
        return 'cm';
    }
    return 'Unknown';
}

function getXResolution(dataView, jfifDataOffset, length) {
    const OFFSET = 10;
    const SIZE = 2;

    if (OFFSET + SIZE > length) {
        return undefined;
    }

    const value = Types.getShortAt(dataView, jfifDataOffset + OFFSET);
    return {
        value,
        description: '' + value
    };
}

function getYResolution(dataView, jfifDataOffset, length) {
    const OFFSET = 12;
    const SIZE = 2;

    if (OFFSET + SIZE > length) {
        return undefined;
    }

    const value = Types.getShortAt(dataView, jfifDataOffset + OFFSET);
    return {
        value,
        description: '' + value
    };
}

function getThumbnailWidth(dataView, jfifDataOffset, length) {
    const OFFSET = 14;
    const SIZE = 1;

    if (OFFSET + SIZE > length) {
        return undefined;
    }

    const value = Types.getByteAt(dataView, jfifDataOffset + OFFSET);
    return {
        value,
        description: `${value}px`
    };
}

function getThumbnailHeight(dataView, jfifDataOffset, length) {
    const OFFSET = 15;
    const SIZE = 1;

    if (OFFSET + SIZE > length) {
        return undefined;
    }

    const value = Types.getByteAt(dataView, jfifDataOffset + OFFSET);
    return {
        value,
        description: `${value}px`
    };
}

function getThumbnail(dataView, jfifDataOffset, thumbnailLength, length) {
    const OFFSET = 16;

    if (thumbnailLength === 0 || OFFSET + thumbnailLength > length) {
        return undefined;
    }

    const value = dataView.buffer.slice(jfifDataOffset + OFFSET, jfifDataOffset + OFFSET + thumbnailLength);
    return {
        value,
        description: '<24-bit RGB pixel data>'
    };
}
