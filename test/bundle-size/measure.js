/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-disable no-console */

// The bundle-size gate. Packs the working tree, builds every consumer in
// consumers/ against the packed package with a stock webpack and with esbuild,
// builds the full default bundle from source, and checks the sizes against the
// fixed numbers in baseline.json, the strings each bundle must and must not
// carry, and that every emitted bundle still parses.
//
// Run with `npm run test:bundle-size`. A CI job runs it; it is not part of
// pre-commit or test:all, since it builds every consumer with both bundlers.

const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {packAndExtract} = require('../packaging/pack-tarball.js');
const {MODULE_MARKERS, assertMarkersAreUnique, bundleContains, getModulesPresentIn} = require('./markers.js');
const BASELINE = require('./baseline.json');

const ROOT_PATH = path.join(__dirname, '..', '..');
const STOCK_CONFIG = path.join(__dirname, 'webpack.stock.config.js');
const WEBPACK = path.join(ROOT_PATH, 'node_modules', '.bin', 'webpack');
const CONSUMERS_PATH = path.join(__dirname, 'consumers');
const FIXTURE = path.join(ROOT_PATH, 'test', 'fixtures', 'images', 'test.jpg');
const MIN_PLAUSIBLE_BUNDLE_SIZE = 2000;
const BUILD_TIMEOUT_MS = 5 * 60 * 1000;
const BUNDLERS = ['webpack', 'esbuild'];
const FULL_DIST = 'full dist';
// The same ratio as the dist's maxRatio; these consumers grow with every added tag.
const CONSUMER_MAX_RATIO = 1.04;
const RATIO_CONSUMERS = ['composable-jpeg-exif', 'legacy-stock'];
// Lets small changes land without a new floor.
const FLOOR_MAX_RATIO = 1.02;

// Quoted, so DateTimeOriginal and DateTimeDigitized cannot mask the DateTime descriptor.
const DATETIME_DESCRIPTOR = {marker: '\'DateTime\'', why: 'the DateTime descriptor'};

// Strings from the tag dictionaries that a reader composing at most DateTime
// must not carry.
const PER_TAG_PROOFS = [
    {marker: 'Version 2.2', why: 'the description of GPSVersionID, an unimported GPS tag'},
    {marker: 'Uncalibrated', why: 'a description in tag-names-common.js, the shared description dictionary'},
    {marker: '[JIS encoded text]', why: 'getEncodedString in tag-names-utils.js'},
    {marker: 'ProcessingSoftware', why: 'the 0th IFD dictionary'},
    {marker: 'SpectralSensitivity', why: 'the Exif IFD dictionary'},
    {marker: 'GPSLatitude', why: 'an unimported GPS tag'}
];

// The tag filter (createTagFilter, narrowIncludeTags, assertOptions) as the minifier emits it.
const TAG_FILTER_MARKERS = [
    {marker: 'excludeAll', why: 'the tag filter, which this reader did not compose'},
    {marker: 'ids.indexOf(', why: 'the tag filter, which this reader did not compose'},
    {marker: '[[0,31]]', why: 'the tag filter, which this reader did not compose'},
    {marker: 'has no group', why: 'the tag filter, which this reader did not compose'}
];

// Quoted names from the IPTC dictionary that a reader composing only By-line
// must not carry.
const IPTC_PER_TAG_PROOFS = [
    {marker: '\'Headline\'', why: 'an unimported IPTC tag'},
    {marker: '\'Caption/Abstract\'', why: 'an unimported IPTC tag'},
    {marker: '\'Coded Character Set\'', why: 'the IPTC tag the reader reads the text encoding from, but did not import'},
    {marker: '\'Keywords\'', why: 'an unimported repeatable IPTC tag'}
];

const LIGHT_SOURCE_TABLE = {marker: 'ISO studio tungsten', why: 'the LightSource table in tag-names-common.js, which XMP does not describe'};

