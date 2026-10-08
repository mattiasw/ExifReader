/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Constants from './constants.js';
import Types from './types.js';
import TagNames, {IFD_TYPE_0TH, IFD_TYPE_1ST, IFD_TYPE_PENTAX} from './tag-names.js';
import {IFD_ENTRY_LENGTH, TIFF_IFD_OFFSET_OFFSET} from './tiff-constants.js';
import {NOOP_TAG_FILTER} from './tag-filter.js';
import {decodeUtf8ByteString, getByteString} from './utils.js';

// Across the test corpus, for whole files and for the 128 KiB and
// length: 'auto' reads, out-of-slot values decode at most 1.2241 times the
// buffer (faulty files parsed with includeUnknown). Exif decompressed from a
// PNG or JPEG XL gets its own allowance on top of the file-sized budget, see
// MAX_DECOMPRESSED_VALUE_ALLOWANCE. Description text is not charged, as real
// TIFFs whose large BYTE tags get joined descriptions would need 4.48 times.
// A decoded byte costs about 15 bytes of heap, mostly as an array element and
// its share of the joined description.
const MAX_VALUE_SIZE_PER_BUFFER_SIZE = 4;

// Real Exif decodes at most about 2 times its own size (the MakerNote bytes
// decode twice), so MAX_VALUE_SIZE_PER_BUFFER_SIZE times its decompressed size
// covers it. The cap keeps a small crafted file from decoding values in
// proportion to what it decompresses to: at most this much more per load.
const MAX_DECOMPRESSED_VALUE_ALLOWANCE = 1024 * 1024;

// A buffer holds at most byteLength / 12 IFD entries and a real file reads each
// once. The multiple leaves room for an IFD reached through more than one
// pointer. In the test corpus, whole files and 128 KiB and length: 'auto' reads
// visit at most about as many entries as the buffer holds.
const MAX_IFD_ENTRY_READS_PER_BUFFER_ENTRY = 4;

// Each string after the first of an out-of-slot ASCII value costs this much
// budget. 4 MiB files whose tags use the budget up on short strings peaked at
// up to 107 times their size in RSS without it, 88 with 1 and 76 with 2,
// against 87 for BYTE values.
export const BUDGET_BYTES_PER_EXTRA_ASCII_STRING = 2;

const getTagValueAt = {
    1: Types.getByteAt,
    3: Types.getShortAt,
    4: Types.getLongAt,
    5: Types.getRationalAt,
    7: Types.getUndefinedAt,
    9: Types.getSlongAt,
    10: Types.getSrationalAt,
    13: Types.getIfdPointerAt
};

export function get0thIfdOffset(dataView, tiffHeaderOffset, byteOrder) {
    const offset = tiffHeaderOffset + TIFF_IFD_OFFSET_OFFSET;
    if (offset + Types.getTypeSize('LONG') > dataView.byteLength) {
        return undefined;
    }
    return tiffHeaderOffset
        + Types.getLongAt(dataView, offset, byteOrder);
}

/**
 * Reads the tags of an IFD, and for a 0th IFD also those of the thumbnail IFD
 * it points to.
 *
 * @param {{remaining: number, ifdEntriesRemaining: number, decompressedAllowanceRemaining: number}} [valueBudget] -
 * Caps the total size of the decoded tag values and the number of IFD entries
 * read, see getValueBudget. Pass the same object to several calls to bound them
 * together; omit it to give this call its own budget. Once the entry count runs
 * out, later entries and IFDs are not read, so their tags are absent rather than
 * empty, and an IFD cut short does not follow its next-IFD offset.
 * @returns {Object} The read tags, keyed by tag name.
 */
