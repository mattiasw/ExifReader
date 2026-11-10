/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Composite from '../../composite.js';
import {GROUP_BRAND} from '../brand.js';

// Derived from the Exif and XMP tags, so it reads no block.
export const composite = {
    key: 'composite',
    consumes: [],
    emits: [],
    merge: () => ({slot: 'composite', mode: 'composite'}),
    mergeDeps: {Composite},
    brand: GROUP_BRAND,
};
