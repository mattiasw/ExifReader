/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import NodeRequire from './node-require.js';

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
        const {DOMParser, onErrorStopParsing} = NodeRequire.optionalPackage('@xmldom/xmldom');
        return new DOMParser({onError: onErrorStopParsing});
    } catch (error) {
        return undefined;
    }
}
