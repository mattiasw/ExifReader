/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// A composed reader has to return what the default entry returns for the same
// bytes, cut down to what it composes, over the whole fixture set.
//
// Accepted differences:
// - canon alone and pentax alone decode only their own maker notes, while the
//   default entry decodes both. Each is compared only on images where the
//   other one finds no maker notes.
// - A reader that reads Exif without returning it (gps or composite alone,
//   for example) filters as the default entry does under its includeTags
//   mapping, so its flat tags are compared against that. Flat Composite then
//   comes from the parsed exif and file groups, as in expanded mode, and lacks
//   the tags the unfiltered default entry derives from PNG image dimensions.
// - A composed reader returns a repeatable IPTC dataset as an array also when
//   it is read once, so a single one from the default entry is compared
//   wrapped in an array.
// - The grouped result of a composed reader leaves out a group that holds
//   nothing, where the default entry keeps it as {} (an Exif group composed
//   by tags that finds none, an icc group of an unsupported iCCP compression
//   method), so the expected value drops such groups.

const {expect} = require('chai');
const fs = require('fs');
const path = require('path');
const {DOMParser, onErrorStopParsing} = require('@xmldom/xmldom');

const ExifReader = require('../../src/exif-reader.js');
const {createReader} = require('../../src/composable/core.js');
const Formats = require('../../src/composable/formats.js');
const Groups = require('../../src/composable/groups.js');
const IptcTagNames = require('../../src/iptc-tag-names.js').default;

const IMAGES_PATH = path.join(__dirname, '..', 'fixtures', 'images');
const TRACKED_IMAGES = ['test.jpg', 'test.png', 'test.tiff', 'test.heic', 'test.avif', 'test.jxl', 'test.gif'];
const XMP_SIDECAR_NAME = 'crafted XMP sidecar';
const XMP_SIDECAR = '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/">'
    + '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"'
    + ' xmp:Rating="3" xmp:CreatorTool="Sidecar">'
    + '<dc:subject><rdf:Bag><rdf:li>one</rdf:li><rdf:li>two</rdf:li></rdf:Bag></dc:subject>'
    + '</rdf:Description>'
    + '</rdf:RDF>'
    + '</x:xmpmeta>'
    + '<?xpacket end="w"?>';

const domParser = new DOMParser({onError: onErrorStopParsing});
const BASE = {includeUnknown: true};
const ALL_FORMATS_BUT_XML = Formats.allFormats.filter((format) => format !== Formats.xml);
const FORMAT_READER_KEYS = {
    tiff: [],
    jpeg: ['file', 'jfif'],
    png: ['png'],
    heic: ['file'],
    avif: ['file'],
    jxl: ['file'],
    webp: ['riff'],
    gif: ['gif'],
    xml: [],
};
const GROUP_OUTPUT_KEYS = {thumbnail: 'Thumbnail'};
const REPEATABLE_IPTC_IDS = getRepeatableIptcIds();

const ALL_GROUPS_OPTION_SETS = [
    {options: {}, modes: [false, true]},
    {options: {excludeTags: {exif: ['MakerNote']}}, modes: [false, true]},
    {options: {excludeTags: {xmp: true}}, modes: [false, true]},
    {options: {excludeTags: {gps: true, thumbnail: true}}, modes: [false, true]},
    {options: {includeTags: {exif: ['DateTimeOriginal', 'GPSLatitude'], gps: true, iptc: true}}, modes: [false, true]},
    {options: {computed: true}, modes: [false, true]},
    {options: {includeOffsets: true}, modes: [true]},
];

const COMPOSITIONS = getSingleGroupCompositions().concat([
    {name: 'jpeg + tiff with exif', formats: [Formats.jpeg, Formats.tiff], groups: [Groups.exif]},
    {name: 'png alone', formats: [Formats.png], groups: []},
    {name: 'jxl + iptc', formats: [Formats.jxl], groups: [Groups.iptc]},
    {name: 'xml + xmp', formats: [Formats.xml], groups: [Groups.xmp], excludeTags: [{xmp: true}]},
    {name: 'xml without xmp: all formats with exif', formats: Formats.allFormats, groups: [Groups.exif]},
    {name: 'canon alone', formats: ALL_FORMATS_BUT_XML, groups: [Groups.canon], excludeTags: [{exif: ['MakerNote']}], onlyWithout: 'pentax'},
    {name: 'pentax alone', formats: ALL_FORMATS_BUT_XML, groups: [Groups.pentax], excludeTags: [{exif: ['MakerNote']}], onlyWithout: 'canon'},
]).map(withReader);

