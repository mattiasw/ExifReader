/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// One IPTC tag from JPEG, as createReader ships it.
import {createReader} from 'exifreader/core';
import {jpeg} from 'exifreader/formats';
import {ByLine} from 'exifreader/tags/iptc';

export const reader = createReader({formats: [jpeg], tags: [ByLine]});
