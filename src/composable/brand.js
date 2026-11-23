/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Each brand marks the kind of value createReader accepts and is equal in every
// copy of this module, so separately bundled subpaths combine. Change a value if
// a format or group of an older release stops working with a newer createReader.
export const FORMAT_BRAND = 'exifreader.format';
export const GROUP_BRAND = 'exifreader.group';
export const FILTER_BRAND = 'exifreader.tagFilter';
