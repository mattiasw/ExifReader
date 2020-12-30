/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringValue} from './tag-names-utils.js';

export default {
    0xb000: {
        'name': 'MPFVersion',
        'description': (value) => getStringValue(value)
    },
    0xb001: 'NumberOfImages',
    0xb002: 'MPEntry',
    0xb003: 'ImageUIDList',
    0xb004: 'TotalFrames'
};
