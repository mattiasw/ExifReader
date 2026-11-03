/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The JS identifier a tag name is exported as: the name split into words on
 * every non-identifier character, each word's first letter upper-cased.
 *
 * @param {string} name A tag name as the dictionaries give it.
 * @returns {string}
 */
export function getTagBindingName(name) {
    return name.split(/[^A-Za-z0-9_$]+/)
        .filter((word) => word !== '')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
}
