/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Grepping the emitted, minified bundle is the only ground truth for whether a
// module survived: webpack's --json stats are pre-terser and list modules whose
// bodies terser strips later. Terser does not rewrite string literals beyond
// their quote style, so a marker that reaches live code reaches the emitted file.
//
// A custom build replaces every Constants.USE_* with a literal before
// minifying, so a marker inside a branch the config turned off disappears while
// the rest of its file stays. Read an absence as "this string is gone", not
// "this file is gone".
//
// Every marker has to occur in exactly one file under src/, and in code rather
// than in a comment, which assertMarkersAreUnique checks rather than trusting
// this list.

const fs = require('fs');
const path = require('path');
const parseConfig = require('../../bin/parse-config');

const SRC_PATH = path.join(__dirname, '..', '..', 'src');

// A label (the owning file, plus a name when one file carries two probes)
// mapped to a string literal only that file contains. A marker written with
// its single quotes matches only the quoted literal, in either quote style.
const MODULE_MARKERS = {
    'errors.js': 'No Exif data',
    'file-loaders.js': 'Content-Range',
    'image-header.js': 'Invalid image format',
    'load-auto.js': 'length: "auto" is not supported for this file type ',
    'loadview-pipeline.js': 'mpfImage',
    'tag-filter-config.js': 'relatedimage',
    // Quoted, since the data URI regex in file-loaders.js also holds the bare text.
    'utils.js': '\';base64\'',
    'file-tags.js': 'Subsampling',
    'jfif-tags.js': 'JFIF Version',
    'png-file-tags.js': 'Grayscale with Alpha',
    'tag-names-0th-ifd.js': 'ProcessingSoftware',
    'tag-names-exif-ifd.js': 'SpectralSensitivity',
    'tag-names-gps-ifd.js': 'GPSVersionID',
    'tag-names-interoperability-ifd.js': 'InteroperabilityIndex',
    'tag-names-utils.js:getEncodedString': '[JIS encoded text]',
    'image-header-jpeg.js:warnAboutMultipleExifSegments': 'Will pick the best candidate segment.',
    'image-header-jpeg.js:APP13_IPTC_IDENTIFIER': 'Photoshop 3.0',
    'iptc-tags.js': 'No IPTC NAA resource block.',
    'iptc-tag-names.js': 'Model Version',
    'xml.js': '<?xpacket begin',
    'xmp-tags.js': 'application/xml',
    'xmp-namespaces.js': 'prefix not bound to a namespace',
    'xmp-tag-names.js': 'Mirror horizontal',
    'image-header-iso-bmff.js:parseItemInformationBox': 'iinf',
    'image-header-iso-bmff.js:findIinfXmpItemId': 'application/rdf+xml',
    'icc-tags.js': 'mluc',
    'icc-tag-names.js': 'ICC Description',
    'photoshop-tags.js': '<no description formatter>',
    'photoshop-tag-names.js': 'PathInformation',
    'canon-tags.js': 'AutoRotate',
    'pentax-tags.js': 'CameraOrientation',
    'tag-names-pentax-ifd.js': 'PentaxVersion',
    'mpf-tags.js': 'ImageFlags',
    'tag-names-mpf-ifd.js': 'MPFVersion',
    'thumbnail.js': 'image/jpeg',
    'png-tags.js': 'Pixels Per Unit X',
    'image-header-png.js': 'zTXt',
    'png-text-tags.js': 'STATE_KEYWORD',
    'image-header-heic.js': 'heix',
    'jxl-file-tags.js': 'Unexpected end of data',
    'vp8x-tags.js': 'Animation',
    // Quoted, since the bare word is also part of every USE_WEBP identifier.
    'image-header-webp.js': '\'WEBP\'',
    'gif-file-tags.js': 'GIF Version',
    'image-header-gif.js': 'GIF87a'
};

// The parsing core, whose markers have to be in every build. An absence here
// also means the probe read an empty or wrong file.
const ALWAYS_PRESENT_MODULES = [
    'errors.js',
    'file-loaders.js',
    'image-header.js',
    'load-auto.js',
    'loadview-pipeline.js',
    'tag-filter-config.js',
    'utils.js'
];