export function readIfd(
    dataView,
    ifdType,
    offsetOrigin,
    offset,
    byteOrder,
    includeUnknown,
    computed = false,
    tagFilter = NOOP_TAG_FILTER,
    groupKey = 'exif',
    valueBudget = getValueBudget(dataView)
) {
    const FIELD_COUNT_SIZE = Types.getTypeSize('SHORT');
    const FIELD_SIZE = IFD_ENTRY_LENGTH;

    const tags = {};
    const numberOfFields = getNumberOfFields(dataView, offset, byteOrder);
    let ranOutOfIfdEntries = false;

    offset += FIELD_COUNT_SIZE;
    for (let fieldIndex = 0; fieldIndex < numberOfFields; fieldIndex++) {
        if (offset + FIELD_SIZE > dataView.byteLength) {
            ranOutOfIfdEntries = true;
            break;
        }
        if (!takeIfdEntry(valueBudget)) {
            ranOutOfIfdEntries = true;
            break;
        }

        const tag = readTag(
            dataView,
            ifdType,
            offsetOrigin,
            offset,
            byteOrder,
            includeUnknown,
            tagFilter,
            groupKey,
            valueBudget
        );
        if (tag !== undefined) {
            tags[tag.name] = {
                'id': tag.id,
                'value': tag.value,
                'description': tag.description
            };
            if (computed) {
                tags[tag.name].computed = getComputedTagValue(tag.tagType, tag.value);
            }
            if (tag.name === 'MakerNote' || (ifdType === IFD_TYPE_PENTAX && tag.name === 'LevelInfo')) {
                tags[tag.name].__offset = tag.__offset;
            }
        }

        offset += FIELD_SIZE;
    }

    if (Constants.USE_THUMBNAIL && !ranOutOfIfdEntries && (offset + Types.getTypeSize('LONG') <= dataView.byteLength)) {
        const nextIfdOffset = Types.getLongAt(dataView, offset, byteOrder);
        if (nextIfdOffset !== 0 && ifdType === IFD_TYPE_0TH) {
            if (tagFilter.shouldParseGroup('thumbnail')) {
                tags['Thumbnail'] = readIfd(
                    dataView,
                    IFD_TYPE_1ST,
                    offsetOrigin,
                    offsetOrigin + nextIfdOffset,
                    byteOrder,
                    includeUnknown,
                    computed,
                    tagFilter,
                    'thumbnail',
                    valueBudget
                );
            }
        }
    }

    return tags;
}

function takeIfdEntry(valueBudget) {
    if (valueBudget.ifdEntriesRemaining > 0) {
        valueBudget.ifdEntriesRemaining--;
        return true;
    }
    return false;
}

/**
 * Creates a budget for the total size of the tag values decoded from a buffer.
 *
 * Tags can legitimately point at overlapping parts of the buffer, and unknown
 * tags of a faulty file can do so with large sizes, so the total is allowed to
 * be a multiple of the buffer size. The multiple keeps the total proportional
 * to the input, which is what stops a crafted file from having thousands of
 * tags decode the same bytes over and over.
 *
 * loadView shares one budget across the Exif IFDs, then the maker note, then
 * MPF, then the Exif decompressed from PNG text chunks and JPEG XL brob boxes,
 * each of which first adds its allowance, see addDecompressedValueAllowance.
 * Once it is used up, later out-of-slot values decode empty, Make included,
 * and an empty Make or MakerNote turns maker note detection off. An ASCII
 * value also draws for each string after its first, and keeps only the
 * strings the budget covers.
 *
 * The budget also counts the IFD entries read, shared the same way, so that
 * Exif decompressed from a small file cannot have its entries read in
 * proportion to the decompressed size.
 *
 * @param {DataView} dataView - The buffer the values are decoded from.
 * @returns {{remaining: number, ifdEntriesRemaining: number, decompressedAllowanceRemaining: number}}
 * The budget: remaining is the bytes left to decode, with each extra ASCII
 * string counted as BUDGET_BYTES_PER_EXTRA_ASCII_STRING bytes;
 * ifdEntriesRemaining is the IFD entries left to read,
 * MAX_IFD_ENTRY_READS_PER_BUFFER_ENTRY times the byteLength / 12 entries the
 * buffer can hold; decompressedAllowanceRemaining is what decompressed Exif
 * can still add to remaining, MAX_DECOMPRESSED_VALUE_ALLOWANCE per budget.
 */
export function getValueBudget(dataView) {
    return {
        remaining: dataView.byteLength * MAX_VALUE_SIZE_PER_BUFFER_SIZE,
        ifdEntriesRemaining: Math.floor(dataView.byteLength / IFD_ENTRY_LENGTH) * MAX_IFD_ENTRY_READS_PER_BUFFER_ENTRY,
        decompressedAllowanceRemaining: MAX_DECOMPRESSED_VALUE_ALLOWANCE
    };
}

/**
 * Adds the allowance of an Exif block decompressed from the file to the
 * budget: MAX_VALUE_SIZE_PER_BUFFER_SIZE times its decompressed size, up to
 * what is left of the budget's decompressedAllowanceRemaining, which it draws
 * from. Leaves the IFD entry count as it is. Does nothing without a budget.
 *
 * @param {{remaining: number, decompressedAllowanceRemaining: number}} [valueBudget]
 * @param {number} decompressedByteLength - The size of the decompressed Exif.
 */
