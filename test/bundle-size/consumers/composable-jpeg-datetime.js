/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// One Exif tag from JPEG, as createReader ships it.
import {createReader} from '../../../src/composable/core.js';
import {jpeg} from '../../../src/composable/formats.js';
import {DateTime} from '../../../src/composable/tags/exif.js';

export const reader = createReader({formats: [jpeg], tags: [DateTime]});
