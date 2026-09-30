/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const MAX_SHOWN_LENGTH = 80;

module.exports = {diffResults, verifyImages, loadCustomParser};

/**
 * Compare two expanded ExifReader results.
 *
 * @param {Object} full The result from the full parser.
 * @param {Object} custom The result from the custom build.
 * @returns {string[]} One line per difference, each starting with the path of
 *   the value, for example "exif.DateTime" or "mpf.Images[0].image".
 */
function diffResults(full, custom) {
    const differences = [];
    compareValues(full, custom, '', differences);
    return differences;
}

function compareValues(full, custom, valuePath, differences) {
    const fullBytes = bytesOf(full);
    const customBytes = bytesOf(custom);
    if (fullBytes && customBytes) {
        if (!sameBytes(fullBytes, customBytes)) {
            differences.push(`${valuePath}: bytes differ`);
        }
        return;
    }
    if (!fullBytes && !customBytes && isObject(full) && isObject(custom) && Array.isArray(full) === Array.isArray(custom)) {
        compareKeys(full, custom, valuePath, differences);
        return;
    }
    if (!Object.is(full, custom)) {
        differences.push(`${valuePath}: ${shown(full)} in the full parser, ${shown(custom)} in the custom build`);
    }
}

function bytesOf(value) {
    if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') {
        return new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    return undefined;
}

function sameBytes(bytes0, bytes1) {
    if (bytes0.length !== bytes1.length) {
        return false;
    }
    return bytes0.every((byte, index) => byte === bytes1[index]);
}

function isObject(value) {
    return value !== null && typeof value === 'object';
}

function compareKeys(full, custom, valuePath, differences) {
    const isArray = Array.isArray(full);
    for (const key of Object.keys(full)) {
        const keyPath = childPath(valuePath, key, isArray);
        if (Object.prototype.hasOwnProperty.call(custom, key)) {
            compareValues(full[key], custom[key], keyPath, differences);
        } else {
            differences.push(`${keyPath}: missing from the custom build`);
        }
    }
    for (const key of Object.keys(custom)) {
        if (!Object.prototype.hasOwnProperty.call(full, key)) {
            differences.push(`${childPath(valuePath, key, isArray)}: only in the custom build`);
        }
    }
}

function childPath(valuePath, key, isArray) {
    if (isArray) {
        return `${valuePath}[${key}]`;
    }
    return valuePath === '' ? key : `${valuePath}.${key}`;
}

function shown(value) {
    const bytes = bytesOf(value);
    if (bytes) {
        return `<${bytes.length} bytes>`;
    }
    const text = value === undefined ? 'undefined' : JSON.stringify(value);
    return text.length > MAX_SHOWN_LENGTH ? `${text.slice(0, MAX_SHOWN_LENGTH - 3)}...` : text;
}

/**
 * Parse each file with the full parser and the custom build, using the same
 * options on both sides, and compare the results.
 *
 * @param {string[]} paths Absolute file paths.
 * @param {{fs: Object, fullParser: Object, customParser: Object, domParser: (Object|undefined)}} deps
 * @returns {Promise<{results: {path: string, differences: string[]}[], skipped: {path: string, message: string}[]}>}
 *   Files that cannot be read, or that the full parser cannot parse, go to
 *   skipped.
 */
async function verifyImages(paths, deps) {
    const results = [];
    const skipped = [];
    for (const filePath of paths) {
        let buffer;
        let full;
        try {
            buffer = deps.fs.readFileSync(filePath);
            full = await deps.fullParser.load(buffer, parseOptions(deps.domParser));
        } catch (error) {
            skipped.push({path: filePath, message: error.message});
            continue;
        }
        results.push({path: filePath, differences: await customDifferences(full, buffer, deps)});
    }
    return {results, skipped};
}

function parseOptions(domParser) {
    return {expanded: true, async: true, domParser};
}

async function customDifferences(full, buffer, deps) {
    let custom;
    try {
        custom = await deps.customParser.load(buffer, parseOptions(deps.domParser));
    } catch (error) {
        return [`the custom build failed: ${error.message}`];
    }
    return diffResults(full, custom);
}

/**
 * Load the custom bundle, bypassing the require cache so a bundle rebuilt in
 * this process is read again.
 *
 * @param {string} distPath Absolute path of dist/exif-reader.js.
 * @returns {Object} The ExifReader export of the bundle.
 */
function loadCustomParser(distPath) {
    delete require.cache[require.resolve(distPath)];
    return require(distPath);
}
