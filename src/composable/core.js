/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Composition from './composition.js';
import {exif} from './groups/exif.js';
import {FORMAT_BRAND, GROUP_BRAND} from './brand.js';
import {readView} from './read-view.js';
import Errors from '../errors.js';
import {objectAssign, getDataViewFromBytes, getByteString, assertPromiseSupport} from '../utils.js';

const FORMATS_IMPORT = '\'exifreader/formats\'';
const GROUPS_IMPORT = '\'exifreader/groups\'';
const TAGS_IMPORT = '\'exifreader/tags/exif\'';
const TABLE_KEYS = ['formats', 'groups', 'tags', 'domParser', 'decompress'];
const DECOMPRESS_KEYS = ['brotli', 'deflate', 'maxDecompressedSize'];
const BOOLEAN_OPTIONS = ['expanded', 'includeUnknown', 'computed', 'includeOffsets'];
const SUPPORTED_OPTIONS = BOOLEAN_OPTIONS.concat(['includeTags', 'excludeTags']);
const INPUT_MESSAGE = 'reader.load: data must be an ArrayBuffer, a SharedArrayBuffer, a DataView, a typed array such as Uint8Array or a Node Buffer, or a Blob or File';
const ENVIRONMENT = {getDomParser, getBase64Image};
// includeTags then only caps what is read, so excludeTags applies to every group.
const LIMITING_ENVIRONMENT = objectAssign({}, ENVIRONMENT, {includeTagsIsLimit: true});

export const errors = {UnsupportedFormatError: Errors.UnsupportedFormatError};

/**
 * Builds a reader of the given formats, groups and tags only.
 *
 * @param {{formats: Array<object>, groups: (Array<object>|undefined), tags: (Array<object>|undefined), domParser: (object|undefined), decompress: (object|undefined)}} tables
 *     Values imported from 'exifreader/formats', 'exifreader/groups' and
 *     'exifreader/tags/exif', `domParser`, an object with a parseFromString
 *     method, for xmp where there is no global DOMParser, and `decompress`,
 *     {brotli, deflate, maxDecompressedSize} as ExifReader.load takes it, for
 *     every load (each load gets the whole limit).
 * @returns {{load: function}} `load(data, options)` always returns a Promise
 *     of the tags, grouped unless `expanded` is false.
 * @throws {TypeError} When a table is not an array or holds a value that was
 *     not imported from its module, formats is empty, domParser is given and
 *     has no parseFromString method, or decompress is given and is not an
 *     object of optional brotli and deflate functions and a maxDecompressedSize
 *     of zero or more, or has another key.
 * @throws {Error} When the groups' emission graph has a cycle or is too deep.
 */
export function createReader(tables) {
    const given = tables || {};
    assertTableKeys(given);
    const {formats, groups = [], tags = [], domParser, decompress} = given;
    assertTables(formats, groups, tags);
    assertDomParserShape(domParser);
    const decompressConfig = getDecompressConfig(decompress);

    const composition = compose(formats, groups);
    const unsupportedFormatMessage = getUnsupportedFormatMessage(composition.formats);
    const addsExif = needsExif(composition, tags) && composition.composed.groups.exif !== true;
    const runComposition = addsExif ? compose(formats, groups.concat([exif])) : composition;
    const includeTagsMapping = getIncludeTagsMapping(composition, tags);
    const hasXmp = composition.composed.groups.xmp === true;

    return {load};

    function load(data, options) {
        assertPromiseSupport();
        return Promise.resolve().then(() => {
            const loadOptions = getLoadOptions(options);
            const expanded = loadOptions.expanded === undefined ? true : loadOptions.expanded;
            assertDomParser(hasXmp, domParser);
            return getInputDataView(data).then((dataView) => {
                const run = getRun(objectAssign({}, loadOptions, {domParser, decompress: decompressConfig, expanded}), includeTagsMapping, addsExif);
                return readView(runComposition, dataView, run.options, run.environment);
            }).catch((error) => {
                throw getReadError(error, unsupportedFormatMessage);
            }).then((result) => {
                if (expanded) {
                    // png already holds every pngFile and pngText tag; the
                    // default entry keeps the two keys only for compatibility.
                    delete result.pngFile;
                    delete result.pngText;
                    deleteEmptyGroups(result);
                }
                return result;
            });
        });
    }
}

// for...in, as the destructuring above also reads an inherited key.
function assertTableKeys(tables) {
    for (const key in tables) {
        if (TABLE_KEYS.indexOf(key) === -1) {
            throw new TypeError('createReader: unknown key \'' + key + '\': the keys are formats, groups, tags, domParser and decompress');
        }
    }
}