const DATE_TIME_ORIGINAL = {name: 'DateTimeOriginal', ids: [0x9003], group: 'exif'};

describe('composable reader against the default entry', function () {
    this.timeout(60000);

    const images = fs.readdirSync(IMAGES_PATH).sort();
    const allReader = createReader({formats: Formats.allFormats, groups: Groups.allGroups, domParser});
    const tagReader = createReader({formats: ALL_FORMATS_BUT_XML, tags: [DATE_TIME_ORIGINAL], domParser});
    const readerWithMakerNotesOf = {
        canon: createReader({formats: ALL_FORMATS_BUT_XML, groups: [Groups.canon], domParser}),
        pentax: createReader({formats: ALL_FORMATS_BUT_XML, groups: [Groups.pentax], domParser}),
    };

    it('runs over the fixture set', () => {
        // eslint-disable-next-line no-console
        console.log(`        comparing ${images.length} fixture images and the crafted XMP sidecar`);
        expect(images).to.include.members(TRACKED_IMAGES);
    });

    it('reads a Blob and a slice of it as their bytes', async () => {
        const bytes = new Uint8Array(fs.readFileSync(path.join(IMAGES_PATH, 'test.jpg')));
        const blob = new Blob([bytes]);
        const half = Math.ceil(blob.size / 2);

        expect(await getOutcome(() => allReader.load(blob, BASE))).to.deep.equal(await getOutcome(() => allReader.load(bytes.buffer, BASE)));
        expect(await getOutcome(() => allReader.load(blob.slice(0, half), BASE)))
            .to.deep.equal(await getOutcome(() => allReader.load(bytes.slice(0, half), BASE)));
    });

    for (const image of images.concat([XMP_SIDECAR_NAME])) {
        describe(image, () => {
            let bytes;
            let fileType;
            let referenceCache;

            before(async () => {
                bytes = new Uint8Array(image === XMP_SIDECAR_NAME ? Buffer.from(XMP_SIDECAR, 'utf8') : fs.readFileSync(path.join(IMAGES_PATH, image)));
                referenceCache = Object.create(null);
                const outcome = await getOutcome(() => ExifReader.load(bytes, {async: true, domParser}));
                fileType = outcome.tags ? outcome.tags.FileType.value : undefined;
            });

            after(() => {
                bytes = undefined;
                referenceCache = undefined;
            });

            it('matches with all formats and all groups, flat and expanded, for every option set', async () => {
                for (const {options, modes} of ALL_GROUPS_OPTION_SETS) {
                    for (const expanded of modes) {
                        const loadOptions = Object.assign({}, BASE, options, {expanded});
                        const expected = withRepeatableIptcArrays(asComposedGroups(await getReference(loadOptions), expanded), expanded);
                        const actual = await getOutcome(() => allReader.load(bytes, loadOptions));
                        expect(withoutUnsupportedFormatMessage(actual), JSON.stringify(Object.assign({}, options, {expanded})))
                            .to.deep.equal(withoutUnsupportedFormatMessage(expected));
                    }
                }
            });

            it('gives the expanded output by default', async () => {
                expect(await getOutcome(() => allReader.load(bytes))).to.deep.equal(await getOutcome(() => allReader.load(bytes, {expanded: true})));
            });

            it('matches with every other whole-group composition, expanded', async () => {
                for (const composition of COMPOSITIONS) {
                    if (!(await isComparable(composition))) {
                        continue;
                    }
                    for (const options of [{}].concat(composition.excludeTags.map((excludeTags) => ({excludeTags})))) {
                        const loadOptions = Object.assign({}, BASE, options, {expanded: true});
                        const actual = await getOutcome(() => composition.reader.load(bytes, loadOptions));
                        if (!hasFormat(composition, fileType)) {
                            expectUnsupportedFormat(actual, composition.name, composition.formats);
                            continue;
                        }
                        const expected = restrict(withRepeatableIptcArrays(asComposedGroups(await getReference(loadOptions), true), true), composition);
                        expect(withoutUnsupportedFormatMessage(actual), composition.name + ' ' + JSON.stringify(options))
                            .to.deep.equal(withoutUnsupportedFormatMessage(expected));
                    }
                }
            });

            it('matches with every other whole-group composition, flat, against its includeTags mapping', async () => {
                for (const composition of COMPOSITIONS) {
                    if (!(await isComparable(composition))) {
                        continue;
                    }
                    const actual = await getOutcome(() => composition.reader.load(bytes, Object.assign({}, BASE, {expanded: false})));
                    if (!hasFormat(composition, fileType)) {
                        expectUnsupportedFormat(actual, composition.name, composition.formats);
                        continue;
                    }
                    const expected = withRepeatableIptcArrays(await getOutcome(() => ExifReader.load(bytes, Object.assign({async: true, domParser}, BASE, {includeTags: getMapping(composition)}))), false);
                    expect(withoutUnsupportedFormatMessage(actual), composition.name).to.deep.equal(withoutUnsupportedFormatMessage(expected));
                }
            });

            it('matches with a tag-descriptor reader, flat and expanded', async () => {
                for (const expanded of [false, true]) {
                    const loadOptions = Object.assign({}, BASE, {expanded});
                    if (fileType === 'xml') {
                        expectUnsupportedFormat(await getOutcome(() => tagReader.load(bytes, loadOptions)), 'tags', ALL_FORMATS_BUT_XML);
                        continue;
                    }
                    const includeTags = {file: true, jfif: true, png: true, riff: true, gif: true, exif: ['DateTimeOriginal']};
                    const expected = await getOutcome(() => ExifReader.load(bytes, Object.assign({async: true, domParser}, loadOptions, {includeTags})));
                    const actual = await getOutcome(() => tagReader.load(bytes, loadOptions));
                    expect(withoutUnsupportedFormatMessage(actual), 'expanded ' + expanded)
                        .to.deep.equal(withoutUnsupportedFormatMessage(withRepeatableIptcArrays(asComposedGroups(expected, expanded), expanded)));
                }
            });

            function getReference(loadOptions) {
                const key = JSON.stringify(loadOptions);
                if (referenceCache[key] === undefined) {
                    referenceCache[key] = getOutcome(() => ExifReader.load(bytes, Object.assign({async: true, domParser}, loadOptions)));
                }
                return referenceCache[key];
            }

            async function isComparable(composition) {
                if (composition.onlyWithout === undefined) {
                    return true;
                }
                // With includeUnknown a maker note whose tags are all unnamed still
                // counts as found; without it the group is empty and left out.
                const other = await getOutcome(() => readerWithMakerNotesOf[composition.onlyWithout].load(bytes, Object.assign({}, BASE, {expanded: true})));
                return !other.tags || other.tags.makerNotes === undefined;
            }
        });
    }
});

