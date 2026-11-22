/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {tiff} from './formats/tiff.js';
import {jpeg} from './formats/jpeg.js';
import {png} from './formats/png.js';
import {heic} from './formats/heic.js';
import {avif} from './formats/avif.js';
import {jxl} from './formats/jxl.js';
import {webp} from './formats/webp.js';
import {gif} from './formats/gif.js';
import {xml} from './formats/xml.js';

export {tiff, jpeg, png, heic, avif, jxl, webp, gif, xml};

export const allFormats = [tiff, jpeg, png, heic, avif, jxl, webp, gif, xml];
