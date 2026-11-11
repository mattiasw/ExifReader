/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect} from 'chai';
import {DOMParser, onErrorStopParsing} from '@xmldom/xmldom';
import {createReader, errors} from '../../../src/composable/core.js';
import * as Formats from '../../../src/composable/formats.js';
import * as Groups from '../../../src/composable/groups.js';
import * as ExifDescriptors from '../../../src/composable/tags/exif.js';
import * as IptcDescriptors from '../../../src/composable/tags/iptc.js';
import IptcTagNames from '../../../src/iptc-tag-names.js';
import {getDataView} from '../test-utils.js';
import {
    TAG_MAKE,
    ascii,
    getTiff,
    getIccProfile,
    getXmpPacket,
    getJpegWithEverything,
    getWebpWithMetadata,
} from '../loadview-inventory-images.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TRACKED_IMAGES = [
    'test.jpg',
    'test-iptc.jpg',
    'test-xmp-utf8.jpg',
    'test-issue-608-truncated-exif-tiff-dos.jpg',
    'test.png',
    'test.tiff',
    'test.heic',
    'test-no-meta-data.heic',
    'test.avif',
    'test.jxl',
    'test-brotli.jxl',
    'test.gif',
    'test-not-an-image.txt',
];
const ALL_TABLES = ['allFormats', 'allGroups'];
const FORMAT_NAMES = Object.keys(Formats).filter((name) => !ALL_TABLES.includes(name));
const GROUP_NAMES = Object.keys(Groups).filter((name) => !ALL_TABLES.includes(name));
const METADATA_RANGE = 'metadataRange';
const OPTION_SETS = [{}, {includeOffsets: true}];
const DESCRIPTOR_OPTION_SETS = [{}, {includeUnknown: true}];
// No input carries a Pentax maker note: the test images have no builder for one.
const UNRETURNED_KEYS = {pentax: ['makerNotes']};
const DESCRIPTOR_MODULES = [
    {group: 'exif', typesPath: 'src/composable/tags/exif.d.ts', descriptors: ExifDescriptors},
    {group: 'iptc', typesPath: 'src/composable/tags/iptc.d.ts', descriptors: IptcDescriptors},
];

