/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Runs unchanged under Node, Bun and Deno from a consumer that has the package
// at node_modules/exifreader. Usage: <runtime> runtime-smoke.mjs <path to test.jpg>

import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ExifReader from 'exifreader';

const SPECIFIERS = [
    'exifreader',
    'exifreader/package.json',
    'exifreader/src/exif-reader.js',
    'exifreader/dist/exif-reader.js',
    'exifreader/src/exif-reader',
    'exifreader/dist/exif-reader',
    'exifreader/src/composable/x.js'
];
const ROOT_FILE_SUFFIX = 'node_modules/exifreader/dist/exif-reader.js';
const EXPECTED_TAG = '2011:06:28 12:06:14';

const require = createRequire(import.meta.url);
const report = {
    import: resolveAll(resolveWithImport),
    require: resolveAll((specifier) => require.resolve(specifier)),
    tag: readTag(process.argv[2])
};
process.stdout.write(`${JSON.stringify(report)}\n`);

const failures = findFailures(report);
if (failures.length > 0) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exitCode = 1;
}

function resolveAll(resolveSpecifier) {
    const resolutions = {};
    SPECIFIERS.forEach((specifier) => {
        try {
            resolutions[specifier] = resolveSpecifier(specifier);
        } catch (error) {
            resolutions[specifier] = {error: error.code || error.message};
        }
    });
    return resolutions;
}

function resolveWithImport(specifier) {
    const resolved = import.meta.resolve(specifier);
    return resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved;
}

function readTag(fixturePath) {
    try {
        return ExifReader.load(fs.readFileSync(fixturePath)).DateTimeDigitized.description;
    } catch (error) {
        return {error: error.message};
    }
}

function findFailures({import: imported, require: required, tag}) {
    const reasons = [];
    [['import', imported], ['require', required]].forEach(([kind, resolutions]) => {
        const resolved = resolutions.exifreader;
        if (typeof resolved !== 'string' || !resolved.replace(/\\/g, '/').endsWith(ROOT_FILE_SUFFIX)) {
            reasons.push(`exifreader under ${kind} resolved to ${JSON.stringify(resolved)}, expected ...${ROOT_FILE_SUFFIX}`);
        }
    });
    if (tag !== EXPECTED_TAG) {
        reasons.push(`DateTimeDigitized was ${JSON.stringify(tag)}, expected ${JSON.stringify(EXPECTED_TAG)}`);
    }
    return reasons;
}
