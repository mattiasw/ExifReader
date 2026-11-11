/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// No groups and no tags: the smallest TIFF reader createReader builds.
import {createReader} from 'exifreader/core';
import {tiff} from 'exifreader/formats';

export const reader = createReader({formats: [tiff]});