describe('composable/composition keys', () => {
    const inputs = getInputs();
    const formatDeclarations = getDeclaredKeys('src/composable/formats.d.ts', 'Format');
    const groupDeclarations = getDeclaredKeys('src/composable/groups.d.ts', 'Group');
    const declaredKeys = {formats: formatDeclarations.keys, groups: groupDeclarations.keys};

    it('should declare the output keys of every format and group, as a string literal union', () => {
        expect(formatDeclarations.unparsed).to.deep.equal([]);
        expect(groupDeclarations.unparsed).to.deep.equal([]);
        expect(Object.keys(formatDeclarations.keys).sort()).to.deep.equal([...FORMAT_NAMES].sort());
        expect(Object.keys(groupDeclarations.keys).sort()).to.deep.equal([...GROUP_NAMES].sort());
    });

    describe('with one format and at most one group', () => {
        let runs;

        before(async function () {
            this.timeout(30000);
            runs = await getSingleGroupRuns(inputs);
        });

        it('should return only the declared keys of the format and group', () => {
            expect(runs.length).to.be.above(0);
            expect(getUndeclaredKeyRuns(runs, declaredKeys)).to.deep.equal([]);
        });

        it('should return every declared key of every format and group in some run', () => {
            expect(getUnreturnedKeys(runs, declaredKeys)).to.deep.equal(UNRETURNED_KEYS);
        });
    });

    it('should return only the declared keys of the format and the groups with every group composed', async () => {
        const runs = [];
        for (const formatName of FORMAT_NAMES) {
            runs.push(...await getRuns(formatName, GROUP_NAMES, inputs));
        }
        expect(runs.length).to.be.above(0);
        expect(getUndeclaredKeyRuns(runs, declaredKeys)).to.deep.equal([]);
    }).timeout(30000);

    describe('with tag descriptors', () => {
        const descriptorModules = DESCRIPTOR_MODULES.map(getDeclaredDescriptors);

        it('should declare every descriptor with its group and output name', () => {
            for (const {typesPath, descriptors, declarations, unparsed} of descriptorModules) {
                expect(unparsed, typesPath).to.deep.equal([]);
                expect(Object.keys(declarations).sort(), typesPath).to.deep.equal(Object.keys(descriptors).sort());
            }
        });

        it('should return only the declared group and name of each descriptor alone', async () => {
            const mismatches = [];
            const returnedNames = new Set();
            for (const {descriptors, declarations} of descriptorModules) {
                for (const binding of Object.keys(declarations)) {
                    const declaration = declarations[binding];
                    for (const formatName of FORMAT_NAMES) {
                        const reader = createReader({formats: [Formats[formatName]], tags: [descriptors[binding]]});
                        const allowedKeys = declaredKeys.formats[formatName].concat(declaration.group);
                        for (const {name, data} of inputs) {
                            for (const options of DESCRIPTOR_OPTION_SETS) {
                                const tags = await loadSupported(reader, data, options);
                                if (tags === undefined) {
                                    continue;
                                }
                                const run = `${formatName} with ${binding} on ${name} ${JSON.stringify(options)}`;
                                mismatches.push(...getExtraKeys(tags, allowedKeys).map((key) => `${run}: ${key}`));
                                const namedTags = tags[declaration.group];
                                mismatches.push(...getExtraKeys(namedTags, [declaration.name]).map((key) => `${run}: ${declaration.group}.${key}`));
                                if (namedTags && declaration.name in namedTags) {
                                    returnedNames.add(declaration.name);
                                }
                            }
                        }
                    }
                }
            }
            expect(mismatches).to.deep.equal([]);
            expect(returnedNames).to.include('Exif IFD Pointer');
            expect(returnedNames).to.include('Sub-location');
        }).timeout(60000);

        it('should add no dependency names of the other descriptor group', async () => {
            const mismatches = [];
            for (const [{group, descriptors, declarations}, otherGroup] of [[descriptorModules[0], 'iptc'], [descriptorModules[1], 'exif']]) {
                for (const binding of Object.keys(declarations)) {
                    const tables = getTables(FORMAT_NAMES, [otherGroup]);
                    tables.tags = [descriptors[binding]];
                    mismatches.push(...await getNestedMismatches(createReader(tables), inputs, {[group]: [declarations[binding].name]}));
                }
            }
            expect(mismatches).to.deep.equal([]);
        }).timeout(60000);

        it('should add no dependency names of the groups composed beside the descriptors', async () => {
            const [exifModule, iptcModule] = descriptorModules;
            const allowedNames = {
                exif: [exifModule.declarations.DateTimeOriginal.name, exifModule.declarations.ExifIFDPointer.name],
                iptc: [iptcModule.declarations.SubLocation.name],
            };
            const mismatches = [];
            for (const groupName of GROUP_NAMES.filter((name) => name !== 'exif' && name !== 'iptc')) {
                const tables = getTables(['jpeg'], [groupName]);
                tables.tags = [ExifDescriptors.DateTimeOriginal, ExifDescriptors.ExifIFDPointer, IptcDescriptors.SubLocation];
                mismatches.push(...await getNestedMismatches(createReader(tables), inputs, allowedNames));
            }
            expect(mismatches).to.deep.equal([]);
        });

        it('should declare in core.d.ts exactly the iptc names that have no descriptor', () => {
            const descriptorNames = getDeclaredNames(descriptorModules[1]);
            const groupOnlyNames = getDictionaryNames(IptcTagNames.iptc).filter((name) => !descriptorNames.includes(name));
            expect(getIptcGroupOnlyNames().sort()).to.deep.equal(groupOnlyNames.sort());
        });

        it('should declare in core.d.ts exactly the iptc names of the repeatable datasets', () => {
            const repeatableNames = Object.values(IptcTagNames.iptc).filter((entry) => entry.repeatable === true).map((entry) => entry.name);
            expect(getRepeatableIptcNames().sort()).to.deep.equal(repeatableNames.sort());
        });

        it('should index ComposedExpandedTags with an intersection in the group branch of GroupedTags', () => {
            const groupedTags = readText('src/composable/core.d.ts').match(/^type GroupedTags<[^\n]*= \{\n([\s\S]*?)\n\};$/m);
            expect(groupedTags, 'type GroupedTags in src/composable/core.d.ts').to.not.equal(null);
            expect(
                groupedTags[1],
                'TypeScript 5.4 without skipLibCheck rejects the plain ComposedExpandedTags[K] in this branch with TS2536, '
                    + 'and the type tests compile with TypeScript 7 only'
            ).to.contain('K extends FormatKeys<F> | GroupKeys<G> ? ComposedExpandedTags[K & keyof ComposedExpandedTags]');
        });

        it('should return only declared names from the whole exif and iptc groups', async () => {
            const allowedNames = {
                exif: getDeclaredNames(descriptorModules[0]),
                iptc: getDeclaredNames(descriptorModules[1]).concat(getIptcGroupOnlyNames()),
            };
            const reader = createReader(getTables(FORMAT_NAMES, ['exif', 'iptc']));
            const extraNames = [];
            const returnedNames = {exif: new Set(), iptc: new Set()};
            for (const {name, data} of inputs) {
                const tags = await loadSupported(reader, data, {});
                if (tags === undefined) {
                    continue;
                }
                for (const group of Object.keys(allowedNames)) {
                    extraNames.push(...getExtraKeys(tags[group], allowedNames[group]).map((key) => `${name}: ${group}.${key}`));
                    Object.keys(tags[group] || {}).forEach((key) => returnedNames[group].add(key));
                }
            }
            expect(extraNames).to.deep.equal([]);
            expect(returnedNames.exif).to.include('Make');
            expect(returnedNames.iptc).to.include('Headline');
        }).timeout(30000);
    });
});