function assertTables(formats, groups, tags) {
    assertArray(formats, 'formats', FORMATS_IMPORT);
    if (formats.length === 0) {
        throw new TypeError('createReader: formats must hold at least one value imported from ' + FORMATS_IMPORT);
    }
    assertArray(groups, 'groups', GROUPS_IMPORT);
    assertArray(tags, 'tags', TAGS_IMPORT);
    assertElements(formats, 'formats', FORMATS_IMPORT, (format) => !!format && format.brand === FORMAT_BRAND);
    assertElements(groups, 'groups', GROUPS_IMPORT, (group) => !!group && group.brand === GROUP_BRAND);
    assertElements(tags, 'tags', TAGS_IMPORT, isExifTagDescriptor);
}

function assertArray(table, name, importName) {
    if (!Array.isArray(table)) {
        throw new TypeError('createReader: ' + name + ' must be an array of values imported from ' + importName);
    }
}

function assertElements(table, name, importName, isValid) {
    for (let i = 0; i < table.length; i++) {
        if (!isValid(table[i])) {
            throw new TypeError('createReader: ' + name + '[' + i + '] is not a value imported from ' + importName);
        }
    }
}

function isExifTagDescriptor(tag) {
    return !!tag
        && typeof tag.name === 'string'
        && Array.isArray(tag.ids)
        && tag.ids.length > 0
        && tag.ids.every((id) => typeof id === 'number')
        && tag.group === 'exif';
}

function assertDomParserShape(domParser) {
    if (domParser !== undefined && !(domParser && typeof domParser.parseFromString === 'function')) {
        throw new TypeError('createReader: domParser must be a DOM parser, an object with a parseFromString method');
    }
}

// Each field is read once, so a getter cannot pass the checks with one value
// and give load another.
function getDecompressConfig(decompress) {
    if (decompress === undefined) {
        return undefined;
    }
    if (!isPlainObject(decompress)) {
        throw new TypeError('createReader: decompress must be an object with brotli, deflate and maxDecompressedSize');
    }
    assertDecompressKeys(decompress);
    const {brotli, deflate, maxDecompressedSize} = decompress;
    assertDecompressFunction(brotli, 'brotli');
    assertDecompressFunction(deflate, 'deflate');
    if (maxDecompressedSize !== undefined && !(typeof maxDecompressedSize === 'number' && maxDecompressedSize >= 0)) {
        throw new TypeError('createReader: decompress.maxDecompressedSize must be a number of bytes, zero or more');
    }
    return {brotli, deflate, maxDecompressedSize};
}

function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
}

// for...in, as reading the fields also reads an inherited key.
function assertDecompressKeys(decompress) {
    for (const key in decompress) {
        if (DECOMPRESS_KEYS.indexOf(key) === -1) {
            throw new TypeError('createReader: decompress has no key \'' + key + '\': the keys are brotli, deflate and maxDecompressedSize');
        }
    }
}

function assertDecompressFunction(value, key) {
    if (value !== undefined && typeof value !== 'function') {
        throw new TypeError('createReader: decompress.' + key + ' must be a function');
    }
}

function compose(formats, groups) {
    try {
        return Composition.createComposition({formats, groups});
    } catch (error) {
        throw new Error('createReader: ' + error.message);
    }
}

function getUnsupportedFormatMessage(formats) {
    const names = formats.map((format) => format.header.fileType.value);
    return 'reader.load: none of this reader\'s formats (' + names.join(', ') + ') recognizes the input: it is in another format or is not an image';
}

// The derived groups, the blocks Exif carries and the tag descriptors are all
// read through the Exif group.
function needsExif(composition, tags) {
    return exif.emits.some((kind) => composition.composed.kinds[kind] === true)
        || composition.derived.length > 0
        || tags.length > 0;
}

// The includeTags config this reader stands for: every composed group whole,
// file for FileType, and the descriptors of a group composed by tags alone.
function getIncludeTagsMapping(composition, tags) {
    const mapping = Object.create(null);
    mapping.file = true;
    const groups = composition.groups.concat(composition.derived);
    for (let i = 0; i < groups.length; i++) {
        mapping[groups[i].key] = true;
    }
    for (let i = 0; i < tags.length; i++) {
        const key = tags[i].group;
        if (mapping[key] !== true) {
            mapping[key] = (mapping[key] || []).concat([tags[i]]);
        }
    }
    return mapping;
}

function getLoadOptions(options) {
    if (options === undefined) {
        return {};
    }
    if (options === null || typeof options !== 'object') {
        throw new TypeError('reader.load: options must be an object');
    }
    // for...in, as objectAssign copies an inherited key too.
    for (const key in options) {
        assertSupportedOption(key);
    }
    BOOLEAN_OPTIONS.forEach((name) => assertBooleanOption(options, name));
    assertExcludeTagsShape(options.excludeTags);
    return options;
}

