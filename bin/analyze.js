/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const path = require('path');
const url = require('url');

const EXIFREADER_ROOT_DIR = path.join(__dirname, '..');

const FORMATS = ['jpeg', 'tiff', 'png', 'heic', 'avif', 'jxl', 'webp', 'gif'];
const FORMAT_NAMES = {
    jpeg: 'JPEG',
    tiff: 'TIFF',
    png: 'PNG',
    heic: 'HEIC',
    avif: 'AVIF',
    jxl: 'JPEG XL',
    webp: 'WebP',
    gif: 'GIF'
};
const MODULE_ORDER = FORMATS.concat(['file', 'jfif', 'png_file', 'exif', 'iptc', 'xmp', 'icc', 'photoshop', 'maker_notes', 'mpf', 'thumbnail']);
const GROUP_MODULES = {
    jfif: 'jfif',
    pngFile: 'png_file',
    xmp: 'xmp',
    icc: 'icc',
    mpf: 'mpf',
    photoshop: 'photoshop',
    makerNotes: 'maker_notes'
};
const COMPOSABLE_FORMATS = ['tiff', 'jpeg', 'png', 'heic', 'avif', 'jxl', 'webp', 'gif', 'xml'];
const COMPOSABLE_GROUP_MODULES = {
    iptc: 'iptc',
    xmp: 'xmp',
    icc: 'icc',
    photoshop: 'photoshop',
    mpf: 'mpf',
    maker_notes: 'makerNotes',
    thumbnail: 'thumbnail'
};
const COMPOSABLE_RESULT_GROUPS = ['gps', 'composite'];
const COMPOSABLE_GROUPS = ['iptc', 'xmp', 'icc', 'photoshop', 'mpf', 'makerNotes', 'gps', 'composite', 'thumbnail'];
const DOM_PARSER_COMMENT = '// Outside browsers, xmp needs a domParser in createReader, for example '
    + 'new DOMParser({onError: onErrorStopParsing}) from @xmldom/xmldom.';
const MAKER_NOTE_COMMENT_END = ' decodes the maker notes in these images but no other make. '
    + 'Use makerNotes instead to get every maker note decoder, including the ones later releases add.';
const THUMBNAIL_NON_TAG_KEYS = ['image', 'base64', 'type'];
const GPS_POINTER = 'GPS Info IFD Pointer';
const INTEROPERABILITY_POINTER = 'Interoperability IFD Pointer';

module.exports = {
    collectImagePaths,
    loadFullParser,
    loadTagBindingName,
    loadIptcTagExportNames,
    loadMakerNoteDecoders,
    resolveDomParser,
    analyzeImages,
    deriveConfig,
    deriveImports,
    writeConfigToPackageJson
};

/**
 * Expand the named files and directories into a sorted list of files.
 * Directories are walked recursively, following symlinks.
 *
 * @param {string[]} paths Absolute paths of files and directories.
 * @param {Object} fs Node's fs module or a stand-in with statSync, readdirSync
 *   and realpathSync.
 * @returns {{paths: string[], skipped: {path: string, message: string}[]}}
 *   Throws when a named path cannot be read. Entries found during the walk
 *   that cannot be read go to skipped.
 */
function collectImagePaths(paths, fs) {
    const walk = {fs, files: new Set(), skipped: [], visitedDirectories: new Set()};
    for (const namedPath of paths) {
        const resolvedPath = path.resolve(namedPath);
        let stats;
        try {
            stats = fs.statSync(resolvedPath);
        } catch (error) {
            throw new Error(`Could not read ${resolvedPath}: ${error.message}`);
        }
        addEntry(resolvedPath, stats, walk);
    }
    return {paths: Array.from(walk.files).sort(), skipped: walk.skipped};
}

function addEntry(entryPath, stats, walk) {
    if (!stats.isDirectory()) {
        walk.files.add(entryPath);
        return;
    }
    try {
        const realDirectory = walk.fs.realpathSync(entryPath);
        if (walk.visitedDirectories.has(realDirectory)) {
            return;
        }
        walk.visitedDirectories.add(realDirectory);
        for (const name of walk.fs.readdirSync(entryPath)) {
            addWalkedEntry(path.join(entryPath, name), walk);
        }
    } catch (error) {
        walk.skipped.push({path: entryPath, message: error.message});
    }
}