function getSingleGroupCompositions() {
    return Groups.allGroups.map((group) => ({
        name: getGroupName(group) + ' with all formats',
        formats: group === Groups.xmp ? Formats.allFormats : ALL_FORMATS_BUT_XML,
        groups: [group],
        excludeTags: getExcludeTagsFor(group),
    }));
}

function getGroupName(group) {
    return Object.keys(Groups).find((name) => Groups[name] === group);
}

function getExcludeTagsFor(group) {
    if (group === Groups.makerNotes) {
        return [{exif: ['MakerNote']}];
    }
    if (group === Groups.xmp || group === Groups.gps || group === Groups.thumbnail) {
        const excludeTags = {};
        excludeTags[group.key] = true;
        return [excludeTags];
    }
    return [];
}

function withReader(composition) {
    return Object.assign({excludeTags: []}, composition, {
        reader: createReader({formats: composition.formats, groups: composition.groups, domParser}),
    });
}

function hasFormat(composition, fileType) {
    return composition.formats.some((format) => format.header.fileType.value === fileType);
}

function expectUnsupportedFormat(outcome, name, formats) {
    const names = Formats.allFormats.filter((format) => formats.includes(format)).map((format) => format.header.fileType.value);
    const message = 'reader.load: none of this reader\'s formats (' + names.join(', ') + ') recognizes the input: it is in another format or is not an image';
    expect(outcome, name).to.deep.equal({error: {name: 'UnsupportedFormatError', message}});
}