const ABSENCE_CHECKS = {
    'composable-jpeg-floor': PER_TAG_PROOFS.concat([DATETIME_DESCRIPTOR], TAG_FILTER_MARKERS),
    'composable-jpeg-iptc-byline': PER_TAG_PROOFS.concat([DATETIME_DESCRIPTOR], TAG_FILTER_MARKERS, IPTC_PER_TAG_PROOFS),
    'composable-tiff-floor': PER_TAG_PROOFS.concat([DATETIME_DESCRIPTOR], TAG_FILTER_MARKERS),
    'composable-jpeg-datetime': PER_TAG_PROOFS.concat(TAG_FILTER_MARKERS),
    'composable-jpeg-xmp': [LIGHT_SOURCE_TABLE],
    'composable-tiff-gps': [
        DATETIME_DESCRIPTOR,
        {marker: 'ExposureTime', why: 'an unimported Exif tag'},
        {marker: 'SpectralSensitivity', why: 'an unimported Exif tag'},
        {marker: 'GPSSatellites', why: 'an unimported GPS tag'},
        {marker: 'Version 2.2', why: 'the description of GPSVersionID, an unimported GPS tag'},
        {marker: 'Uncalibrated', why: 'a description in tag-names-common.js, the shared description dictionary'},
        {marker: '[JIS encoded text]', why: 'getEncodedString, a sibling export of the getCalculatedGpsValue this reader imports'},
        {marker: 'Photoshop 3.0', why: 'the JPEG finder, in a tiff-only reader'}
    ]
};

// A code use of Buffer. The lookbehind keeps ArrayBuffer., globalThis.Buffer.
// and the "a Node Buffer, or" text of core.js's input message out.
const BUFFER_CODE = /\btypeof Buffer\b|(?<![\w$.])Buffer\s*\.|\bnew Buffer\b|\binstanceof Buffer\b/;
const BUFFER_CHECK = {marker: BUFFER_CODE, why: 'a code use of Buffer, which makes CDNs add a buffer polyfill'};

// What the composed formats and groups may bring along, the modules this gate
// allows. Any other probed module in a composable bundle is a module
// the consumer did not compose, the default-entry-only ones included.
const CORE = ['unsupported-format-error.js', 'image-header.js', 'loadview-pipeline.js', 'engine.js', 'tag-filter-config.js', 'utils.js'];
const JPEG = [
    'file-tags.js',
    'jfif-tags.js',
    'image-header-jpeg.js:warnAboutMultipleExifSegments',
    'image-header-jpeg.js:APP13_IPTC_IDENTIFIER'
];
const EXIF_GROUP = [
    'tag-names-0th-ifd.js',
    'tag-names-0th-ifd-descriptions.js',
    'tag-names-exif-ifd.js',
    'tag-names-exif-ifd-descriptions.js',
    'tag-names-gps-ifd.js',
    'tag-names-gps-ifd-descriptions.js',
    'tag-names-interoperability-ifd.js',
    'tag-names-utils.js:getEncodedString'
];
const XMP_GROUP = ['xmp-tags.js', 'xmp-namespaces.js', 'xmp-tag-names.js'];
const ALLOWED_MODULES = {
    'composable-jpeg-floor': CORE.concat(JPEG),
    'composable-tiff-floor': CORE,
    'composable-jpeg-datetime': CORE.concat(JPEG),
    'composable-jpeg-datetime-filter': CORE.concat(JPEG),
    'composable-jpeg-exif': CORE.concat(JPEG, EXIF_GROUP),
    'composable-jpeg-iptc-byline': CORE.concat(JPEG, ['iptc-tags.js']),
    'composable-jpeg-xmp': CORE.concat(JPEG, XMP_GROUP),
    'composable-tiff-gps': CORE
};

// An absence proves nothing about a string no bundle ever holds, so each marker
// the absence checks rely on is shown present somewhere, in the same bundler.
const PRESENCE_CHECKS = {
    'composable-jpeg-exif': PER_TAG_PROOFS.map(getMarker).concat([DATETIME_DESCRIPTOR.marker, 'ExposureTime', 'GPSSatellites', LIGHT_SOURCE_TABLE.marker]),
    'composable-jpeg-datetime-filter': TAG_FILTER_MARKERS.map(getMarker),
    'legacy-stock': ['Photoshop 3.0', BUFFER_CODE].concat(getModuleMarkersLeftOut(), IPTC_PER_TAG_PROOFS.map(getMarker))
};

