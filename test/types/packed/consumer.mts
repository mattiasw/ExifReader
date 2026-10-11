/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Node gives an ES module only the default export of the UMD build.
import ExifReader from "exifreader";

const tags: ExifReader.Tags = ExifReader.load(new ArrayBuffer(0));
// @ts-expect-error
ExifReader.load(42);

export { tags };
