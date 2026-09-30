/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MARKER_FILE_NAME = '.exifreader-custom-build.json';

module.exports = {MARKER_FILE_NAME, configHash, readMarker, writeMarker, removeMarker, markerMatches};

/**
 * Hash a custom build configuration so that key order does not matter.
 *
 * @param {object} config The JSON-derived `exifreader` config object.
 * @returns {string} The sha256 hex digest of the config.
 */
function configHash(config) {
    return crypto.createHash('sha256').update(stableStringify(config)).digest('hex');
}

function stableStringify(value) {
    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']';
    }
    if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',') + '}';
    }
    return JSON.stringify(value);
}

/**
 * Read the custom build marker in a dist directory.
 *
 * @param {string} distDir The package's dist directory.
 * @returns {{configHash: string, version: string}|undefined} The parsed marker,
 *   or undefined when the file is missing or is not valid JSON.
 */
function readMarker(distDir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(distDir, MARKER_FILE_NAME), 'utf8'));
    } catch (error) {
        return undefined;
    }
}

/**
 * Record which config and exifreader version a custom bundle was built from.
 *
 * @param {string} distDir The package's dist directory.
 * @param {object} config The `exifreader` config object that was built.
 * @param {string} version The exifreader version that was built.
 */
function writeMarker(distDir, config, version) {
    fs.writeFileSync(path.join(distDir, MARKER_FILE_NAME), JSON.stringify({configHash: configHash(config), version}));
}

/**
 * Remove the custom build marker from a dist directory, if there is one.
 *
 * @param {string} distDir The package's dist directory.
 */
function removeMarker(distDir) {
    fs.rmSync(path.join(distDir, MARKER_FILE_NAME), {force: true});
}

/**
 * Tell whether a marker was written for this config and exifreader version.
 *
 * @param {{configHash: string, version: string}|undefined} marker The result of readMarker.
 * @param {object} config The `exifreader` config object to compare with.
 * @param {string} version The exifreader version to compare with.
 * @returns {boolean} True only when both the config hash and the version match.
 */
function markerMatches(marker, config, version) {
    return !!marker && marker.configHash === configHash(config) && marker.version === version;
}