// Tree-shaking that removes something load-bearing only shows when the emitted
// bundle runs, so every bundle parses input holding the tags it composed.
//
// A big-endian TIFF: a 0th IFD with DateTime and a GPS pointer, and a GPS IFD
// with GPSLatitudeRef. Crafted rather than read from test/fixtures, because
// none of the images in the repository carry GPS.
const TIFF_WITH_DATE_AND_GPS =
    'MM\x00\x2a\x00\x00\x00\x08'
    + '\x00\x02'
    + '\x01\x32\x00\x02\x00\x00\x00\x14\x00\x00\x00\x38'
    + '\x88\x25\x00\x04\x00\x00\x00\x01\x00\x00\x00\x26'
    + '\x00\x00\x00\x00'
    + '\x00\x01'
    + '\x00\x01\x00\x02\x00\x00\x00\x02\x4e\x00\x00\x00'
    + '\x00\x00\x00\x00'
    + '2026:08:28 12:34:56\x00';

const JPEG_WITH_DATE_AND_GPS =
    '\xff\xd8\xff\xe1\x00\x54Exif\x00\x00' + TIFF_WITH_DATE_AND_GPS + '\xff\xda\x00\x02';

const DATETIME = '2026:08:28 12:34:56';

// An APP13 IPTC block: Coded Character Set ISO-8859-5, By-line, then Headline.
// Cyrillic text shows the charset was applied, which a Latin-1 fallback could not fake.
const JPEG_WITH_IPTC =
    '\xff\xd8\xff\xed\x00\x33Photoshop 3.0\x00'
    + '8BIM\x04\x04\x00\x00\x00\x00\x00\x17'
    + '\x1c\x01\x5a\x00\x03\x1b\x2f\x40'
    + '\x1c\x02\x50\x00\x04\xb8\xd2\xd0\xdd'
    + '\x1c\x02\x69\x00\x01H'
    + '\xff\xda\x00\x02';

// An XMP packet with a tiff and an exif tag, both described through tag-names-common.js.
const XMP_PACKET = '<x:xmpmeta xmlns:x="adobe:ns:meta/">'
    + '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + '<rdf:Description rdf:about="" xmlns:tiff="http://ns.adobe.com/tiff/1.0/"'
    + ' xmlns:exif="http://ns.adobe.com/exif/1.0/" tiff:ResolutionUnit="2" exif:ColorSpace="1"/>'
    + '</rdf:RDF></x:xmpmeta>';

// Each case lists the exact set of groups and tags the bundle returns.
const CORRECTNESS_CHECKS = [
    {id: 'composable-jpeg-floor', data: JPEG_WITH_DATE_AND_GPS, tags: {file: {FileType: 'JPEG'}}},
    {id: 'composable-tiff-floor', data: TIFF_WITH_DATE_AND_GPS, tags: {file: {FileType: 'TIFF'}}},
    {id: 'composable-jpeg-datetime', data: JPEG_WITH_DATE_AND_GPS, tags: {exif: {DateTime: DATETIME}, file: {FileType: 'JPEG'}}},
    {id: 'composable-jpeg-datetime-filter', data: JPEG_WITH_DATE_AND_GPS, tags: {exif: {DateTime: DATETIME}, file: {FileType: 'JPEG'}}},
    {
        id: 'composable-jpeg-datetime-filter',
        data: JPEG_WITH_DATE_AND_GPS,
        options: {includeTags: {exif: ['DateTime']}},
        tags: {exif: {DateTime: DATETIME}}
    },
    {
        // The whole-group reader keeps the GPS pointer because its dictionary
        // describes it; only the pointers the reader injects itself are removed.
        id: 'composable-jpeg-exif',
        data: JPEG_WITH_DATE_AND_GPS,
        tags: {
            exif: {
                'DateTime': DATETIME,
                'GPS Info IFD Pointer': '38',
                'GPSLatitudeRef': 'North latitude'
            },
            file: {FileType: 'JPEG'}
        }
    },
    {id: 'composable-tiff-gps', data: TIFF_WITH_DATE_AND_GPS, tags: {exif: {GPSLatitudeRef: 'North latitude'}, file: {FileType: 'TIFF'}}},
    {id: 'composable-jpeg-iptc-byline', data: JPEG_WITH_IPTC, tags: {iptc: {'By-line': ['\u0418\u0432\u0430\u043d']}, file: {FileType: 'JPEG'}}},
    {
        // The emitted bundle runs in Node, which has no global DOMParser.
        id: 'composable-jpeg-xmp',
        data: getJpegWithXmp,
        domParser: true,
        tags: {xmp: {_raw: XMP_PACKET, about: '', ResolutionUnit: 'inches', ColorSpace: 'sRGB'}, file: {FileType: 'JPEG'}}
    }
];

