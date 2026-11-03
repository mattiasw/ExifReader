/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// No groups and no tags: the smallest JPEG reader createReader builds.
import {createReader} from '../../../src/composable/core.js';
import {jpeg} from '../../../src/composable/formats.js';

export const reader = createReader({formats: [jpeg]});
