/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign} from './utils.js';
import Constants from './constants.js';
import TagNames0thIfd from './tag-names-0th-ifd.js';
import TagNamesExifIfd from './tag-names-exif-ifd.js';
import TagNamesGpsIfd from './tag-names-gps-ifd.js';
import TagNamesInteroperabilityIfd from './tag-names-interoperability-ifd.js';
import TagNamesMpfIfd from './tag-names-mpf-ifd.js';
import TagNamesCanonIfd from './tag-names-canon-ifd.js';
import TagNamesPentaxIfd from './tag-names-pentax-ifd.js';
import {
    IFD_TYPE_0TH,
    IFD_TYPE_1ST,
    IFD_TYPE_EXIF,
    IFD_TYPE_GPS,
    IFD_TYPE_INTEROPERABILITY,
    IFD_TYPE_MPF,
    IFD_TYPE_CANON,
    IFD_TYPE_PENTAX
} from './ifd-types.js';

const tagNames0thExifIfds = Constants.USE_EXIF ? objectAssign({}, TagNames0thIfd, TagNamesExifIfd) : {};

export {
    IFD_TYPE_0TH,
    IFD_TYPE_1ST,
    IFD_TYPE_EXIF,
    IFD_TYPE_GPS,
    IFD_TYPE_INTEROPERABILITY,
    IFD_TYPE_MPF,
    IFD_TYPE_CANON,
    IFD_TYPE_PENTAX
};

export default {
    [IFD_TYPE_0TH]: tagNames0thExifIfds,
    [IFD_TYPE_1ST]: Constants.USE_EXIF ? TagNames0thIfd : {},
    [IFD_TYPE_EXIF]: tagNames0thExifIfds,
    [IFD_TYPE_GPS]: Constants.USE_EXIF ? TagNamesGpsIfd : {},
    [IFD_TYPE_INTEROPERABILITY]: Constants.USE_EXIF ? TagNamesInteroperabilityIfd : {},
    [IFD_TYPE_MPF]: Constants.USE_MPF ? TagNamesMpfIfd : {},
    [IFD_TYPE_CANON]: Constants.USE_MAKER_NOTES ? TagNamesCanonIfd : {},
    [IFD_TYPE_PENTAX]: Constants.USE_MAKER_NOTES ? TagNamesPentaxIfd : {},
};
