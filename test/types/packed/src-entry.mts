/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import ExifReader from "exifreader/src/exif-reader";
import { load } from "exifreader/src/exif-reader.js";
import type { Tags } from "exifreader/src/exif-reader.js";
import ReadmeExifReader from "./node_modules/exifreader/src/exif-reader.js";

const tags: ExifReader.Tags = ExifReader.load(new ArrayBuffer(0));
const namedTags: Tags = load(new ArrayBuffer(0));
const readmeTags: ReadmeExifReader.Tags = ReadmeExifReader.load(new ArrayBuffer(0));
// @ts-expect-error
ExifReader.load(42);
// @ts-expect-error
ReadmeExifReader.load(42);

export { tags, namedTags, readmeTags };
