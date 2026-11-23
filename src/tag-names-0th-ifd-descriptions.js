/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {joinMapped} from './utils.js';
import {getTableDescription, isArrayWithoutCharacterCodes, getStringsText} from './tag-names-utils.js';

export function getSubfileTypeDescription(value) {
    return getTableDescription({
        0x0: 'Full-resolution image',
        0x1: 'Reduced-resolution image',
        0x2: 'Single page of multi-page image',
        0x3: 'Single page of multi-page reduced-resolution image',
        0x4: 'Transparency mask',
        0x5: 'Transparency mask of reduced-resolution image',
        0x6: 'Transparency mask of multi-page image',
        0x7: 'Transparency mask of reduced-resolution multi-page image',
        0x10001: 'Alternate reduced-resolution image',
        0xffffffff: 'Invalid'
    }, value);
}

export function getOldSubfileTypeDescription(value) {
    return getTableDescription({
        0: 'Full-resolution image',
        1: 'Reduced-resolution image',
        2: 'Single page of multi-page image'
    }, value);
}

export function getThresholdingDescription(value) {
    return getTableDescription({
        1: 'No dithering or halftoning',
        2: 'Ordered dither or halfton',
        3: 'Randomized dither'
    }, value);
}

export function getFillOrderDescription(value) {
    return getTableDescription({
        1: 'Normal',
        2: 'Reversed'
    }, value);
}

export function getOrientationDescription(value) {
    if (value === 1) {
        return 'top-left';
    }
    if (value === 2) {
        return 'top-right';
    }
    if (value === 3) {
        return 'bottom-right';
    }
    if (value === 4) {
        return 'bottom-left';
    }
    if (value === 5) {
        return 'left-top';
    }
    if (value === 6) {
        return 'right-top';
    }
    if (value === 7) {
        return 'right-bottom';
    }
    if (value === 8) {
        return 'left-bottom';
    }
    return 'Undefined';
}

export function getXPositionDescription(value) {
    return '' + Math.round(value[0] / value[1]);
}

export function getYPositionDescription(value) {
    return '' + Math.round(value[0] / value[1]);
}

export function getGrayResponseUnitDescription(value) {
    return getTableDescription({
        1: '0.1',
        2: '0.001',
        3: '0.0001',
        4: '1e-05',
        5: '1e-06'
    }, value);
}

export function getWhitePointDescription(values) {
    return joinMapped(values, getRationalText, ', ');
}

export function getPrimaryChromaticitiesDescription(values) {
    return joinMapped(values, getRationalText, ', ');
}

export function getInkSetDescription(value) {
    return getTableDescription({
        1: 'CMYK',
        2: 'Not CMYK'
    }, value);
}

export function getExtraSamplesDescription(value) {
    return getTableDescription({
        0: 'Unspecified',
        1: 'Associated Alpha',
        2: 'Unassociated Alpha',
    }, value);
}

export function getSampleFormatDescription(value) {
    if (!Array.isArray(value)) {
        return getSampleFormatText(value);
    }
    return value.map(getSampleFormatText).join(', ');
}

export function getYCbCrCoefficientsDescription(values) {
    return values.map((value) => '' + value[0] / value[1]).join('/');
}

export function getYCbCrPositioningDescription(value) {
    if (value === 1) {
        return 'centered';
    }
    if (value === 2) {
        return 'co-sited';
    }
    return 'undefined ' + value;
}

export function getReferenceBlackWhiteDescription(values) {
    return values.map((value) => '' + value[0] / value[1]).join(', ');
}

export function getCopyrightDescription(value) {
    return value.join('; ');
}

export function getDngVersionDescription(value) {
    return value.join('.');
}

export function getMakerNoteSafetyDescription(value) {
    return getTableDescription({
        0: 'Unsafe',
        1: 'Safe'
    }, value);
}

export function getProfileEmbedPolicyDescription(value) {
    return getTableDescription({
        0: 'Allow Copying',
        1: 'Embed if Used',
        2: 'Never Embed',
        3: 'No Restrictions'
    }, value);
}

export function getPreviewColorSpaceDescription(value) {
    return getTableDescription({
        1: 'Gray Gamma 2.2',
        2: 'sRGB',
        3: 'Adobe RGB',
        4: 'ProPhoto RGB'
    }, value);
}

export function getProfileHueSatMapEncodingDescription(value) {
    return getTableDescription({
        0: 'Linear',
        1: 'sRGB'
    }, value);
}

export function getProfileLookTableEncodingDescription(value) {
    return getTableDescription({
        0: 'Linear',
        1: 'sRGB'
    }, value);
}

export function getDefaultBlackRenderDescription(value) {
    return getTableDescription({
        0: 'Auto',
        1: 'None'
    }, value);
}

function getRationalText(value) {
    if (!Array.isArray(value)) {
        throw new TypeError('Expected a rational.');
    }
    return `${value[0]}/${value[1]}`;
}

function getSampleFormatText(sample) {
    const formats = {
        1: 'Unsigned',
        2: 'Signed',
        3: 'Float',
        4: 'Undefined',
        5: 'Complex int',
        6: 'Complex float',
    };
    return getTableDescription(formats, sample);
}

export function decodeXPValue(value) {
    if (!Array.isArray(value)) {
        // A one-element value arrives as a bare number, which Uint8Array would take as a length.
        return '';
    }
    if (isArrayWithoutCharacterCodes(value)) {
        // An ASCII-typed value holds strings, not UCS-2 bytes.
        return getStringsText(value);
    }
    // The XP tags are encoded as UCS-2 which uses two bytes per character but
    // it's close to UTF-16 so we can use that to decode them.
    // https://www.loc.gov/preservation/digital/formats/content/tiff_tags.shtml
    const decodedValue = new TextDecoder('utf-16').decode(new Uint8Array(value));
    // Some softwares pad the string with null characters so we remove them.
    return removeTrailingNulls(decodedValue);
}

function removeTrailingNulls(text) {
    let end = text.length;
    while (end > 0 && text.charCodeAt(end - 1) === 0) {
        end--;
    }
    return text.slice(0, end);
}