// Labels mapped to whether a build with the given module map reaches them.
// The keys are the module names of bin/parse-config.js. Dictionaries that
// bin/TagFilterPlugin.js filters lose their unlisted entries when the module
// is given as a tag list, so their markers are expected only for a full
// include, and gone for a tag list that does not name them.
const MODULE_PROBES = {
    file: [
        {label: 'file-tags.js', when: whenIncluded('jpeg', 'file')}
    ],
    jfif: [
        {label: 'jfif-tags.js', when: whenIncluded('jpeg', 'jfif')}
    ],
    png_file: [
        {label: 'png-file-tags.js', when: whenIncluded('png', 'png_file')}
    ],
    exif: [
        {label: 'tag-names-0th-ifd.js', when: whenIncludedInFull('exif')},
        {label: 'tag-names-exif-ifd.js', when: whenIncludedInFull('exif')},
        {label: 'tag-names-gps-ifd.js', when: whenIncludedInFull('exif')},
        {label: 'tag-names-interoperability-ifd.js', when: whenIncludedInFull('exif')},
        // Only reached from descriptions in the dictionaries above.
        {label: 'tag-names-utils.js:getEncodedString', when: whenIncludedInFull('exif')},
        {label: 'image-header-jpeg.js:warnAboutMultipleExifSegments', when: whenIncluded('jpeg', 'exif')}
    ],
    iptc: [
        // Read from JPEG APP13, from the Exif IPTC-NAA tag and from PNG text.
        {label: 'iptc-tags.js', when: whenIncluded('iptc')},
        {label: 'iptc-tag-names.js', when: whenIncludedInFull('iptc')},
        {label: 'image-header-jpeg.js:APP13_IPTC_IDENTIFIER', when: whenIncluded('jpeg', 'iptc')}
    ],
    xmp: [
        {label: 'xml.js', when: whenIncluded('xmp')},
        {label: 'xmp-tags.js', when: whenIncluded('xmp')},
        {label: 'xmp-namespaces.js', when: whenIncluded('xmp')},
        {label: 'xmp-tag-names.js', when: whenIncluded('xmp')},
        {label: 'image-header-iso-bmff.js:findIinfXmpItemId', when: (modules) => isoBmffIsIncluded(modules) && !!modules.xmp}
    ],
    icc: [
        {label: 'icc-tags.js', when: whenIncluded('icc')},
        {label: 'icc-tag-names.js', when: whenIncluded('icc')}
    ],
    photoshop: [
        {label: 'photoshop-tags.js', when: whenIncluded('photoshop')},
        {label: 'photoshop-tag-names.js', when: whenIncluded('photoshop')}
    ],
    maker_notes: [
        {label: 'canon-tags.js', when: whenIncluded('maker_notes')},
        {label: 'pentax-tags.js', when: whenIncluded('maker_notes')},
        {label: 'tag-names-pentax-ifd.js', when: whenIncluded('maker_notes')}
    ],
    mpf: [
        {label: 'mpf-tags.js', when: whenIncluded('mpf')},
        {label: 'tag-names-mpf-ifd.js', when: whenIncludedInFull('mpf')}
    ],
    thumbnail: [
        {label: 'thumbnail.js', when: whenIncluded('exif', 'thumbnail')}
    ],
    jpeg: [
        {label: 'image-header-jpeg.js:warnAboutMultipleExifSegments', when: whenIncluded('jpeg', 'exif')},
        {label: 'image-header-jpeg.js:APP13_IPTC_IDENTIFIER', when: whenIncluded('jpeg', 'iptc')}
    ],
    png: [
        {label: 'png-tags.js', when: whenIncluded('png')},
        {label: 'image-header-png.js', when: whenIncluded('png')},
        {label: 'png-text-tags.js', when: whenIncluded('png')}
    ],
    heic: [
        {label: 'image-header-heic.js', when: whenIncluded('heic')},
        // Both ISO-BMFF finders import the shared box parser.
        {label: 'image-header-iso-bmff.js:parseItemInformationBox', when: isoBmffIsIncluded}
    ],
    avif: [
        {label: 'image-header-iso-bmff.js:parseItemInformationBox', when: isoBmffIsIncluded}
    ],
    jxl: [
        {label: 'jxl-file-tags.js', when: whenIncluded('jxl')}
    ],
    webp: [
        {label: 'image-header-webp.js', when: whenIncluded('webp')},
        {label: 'vp8x-tags.js', when: whenIncluded('webp')}
    ],
    gif: [
        {label: 'image-header-gif.js', when: whenIncluded('gif')},
        {label: 'gif-file-tags.js', when: whenIncluded('gif')}
    ]
};