function addWalkedEntry(entryPath, walk) {
    let stats;
    try {
        stats = walk.fs.statSync(entryPath);
    } catch (error) {
        walk.skipped.push({path: entryPath, message: error.message});
        return;
    }
    addEntry(entryPath, stats, walk);
}

/**
 * Load the ExifReader ES module source, which always has every module, unlike
 * dist/exif-reader.js which may be a custom build.
 *
 * @returns {Promise<Object>} The ExifReader default export.
 */
function loadFullParser() {
    const sourceUrl = url.pathToFileURL(path.join(EXIFREADER_ROOT_DIR, 'src', 'exif-reader.js')).href;
    return import(sourceUrl).then((sourceModule) => sourceModule.default);
}

/**
 * Load the function that names the exports of exifreader/tags/*, from the
 * ES module source.
 *
 * @returns {Promise<function(string): string>} Resolves to getTagBindingName.
 */
function loadTagBindingName() {
    const sourceUrl = url.pathToFileURL(path.join(EXIFREADER_ROOT_DIR, 'src', 'composable', 'tag-binding-name.js')).href;
    return import(sourceUrl).then((sourceModule) => sourceModule.getTagBindingName);
}

/**
 * Load the names exifreader/tags/iptc exports, from the ES module source.
 *
 * @returns {Promise<string[]>}
 */
function loadIptcTagExportNames() {
    const sourceUrl = url.pathToFileURL(path.join(EXIFREADER_ROOT_DIR, 'src', 'composable', 'tags', 'iptc.js')).href;
    return import(sourceUrl).then((sourceModule) => Object.keys(sourceModule));
}

/**
 * Load the maker note decoders of the composable makerNotes group, in the
 * order the reader tries them, from the ES module source.
 *
 * @returns {Promise<{name: string, matches: function(Object): boolean}[]>}
 */
function loadMakerNoteDecoders() {
    const sourceUrl = url.pathToFileURL(path.join(EXIFREADER_ROOT_DIR, 'src', 'composable', 'groups', 'maker-notes.js')).href;
    return import(sourceUrl).then((sourceModule) => sourceModule.makerNotes.decoders);
}

/**
 * Create the xmldom DOM parser the way src/dom-parser.js does, resolving the
 * package from the exifreader directory first and then from cwd.
 *
 * @param {string} cwd The directory the command runs in.
 * @param {Object} [options] Stand-ins for require.resolve (resolve) and
 *   require (require).
 * @returns {Object|undefined} The DOM parser, or undefined when xmldom is not
 *   available.
 */
function resolveDomParser(cwd, options) {
    options = options || {};
    const resolve = options.resolve || require.resolve;
    const load = options.require || require;
    try {
        const {DOMParser, onErrorStopParsing} = load(resolve('@xmldom/xmldom', {paths: [EXIFREADER_ROOT_DIR, cwd]}));
        return new DOMParser({onError: onErrorStopParsing});
    } catch (error) {
        return undefined;
    }
}

/**
 * Parse each file with the given parser into expanded tags.
 *
 * @param {string[]} paths Absolute file paths.
 * @param {{fs: Object, parser: Object, domParser: (Object|undefined)}} deps
 * @returns {Promise<{results: {path: string, tags: Object}[], skipped: {path: string, message: string}[]}>}
 *   Files that cannot be read or parsed go to skipped.
 */
async function analyzeImages(paths, deps) {
    const results = [];
    const skipped = [];
    for (const filePath of paths) {
        try {
            const buffer = deps.fs.readFileSync(filePath);
            const tags = await deps.parser.load(buffer, {expanded: true, async: true, domParser: deps.domParser});
            results.push({path: filePath, tags});
        } catch (error) {
            skipped.push({path: filePath, message: error.message});
        }
    }
    return {results, skipped};
}