function assertSupportedOption(key) {
    if (key === 'async') {
        throw new TypeError('reader.load: the async option is not supported: load always returns a Promise');
    }
    if (key === 'length') {
        throw new TypeError('reader.load: the length option is not supported: to read the first bytes of a Blob or File, pass blob.slice(0, length)');
    }
    if (key === 'domParser' || key === 'decompress') {
        throw new TypeError('reader.load: the ' + key + ' option is not supported: pass ' + key + ' to createReader');
    }
    if (SUPPORTED_OPTIONS.indexOf(key) === -1) {
        throw new TypeError('reader.load: unknown option \'' + key + '\'');
    }
}

function assertBooleanOption(options, name) {
    if (options[name] !== undefined && typeof options[name] !== 'boolean') {
        throw new TypeError('reader.load: ' + name + ' must be true or false');
    }
}

// A list or a string would strip nothing, as excludeTags[group] is read.
function assertExcludeTagsShape(excludeTags) {
    if (excludeTags && (typeof excludeTags !== 'object' || Array.isArray(excludeTags))) {
        throw new TypeError('reader.load: excludeTags must be an object keyed by group');
    }
}

function assertDomParser(hasXmp, domParser) {
    if (hasXmp && !domParser && typeof DOMParser === 'undefined') {
        throw new Error('reader.load: xmp is in groups but no DOM parser is available: pass domParser to createReader, for example new DOMParser({onError: onErrorStopParsing}) from @xmldom/xmldom, or leave xmp out of groups');
    }
}

function getInputDataView(data) {
    if (isBlobLike(data)) {
        return Promise.resolve(data.arrayBuffer()).then(getBytesDataView);
    }
    return Promise.resolve(getBytesDataView(data));
}

function isBlobLike(data) {
    return !!data
        && typeof data.arrayBuffer === 'function'
        && typeof data.slice === 'function'
        && typeof data.size === 'number';
}

function getBytesDataView(bytes) {
    try {
        return getDataViewFromBytes(bytes);
    } catch (error) {
        if (error instanceof TypeError) {
            throw new TypeError(INPUT_MESSAGE);
        }
        throw error;
    }
}

// The composition alone caps a whole group. Only a parse-only Exif group and
// tag descriptors need includeTags, and a caller's includeTags is narrowed to
// what the reader composes, never widened.
function getRun(options, mapping, capsExif) {
    if (options.includeTags) {
        return {
            options: objectAssign({}, options, {async: true, includeTags: narrowIncludeTags(options.includeTags, mapping)}),
            environment: ENVIRONMENT,
        };
    }
    if (capsExif) {
        return {
            options: objectAssign({}, options, {async: true, includeTags: getIncludeTagsConfig(mapping)}),
            environment: LIMITING_ENVIRONMENT,
        };
    }
    return {options: objectAssign({}, options, {async: true}), environment: ENVIRONMENT};
}

function getIncludeTagsConfig(mapping) {
    const config = {};
    for (const key in mapping) {
        config[key] = mapping[key] === true ? true : getNames(mapping[key]);
    }
    return config;
}

function getReadError(error, unsupportedFormatMessage) {
    if (error instanceof Errors.UnsupportedFormatError) {
        return new Errors.UnsupportedFormatError(unsupportedFormatMessage);
    }
    return error;
}

function deleteEmptyGroups(tags) {
    Object.keys(tags).forEach((key) => {
        if (isPlainObject(tags[key]) && Object.keys(tags[key]).length === 0) {
            delete tags[key];
        }
    });
}

function narrowIncludeTags(includeTags, mapping) {
    const narrowed = {};
    if (typeof includeTags !== 'object' || Array.isArray(includeTags)) {
        return narrowed;
    }
    Object.keys(includeTags).forEach((key) => {
        if (mapping[key] === true) {
            narrowed[key] = includeTags[key];
        } else if (mapping[key] !== undefined) {
            narrowed[key] = narrowToDescriptors(includeTags[key], mapping[key]);
        }
    });
    return narrowed;
}

function narrowToDescriptors(value, descriptors) {
    if (!Array.isArray(value)) {
        return getNames(descriptors);
    }
    // By name: the filter matches an id in every IFD of the group.
    return getNames(descriptors.filter((descriptor) => value.some((selector) => matchesDescriptor(selector, descriptor))));
}

function matchesDescriptor(selector, descriptor) {
    if (typeof selector === 'number') {
        return descriptor.ids.indexOf(selector) !== -1;
    }
    return typeof selector === 'string' && selector.toLowerCase() === descriptor.name.toLowerCase();
}

function getNames(descriptors) {
    return descriptors.map((descriptor) => descriptor.name);
}

function getDomParser(domParser) {
    return {parser: domParser || new DOMParser()};
}

function getBase64Image(image) {
    if (typeof btoa === 'undefined') {
        return undefined;
    }
    return btoa(getByteString(new Uint8Array(image)));
}
