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
        return eval('require')('xmldom').DOMParser; // This stops Webpack from replacing the require with a generic import and bundling the module.
    } catch (error) {
        return undefined;
    }
}