/**
 * Derive the smallest include configuration that reads everything found in
 * the given parse results.
 *
 * @param {Object[]} results Expanded ExifReader results.
 * @param {string} [product] What the warnings call the result: 'build' or 'reader'.
 * @returns {{config: {include: Object}, fileTypes: string[], warnings: string[]}}
 */
function deriveConfig(results, product = 'build') {
    const found = {modules: new Set(), exifNames: new Set(), iptcNames: new Set(), fileTypes: new Set(), exifArray: false};
    for (const tags of results) {
        observeResult(tags, found);
    }

    const modules = {};
    for (const moduleName of found.modules) {
        modules[moduleName] = true;
    }
    if (found.modules.has('iptc')) {
        modules.iptc = Array.from(found.iptcNames).sort();
    }
    if (found.exifArray) {
        modules.exif = withoutInjectedNames(Array.from(found.exifNames), modules).sort();
    }

    const include = {};
    for (const moduleName of MODULE_ORDER.filter((name) => name in modules)) {
        include[moduleName] = modules[moduleName];
    }

    return {
        config: {include},
        fileTypes: Array.from(found.fileTypes).sort(),
        warnings: warningsFor(found.modules, product)
    };
}

function observeResult(tags, found) {
    const fileType = tags.file.FileType.value;
    found.fileTypes.add(fileType);
    if (FORMATS.includes(fileType)) {
        found.modules.add(fileType);
    }
    if (fileType === 'jpeg' && Object.keys(tags.file).some((name) => name !== 'FileType')) {
        found.modules.add('file');
    }
    for (const group of Object.keys(GROUP_MODULES)) {
        if (group in tags) {
            found.modules.add(GROUP_MODULES[group]);
        }
    }
    if ('iptc' in tags) {
        found.modules.add('iptc');
        addNames(found.iptcNames, Object.keys(tags.iptc));
    }
    if ('exif' in tags) {
        found.exifArray = true;
        addNames(found.exifNames, exifGroupNames(tags));
    }
    observeThumbnail(tags.Thumbnail, found);
    observeThumbnail(tags.exif && tags.exif.Thumbnail, found);
    if ('makerNotes' in tags || 'photoshop' in tags || (fileType === 'tiff' && ['iptc', 'xmp', 'icc'].some((group) => group in tags))) {
        found.exifArray = true;
    }
}

function exifGroupNames(tags) {
    return Object.keys(tags.exif).filter((name) => name !== 'Thumbnail');
}

function addNames(names, newNames) {
    for (const name of newNames) {
        names.add(name);
    }
}

function observeThumbnail(thumbnail, found) {
    if (thumbnail === undefined) {
        return;
    }
    found.modules.add('thumbnail');
    found.exifArray = true;
    addNames(found.exifNames, Object.keys(thumbnail).filter((name) => !THUMBNAIL_NON_TAG_KEYS.includes(name)));
}

// Mirrors the tags webpack.config.js getConfig() adds to an exif array, so the
// derived array does not repeat them. A pointer is only left out when another
// name will make the build add it.
function withoutInjectedNames(names, modules) {
    const otherNames = names.filter((name) => name !== GPS_POINTER && name !== INTEROPERABILITY_POINTER);
    const injected = ['Exif IFD Pointer'];
    if (otherNames.some((name) => name.toLowerCase().startsWith('gps'))) {
        injected.push(GPS_POINTER);
    }
    if (otherNames.some((name) => /^(interoperability|relatedimage)/i.test(name))) {
        injected.push(INTEROPERABILITY_POINTER);
    }
    if (modules.iptc) {
        injected.push('IPTC-NAA');
    }
    if (modules.xmp) {
        injected.push('ApplicationNotes');
    }
    if (modules.icc) {
        injected.push('ICC_Profile');
    }
    if (modules.photoshop) {
        injected.push('ImageSourceData', 'PhotoshopSettings');
    }
    if (modules.thumbnail) {
        injected.push('JPEGInterchangeFormat', 'JPEGInterchangeFormatLength');
    }
    if (modules.maker_notes) {
        injected.push('MakerNote', 'Make');
    }
    return names.filter((name) => !injected.includes(name));
}