// A real file too, since crafted bytes cannot show that a real segment layout
// still parses. Only the one tag is compared, in its group for a composable reader.
const FIXTURE_CHECKS = [
    {id: 'composable-jpeg-exif', group: 'exif', tag: 'DateTimeDigitized', description: '2011:06:28 12:06:14'},
    {id: 'legacy-stock', tag: 'DateTimeDigitized', description: '2011:06:28 12:06:14'}
];

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    assertMarkersAreUnique();

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-bundle-size-'));
    try {
        const {consumerDir} = packAndExtract(tempRoot);
        const consumerIds = getConsumerIds();
        for (const id of consumerIds) {
            fs.copyFileSync(path.join(CONSUMERS_PATH, `${id}.js`), path.join(consumerDir, `${id}.js`));
        }

        const dist = buildFullDist(path.join(tempRoot, 'dist'));
        const bundles = {webpack: {}, esbuild: {}};
        for (const id of consumerIds) {
            const entry = path.join(consumerDir, `${id}.js`);
            bundles.webpack[id] = buildWithWebpack(id, entry, path.join(tempRoot, 'webpack', id));
            bundles.esbuild[id] = await buildWithEsbuild(id, entry, consumerDir, path.join(tempRoot, 'esbuild', `${id}.js`));
        }

        printSizes(consumerIds, dist, bundles);

        const failures = [].concat(
            checkDist(dist),
            checkFloors(consumerIds, bundles),
            checkPlausibility(dist, bundles),
            checkTables(consumerIds),
            checkContents(bundles),
            await checkCorrectness(bundles)
        );

        printFailures(failures);
        if (failures.length > 0) {
            process.exitCode = 1;
        }
    } finally {
        fs.rmSync(tempRoot, {recursive: true, force: true});
    }
}

function getMarker(check) {
    return check.marker;
}

function getModuleMarkersLeftOut() {
    const allowedEverywhere = Object.keys(MODULE_MARKERS).filter((label) => Object.keys(ALLOWED_MODULES)
        .every((id) => ALLOWED_MODULES[id].includes(label)));
    return Object.keys(MODULE_MARKERS)
        .filter((label) => !allowedEverywhere.includes(label))
        .map((label) => MODULE_MARKERS[label]);
}

function getConsumerIds() {
    return fs.readdirSync(CONSUMERS_PATH)
        .filter((fileName) => fileName.endsWith('.js'))
        .map((fileName) => path.basename(fileName, '.js'))
        .sort();
}

function buildFullDist(outputPath) {
    const output = runWebpack(FULL_DIST, ['--output-path', outputPath], getBuildEnv());
    const bundle = measureFile(path.join(outputPath, 'exif-reader.js'));
    // webpack.config.js announces a custom build, and falls back to a config
    // found by walking up from the repository, so this proves the full bundle
    // was built with no configuration.
    bundle.isCustomBuild = output.includes('[INFO] Building custom bundle');
    return bundle;
}

function getBuildEnv(extra) {
    const env = Object.assign({}, process.env, {BABEL_ENV: 'production', NODE_ENV: 'production'}, extra);
    // An inherited one would silently turn every build into a custom one.
    delete env.EXIFREADER_CUSTOM_BUILD;
    return env;
}

