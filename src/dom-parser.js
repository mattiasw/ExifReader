/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export default {
    get
};

function get(domParser) {
    if (domParser) {
        return domParser;
    }

    if (typeof DOMParser !== 'undefined') {
        return new DOMParser();
    }
    try {
        // eslint-disable-next-line no-undef
        const {DOMParser, onErrorStopParsing} = __non_webpack_require__('@xmldom/xmldom');
        return new DOMParser({onError: onErrorStopParsing});
    } catch (error) {
        return undefined;
    }
}
