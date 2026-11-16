/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Composition from './composition.js';
import {FORMAT_BRAND, GROUP_BRAND, FILTER_BRAND} from './brand.js';
import {readView} from './read-view.js';
import {createCompositionTagFilter} from './composition-tag-filter.js';
import {createTagFilter} from '../tag-filter.js';
import {FILTER_GROUPS} from '../tag-filter-config.js';
import {UnsupportedFormatError} from '../unsupported-format-error.js';
import {objectAssign, getDataViewFromBytes, assertPromiseSupport} from '../utils.js';

const FORMATS_IMPORT = '\'exifreader/formats\'';
const GROUPS_IMPORT = '\'exifreader/groups\'';
const TAGS_IMPORT = '\'exifreader/tags/exif\' or \'exifreader/tags/iptc\'';
const CORE_IMPORT = '\'exifreader/core\'';
const TABLE_KEYS = ['formats', 'groups', 'tags', 'tagFilter', 'domParser', 'decompress'];
const DECOMPRESS_KEYS = ['brotli', 'deflate', 'maxDecompressedSize'];
const BOOLEAN_OPTIONS = ['expanded', 'includeUnknown', 'computed', 'includeOffsets'];
const SUPPORTED_OPTIONS = BOOLEAN_OPTIONS.concat(['includeTags', 'excludeTags']);
const INPUT_MESSAGE = 'reader.load: data must be an ArrayBuffer, a SharedArrayBuffer, a DataView, a typed array such as Uint8Array or a Node Buffer, or a Blob or File';

export const errors = {UnsupportedFormatError};

// Only this object references narrowIncludeTags and assertOptions, so a bundle
// without the tag filter leaves the caller's includeTags handling and the
// checks of includeTags and excludeTags out too.
export const tagFilter = {brand: FILTER_BRAND, createTagFilter, narrowIncludeTags, getNarrowedTagFilterFactory, assertOptions};

/**
 * Builds a reader of the given formats, groups and tags only.
 *
 * @param {{formats: Array<object>, groups: (Array<object>|undefined), tags: (Array<object>|undefined), tagFilter: (object|undefined), domParser: (object|undefined), decompress: (object|undefined)}} tables
 *     Values imported from 'exifreader/formats', 'exifreader/groups',
 *     'exifreader/tags/exif' and 'exifreader/tags/iptc', `tagFilter` from
 *     'exifreader/core' to let load take includeTags and excludeTags,
 *     `domParser`, an object with a parseFromString method, for xmp where there
 *     is no global DOMParser, and `decompress`, {brotli, deflate,
 *     maxDecompressedSize} as ExifReader.load takes it, for every load (each
 *     load gets the whole limit).
 * @returns {{load: function}} `load(data, options)` always returns a Promise
 *     of the tags, grouped unless `expanded` is false.
 * @throws {TypeError} When a table is not an array or holds a value that was
 *     not imported from its module, formats is empty, tagFilter is given and
 *     is not the tagFilter export, domParser is given and has no
 *     parseFromString method, or decompress is given and is not an object of
 *     optional brotli and deflate functions and a maxDecompressedSize of zero
 *     or more, or has another key.
 */