function getInputs() {
    const images = TRACKED_IMAGES.map((name) => ({name, data: new Uint8Array(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'images', name)))}));
    const webp = getWebpWithMetadata({
        tiff: getTiff({ifd0: [ascii(TAG_MAKE, 'Canon')]}),
        xmpPacket: getXmpPacket({Title: 'webp'}),
        iccProfile: getIccProfile('WEBP'),
    });
    return images.concat([
        {name: 'crafted WebP', data: getDataView(webp)},
        {name: 'crafted JPEG with every group', data: getDataView(getJpegWithEverything())},
        {name: 'XMP sidecar', data: getDataView('<?xpacket begin=""?>' + getXmpPacket({Title: 'xmp'}) + '<?xpacket end="w"?>')},
    ]);
}

function getDeclaredKeys(relativePath, typeName) {
    const keys = {};
    const unparsed = [];
    const keysPattern = new RegExp(`^${typeName}<('[^']*'(?: \\| '[^']*')*)[,>]`);
    for (const [, name, type] of readText(relativePath).matchAll(/^export declare const (\w+): (.*);$/gm)) {
        if (ALL_TABLES.includes(name)) {
            continue;
        }
        const union = type.match(keysPattern);
        if (union) {
            keys[name] = union[1].split(' | ').map((literal) => literal.slice(1, -1));
        } else {
            unparsed.push(`${name}: ${type}`);
        }
    }
    return {keys, unparsed};
}