export function addDecompressedValueAllowance(valueBudget, decompressedByteLength) {
    if (valueBudget === undefined) {
        return;
    }
    const allowance = Math.min(
        decompressedByteLength * MAX_VALUE_SIZE_PER_BUFFER_SIZE,
        valueBudget.decompressedAllowanceRemaining
    );
    valueBudget.remaining += allowance;
    valueBudget.decompressedAllowanceRemaining -= allowance;
}

function getNumberOfFields(dataView, offset, byteOrder) {
    if (offset + Types.getTypeSize('SHORT') <= dataView.byteLength) {
        return Types.getShortAt(dataView, offset, byteOrder);
    }
    return 0;
}

function readTag(
    dataView,
    ifdType,
    offsetOrigin,
    offset,
    byteOrder,
    includeUnknown = false,
    tagFilter = NOOP_TAG_FILTER,
    groupKey = 'exif',
    valueBudget
) {
    const TAG_CODE_IPTC_NAA = 0x83bb;
    const TAG_TYPE_OFFSET = Types.getTypeSize('SHORT');
    const TAG_COUNT_OFFSET = TAG_TYPE_OFFSET + Types.getTypeSize('SHORT');
    const TAG_VALUE_OFFSET = TAG_COUNT_OFFSET + Types.getTypeSize('LONG');

    const tagCode = Types.getShortAt(dataView, offset, byteOrder);
    const tagType = Types.getShortAt(dataView, offset + TAG_TYPE_OFFSET, byteOrder);
    const tagCount = Types.getLongAt(dataView, offset + TAG_COUNT_OFFSET, byteOrder);
    let tagValue;
    let tagValueOffset;
    let stringBudget;

    if (Types.typeSizes[tagType] === undefined || (!includeUnknown && TagNames[ifdType][tagCode] === undefined)) {
        return undefined;
    }

    const tagName = getTagName(ifdType, tagCode);
    if (!tagFilter.shouldParseTag(groupKey, tagName, tagCode)) {
        return undefined;
    }

    if (tagValueFitsInOffsetSlot(tagType, tagCount)) {
        tagValueOffset = offset + TAG_VALUE_OFFSET - offsetOrigin;
        tagValue = getTagValue(dataView, offsetOrigin + tagValueOffset, tagType, tagCount, byteOrder);
    } else {
        tagValueOffset = Types.getLongAt(dataView, offset + TAG_VALUE_OFFSET, byteOrder);
        if (tagValueFitsInDataView(dataView, offsetOrigin, tagValueOffset, tagType, tagCount)) {
            const forceByteType = tagCode === TAG_CODE_IPTC_NAA;
            const boundedTagCount = getBoundedTagCount(valueBudget.remaining, tagType, tagCount);
            valueBudget.remaining -= boundedTagCount * Types.typeSizes[tagType];
            stringBudget = valueBudget;
            tagValue = getTagValue(dataView, offsetOrigin + tagValueOffset, tagType, boundedTagCount, byteOrder, forceByteType);
        } else {
            tagValue = '<faulty value>';
        }
    }

    if (tagType === Types.tagTypes['ASCII']) {
        tagValue = getAsciiTagValue(tagValue, stringBudget);
    }

    let tagDescription = tagValue;

    if (TagNames[ifdType][tagCode] !== undefined) {
        if ((TagNames[ifdType][tagCode]['name'] !== undefined) && (TagNames[ifdType][tagCode]['description'] !== undefined)) {
            try {
                tagDescription = TagNames[ifdType][tagCode]['description'](tagValue);
            } catch (error) {
                tagDescription = getDescriptionFromTagValue(tagValue);
            }
        } else if ((tagType === Types.tagTypes['RATIONAL']) || (tagType === Types.tagTypes['SRATIONAL'])) {
            tagDescription = '' + (tagValue[0] / tagValue[1]);
        } else {
            tagDescription = getDescriptionFromTagValue(tagValue);
        }
    }

    return {
        id: tagCode,
        name: tagName,
        value: tagValue,
        description: tagDescription,
        tagType,
        __offset: tagValueOffset
    };
}

function getTagName(ifdType, tagCode) {
    if (TagNames[ifdType][tagCode] !== undefined) {
        if (typeof TagNames[ifdType][tagCode] === 'string') {
            return TagNames[ifdType][tagCode];
        }
        if (TagNames[ifdType][tagCode].name) {
            return TagNames[ifdType][tagCode].name;
        }
    }

    return `undefined-${tagCode}`;
}

function tagValueFitsInOffsetSlot(tagType, tagCount) {
    return Types.typeSizes[tagType] * tagCount <= Types.getTypeSize('LONG');
}