function warningsFor(modules, product) {
    const warnings = [];
    const missingFormats = FORMATS.filter((format) => !modules.has(format)).map((format) => FORMAT_NAMES[format]);
    if (missingFormats.length > 0) {
        warnings.push(missingFormatsWarning(missingFormats, product));
    }
    warnings.push(`Tags and metadata groups that do not appear in these images are left out of the ${product}, so pass a `
        + 'sample of every kind of image your app reads, all in one run.');
    return warnings;
}

function missingFormatsWarning(names, product) {
    if (names.length === 1) {
        return `No ${names[0]} images were found, so the ${product} will not read that format.`;
    }
    return `No ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]} images were found, so the ${product} `
        + 'will not read those formats.';
}

/**
 * Derive the createReader imports of the composable API that read everything
 * found in the given parse results.
 *
 * @param {Object[]} results Expanded ExifReader results.
 * @param {function(string): string} getTagBindingName The function
 *   loadTagBindingName resolves to.
 * @param {string[]} iptcTagExportNames The names loadIptcTagExportNames
 *   resolves to.
 * @param {{name: string, matches: function(Object): boolean}[]} makerNoteDecoders
 *   The decoders loadMakerNoteDecoders resolves to. The group of the one that
 *   decodes every maker note found replaces makerNotes.
 * @returns {string} JavaScript import lines and a createReader call.
 */
function deriveImports(results, getTagBindingName, iptcTagExportNames, makerNoteDecoders) {
    const derived = deriveConfig(results);
    const formats = COMPOSABLE_FORMATS.filter((name) => derived.fileTypes.includes(name));
    const iptcTags = composableIptcTags(results, getTagBindingName, iptcTagExportNames);
    const makerNoteGroup = singleMakerNoteDecoderName(results, makerNoteDecoders);
    const groups = composableGroups(derived.config.include, results, formats)
        .filter((name) => name !== 'iptc' || iptcTags.length === 0)
        .map((name) => name === 'makerNotes' && makerNoteGroup ? makerNoteGroup : name);
    const tables = [
        {key: 'formats', names: formats, specifier: 'exifreader/formats'},
        {key: 'groups', names: groups, specifier: 'exifreader/groups'},
        {key: 'tags', names: composableTags(results, getTagBindingName), specifier: 'exifreader/tags/exif'},
        {key: 'tags', names: iptcTags, specifier: 'exifreader/tags/iptc'}
    ].filter((table) => table.names.length > 0);

    const lines = ['import {createReader} from \'exifreader/core\';']
        .concat(tables.map((table) => `import {${table.names.join(', ')}} from '${table.specifier}';`), ['']);
    if (groups.includes('xmp')) {
        lines.push(DOM_PARSER_COMMENT);
    }
    if (groups.includes(makerNoteGroup)) {
        lines.push(`// ${makerNoteGroup}${MAKER_NOTE_COMMENT_END}`);
    }
    const entries = getEntries(tables).map((entry) => `${entry.key}: [${entry.names.join(', ')}]`);
    lines.push(`const reader = createReader({${entries.join(', ')}});`);
    return lines.join('\n');
}

// The name of the one decoder that reads every maker note found, or undefined
// when a maker note has none or the maker notes need more than one. The first
// decoder to match wins, as in readMakerNoteWithDecoders.
function singleMakerNoteDecoderName(results, makerNoteDecoders) {
    const names = new Set();
    for (const tags of results.filter((result) => 'makerNotes' in result || (result.exif && 'MakerNote' in result.exif))) {
        const exif = tags.exif || {};
        const block = {make: exif.Make && exif.Make.value, bytes: exif.MakerNote && exif.MakerNote.value};
        const decoder = makerNoteDecoders.find((candidate) => candidate.matches(block));
        if (!decoder) {
            return undefined;
        }
        names.add(decoder.name);
    }
    return names.size === 1 ? Array.from(names)[0] : undefined;
}