export function createReader(tables) {
    const given = tables || {};
    assertTableKeys(given);
    const {formats, groups = [], tags = [], tagFilter: filter, domParser, decompress} = given;
    assertTables(formats, groups, tags);
    assertFilter(filter);
    assertDomParserShape(domParser);
    const decompressConfig = getDecompressConfig(decompress);

    const composition = Composition.createComposition({formats, groups});
    const unsupportedFormatMessage = getUnsupportedFormatMessage(composition.formats);
    const includeTagsMapping = getIncludeTagsMapping(composition, tags);
    const readGroups = groups.concat(getParseOnlyGroups(includeTagsMapping));
    const exifDescriptors = tags.filter((tag) => tag.group === 'exif').concat(getExifDependencies(readGroups));
    const addsExif = needsExif(exifDescriptors) && composition.composed.groups.exif !== true;
    const runGroups = addsExif ? readGroups.concat([getParseOnlyExifGroup(exifDescriptors, groups)]) : readGroups;
    const runComposition = runGroups.length > groups.length ? Composition.createComposition({formats, groups: runGroups}) : composition;
    const environments = getEnvironments(groups, filter ? filter.createTagFilter : getCompositionTagFilterFactory(readGroups));
    const environmentChecks = getEnvironmentChecks(groups);

    return {load};

    function load(data, options) {
        assertPromiseSupport();
        return Promise.resolve().then(() => {
            const loadOptions = getLoadOptions(options);
            const expanded = loadOptions.expanded === undefined ? true : loadOptions.expanded;
            assertTagFilterOptions(filter, loadOptions);
            environmentChecks.forEach((check) => check(domParser));
            return getInputDataView(data).then((dataView) => {
                const run = getRun(objectAssign({}, loadOptions, {domParser, decompress: decompressConfig, expanded}), includeTagsMapping, addsExif, filter, environments);
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
            throw new TypeError('createReader: unknown key \'' + key + '\': the keys are formats, groups, tags, tagFilter, domParser and decompress');
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
    assertElements(tags, 'tags', TAGS_IMPORT, isTagDescriptor);
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

// The reader a descriptor links to checks its group and dictionary.
function isTagDescriptor(tag) {
    return !!tag
        && typeof tag.name === 'string'
        && Array.isArray(tag.ids)
        && tag.ids.length > 0
        && tag.ids.every((id) => typeof id === 'number')
        && !!tag.reader
        && typeof tag.reader.createParseOnlyGroup === 'function'
        && typeof tag.reader.isDescriptor === 'function'
        && tag.reader.isDescriptor(tag);
}

function assertFilter(filter) {
    if (filter !== undefined && !(filter && filter.brand === FILTER_BRAND)) {
        throw new TypeError('createReader: tagFilter must be the tagFilter imported from ' + CORE_IMPORT);
    }
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

function getUnsupportedFormatMessage(formats) {
    const names = formats.map((format) => format.header.fileType.value);
    return 'reader.load: none of this reader\'s formats (' + names.join(', ') + ') recognizes the input: it is in another format or is not an image';
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

// Built by the reader the descriptors link to, for each group other than exif
// composed by descriptors alone. Exif comes last, as these add to what it reads.
function getParseOnlyGroups(mapping) {
    const parseOnlyGroups = [];
    for (const key in mapping) {
        if (key !== 'exif' && mapping[key] !== true) {
            parseOnlyGroups.push(mapping[key][0].reader.createParseOnlyGroup(mapping[key]));
        }
    }
    return parseOnlyGroups;
}

// From the groups as given: composing merges the maker-note groups into one
// that carries no exifDependencies.
function getExifDependencies(groups) {
    let dependencies = [];
    for (let i = 0; i < groups.length; i++) {
        if (groups[i].exifDependencies !== undefined) {
            dependencies = dependencies.concat(groups[i].exifDependencies);
        }
    }
    return dependencies;
}

// The groups that consume a block Exif carries and the derived groups carry
// Exif dependencies, so with the tag descriptors these are all that read Exif.
function needsExif(exifDescriptors) {
    return exifDescriptors.length > 0;
}

// Built by the reader the descriptors link to, so a bundle without one has no
// Exif reading code.
function getParseOnlyExifGroup(exifDescriptors, groups) {
    return exifDescriptors[0].reader.createParseOnlyGroup(exifDescriptors, getIfd1TagNames(groups));
}

function getIfd1TagNames(groups) {
    for (let i = 0; i < groups.length; i++) {
        if (groups[i].ifd1TagNames !== undefined) {
            return groups[i].ifd1TagNames;
        }
    }
    return undefined;
}

// From the groups as given: parse-only groups carry no environment.
function getEnvironments(groups, createFilter) {
    const environment = {createTagFilter: createFilter};
    for (let i = 0; i < groups.length; i++) {
        objectAssign(environment, groups[i].environment);
    }
    return {
        environment,
        // includeTags then only caps what is read, so excludeTags applies to every group.
        limitingEnvironment: objectAssign({}, environment, {includeTagsIsLimit: true}),
    };
}

// Without the tag filter a load passes no includeTags or excludeTags, so the
// filter only ever sees the reader's own includeTags config.
function getCompositionTagFilterFactory(groups) {
    const exifDependencyNames = getNames(getExifDependencies(groups));
    return ({includeTags}) => createCompositionTagFilter(includeTags, exifDependencyNames);
}

function getEnvironmentChecks(groups) {
    const checks = [];
    for (let i = 0; i < groups.length; i++) {
        if (groups[i].assertEnvironment !== undefined) {
            checks.push(groups[i].assertEnvironment);
        }
    }
    return checks;
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

function assertTagFilterOptions(filter, options) {
    if (filter) {
        filter.assertOptions(options);
        return;
    }
    if (options.includeTags) {
        throw getMissingFilterError('includeTags');
    }
    if (options.excludeTags) {
        throw getMissingFilterError('excludeTags');
    }
}

function getMissingFilterError(option) {
    return new TypeError('reader.load: ' + option + ' needs the tag filter: add tagFilter, imported from ' + CORE_IMPORT + ', to createReader');
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
function getRun(options, mapping, addsExif, filter, environments) {
    if (options.includeTags) {
        return {
            options: objectAssign({}, options, {async: true, includeTags: filter.narrowIncludeTags(options.includeTags, mapping)}),
            environment: objectAssign({}, environments.environment, {createTagFilter: filter.getNarrowedTagFilterFactory(mapping)}),
        };
    }
    if (addsExif) {
        return {
            options: objectAssign({}, options, {async: true, includeTags: getIncludeTagsConfig(mapping)}),
            environment: environments.limitingEnvironment,
        };
    }
    return {options: objectAssign({}, options, {async: true}), environment: environments.environment};
}

function getIncludeTagsConfig(mapping) {
    const config = {};
    for (const key in mapping) {
        config[key] = mapping[key] === true ? true : getNames(mapping[key]);
    }
    return config;
}

function getReadError(error, unsupportedFormatMessage) {
    if (error instanceof UnsupportedFormatError) {
        return new UnsupportedFormatError(unsupportedFormatMessage);
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

// The shared filter skips what it cannot read: a misspelt group, a value that
// is not true or an array, a selector that is neither a name nor an id.
function assertOptions(options) {
    assertGroups(options.includeTags, 'includeTags');
    assertGroups(options.excludeTags, 'excludeTags');
}

function assertGroups(groups, option) {
    if (!groups) {
        return;
    }
    if (!isPlainObject(groups)) {
        throw new TypeError('reader.load: ' + option + ' must be an object keyed by group');
    }
    Object.keys(groups).forEach((key) => {
        if (FILTER_GROUPS[key] !== true) {
            throw new TypeError('reader.load: ' + option + ' has no group \'' + key + '\': the groups are ' + getGroupList());
        }
        if (!isGroupValue(groups[key])) {
            throw new TypeError('reader.load: ' + option + '.' + key + ' must be true, false or an array of tag names or ids');
        }
    });
}

function getGroupList() {
    const names = Object.keys(FILTER_GROUPS);
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function isGroupValue(value) {
    return value === undefined || typeof value === 'boolean' || (Array.isArray(value) && value.every(isTagSelector));
}

function isTagSelector(selector) {
    return typeof selector === 'string' || typeof selector === 'number';
}

function narrowIncludeTags(includeTags, mapping) {
    const narrowed = {};
    Object.keys(includeTags).forEach((key) => {
        if (!includeTags[key]) {
            return;
        }
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
    const selectors = [];
    descriptors.forEach((descriptor) => {
        Array.prototype.push.apply(selectors, getDescriptorSelectors(value, descriptor));
    });
    return selectors;
}

// A name selects every id of that name, so a descriptor selected by name passes
// on its name and one selected only by id passes on just those ids.
function getDescriptorSelectors(value, descriptor) {
    const matching = value.filter((selector) => matchesDescriptor(selector, descriptor));
    const selectedByName = matching.some((selector) => typeof selector === 'string');
    return selectedByName ? [descriptor.name] : matching;
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

// A narrowed id also matches a tag of that id in another IFD of the group, an
// unknown tag included, so a group of descriptors returns only their names.
function getNarrowedTagFilterFactory(mapping) {
    const names = getDescriptorNames(mapping);
    return (options) => {
        const filter = createTagFilter(options);
        return objectAssign({}, filter, {
            shouldReturnTag(groupKey, tagName, tagId) {
                return filter.shouldReturnTag(groupKey, tagName, tagId)
                    && (names[groupKey] === undefined || names[groupKey][String(tagName).toLowerCase()] === true);
            },
        });
    };
}

function getDescriptorNames(mapping) {
    const names = Object.create(null);
    for (const key in mapping) {
        if (mapping[key] !== true) {
            names[key] = Object.create(null);
            mapping[key].forEach((descriptor) => {
                names[key][descriptor.name.toLowerCase()] = true;
            });
        }
    }
    return names;
}
