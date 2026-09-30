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
const THUMBNAIL_NON_TAG_KEYS = ['image', 'base64', 'type'];
const GPS_POINTER = 'GPS Info IFD Pointer';
const INTEROPERABILITY_POINTER = 'Interoperability IFD Pointer';

module.exports = {
    collectImagePaths,
    loadFullParser,
    resolveDomParser,
    analyzeImages,
    deriveConfig,
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
 * @returns {{config: {include: Object}, fileTypes: string[], warnings: string[]}}
 */
function deriveConfig(results) {
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
        warnings: warningsFor(found.modules)
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
        addNames(found.exifNames, Object.keys(tags.exif).filter((name) => name !== 'Thumbnail'));
    }
    observeThumbnail(tags.Thumbnail, found);
    observeThumbnail(tags.exif && tags.exif.Thumbnail, found);
    if ('makerNotes' in tags || 'photoshop' in tags || (fileType === 'tiff' && ['iptc', 'xmp', 'icc'].some((group) => group in tags))) {
        found.exifArray = true;
    }
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

function warningsFor(modules) {
    const warnings = [];
    const missingFormats = FORMATS.filter((format) => !modules.has(format)).map((format) => FORMAT_NAMES[format]);
    if (missingFormats.length > 0) {
        warnings.push(missingFormatsWarning(missingFormats));
    }
    warnings.push('Tags and metadata groups that do not appear in these images are left out of the build, so pass a '
        + 'sample of every kind of image your app reads, all in one run.');
    return warnings;
}

function missingFormatsWarning(names) {
    if (names.length === 1) {
        return `No ${names[0]} images were found, so the build will not read that format.`;
    }
    return `No ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]} images were found, so the build `
        + 'will not read those formats.';
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
