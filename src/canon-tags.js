/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Reverse-engineered docs:
// https://exiftool.org/makernote_types.html
// https://exiv2.org/makernote.html
// https://exiv2.org/tags-canon.html
// https://gist.github.com/redaktor/bae0ef2377ab70bc5276
// https://www.ozhiker.com/electronics/pjmt/jpeg_info/canon_mn.html

import {objectAssign} from './utils.js';
import {readIfd} from './tags-helpers.js';
import {IFD_TYPE_CANON} from './tag-names.js';

const SHOT_INFO_AUTO_ROTATE = 27; // First position is size.

export default {
    read,
    SHOT_INFO_AUTO_ROTATE
};

function read(dataView, tiffHeaderOffset, offset, byteOrder, includeUnknown) {
    let tags = readIfd(dataView, IFD_TYPE_CANON, tiffHeaderOffset, tiffHeaderOffset + offset, byteOrder, includeUnknown);

    if (tags['ShotInfo']) {
        tags = objectAssign({}, tags, parseShotInfo(tags['ShotInfo'].value));
        delete tags['ShotInfo'];
    }

    return tags;
}

function parseShotInfo(shotInfoData) {
    const tags = {};

    if (shotInfoData[SHOT_INFO_AUTO_ROTATE] !== undefined) {
        tags['AutoRotate'] = {
            value: shotInfoData[SHOT_INFO_AUTO_ROTATE],
            description: getAutoRotateDescription(shotInfoData[SHOT_INFO_AUTO_ROTATE])
        };
    }

    return tags;
}

function getAutoRotateDescription(autoRotate) {
    if (autoRotate === 0) {
        return 'None';
    }
    if (autoRotate === 1) {
        return 'Rotate 90 CW';
    }
    if (autoRotate === 2) {
        return 'Rotate 180';
    }
    if (autoRotate === 3) {
        return 'Rotate 270 CW';
    }
    return 'Unknown';
}
