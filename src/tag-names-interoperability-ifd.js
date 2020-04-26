/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringValue} from './tag-names-utils.js';

export default {
    0x0001: 'InteroperabilityIndex',
    0x0002: {
        name: 'InteroperabilityVersion',
        description: (value) => getStringValue(value)
    },
    0x1000: 'RelatedImageFileFormat',
    0x1001: 'RelatedImageWidth',
    0x1002: 'RelatedImageHeight'
};
