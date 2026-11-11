/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// One Exif tag from JPEG, as createReader ships it.
import {createReader} from 'exifreader/core';
import {jpeg} from 'exifreader/formats';
import {DateTime} from 'exifreader/tags/exif';

export const reader = createReader({formats: [jpeg], tags: [DateTime]});
