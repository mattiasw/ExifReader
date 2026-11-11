/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import ExifReader from "exifreader/dist/exif-reader";
import type { Tags } from "exifreader/dist/exif-reader.js";

const tags: Tags = ExifReader.load(new ArrayBuffer(0));
// @ts-expect-error
ExifReader.load(42);

export { tags };