function runWebpack(id, args, env) {
    try {
        return execFileSync(WEBPACK, args, {cwd: ROOT_PATH, env, stdio: 'pipe', timeout: BUILD_TIMEOUT_MS}).toString();
    } catch (error) {
        // execFileSync's own message says nothing useful, so print what webpack said.
        console.error(`\nwebpack failed for ${id}:\n${error.stdout}\n${error.stderr}`);
        throw error;
    }
}

function measureFile(filePath) {
    const bytes = fs.readFileSync(filePath);
    return {filePath, text: bytes.toString('utf8'), raw: bytes.length, gzip: gzipSize(bytes)};
}

// The only gzip figure in the harness: the floors are exact byte counts from
// this one implementation.
function gzipSize(bytes) {
    return execFileSync('gzip', ['-9', '-n', '-c'], {input: bytes}).length;
}

function buildWithWebpack(id, entry, outputPath) {
    runWebpack(id, ['--config', STOCK_CONFIG, '--output-path', outputPath], getBuildEnv({EXIFREADER_STOCK_ENTRY: entry}));
    return measureFile(path.join(outputPath, 'exif-reader.js'));
}

async function buildWithEsbuild(id, entry, consumerDir, outfile) {
    try {
        await require('esbuild').build({
            entryPoints: [entry],
            bundle: true,
            minify: true,
            format: 'cjs',
            platform: 'browser',
            absWorkingDir: consumerDir,
            outfile,
            logLevel: 'silent'
        });
    } catch (error) {
        const messages = (error.errors || []).map(formatEsbuildMessage);
        console.error(`\nesbuild failed for ${id}:\n${messages.join('\n') || error.message}`);
        throw error;
    }
    return measureFile(outfile);
}

function formatEsbuildMessage(message) {
    const location = message.location ? `${message.location.file}:${message.location.line}: ` : '';
    return `${location}${message.text}`;
}

function printSizes(consumerIds, dist, bundles) {
    console.log(execFileSync('gzip', ['--version']).toString().split('\n')[0]);
    console.log('');
    console.log(pad('consumer', 34) + BUNDLERS.map((bundler) => pad(`${bundler} raw`, 14) + pad('gzip', 8) + pad('floor', 8)).join(''));
    console.log('-'.repeat(34 + BUNDLERS.length * 30));
    for (const id of consumerIds) {
        console.log(pad(id, 34) + BUNDLERS.map((bundler) => {
            const bundle = bundles[bundler][id];
            return pad(String(bundle.raw), 14) + pad(String(bundle.gzip), 8) + pad(String(getFloor(bundler, id) || '-'), 8);
        }).join(''));
    }
    console.log('');
    console.log(`${FULL_DIST}: raw ${dist.raw} (limit ${getDistLimit('raw')}), gzip ${dist.gzip} (limit ${getDistLimit('gzip')})`);
}

function getFloor(bundler, id) {
    return (BASELINE.consumers[bundler] || {})[id];
}

function getDistLimit(measure) {
    return BASELINE.dist[measure] * BASELINE.dist.maxRatio;
}

function checkDist(dist) {
    const failures = [];
    if (dist.isCustomBuild) {
        failures.push(`${FULL_DIST}: webpack built a custom bundle, so this is not the default build`);
    }
    for (const measure of ['raw', 'gzip']) {
        if (dist[measure] > getDistLimit(measure)) {
            failures.push(`${FULL_DIST}: ${measure} ${dist[measure]} is over its limit ${getDistLimit(measure)}`
                + ` (${BASELINE.dist.maxRatio} x ${BASELINE.dist[measure]}, v${BASELINE.dist.version})`);
        }
    }
    return failures;
}

function checkFloors(consumerIds, bundles) {
    const failures = [];
    for (const bundler of BUNDLERS) {
        for (const id of consumerIds) {
            const floor = getFloor(bundler, id);
            if (floor === undefined) {
                failures.push(`${id} (${bundler}): no gzip floor in baseline.json`);
            } else {
                const limit = getConsumerLimit(id, floor);
                if (bundles[bundler][id].gzip > limit.bytes) {
                    failures.push(`${id} (${bundler}): gzip ${bundles[bundler][id].gzip} is over its limit ${limit.bytes}`
                        + ` (${limit.description})`);
                }
            }
        }
        for (const id of Object.keys(BASELINE.consumers[bundler] || {})) {
            if (!consumerIds.includes(id)) {
                failures.push(`${id} (${bundler}): a floor in baseline.json with no consumer file`);
            }
        }
    }
    return failures;
}