// Every iptc name as a tag, or none when exifreader/tags/iptc has no export
// for a name, as the iptc group then has to read it.
function composableIptcTags(results, getTagBindingName, iptcTagExportNames) {
    const names = new Set();
    for (const tags of results.filter((result) => 'iptc' in result)) {
        addNames(names, Object.keys(tags.iptc));
    }
    const bindingNames = Array.from(names).map((name) => getTagBindingName(name));
    if (bindingNames.some((bindingName) => !iptcTagExportNames.includes(bindingName))) {
        return [];
    }
    return bindingNames.sort();
}

// An XMP sidecar is read only with xmp composed, and the gps and composite
// groups have no custom build module of their own.
function composableGroups(include, results, formats) {
    const groups = new Set(Object.keys(include)
        .filter((name) => name in COMPOSABLE_GROUP_MODULES)
        .map((name) => COMPOSABLE_GROUP_MODULES[name]));
    for (const group of COMPOSABLE_RESULT_GROUPS.filter((name) => results.some((tags) => name in tags))) {
        groups.add(group);
    }
    if (formats.includes('xml')) {
        groups.add('xmp');
    }
    return COMPOSABLE_GROUPS.filter((name) => groups.has(name));
}

// Every exif name, the ones a composed group reads included: a reader returns
// those only when they are in its tags.
function composableTags(results, getTagBindingName) {
    const names = new Set();
    for (const tags of results.filter((result) => 'exif' in result)) {
        addNames(names, exifGroupNames(tags).map((name) => getTagBindingName(name)));
    }
    return Array.from(names).sort();
}

// One entry per key, so the exif and iptc tag tables make one tags entry.
function getEntries(tables) {
    const entries = [];
    for (const table of tables) {
        const entry = entries.find(({key}) => key === table.key);
        if (entry) {
            entry.names = entry.names.concat(table.names);
        } else {
            entries.push({key: table.key, names: table.names});
        }
    }
    return entries;
}

/**
 * Set the include section of the "exifreader" key in a package.json file,
 * replacing any include or exclude section there and keeping everything else,
 * including the indentation, line endings, trailing newline and a leading
 * byte order mark.
 *
 * @param {string} filePath Path of the package.json file.
 * @param {Object} include The include section to write.
 * @param {Object} fs Node's fs module or a stand-in with readFileSync and
 *   writeFileSync.
 * @returns {{created: boolean, replaced: (Object|undefined)}} created is true
 *   when there was no "exifreader" object. replaced holds the include and
 *   exclude sections that were replaced, if any. Throws when the file cannot
 *   be read or is not valid JSON.
 */
function writeConfigToPackageJson(filePath, include, fs) {
    const original = fs.readFileSync(filePath, 'utf8');
    const byteOrderMark = original.startsWith('\uFEFF') ? '\uFEFF' : '';
    const text = original.slice(byteOrderMark.length);
    const packageJson = JSON.parse(text);

    const indentMatch = /^([ \t]+)"/m.exec(text);
    const indent = indentMatch ? indentMatch[1] : '  ';
    const newline = text.includes('\r\n') ? '\r\n' : '\n';
    const trailingNewline = text.endsWith('\n') ? newline : '';

    const update = updatedSection(packageJson.exifreader, include);
    packageJson.exifreader = update.section;

    const json = JSON.stringify(packageJson, null, indent).replace(/\n/g, newline);
    fs.writeFileSync(filePath, byteOrderMark + json + trailingNewline);
    return {created: update.created, replaced: update.replaced};
}

function updatedSection(section, include) {
    if (section === null || typeof section !== 'object' || Array.isArray(section)) {
        return {section: {include}, created: true, replaced: undefined};
    }

    const entries = [];
    const replaced = {};
    let placed = false;
    for (const [key, value] of Object.entries(section)) {
        if (key !== 'include' && key !== 'exclude') {
            entries.push([key, value]);
            continue;
        }
        replaced[key] = value;
        if (!placed) {
            entries.push(['include', include]);
            placed = true;
        }
    }
    if (!placed) {
        entries.push(['include', include]);
    }
    return {section: Object.fromEntries(entries), created: false, replaced: placed ? replaced : undefined};
}
