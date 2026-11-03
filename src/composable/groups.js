/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {exif} from './groups/exif.js';
import {composedIptc as iptc} from './groups/iptc.js';
import {xmp} from './groups/xmp.js';
import {icc} from './groups/icc.js';
import {photoshop} from './groups/photoshop.js';
import {mpf} from './groups/mpf.js';
import {canon} from './groups/canon.js';
import {pentax} from './groups/pentax.js';
import {makerNotes} from './groups/maker-notes.js';
import {gps} from './groups/gps.js';
import {composite} from './groups/composite.js';
import {thumbnail} from './groups/thumbnail.js';

export {exif, iptc, xmp, icc, photoshop, mpf, canon, pentax, makerNotes, gps, composite, thumbnail};

// Without canon and pentax, since makerNotes is their union: leaving makerNotes
// out of this list leaves out every maker note.
export const allGroups = [exif, iptc, xmp, icc, photoshop, mpf, makerNotes, gps, composite, thumbnail];
