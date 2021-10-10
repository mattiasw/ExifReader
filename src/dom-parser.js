/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export default {
    get
};

function get() {
    if (typeof DOMParser !== 'undefined') {
        return DOMParser;
    }
    try {
        return __non_webpack_require__('@xmldom/xmldom').DOMParser; // eslint-disable-line no-undef
    } catch (error) {
        return undefined;
    }
}
