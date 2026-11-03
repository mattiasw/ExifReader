/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Composite from '../../composite.js';

// Derived from the Exif and XMP tags, so it reads no block.
export const composite = {
    key: 'composite',
    consumes: [],
    emits: [],
    descriptors: [],
    merge: () => ({slot: 'composite', mode: 'composite'}),
    mergeDeps: {Composite},
};
