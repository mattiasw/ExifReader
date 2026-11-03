/**
 * ExifReader
 * http://github.com/mattiasw/exifreader
 * Copyright (C) 2011-2026  Mattias Wallander <mattias@wallander.eu>
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {objectAssign, getDataViewFromBytes, assertPromiseSupport} from './utils.js';
import {isFilePathOrURL, isBrowserFileObject, loadFile, loadFileObject} from './file-loaders.js';
import {makeLoadAuto, validateAutoOptions} from './load-auto.js';
import Constants from './constants.js';
import {getBase64Image} from './base64-image.js';
import DOMParser from './dom-parser.js';
import exifErrors from './errors.js';
import Composition from './composable/composition.js';
import {readView} from './composable/read-view.js';
import {createTagFilter} from './tag-filter.js';
import {tiff} from './composable/formats/tiff.js';
import {jpegHeader, file, jfif} from './composable/formats/jpeg.js';
import {pngHeader, pngFile, pngText, pngChunk} from './composable/formats/png.js';
import {heic} from './composable/formats/heic.js';
import {avif} from './composable/formats/avif.js';
import {jxl} from './composable/formats/jxl.js';
import {webp} from './composable/formats/webp.js';
import {gif} from './composable/formats/gif.js';
import {xml} from './composable/formats/xml.js';
import {exif} from './composable/groups/exif.js';
import {iptc} from './composable/groups/iptc.js';
import {xmp} from './composable/groups/xmp.js';
import {icc} from './composable/groups/icc.js';
import {photoshop} from './composable/groups/photoshop.js';
import {mpf} from './composable/groups/mpf.js';
import {makerNotes} from './composable/groups/maker-notes.js';
import {gps} from './composable/groups/gps.js';
import {composite} from './composable/groups/composite.js';
import {thumbnail} from './composable/groups/thumbnail.js';

export default {
    load,
    loadView,
    errors: exifErrors,
};

// Composing costs more than a small load, so the composition is kept until the
// tables change; they only do when the unit tests swap the Constants.
let defaultComposition;
let defaultCompositionEntries;

// Builds the default composition once at import, so that a cycle in the
// groups' emission graph throws here rather than on the first load.
getDefaultComposition();

export const errors = exifErrors;

export function load(data, options = {}) {
    if (options.length === 'auto') {
        validateAutoOptions(options);
        return makeLoadAuto(loadFromData)(data, options);
    }
    if (isFilePathOrURL(data) || isBrowserFileObject(data)) {
        assertPromiseSupport();
        const loadFileFunction = isFilePathOrURL(data) ? loadFile : loadFileObject;
        const asyncOptions = objectAssign({}, options, {async: true});

        return loadFileFunction(data, asyncOptions).then((fileContents) => loadFromData(fileContents, asyncOptions));
    }
    return loadFromData(data, options);
}

function loadFromData(data, options) {
    return loadView(getDataViewFromBytes(data), options);
}

export function loadView(dataView, options = {}) {
    return readView(getDefaultComposition(), dataView, options, {getDomParser: DOMParser.get, getBase64Image, createTagFilter});
}

function getDefaultComposition() {
    const tables = getDefaultTables();
    const entries = getTableEntries(tables);
    if (defaultComposition === undefined || !haveSameItems(entries, defaultCompositionEntries)) {
        defaultComposition = Composition.createComposition(tables);
        defaultCompositionEntries = entries;
    }
    return defaultComposition;
}

// Every format and group, each inside its build gate so that a custom build
// folds the import away. A format-bound reader has its own gate, so the jpeg
// and png formats are listed by header and readers rather than whole.
function getDefaultTables() {
    return {
        formats: [
            Constants.USE_TIFF ? tiff : undefined,
            Constants.USE_JPEG ? {
                header: jpegHeader,
                readers: [
                    Constants.USE_FILE ? file : undefined,
                    Constants.USE_JFIF ? jfif : undefined,
                ],
            } : undefined,
            Constants.USE_PNG ? {
                header: pngHeader,
                readers: [
                    Constants.USE_PNG_FILE ? pngFile : undefined,
                    pngText,
                    pngChunk,
                ],
            } : undefined,
            Constants.USE_HEIC ? heic : undefined,
            Constants.USE_AVIF ? avif : undefined,
            Constants.USE_JXL ? jxl : undefined,
            Constants.USE_WEBP ? webp : undefined,
            Constants.USE_GIF ? gif : undefined,
            Constants.USE_XMP ? xml : undefined,
        ].filter(Boolean),
        groups: [
            Constants.USE_EXIF ? exif : undefined,
            Constants.USE_IPTC ? iptc : undefined,
            Constants.USE_XMP ? xmp : undefined,
            Constants.USE_ICC ? icc : undefined,
            Constants.USE_MPF ? mpf : undefined,
            Constants.USE_PHOTOSHOP ? photoshop : undefined,
            Constants.USE_MAKER_NOTES ? makerNotes : undefined,
            Constants.USE_EXIF && Constants.USE_THUMBNAIL ? thumbnail : undefined,
            Constants.USE_EXIF ? gps : undefined,
            Constants.USE_EXIF || Constants.USE_XMP ? composite : undefined,
        ].filter(Boolean),
    };
}

// The jpeg and png formats are new objects on every call, so they compare by
// header and readers.
function getTableEntries({formats, groups}) {
    let entries = [];
    for (let i = 0; i < formats.length; i++) {
        entries = entries.concat([formats[i].header], formats[i].readers);
    }
    return entries.concat(groups);
}

function haveSameItems(items, otherItems) {
    if (items.length !== otherItems.length) {
        return false;
    }
    for (let i = 0; i < items.length; i++) {
        if (items[i] !== otherItems[i]) {
            return false;
        }
    }
    return true;
}
