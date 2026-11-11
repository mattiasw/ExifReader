/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The default entry as a stock bundler resolves it, everything included.
import ExifReader from 'exifreader';

export function loadTags(buffer) {
    return ExifReader.load(buffer);
}