// A reader names its own formats in the message, the default entry does not.
function withoutUnsupportedFormatMessage(outcome) {
    if (outcome.error && outcome.error.name === 'UnsupportedFormatError') {
        return {error: {name: 'UnsupportedFormatError'}};
    }
    return outcome;
}

function restrict(outcome, composition) {
    if (!outcome.tags) {
        return outcome;
    }
    const keys = getOutputKeys(composition);
    const tags = {};
    for (const key of Object.keys(outcome.tags)) {
        if (keys.includes(key)) {
            tags[key] = outcome.tags[key];
        }
    }
    return {tags};
}

function getOutputKeys(composition) {
    const keys = ['file'];
    for (const format of composition.formats) {
        keys.push(...FORMAT_READER_KEYS[format.header.fileType.value]);
    }
    for (const group of composition.groups) {
        keys.push(GROUP_OUTPUT_KEYS[group.key] || group.key);
    }
    return keys;
}

// The includeTags that makes the default entry read what a composition reads:
// every format reader and group whole, and file for FileType.
function getMapping(composition) {
    const includeTags = {file: true};
    for (const format of composition.formats) {
        for (const key of FORMAT_READER_KEYS[format.header.fileType.value]) {
            includeTags[key] = true;
        }
    }
    for (const group of composition.groups) {
        includeTags[group.key] = true;
    }
    return includeTags;
}

// The composed reader returns png alone in expanded mode, as png holds every
// tag of pngFile and pngText, and leaves out a group with no entry of its own.
function asComposedGroups(outcome, expanded) {
    if (!expanded || !outcome.tags) {
        return outcome;
    }
    const tags = Object.assign({}, outcome.tags);
    for (const key of ['pngFile', 'pngText']) {
        if (tags[key] !== undefined) {
            for (const name of Object.keys(tags[key])) {
                expect(tags.png[name], key + '.' + name).to.deep.equal(tags[key][name]);
            }
        }
        delete tags[key];
    }
    for (const key of Object.keys(tags)) {
        const isPlainObject = Object.prototype.toString.call(tags[key]) === '[object Object]';
        if (key !== 'metadataRange' && isPlainObject && Object.keys(tags[key]).length === 0) {
            delete tags[key];
        }
    }
    return {tags};
}

// Dataset id by name; a flat key of the same name can also be an XMP tag.
function getRepeatableIptcIds() {
    const dictionary = IptcTagNames.iptc;
    const ids = {};
    for (const id of Object.keys(dictionary)) {
        if (dictionary[id].repeatable) {
            ids[dictionary[id].name] = Number(id);
        }
    }
    return ids;
}

// A composed reader returns a repeatable IPTC dataset as an array also when
// it is read once.
function withRepeatableIptcArrays(outcome, expanded) {
    if (!outcome.tags) {
        return outcome;
    }
    const tags = Object.assign({}, outcome.tags);
    if (expanded && tags.iptc !== undefined) {
        tags.iptc = wrapRepeatableIptc(Object.assign({}, tags.iptc), () => true);
    }
    if (!expanded) {
        wrapRepeatableIptc(tags, (tag, name) => tag.id === REPEATABLE_IPTC_IDS[name]);
    }
    return Object.assign({}, outcome, {tags});
}

function wrapRepeatableIptc(tags, isIptcTag) {
    for (const name of Object.keys(REPEATABLE_IPTC_IDS)) {
        if (tags[name] !== undefined && !Array.isArray(tags[name]) && isIptcTag(tags[name], name)) {
            tags[name] = [tags[name]];
        }
    }
    return tags;
}

function getOutcome(load) {
    return new Promise((resolve) => resolve(load())).then(
        (tags) => ({tags: normalize(tags)}),
        (error) => ({error: {name: error.name, message: error.message}})
    );
}

// Binary values compare by their bytes, and getters by their values.
function normalize(value) {
    if (value instanceof ArrayBuffer) {
        return {bytes: Buffer.from(value).toString('base64')};
    }
    if (ArrayBuffer.isView(value)) {
        return {bytes: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64')};
    }
    if (Array.isArray(value)) {
        return value.map(normalize);
    }
    if (value && typeof value === 'object') {
        const result = {};
        for (const key of Object.keys(value)) {
            result[key] = normalize(value[key]);
        }
        return result;
    }
    return value;
}
