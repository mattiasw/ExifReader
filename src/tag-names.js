/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {objectAssign} from './utils.js';
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

const tagNames0thExifIfds = objectAssign({}, TagNames0thIfd, TagNamesExifIfd);

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
    [IFD_TYPE_1ST]: TagNames0thIfd,
    [IFD_TYPE_EXIF]: tagNames0thExifIfds,
    [IFD_TYPE_GPS]: TagNamesGpsIfd,
    [IFD_TYPE_INTEROPERABILITY]: TagNamesInteroperabilityIfd,
    [IFD_TYPE_MPF]: TagNamesMpfIfd,
    [IFD_TYPE_CANON]: TagNamesCanonIfd,
    [IFD_TYPE_PENTAX]: TagNamesPentaxIfd,
};