// Builds in which a module has no probe that can speak for it.
const BLIND_SPOTS = {
    tiff: {
        when: () => true,
        reason: 'image-header-tiff.js holds no string literal, and no other file is gated on USE_TIFF alone'
    },
    avif: {
        when: (modules) => !!modules.heic,
        reason: 'image-header-avif.js has no unique literal, and the ISO-BMFF finder it shares with heic cannot show whether avif is there in a heic build'
    },
    exif: {
        when: (modules) => Array.isArray(modules.exif) && !modules.jpeg,
        reason: 'given as a tag list, every other exif-only literal sits in the filtered dictionaries or descriptions they reference; only the JPEG finder carries one outside them'
    },
    file: {
        when: (modules) => !modules.jpeg,
        reason: 'file-tags.js is only reached through the JPEG finder, so a build without jpeg cannot show whether file is there'
    },
    jfif: {
        when: (modules) => !modules.jpeg,
        reason: 'jfif-tags.js is only reached through the JPEG finder, so a build without jpeg cannot show whether jfif is there'
    },
    png_file: {
        when: (modules) => !modules.png,
        reason: 'png-file-tags.js is only reached through the PNG finder, so a build without png cannot show whether png_file is there'
    },
    jpeg: {
        when: (modules) => !modules.exif && !modules.iptc,
        reason: 'the unique literals of image-header-jpeg.js sit in its exif and iptc branches, so a build without both cannot show whether the JPEG finder is there'
    }
};

// Labels whose marker ships even in builds that exclude their module.
const KNOWN_SURVIVORS = {
    'thumbnail.js': 'exif-reader.js passes Thumbnail as a plain property of pipelineDependencies, which keeps the import alive in every build'
};

const NO_UNIQUE_LITERAL = 'no string literal unique to it in code';
const FINDER_WITHOUT_LITERAL = 'a format finder with no literal of its own, so no probe shows the finder itself';
const SHARED_BY_SEVERAL_MODULES = 'shared by several build modules, so its presence follows no single flag';

// Source files that are neither a marker owner nor in ALWAYS_PRESENT_MODULES.
const UNPROBEABLE_REASONS = {
    'composite.js': NO_UNIQUE_LITERAL,
    'constants.js': NO_UNIQUE_LITERAL,
    'dom-parser.js': NO_UNIQUE_LITERAL,
    'image-header-avif.js': NO_UNIQUE_LITERAL,
    'image-header-iso-bmff-iloc.js': NO_UNIQUE_LITERAL,
    'image-header-iso-bmff-utils.js': NO_UNIQUE_LITERAL,
    'iso-bmff-file-tags.js': NO_UNIQUE_LITERAL,
    'node-require.js': NO_UNIQUE_LITERAL,
    'tag-decoder.js': NO_UNIQUE_LITERAL,
    'tag-filter.js': NO_UNIQUE_LITERAL,
    'tag-names.js': NO_UNIQUE_LITERAL,
    'tag-names-canon-ifd.js': NO_UNIQUE_LITERAL,
    'tags-helpers.js': NO_UNIQUE_LITERAL,
    'tags.js': NO_UNIQUE_LITERAL,
    'text-decoder.js': NO_UNIQUE_LITERAL,
    'tiff-constants.js': NO_UNIQUE_LITERAL,
    'xmp-element-depth.js': NO_UNIQUE_LITERAL,
    'image-header-jxl.js': `${FINDER_WITHOUT_LITERAL} (the jxl probe in jxl-file-tags.js is gated in exif-reader.js)`,
    'image-header-tiff.js': `${FINDER_WITHOUT_LITERAL} (see the tiff blind spot)`,
    'byte-order.js': SHARED_BY_SEVERAL_MODULES,
    'tag-names-common.js': SHARED_BY_SEVERAL_MODULES,
    'types.js': SHARED_BY_SEVERAL_MODULES,
    'exif-reader.js': 'the entry point; its unique literals are keys inside the icc and png gates, which those modules\' own probes cover'
};

const UNPROBEABLE_MODULES = Object.keys(UNPROBEABLE_REASONS);

