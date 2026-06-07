/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Types from './types.js';
import {
    getPascalStringFromDataView,
    padStart,
    parseFloatRadix,
    strRepeat
} from './utils.js';

export const PathRecordTypes = {
    CLOSED_SUBPATH_LENGTH: 0,
    CLOSED_SUBPATH_BEZIER_LINKED: 1,
    CLOSED_SUBPATH_BEZIER_UNLINKED: 2,
    OPEN_SUBPATH_LENGTH: 3,
    OPEN_SUBPATH_BEZIER_LINKED: 4,
    OPEN_SUBPATH_BEZIER_UNLINKED: 5,
    FILL_RULE: 6,
    CLIPBOARD: 7,
    INITIAL_FILL_RULE: 8
};

const PATH_RECORD_SIZE = 24;

export default {
    0x07d0: {
        name: 'PathInformation',
        description: pathResource
    },
    0x0bb7: {
        name: 'ClippingPathName',
        description(dataView) {
            const [, string] = getPascalStringFromDataView(dataView, 0);
            return string;
        }
    },
};

function pathResource(dataView) {
    const TYPE_SIZE = 2;
    const types = {};
    const paths = [];

    for (let offset = 0; offset < dataView.byteLength; offset += TYPE_SIZE + PATH_RECORD_SIZE) {
        const type = Types.getShortAt(dataView, offset);
        if (PATH_RECORD_TYPES[type]) {
            if (!types[type]) {
                types[type] = PATH_RECORD_TYPES[type].description;
            }
            paths.push({
                type,
                path: PATH_RECORD_TYPES[type].path(dataView, offset + TYPE_SIZE)
            });
        }
    }
    return JSON.stringify({types, paths});
}

const PATH_RECORD_TYPES = {
    [PathRecordTypes.CLOSED_SUBPATH_LENGTH]: {
        description: 'Closed subpath length',
        path: (dataView, offset) => [Types.getShortAt(dataView, offset)]
    },
    [PathRecordTypes.CLOSED_SUBPATH_BEZIER_LINKED]: {
        description: 'Closed subpath Bezier knot, linked',
        path: parseBezierKnot
    },
    [PathRecordTypes.CLOSED_SUBPATH_BEZIER_UNLINKED]: {
        description: 'Closed subpath Bezier knot, unlinked',
        path: parseBezierKnot
    },
    [PathRecordTypes.OPEN_SUBPATH_LENGTH]: {
        description: 'Open subpath length',
        path: (dataView, offset) => [Types.getShortAt(dataView, offset)]
    },
    [PathRecordTypes.OPEN_SUBPATH_BEZIER_LINKED]: {
        description: 'Open subpath Bezier knot, linked',
        path: parseBezierKnot
    },
    [PathRecordTypes.OPEN_SUBPATH_BEZIER_UNLINKED]: {
        description: 'Open subpath Bezier knot, unlinked',
        path: parseBezierKnot
    },
    [PathRecordTypes.FILL_RULE]: {
        description: 'Path fill rule',
        path: () => []
    },
    [PathRecordTypes.INITIAL_FILL_RULE]: {
        description: 'Initial fill rule',
        path: (dataView, offset) => [Types.getShortAt(dataView, offset)]
    },
    [PathRecordTypes.CLIPBOARD]: {
        description: 'Clipboard',
        path: parseClipboard
    }
};

function parseBezierKnot(dataView, offset) {
    const PATH_POINT_SIZE = 8;
    const path = [];
    for (let i = 0; i < PATH_RECORD_SIZE; i += PATH_POINT_SIZE) {
        path.push(parsePathPoint(dataView, offset + i));
    }
    return path;
}

function parsePathPoint(dataView, offset) {
    const vertical = getFixedPointNumber(dataView, offset, 8);
    const horizontal = getFixedPointNumber(dataView, offset + 4, 8);
    return [horizontal, vertical];
}

function parseClipboard(dataView, offset) {
    return [
        [
            getFixedPointNumber(dataView, offset, 8), // Top
            getFixedPointNumber(dataView, offset + 4, 8), // Left
            getFixedPointNumber(dataView, offset + 8, 8), // Botton
            getFixedPointNumber(dataView, offset + 12, 8), // Right
        ],
        getFixedPointNumber(dataView, offset + 16, 8) // Resolution
    ];
}

function getFixedPointNumber(dataView, offset, binaryPoint) {
    const number = Types.getLongAt(dataView, offset);

    const sign = (number >>> 31) === 0 ? 1 : -1;
    const integer = (number & 0x7f000000) >>> (32 - binaryPoint);
    const fraction = number & parseInt(strRepeat('1', 32 - binaryPoint), 2);

    return sign * parseFloatRadix(integer.toString(2) + '.' + padStart(fraction.toString(2), 32 - binaryPoint, '0'), 2);
}