function getConsumerLimit(id, floor) {
    const ratio = RATIO_CONSUMERS.includes(id) ? CONSUMER_MAX_RATIO : FLOOR_MAX_RATIO;
    return {bytes: Math.floor(floor * ratio), description: `${ratio} x floor ${floor}`};
}

function checkPlausibility(dist, bundles) {
    const failures = [];
    const named = [{name: FULL_DIST, bundle: dist}];
    for (const bundler of BUNDLERS) {
        for (const id of Object.keys(bundles[bundler])) {
            named.push({name: `${id} (${bundler})`, bundle: bundles[bundler][id]});
        }
    }
    for (const {name, bundle} of named) {
        if (bundle.raw < MIN_PLAUSIBLE_BUNDLE_SIZE) {
            failures.push(`${name}: emitted only ${bundle.raw} bytes, so the consumer was shaken away rather than measured`);
        }
    }
    return failures;
}

// Keeps the tables from drifting apart: every absence marker is shown present
// somewhere, and every table names an existing consumer.
function checkTables(consumerIds) {
    const failures = [];
    const presentMarkers = Object.keys(PRESENCE_CHECKS).reduce((markers, id) => markers.concat(PRESENCE_CHECKS[id]), []);
    const absentMarkers = Object.keys(ABSENCE_CHECKS)
        .reduce((markers, id) => markers.concat(ABSENCE_CHECKS[id].map(getMarker)), [BUFFER_CODE]);
    for (const marker of absentMarkers) {
        if (!presentMarkers.includes(marker)) {
            failures.push(`absence of ${describeMarker(marker)} is never shown to be possible: no presence check holds it`);
        }
    }
    const tableIds = Object.keys(ABSENCE_CHECKS).concat(
        Object.keys(ALLOWED_MODULES),
        Object.keys(PRESENCE_CHECKS),
        CORRECTNESS_CHECKS.map((check) => check.id),
        FIXTURE_CHECKS.map((check) => check.id)
    );
    for (const id of new Set(tableIds)) {
        if (!consumerIds.includes(id)) {
            failures.push(`${id}: named in a check table, but there is no such consumer`);
        }
    }
    for (const id of consumerIds) {
        if (!CORRECTNESS_CHECKS.concat(FIXTURE_CHECKS).some((check) => check.id === id)) {
            failures.push(`${id}: no correctness check parses through it`);
        }
        if (isComposable(id) && !ALLOWED_MODULES[id]) {
            failures.push(`${id}: no allowed module set`);
        }
    }
    return failures;
}

function describeMarker(marker) {
    return marker === BUFFER_CODE ? 'Buffer code' : marker;
}

function isComposable(id) {
    return id.startsWith('composable-');
}

function checkContents(bundles) {
    const failures = [];
    for (const bundler of BUNDLERS) {
        for (const id of Object.keys(bundles[bundler])) {
            const text = bundles[bundler][id].text;
            const name = `${id} (${bundler})`;
            const absences = (ABSENCE_CHECKS[id] || []).concat(isComposable(id) ? [BUFFER_CHECK] : []);
            for (const check of absences) {
                if (contains(text, check.marker)) {
                    failures.push(`${name}: carries ${describeMarker(check.marker)} (${check.why})`);
                }
            }
            for (const label of getModulesPresentIn(text)) {
                if (ALLOWED_MODULES[id] && !ALLOWED_MODULES[id].includes(label)) {
                    failures.push(`${name}: carries ${label} ${JSON.stringify(MODULE_MARKERS[label])}, a module it did not compose`);
                }
            }
            for (const marker of PRESENCE_CHECKS[id] || []) {
                if (!contains(text, marker)) {
                    failures.push(`${name}: lacks ${describeMarker(marker)}, so an absence elsewhere proves nothing`);
                }
            }
        }
    }
    return failures;
}

function contains(text, marker) {
    return marker instanceof RegExp ? marker.test(text) : bundleContains(text, marker);
}