function getTagValue(dataView, offset, type, count, byteOrder, forceByteType = false) {
    const value = [];

    if (forceByteType) {
        count = count * Types.typeSizes[type];
        type = Types.tagTypes['BYTE'];
    }
    if (type === Types.tagTypes['ASCII']) {
        return getAsciiBytes(dataView, offset, count);
    }
    for (let valueIndex = 0; valueIndex < count; valueIndex++) {
        value.push(getTagValueAt[type](dataView, offset, byteOrder));
        offset += Types.typeSizes[type];
    }

    if (value.length === 1) {
        return value[0];
    }

    return value;
}

function getAsciiBytes(dataView, offset, count) {
    const bytes = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
        bytes[i] = Types.getAsciiAt(dataView, offset + i);
    }
    return bytes;
}

function tagValueFitsInDataView(dataView, offsetOrigin, tagValueOffset, tagType, tagCount) {
    return offsetOrigin + tagValueOffset + Types.typeSizes[tagType] * tagCount <= dataView.byteLength;
}

// Draws each out-of-slot value from the shared budget, so a crafted file
// cannot have thousands of tags decode the same bytes over and over. Real
// files stay below it.
function getBoundedTagCount(remainingBudget, tagType, tagCount) {
    const boundedCount = Math.min(tagCount, Math.floor(remainingBudget / Types.typeSizes[tagType]));
    if (boundedCount === 1 && tagCount > 1) {
        // Most types unwrap a single element into a bare value, which would
        // make a truncated value look like a genuine one-element one. Return
        // the empty value a zero count already produces instead.
        return 0;
    }
    return boundedCount;
}

function getAsciiTagValue(tagValue, stringBudget) {
    if (tagValue instanceof Uint8Array) {
        return getNullSeparatedStrings(tagValue, stringBudget);
    }
    if (typeof tagValue === 'string') {
        return [tagValue];
    }
    // An IPTC-NAA value read as bytes: its numbers have always been joined
    // into one string of decimal digits.
    return tagValue.length > 0 ? [decodeUtf8ByteString(tagValue.join(''))] : [];
}

// Empty strings are left as holes in the array, so each string keeps the
// index given by the number of NULs before it. With a string budget, each
// string after the first draws from it, and the value stops when it runs out.
function getNullSeparatedStrings(bytes, stringBudget) {
    const strings = [];
    const charCodes = [];
    let hasString = false;
    let stringIndex = 0;
    let stringStart = 0;

    for (let i = 0; i <= bytes.length; i++) {
        if (i === bytes.length || bytes[i] === 0) {
            if (i > stringStart) {
                if (hasString && !drawExtraString(stringBudget)) {
                    break;
                }
                strings[stringIndex] = decodeUtf8ByteString(getByteString(bytes, stringStart, i, charCodes));
                hasString = true;
            }
            stringIndex++;
            stringStart = i + 1;
        }
    }

    return strings;
}

function drawExtraString(stringBudget) {
    if (stringBudget === undefined) {
        return true;
    }
    if (stringBudget.remaining < BUDGET_BYTES_PER_EXTRA_ASCII_STRING) {
        return false;
    }
    stringBudget.remaining -= BUDGET_BYTES_PER_EXTRA_ASCII_STRING;
    return true;
}

function getDescriptionFromTagValue(tagValue) {
    if (tagValue instanceof Array) {
        return tagValue.join(', ');
    }
    return tagValue;
}

function getComputedTagValue(tagType, value) {
    if (tagType === Types.tagTypes['ASCII']) {
        if (Array.isArray(value) && value.length === 1) {
            return value[0];
        }

        return value;
    }

    if (tagType === Types.tagTypes['RATIONAL'] || tagType === Types.tagTypes['SRATIONAL']) {
        if (isSingleRationalValue(value)) {
            return getComputedRationalValue(value);
        }

        if (Array.isArray(value)) {
            return value.map((rational) => getComputedRationalValue(rational));
        }

        return value;
    }

    return value;
}

function isSingleRationalValue(value) {
    if (!Array.isArray(value) || value.length !== 2) {
        return false;
    }

    return typeof value[0] === 'number' && typeof value[1] === 'number';
}

function getComputedRationalValue(rational) {
    if (!Array.isArray(rational) || rational.length !== 2) {
        return rational;
    }

    const numerator = rational[0];
    const denominator = rational[1];
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
        return rational;
    }

    if (denominator === 0) {
        return null;
    }

    return numerator / denominator;
}