module.exports = {
    MODULE_MARKERS,
    MODULE_PROBES,
    ALWAYS_PRESENT_MODULES,
    UNPROBEABLE_MODULES,
    UNPROBEABLE_REASONS,
    BLIND_SPOTS,
    KNOWN_SURVIVORS,
    assertMarkersAreUnique,
    assertProbeTableIsConsistent,
    getModulesPresentIn,
    getUnaccountedModules,
    checkBundle
};

function whenIncluded(...moduleNames) {
    return (modules) => moduleNames.every((name) => !!modules[name]);
}

function whenIncludedInFull(moduleName) {
    return (modules) => modules[moduleName] === true;
}

function isoBmffIsIncluded(modules) {
    return !!(modules.heic || modules.avif);
}

function assertMarkersAreUnique() {
    const contents = readSourceFiles(SRC_PATH);
    const code = stripComments(contents);
    const problems = [];

    for (const label of Object.keys(MODULE_MARKERS)) {
        const owner = label.split(':')[0];
        const marker = MODULE_MARKERS[label];
        const holders = Object.keys(contents).filter((name) => contents[name].includes(marker));
        if ((holders.length !== 1) || (path.basename(holders[0]) !== owner)) {
            problems.push(`${label}: marker ${JSON.stringify(marker)} found in [${holders.join(', ')}]`);
        } else if (!code[holders[0]].includes(marker)) {
            problems.push(`${label}: marker ${JSON.stringify(marker)} only occurs in a comment`);
        }
    }

    if (problems.length > 0) {
        throw new Error('Module markers are not unique to their module:\n  ' + problems.join('\n  '));
    }
}

function readSourceFiles(directory, prefix = '') {
    const contents = {};

    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        const name = prefix + entry.name;
        if (entry.isDirectory()) {
            Object.assign(contents, readSourceFiles(path.join(directory, entry.name), name + '/'));
        } else if (entry.name.endsWith('.js')) {
            contents[name] = fs.readFileSync(path.join(directory, entry.name), 'utf8');
        }
    }

    return contents;
}

// Crude but sufficient for this repo, where the only // inside a string is in
// a URL, which the preceding-character check leaves alone.
function stripComments(contents) {
    const code = {};

    for (const name of Object.keys(contents)) {
        code[name] = contents[name]
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
    }

    return code;
}

function assertProbeTableIsConsistent(moduleNames) {
    const problems = [];
    const probedLabels = Object.keys(MODULE_PROBES)
        .reduce((labels, moduleName) => labels.concat(MODULE_PROBES[moduleName].map((probe) => probe.label)), []);
    const labels = probedLabels.concat(Object.keys(KNOWN_SURVIVORS), ALWAYS_PRESENT_MODULES);

    for (const label of labels) {
        if (!Object.prototype.hasOwnProperty.call(MODULE_MARKERS, label)) {
            problems.push(`label ${JSON.stringify(label)} has no entry in MODULE_MARKERS`);
        }
    }
    const checkedLabels = probedLabels.concat(ALWAYS_PRESENT_MODULES);
    for (const label of Object.keys(MODULE_MARKERS)) {
        if (!checkedLabels.includes(label)) {
            problems.push(`label ${JSON.stringify(label)} is in MODULE_MARKERS, but no probe checks it`);
        }
    }
    for (const moduleName of Object.keys(MODULE_PROBES).concat(Object.keys(BLIND_SPOTS))) {
        if (!moduleNames.includes(moduleName)) {
            problems.push(`module ${JSON.stringify(moduleName)} is not a build module`);
        }
    }

    if (problems.length > 0) {
        throw new Error('The probe table is inconsistent:\n  ' + problems.join('\n  '));
    }
}

function getModulesPresentIn(bundle) {
    return Object.keys(MODULE_MARKERS).filter((label) => bundleContains(bundle, MODULE_MARKERS[label]));
}

function bundleContains(bundle, marker) {
    if ((marker.length > 1) && marker.startsWith('\'') && marker.endsWith('\'')) {
        return bundle.includes(marker) || bundle.includes(`"${marker.slice(1, -1)}"`);
    }
    return bundle.includes(marker);
}