async function checkCorrectness(bundles) {
    // An ES module; require() of one works from Node 22.12.
    const {getArrayBuffer} = require('../unit/test-utils.js');
    const fixture = fs.readFileSync(FIXTURE);
    const failures = [];
    for (const bundler of BUNDLERS) {
        for (const check of CORRECTNESS_CHECKS) {
            const name = `${check.id} (${bundler})${check.options ? ` with ${JSON.stringify(check.options)}` : ''}`;
            const data = typeof check.data === 'function' ? check.data() : check.data;
            const result = await loadThrough(bundles[bundler][check.id], getArrayBuffer(data), check.options, check.domParser);
            failures.push(...compareGroups(name, result, check.tags));
        }
        for (const check of FIXTURE_CHECKS) {
            const name = `${check.id} (${bundler}) on test.jpg`;
            const result = await loadThrough(bundles[bundler][check.id], fixture);
            failures.push(...compareTags(name, getGroupResult(result, check.group), {[check.tag]: check.description}, {exact: false}));
        }
    }
    return failures;
}

// A function, so the ES module it needs is required only when the checks run.
function getJpegWithXmp() {
    const {getJpeg, getXmpSegment} = require('../unit/loadview-inventory-images.js');
    return getJpeg(getXmpSegment(XMP_PACKET));
}

// Composable consumers export a reader, the legacy one a loadTags function.
// A reader that composed the xmp group finds the DOM parser as a global when it loads.
async function loadThrough(bundle, data, options, domParser) {
    let restore;
    try {
        if (domParser) {
            const {swapProperties} = require('../unit/test-utils.js');
            restore = swapProperties(globalThis, {DOMParser: require('@xmldom/xmldom').DOMParser});
        }
        const consumer = require(bundle.filePath);
        const tags = consumer.reader ? await consumer.reader.load(data, options) : await consumer.loadTags(data);
        return {tags};
    } catch (error) {
        return {error};
    } finally {
        if (restore) {
            restore();
        }
    }
}

function compareGroups(name, result, expected) {
    if (result.error) {
        return compareTags(name, result, {});
    }
    const failures = [];
    for (const group of Object.keys(expected)) {
        failures.push(...compareTags(`${name} ${group}`, {tags: result.tags[group] || {}}, expected[group]));
    }
    const extra = Object.keys(result.tags).filter((group) => !(group in expected));
    if (extra.length > 0) {
        failures.push(`${name}: also returned group(s) ${extra.join(', ')}`);
    }
    return failures;
}

function getGroupResult(result, group) {
    if (result.error || group === undefined) {
        return result;
    }
    return {tags: result.tags[group] || {}};
}

function compareTags(name, {tags, error}, expected, {exact = true} = {}) {
    if (error) {
        return [`${name}: the emitted bundle threw: ${error.message}`];
    }
    const failures = [];
    for (const tagName of Object.keys(expected)) {
        const description = getDescriptionText(tags[tagName]);
        if (JSON.stringify(description) !== JSON.stringify(expected[tagName])) {
            failures.push(`${name}: expected ${tagName} ${JSON.stringify(expected[tagName])}, got ${JSON.stringify(description)}`);
        }
    }
    const unexpected = Object.keys(tags).filter((tagName) => !(tagName in expected));
    if (exact && unexpected.length > 0) {
        failures.push(`${name}: also returned ${unexpected.join(', ')}`);
    }
    return failures;
}

// Descriptions are not always strings, so compare their text, and a tag
// returned as an array as the list of its texts.
function getDescriptionText(tag) {
    if (typeof tag === 'string') {
        return tag;
    }
    if (Array.isArray(tag)) {
        return tag.map(getDescriptionText);
    }
    return tag && String(tag.description);
}

function printFailures(failures) {
    console.log('');
    if (failures.length === 0) {
        console.log('All checks passed.');
        return;
    }
    console.log(`${failures.length} check(s) failed:`);
    for (const failure of failures) {
        console.log(`  ${failure}`);
    }
}

function pad(text, width) {
    if (text.length >= width) {
        return text + ' ';
    }
    return text + ' '.repeat(width - text.length);
}
