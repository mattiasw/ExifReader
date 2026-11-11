/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The whole Exif group from JPEG.
import {createReader} from 'exifreader/core';
import {jpeg} from 'exifreader/formats';
import {exif} from 'exifreader/groups';

export const reader = createReader({formats: [jpeg], groups: [exif]});