// Anything in src/ that is neither probed nor deliberately excluded, so a new
// file has to be classified.
function getUnaccountedModules() {
    const accounted = Object.keys(MODULE_MARKERS)
        .map((label) => label.split(':')[0])
        .concat(UNPROBEABLE_MODULES, ALWAYS_PRESENT_MODULES);

    return Object.keys(readSourceFiles(SRC_PATH))
        .filter((name) => !accounted.includes(path.basename(name)))
        .sort();
}

/**
 * Compare a built bundle with what its module map says it should contain.
 *
 * @param {string} bundle The emitted bundle source.
 * @param {object} modules The module map from bin/parse-config.js.
 * @returns {{missing: string[], surviving: string[]}} `missing` lists the
 *   markers the build should reach but does not contain, and included modules
 *   no probe speaks for; `surviving` lists the markers the build should have
 *   dropped but still contains, and excluded modules no probe can show absent.
 *   Both also report stale KNOWN_SURVIVORS and BLIND_SPOTS entries.
 */
function checkBundle(bundle, modules) {
    const missing = [];
    const surviving = [];

    for (const label of ALWAYS_PRESENT_MODULES) {
        if (!bundleContains(bundle, MODULE_MARKERS[label])) {
            missing.push(`core: ${describeProbe(label)}`);
        }
    }

    for (const moduleName of Object.keys(modules)) {
        const modulesWithIt = withModuleIncluded(modules, moduleName);
        const probes = (MODULE_PROBES[moduleName] || []).map((probe) => ({
            label: probe.label,
            expected: probe.when(modules),
            expectedWithModule: probe.when(modulesWithIt),
            expectedWithoutModule: probe.when(Object.assign({}, modules, {[moduleName]: false})),
            present: bundleContains(bundle, MODULE_MARKERS[probe.label]),
            isKnownSurvivor: Object.prototype.hasOwnProperty.call(KNOWN_SURVIVORS, probe.label)
        }));
        const hasBlindSpot = !!BLIND_SPOTS[moduleName] && BLIND_SPOTS[moduleName].when(modules);

        for (const probe of probes) {
            const entry = `${moduleName}: ${describeProbe(probe.label)}`;
            if (probe.expected && !probe.present) {
                missing.push(entry);
            } else if (!probe.expected && probe.present && !probe.isKnownSurvivor) {
                surviving.push(entry);
            } else if (!probe.expected && !probe.present && probe.isKnownSurvivor) {
                surviving.push(`${entry} (listed in KNOWN_SURVIVORS but gone; remove the entry)`);
            }
        }

        if (modules[moduleName]) {
            checkIncludedModuleCoverage(moduleName, probes, hasBlindSpot, missing);
        } else {
            checkExcludedModuleCoverage(moduleName, probes, hasBlindSpot, surviving);
        }
    }

    return {missing, surviving};
}

function describeProbe(label) {
    return `${label} ${JSON.stringify(MODULE_MARKERS[label])}`;
}

// The same build with one more module, dependencies included as the build adds them.
function withModuleIncluded(modules, moduleName) {
    return parseConfig({include: Object.assign({}, modules, {[moduleName]: true})});
}

function checkIncludedModuleCoverage(moduleName, probes, hasBlindSpot, missing) {
    // A probe shows the module's presence only if leaving the module out would drop it.
    const isCovered = probes.some((probe) => probe.expected && !probe.expectedWithoutModule && !probe.isKnownSurvivor);
    const hasKnownSurvivor = probes.some((probe) => probe.isKnownSurvivor);

    if (!isCovered && !hasKnownSurvivor && !hasBlindSpot) {
        missing.push(`${moduleName}: included, but no probe applies to this build`);
    } else if (isCovered && hasBlindSpot) {
        missing.push(`${moduleName}: blind spot no longer needed here; narrow or remove it`);
    }
}

function checkExcludedModuleCoverage(moduleName, probes, hasBlindSpot, surviving) {
    // A probe shows the module's absence only if including the module would bring it in.
    const isCovered = probes.some((probe) => !probe.expected && probe.expectedWithModule && !probe.isKnownSurvivor);
    const hasKnownSurvivor = probes.some((probe) => probe.isKnownSurvivor);

    if (!isCovered && !hasKnownSurvivor && !hasBlindSpot) {
        surviving.push(`${moduleName}: excluded, but no probe can show its absence in this build`);
    } else if (isCovered && hasBlindSpot) {
        surviving.push(`${moduleName}: blind spot no longer needed here; narrow or remove it`);
    }
}