// A Windows checkout can have CRLF line endings.
function readText(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

async function getSingleGroupRuns(inputs) {
    const runs = [];
    for (const formatName of FORMAT_NAMES) {
        for (const groupNames of [[]].concat(GROUP_NAMES.map((groupName) => [groupName]))) {
            runs.push(...await getRuns(formatName, groupNames, inputs));
        }
    }
    return runs;
}

async function getRuns(formatName, groupNames, inputs) {
    const reader = createReader(getTables([formatName], groupNames));
    const runs = [];
    for (const {name, data} of inputs) {
        for (const options of OPTION_SETS) {
            const tags = await loadSupported(reader, data, options);
            if (tags !== undefined) {
                runs.push({formatName, groupNames, input: name, options, keys: Object.keys(tags)});
            }
        }
    }
    return runs;
}

function getTables(formatNames, groupNames) {
    const tables = {formats: formatNames.map((name) => Formats[name]), groups: groupNames.map((name) => Groups[name])};
    if (groupNames.includes('xmp')) {
        tables.domParser = new DOMParser({onError: onErrorStopParsing});
    }
    return tables;
}

async function loadSupported(reader, data, options) {
    try {
        return await reader.load(data, options);
    } catch (error) {
        if (error instanceof errors.UnsupportedFormatError) {
            return undefined;
        }
        throw error;
    }
}

function getUndeclaredKeyRuns(runs, declaredKeys) {
    const undeclared = [];
    for (const {formatName, groupNames, input, options, keys} of runs) {
        const allowedKeys = getAllowedKeys(formatName, groupNames, options, declaredKeys);
        const extraKeys = keys.filter((key) => !allowedKeys.includes(key));
        if (extraKeys.length > 0) {
            undeclared.push(`${[formatName].concat(groupNames).join(' + ')} on ${input} ${JSON.stringify(options)}: ${extraKeys.join(', ')}`);
        }
    }
    return undeclared;
}

function getAllowedKeys(formatName, groupNames, options, declaredKeys) {
    const allowedKeys = declaredKeys.formats[formatName].concat(...groupNames.map((groupName) => declaredKeys.groups[groupName]));
    return options.includeOffsets ? allowedKeys.concat(METADATA_RANGE) : allowedKeys;
}

function getUnreturnedKeys(runs, declaredKeys) {
    const returnedKeys = getReturnedKeys(runs, declaredKeys);
    const unreturnedKeys = {};
    for (const declarations of [declaredKeys.formats, declaredKeys.groups]) {
        for (const name of Object.keys(declarations)) {
            const missingKeys = declarations[name].filter((key) => !returnedKeys.has(`${name}.${key}`));
            if (missingKeys.length > 0) {
                unreturnedKeys[name] = missingKeys;
            }
        }
    }
    return unreturnedKeys;
}

// A format returns its keys alone; a group, the keys its format does not declare.
function getReturnedKeys(runs, declaredKeys) {
    const returnedKeys = new Set();
    for (const {formatName, groupNames: [groupName], keys} of runs) {
        if (groupName === undefined) {
            keys.forEach((key) => returnedKeys.add(`${formatName}.${key}`));
        } else {
            keys.filter((key) => !declaredKeys.formats[formatName].includes(key)).forEach((key) => returnedKeys.add(`${groupName}.${key}`));
        }
    }
    return returnedKeys;
}

function getDeclaredDescriptors(descriptorModule) {
    const declarations = {};
    const unparsed = [];
    for (const [, binding, type] of readText(descriptorModule.typesPath).matchAll(/^export declare const (\w+): (.*);$/gm)) {
        const descriptor = type.match(/^TagDescriptor<'(exif|iptc)', '((?:[^'\\]|\\.)*)'>$/);
        if (descriptor) {
            declarations[binding] = {group: descriptor[1], name: descriptor[2].replace(/\\(.)/g, '$1')};
        } else {
            unparsed.push(`${binding}: ${type}`);
        }
    }
    return {...descriptorModule, declarations, unparsed};
}

function getExtraKeys(object, allowedKeys) {
    return Object.keys(object || {}).filter((key) => !allowedKeys.includes(key));
}

async function getNestedMismatches(reader, inputs, allowedNames) {
    const mismatches = [];
    for (const {name, data} of inputs) {
        for (const options of DESCRIPTOR_OPTION_SETS) {
            const tags = await loadSupported(reader, data, options);
            if (tags === undefined) {
                continue;
            }
            for (const group of Object.keys(allowedNames)) {
                mismatches.push(...getExtraKeys(tags[group], allowedNames[group]).map((key) => `${name} ${JSON.stringify(options)}: ${group}.${key}`));
            }
        }
    }
    return mismatches;
}

function getDeclaredNames(descriptorModule) {
    return Object.values(descriptorModule.declarations).map(({name}) => name);
}

// A name function gets a two-byte and a one-byte value, the lengths it tells apart.
function getDictionaryNames(dictionary) {
    const names = new Set();
    for (const entry of Object.values(dictionary)) {
        if (typeof entry === 'string') {
            names.add(entry);
        } else if (typeof entry.name === 'function') {
            names.add(entry.name([0, 0]));
            names.add(entry.name([0]));
        } else {
            names.add(entry.name);
        }
    }
    return [...names];
}

function getIptcGroupOnlyNames() {
    const union = readText('src/composable/core.d.ts').match(/^type IptcGroupOnlyName = ('[^']*'(?: \| '[^']*')*);$/m);
    expect(union, 'type IptcGroupOnlyName in src/composable/core.d.ts').to.not.equal(null);
    return union[1].split(' | ').map((literal) => literal.slice(1, -1));
}

function getRepeatableIptcNames() {
    const union = readText('src/composable/core.d.ts').match(/^type RepeatableIptcName = ('[^']*'(?:\s+\| '[^']*')*);$/m);
    expect(union, 'type RepeatableIptcName in src/composable/core.d.ts').to.not.equal(null);
    return union[1].split(/\s+\| /).map((literal) => literal.slice(1, -1));
}
