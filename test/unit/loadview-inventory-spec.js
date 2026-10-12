/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {DOMParser as XmldomDomParser, onErrorStopParsing} from '@xmldom/xmldom';
import * as ExifReader from '../../src/exif-reader.js';
import {objectAssign} from '../../src/utils.js';
import ImageHeader from '../../src/image-header.js';
import Tags from '../../src/tags.js';
import IptcTags from '../../src/iptc-tags.js';
import XmpTags from '../../src/xmp-tags.js';
import IccTags from '../../src/icc-tags.js';
import MpfTags from '../../src/mpf-tags.js';
import FileTags from '../../src/file-tags.js';
import JfifTags from '../../src/jfif-tags.js';
import PhotoshopTags from '../../src/photoshop-tags.js';
import CanonTags from '../../src/canon-tags.js';
import PngFileTags from '../../src/png-file-tags.js';
import PngTextTags from '../../src/png-text-tags.js';
import PngTags from '../../src/png-tags.js';
import Thumbnail from '../../src/thumbnail.js';
import {getDataView, getByteStringFromNumber, swapProperties, getConsoleWarnSpy} from './test-utils.js';
import {
    TAG_MAKE,
    TAG_MODEL,
    TAG_SOFTWARE,
    TAG_APPLICATION_NOTES,
    TAG_IPTC_NAA,
    TAG_PHOTOSHOP_SETTINGS,
    TAG_ICC_PROFILE,
    TAG_IMAGE_SOURCE_DATA,
    TAG_FOCAL_LENGTH,
    TAG_FOCAL_LENGTH_IN_35MM_FILM,
    TAG_FOCAL_PLANE_X_RESOLUTION,
    TAG_FOCAL_PLANE_Y_RESOLUTION,
    TAG_FOCAL_PLANE_RESOLUTION_UNIT,
    TAG_LENS_MODEL,
    TAG_GPS_LATITUDE_REF,
    TAG_GPS_LATITUDE,
    TAG_MPF_NUMBER_OF_IMAGES,
    TAG_CANON_LENS_MODEL,
    ascii,
    short,
    long,
    rational,
    rationals,
    bytes,
    undefinedBytes,
    canonMakerNote,
    getTiff,
    getIptcDatasets,
    getNaaBlock,
    headline,
    objectName,
    getPhotoshopResource,
    getIccProfile,
    getXmpPacket,
    getJpeg,
    getExifSegment,
    getXmpSegment,
    getExtendedXmpSegment,
    getIptcSegment,
    getIccSegment,
    getMpfSegment,
    getJfifSegment,
    getSof0Segment,
    getPng,
    getTextChunk,
    getZtxtChunk,
    getExifRawProfile,
    getIptcRawProfile,
    getExifChunk,
    getIccpChunk,
    getXmpChunk,
    getPhysChunk,
    getPaddingChunk,
    deflate,
    getJxl,
    getBox,
    getExifBox,
    getXmlBox,
    getBrobBox,
    getJxlcBox,
    getPaddingBox,
    getWebp,
    getGif,
} from './loadview-inventory-images.js';

// Where each rule lives in src/.
// Rule 1:  image-header-jpeg.js (getExifMarkerScore), image-header-png.js, image-header-jxl.js, png-text-tags.js
// Rule 2:  exif-reader.js, image-header-jxl.js, image-header-png.js, png-text-tags.js
// Rule 3:  loadview-pipeline.js, exif-reader.js
// Rule 4:  exif-reader.js, tags-helpers.js, png-text-tags.js
// Rule 5:  loadview-pipeline.js, exif-reader.js (mergeSteps)
// Rule 6:  loadview-pipeline.js
// Rule 7:  loadview-pipeline.js, tags-helpers.js, composite.js
// Rule 8:  exif-reader.js, png-text-tags.js, image-header.js, icc-tags.js
// Rule 9:  tag-filter.js, tag-filter-config.js
// Rule 10: png-text-tags.js, exif-reader.js
// Rule 11: image-header-png.js, exif-reader.js, loadview-pipeline.js
// Rule 12: png-text-tags.js

const domParser = new XmldomDomParser({onError: onErrorStopParsing});
const MODES = [false, true];
const MAX_DECOMPRESSED_VALUE_ALLOWANCE = 1024 * 1024;
const MAX_DECOMPRESSED_IPTC_ALLOWANCE = 8192;
const BROB_XMP_SIZE_PER_INPUT_SIZE = 4;
const BROB_XMP_SIZE_ALLOWANCE = 64 * 1024;
const EMBEDDED_THUMBNAIL_SIZE_PER_INPUT_SIZE = 2;
const EMBEDDED_THUMBNAIL_SIZE_ALLOWANCE = 64 * 1024;
// Ignored bytes added to a file so that the "times the file size" term of a
// size bound is large enough to tell the factor from the fixed allowance.
const PADDING_LENGTH = 40000;
const PNG_FILE_TAG_NAMES = ['Image Width', 'Image Height', 'Bit Depth', 'Color Type', 'Compression', 'Filter', 'Interlace'];
const PHYS_TAG_NAMES = ['Pixels Per Unit X', 'Pixels Per Unit Y', 'Pixel Units'];
const IPTC_UNKNOWN_DATASET = 0x02cb;
// Position of the valueBudget argument in each reader's read signature.
const BUDGET_ARGUMENT_INDEX = {Tags: 5, IptcTags: 4, MpfTags: 5, CanonTags: 7, PngTextTags: 7};

const restoreFunctions = [];

describe('loadView behaviour inventory', function () {
    afterEach(() => {
        while (restoreFunctions.length > 0) {
            restoreFunctions.pop()();
        }
    });

    describe('Rule 1: finder duplicate policy', () => {
        describe('JPEG keeps the best-scored APP1 Exif segment', () => {
            let warnSpy;

            beforeEach(() => {
                warnSpy = getConsoleWarnSpy();
            });

            afterEach(() => {
                warnSpy.reset();
            });

            const twoEntries = getTiff({ifd0: [ascii(TAG_MAKE, 'two entries'), ascii(TAG_MODEL, 'model')]});
            const oneEntry = getTiff({ifd0: [ascii(TAG_MAKE, 'one entry')]});
            const oneLongerEntry = getTiff({ifd0: [ascii(TAG_MAKE, 'one entry in a segment longer than the two-entry one')]});

            for (const async of MODES) {
                it(`should skip a segment with an invalid byte order marker (async: ${async})`, async () => {
                    const image = getJpeg(getExifSegment(twoEntries.replace(/^MM/, 'XX')), getExifSegment(oneEntry));

                    const tags = await load(image, {expanded: true, async});

                    expect(tags.exif.Make.value).to.deep.equal(['one entry']);
                    expect(warnSpy.hasWarned).to.be.true;
                });

                it(`should prefer the segment with more IFD0 entries over a longer one in either order (async: ${async})`, async () => {
                    expect(oneLongerEntry.length).to.be.above(twoEntries.length);
                    const twoFirst = await load(getJpeg(getExifSegment(twoEntries), getExifSegment(oneLongerEntry)), {expanded: true, async});
                    const twoLast = await load(getJpeg(getExifSegment(oneLongerEntry), getExifSegment(twoEntries)), {expanded: true, async});

                    expect(twoFirst.exif.Make.value).to.deep.equal(['two entries']);
                    expect(twoLast.exif.Make.value).to.deep.equal(['two entries']);
                });

                it(`should prefer the longer segment at equal entry counts in either order (async: ${async})`, async () => {
                    const longerFirst = await load(getJpeg(getExifSegment(oneLongerEntry), getExifSegment(oneEntry)), {expanded: true, async});
                    const longerLast = await load(getJpeg(getExifSegment(oneEntry), getExifSegment(oneLongerEntry)), {expanded: true, async});

                    expect(longerFirst.exif.Make.value).to.deep.equal(['one entry in a segment longer than the two-entry one']);
                    expect(longerLast.exif.Make.value).to.deep.equal(['one entry in a segment longer than the two-entry one']);
                });
            }
        });

        const firstTiff = getTiff({ifd0: [ascii(TAG_MAKE, 'first'), ascii(TAG_MODEL, 'first only')]});

        for (const async of MODES) {
            it(`should keep only the last APP13 IPTC segment of a JPEG (async: ${async})`, async () => {
                const image = getJpeg(getIptcSegment(getNaaBlock([headline('first'), objectName('first only')])), getIptcSegment(getNaaBlock([headline('last')])));

                const tags = await load(image, {expanded: true, async});

                expect(tags.iptc.Headline.description).to.equal('last');
                expect(tags.iptc['Object Name']).to.be.undefined;
            });

            it(`should keep only the last eXIf chunk of a PNG (async: ${async})`, async () => {
                const image = getPng(getExifChunk(firstTiff), getExifChunk(getTiffWithMake('last')));

                const tags = await load(image, {expanded: true, async});

                expect(tags.exif.Make.value).to.deep.equal(['last']);
                expect(tags.exif.Model).to.be.undefined;
            });

            it(`should keep only the last Exif box of a JXL (async: ${async})`, async () => {
                const image = getJxl(getExifBox(firstTiff), getExifBox(getTiffWithMake('last')));

                const tags = await load(image, {expanded: true, async});

                expect(tags.exif.Make.value).to.deep.equal(['last']);
                expect(tags.exif.Model).to.be.undefined;
            });

            it(`should parse every PNG raw profile exif and iptc chunk (async: ${async})`, async () => {
                const image = getPng(
                    getExifRawProfileChunk(getTiffWithMake('a')),
                    getExifRawProfileChunk(getTiff({ifd0: [ascii(TAG_MODEL, 'b')]})),
                    getExifRawProfileChunk(getTiff({ifd0: [ascii(TAG_SOFTWARE, 'c')]})),
                    getIptcRawProfileChunk(getNaaBlock([headline('h')])),
                    getIptcRawProfileChunk(getNaaBlock([objectName('o')]))
                );

                const tags = await load(image, {expanded: true, async});

                expect(Object.keys(tags.exif)).to.deep.equal(['Make', 'Model', 'Software']);
                expect(Object.keys(tags.iptc)).to.deep.equal(['Headline', 'Object Name']);
            });
        }

        it('should cap the XMP chunks of a JPEG at 1024', async () => {
            const log = [];
            record(log, [['XmpTags', XmpTags]]);
            const guid = 'A'.repeat(32);
            const segments = [getXmpSegment(getXmpPacket({Title: 'x'}))];
            for (let i = 0; i < 1030; i++) {
                segments.push(getExtendedXmpSegment(guid, 1030 * 4, i * 4, 'abcd'));
            }

            await load(getJpeg(...segments), {expanded: true});

            expect(log).to.have.lengthOf(1);
            expect(log[0].args[1]).to.have.lengthOf(1024);
        });

        it('should cap the ICC chunks of a JPEG at 255', async () => {
            const log = [];
            record(log, [['IccTags', IccTags]]);
            const segments = [];
            for (let i = 0; i < 260; i++) {
                segments.push(getIccSegment(getIccProfile('ABCD'), (i % 255) + 1, 255));
            }

            await load(getJpeg(...segments), {expanded: true});

            expect(log).to.have.lengthOf(1);
            expect(log[0].args[1]).to.have.lengthOf(255);
        });

        it('should cap the compressed PNG raw profiles at 255 in async mode', async () => {
            const log = [];
            record(log, [['Tags', Tags]]);
            const chunk = getCompressedExifRawProfileChunk(getTiffWithMake('a'));

            await load(getPng(...new Array(260).fill(chunk)), {expanded: true, async: true});

            expect(log).to.have.lengthOf(255);
        });
    });

    describe('Rule 2: same-kind suppression pairs', () => {
        for (const async of MODES) {
            it(`should let an APP13 segment suppress the IPTC-NAA of the main Exif block (async: ${async})`, async () => {
                const tiff = getTiff({ifd0: [undefinedBytes(TAG_IPTC_NAA, getIptcDatasets([headline('carried'), objectName('carried only')]))]});
                const withSegment = getJpeg(getExifSegment(tiff), getIptcSegment(getNaaBlock([headline('segment')])));
                const withoutSegment = getJpeg(getExifSegment(tiff));

                const expanded = await load(withSegment, {expanded: true, async});
                const flat = await load(withSegment, {async});
                const alone = await load(withoutSegment, {expanded: true, async});

                expect(expanded.iptc.Headline.description).to.equal('segment');
                expect(expanded.iptc['Object Name']).to.be.undefined;
                expect(flat.Headline.description).to.equal('segment');
                expect(flat['Object Name']).to.be.undefined;
                expect(alone.iptc.Headline.description).to.equal('carried');
                expect(alone.iptc['Object Name'].description).to.equal('carried only');
            });

            it(`should let an APP1 XMP segment suppress the ApplicationNotes of the main Exif block (async: ${async})`, async () => {
                const tiff = getTiff({ifd0: [bytes(TAG_APPLICATION_NOTES, getXmpPacket({Title: 'carried', Keep: 'carried'}))]});
                const withSegment = getJpeg(getExifSegment(tiff), getXmpSegment(getXmpPacket({Title: 'segment'})));
                const withoutSegment = getJpeg(getExifSegment(tiff));

                const expanded = await load(withSegment, {expanded: true, async});
                const flat = await load(withSegment, {async});
                const alone = await load(withoutSegment, {expanded: true, async});

                expect(expanded.xmp.Title.value).to.equal('segment');
                expect(expanded.xmp.Keep).to.be.undefined;
                expect(flat.Title.value).to.equal('segment');
                expect(flat.Keep).to.be.undefined;
                expect(alone.xmp.Title.value).to.equal('carried');
                expect(alone.xmp.Keep.value).to.equal('carried');
            });

            it(`should read the ApplicationNotes of a JXL Exif box even when a brob XMP box exists (async: ${async})`, async () => {
                const image = getJxl(getExifBox(getTiffWithCarriedXmp()), getBrobBox('xml ', getXmpPacket({Title: 'brob', Only: 'brob'})), getJxlcBox());

                const expanded = await load(image, {expanded: true, async});
                const flat = await load(image, {async});

                if (async) {
                    expect(expanded.xmp.Title.value).to.equal('brob');
                    expect(expanded.xmp.Keep).to.be.undefined;
                    expect(flat.Title.value).to.equal('brob');
                    expect(flat.Keep.value).to.equal('carried');
                    expect(flat.Only.value).to.equal('brob');
                } else {
                    expect(expanded.xmp.Title.value).to.equal('carried');
                    expect(expanded.xmp.Keep.value).to.equal('carried');
                    expect(flat.Title.value).to.equal('carried');
                    expect(flat.Only).to.be.undefined;
                }
            });

            it(`should let an APP2 ICC segment suppress the ICC_Profile of the main Exif block (async: ${async})`, async () => {
                const tiff = getTiff({ifd0: [undefinedBytes(TAG_ICC_PROFILE, getIccProfile('CARR'))]});
                const withSegment = getJpeg(getExifSegment(tiff), getIccSegment(getIccProfile('SEGM')));
                const withoutSegment = getJpeg(getExifSegment(tiff));

                const expanded = await load(withSegment, {expanded: true, async});
                const flat = await load(withSegment, {async});
                const alone = await load(withoutSegment, {expanded: true, async});

                expect(Object.keys(expanded)).to.deep.equal(['exif', 'icc', 'file']);
                expect(expanded.icc['Device Manufacturer'].value).to.equal('SEGM');
                expect(flat['Device Manufacturer'].value).to.equal('SEGM');
                expect(Object.keys(alone)).to.deep.equal(['icc', 'exif', 'file']);
                expect(alone.icc['Device Manufacturer'].value).to.equal('CARR');
            });

            it(`should let a JXL Exif box suppress a brob Exif box in either order (async: ${async})`, async () => {
                const exifBox = getExifBox(getTiffWithMake('box'));
                const brobExifBox = getBrobExifBox(getTiff({ifd0: [ascii(TAG_MAKE, 'brob'), ascii(TAG_MODEL, 'brob only')]}));

                const exifFirst = await load(getJxl(exifBox, brobExifBox), {expanded: true, async});
                const brobFirst = await load(getJxl(brobExifBox, exifBox), {expanded: true, async});

                expect(exifFirst.exif.Make.value).to.deep.equal(['box']);
                expect(exifFirst.exif.Model).to.be.undefined;
                expect(brobFirst.exif.Make.value).to.deep.equal(['box']);
                expect(brobFirst.exif.Model).to.be.undefined;
            });

            it(`should let a PNG raw IPTC chunk suppress the IPTC-NAA of a raw profile Exif chunk (async: ${async})`, async () => {
                const tiff = getTiff({ifd0: [undefinedBytes(TAG_IPTC_NAA, getIptcDatasets([headline('carried'), objectName('carried only')]))]});
                const iptcBlock = getNaaBlock([headline('chunk')]);

                const bothText = await load(getPng(getExifRawProfileChunk(tiff), getIptcRawProfileChunk(iptcBlock)), {expanded: true, async});
                const textExifCompressedIptc = await load(getPng(getExifRawProfileChunk(tiff), getCompressedIptcRawProfileChunk(iptcBlock)), {expanded: true, async});
                const compressedExifTextIptc = await load(getPng(getCompressedExifRawProfileChunk(tiff), getIptcRawProfileChunk(iptcBlock)), {expanded: true, async});

                expect(bothText.iptc.Headline.description).to.equal('chunk');
                expect(bothText.iptc['Object Name']).to.be.undefined;
                expect(compressedExifTextIptc.iptc.Headline.description).to.equal('chunk');
                expect(compressedExifTextIptc.iptc['Object Name']).to.be.undefined;
                if (async) {
                    expect(textExifCompressedIptc.iptc.Headline.description).to.equal('chunk');
                    expect(textExifCompressedIptc.iptc['Object Name']).to.be.undefined;
                } else {
                    expect(textExifCompressedIptc.iptc.Headline.description).to.equal('carried');
                    expect(textExifCompressedIptc.iptc['Object Name'].description).to.equal('carried only');
                }
            });

            it(`should parse both groups carried by a PNG eXIf chunk in sync mode, and in async let iCCP suppress the carried ICC and a zTXt IPTC merge over the carried IPTC (async: ${async})`, async () => {
                // A PNG never sets iptcDataOffset, so the carried IPTC-NAA is parsed even next to a zTXt raw IPTC chunk.
                const tiff = getTiff({ifd0: [
                    undefinedBytes(TAG_ICC_PROFILE, getIccProfile('CARR')),
                    undefinedBytes(TAG_IPTC_NAA, getIptcDatasets([headline('carried'), objectName('carried only')])),
                ]});
                const image = getPng(
                    getExifChunk(tiff),
                    getIccpChunk('icc', 0, deflate(getIccProfile('ICCP'))),
                    getCompressedIptcRawProfileChunk(getNaaBlock([headline('chunk')]))
                );

                const tags = await load(image, {expanded: true, async});

                if (async) {
                    expect(Object.keys(tags)).to.deep.equal(['iptc', 'exif', 'icc', 'png', 'pngFile', 'file', 'pngText']);
                    expect(tags.icc['Device Manufacturer'].value).to.equal('ICCP');
                    expect(tags.iptc.Headline.description).to.equal('chunk');
                    expect(tags.iptc['Object Name'].description).to.equal('carried only');
                } else {
                    expect(Object.keys(tags)).to.deep.equal(['iptc', 'icc', 'exif', 'png', 'pngFile', 'file']);
                    expect(tags.icc['Device Manufacturer'].value).to.equal('CARR');
                    expect(tags.iptc.Headline.description).to.equal('carried');
                    expect(tags.iptc['Object Name'].description).to.equal('carried only');
                }
            });
        }
    });

    describe('Rule 3: brob XMP merge', () => {
        it('should replace the xmp group with the brob XMP in expanded output and merge key by key in flat output', async () => {
            const image = getJxl(getExifBox(getTiffWithCarriedXmp()), getBrobBox('xml ', getXmpPacket({Title: 'brob', Only: 'brob'})), getJxlcBox());

            const expanded = await load(image, {expanded: true, async: true});
            const flat = await load(image, {async: true});

            expect(Object.keys(expanded.xmp)).to.deep.equal(['_raw', 'about', 'Title', 'Only']);
            expect(expanded.xmp.Title.value).to.equal('brob');
            expect(flat.Title.value).to.equal('brob');
            expect(flat.Keep.value).to.equal('carried');
            expect(flat.Only.value).to.equal('brob');
            expect(flat._raw).to.be.undefined;
        });

        it('should keep the carried xmp group when the brob XMP is empty', async () => {
            const image = getJxl(getExifBox(getTiffWithCarriedXmp()), getBrobBox('xml ', ''), getJxlcBox());

            const tags = await load(image, {expanded: true, async: true});

            expectCarriedXmp(tags);
        });

        it('should keep the carried xmp group when the brob XMP fails to decompress', async () => {
            const image = getJxl(getExifBox(getTiffWithCarriedXmp()), getBox('brob', 'xml not brotli'), getJxlcBox());

            const tags = await load(image, {expanded: true, async: true});

            expectCarriedXmp(tags);
        });

        it('should keep the carried xmp group when the brob XMP exceeds 4 times the file size plus 64 KiB', async () => {
            const packet = getXmpPacket({Title: 'brob', Only: 'brob'}, {padding: ' '.repeat(240000)});
            const image = getJxl(getExifBox(getTiffWithCarriedXmp()), getBrobBox('xml ', packet), getPaddingBox(PADDING_LENGTH), getJxlcBox());
            expect(packet.length).to.be.above(getBrobXmpSizeBound(image.length));
            expect(packet.length).to.be.below(getBrobXmpSizeBound(image.length, 2 * BROB_XMP_SIZE_PER_INPUT_SIZE));

            const tags = await load(image, {expanded: true, async: true});

            expectCarriedXmp(tags);
        });

        it('should take a brob XMP within 4 times the file size plus 64 KiB', async () => {
            const packet = getXmpPacket({Title: 'brob', Only: 'brob'}, {padding: ' '.repeat(200000)});
            const image = getJxl(getExifBox(getTiffWithCarriedXmp()), getBrobBox('xml ', packet), getPaddingBox(PADDING_LENGTH), getJxlcBox());
            expect(packet.length).to.be.at.most(getBrobXmpSizeBound(image.length));
            expect(packet.length).to.be.above(getBrobXmpSizeBound(image.length, BROB_XMP_SIZE_PER_INPUT_SIZE / 2));
            expect(packet.length).to.be.above(getBrobXmpSizeBound(image.length) - BROB_XMP_SIZE_ALLOWANCE / 2);

            const tags = await load(image, {expanded: true, async: true});

            expect(tags.xmp.Title.value).to.equal('brob');
            expect(tags.xmp.Keep).to.be.undefined;
        });

        function expectCarriedXmp(tags) {
            expect(Object.keys(tags.xmp)).to.deep.equal(['_raw', 'about', 'Title', 'Keep']);
            expect(tags.xmp.Title.value).to.equal('carried');
            expect(tags.xmp.Keep.value).to.equal('carried');
        }
    });

    describe('Rule 4: dispatch and budget order', () => {
        const READERS = [
            ['FileTags', FileTags],
            ['JfifTags', JfifTags],
            ['Tags', Tags],
            ['IptcTags', IptcTags],
            ['XmpTags', XmpTags],
            ['PhotoshopTags', PhotoshopTags],
            ['IccTags', IccTags],
            ['CanonTags', CanonTags],
            ['MpfTags', MpfTags],
            ['PngFileTags', PngFileTags],
            ['PngTextTags', PngTextTags],
            ['PngTags', PngTags],
        ];

        for (const async of MODES) {
            it(`should pass one budget object, created from the file view by the main Exif read, to every reader (async: ${async})`, async () => {
                const image = getJpegWithEverything();
                const log = [];
                record(log, READERS);

                await load(image, {expanded: true, async});

                const budgets = getRecordedBudgets(log);
                expect(budgets).to.have.lengthOf(4);
                for (const budget of budgets) {
                    expect(budget.object).to.equal(budgets[0].object);
                }
                expect(budgets[0].name).to.equal('Tags');
                expect(budgets[0].pristine).to.deep.equal(getPristineBudget(image.length));
                expect(budgets[0].object.remaining).to.be.below(4 * image.length);
            });

            it(`should create the budget from the file view when there is no Exif (async: ${async})`, async () => {
                const image = getJpeg(getIptcSegment(getNaaBlock([headline('segment')])));
                const log = [];
                record(log, READERS);

                await load(image, {expanded: true, async});

                const budgets = getRecordedBudgets(log);
                expect(budgets.map((budget) => budget.name)).to.deep.equal(['IptcTags']);
                expect(budgets[0].pristine).to.deep.equal(getPristineBudget(image.length));
            });

            it(`should read the groups in this order when the segments suppress the carried IPTC, XMP and ICC (async: ${async})`, async () => {
                const log = [];
                record(log, READERS);

                await load(getJpegWithEverything(), {expanded: true, async});

                expect(log.map((entry) => entry.name)).to.deep.equal([
                    'FileTags', 'JfifTags', 'Tags', 'PhotoshopTags', 'CanonTags', 'IptcTags', 'XmpTags', 'IccTags', 'MpfTags',
                ]);
            });

            it(`should read the carried groups in EXIF_CARRIED_GROUP_ORDER right after the main Exif block (async: ${async})`, async () => {
                const log = [];
                record(log, READERS);

                await load(getJpegWithEverything({segments: false}), {expanded: true, async});

                expect(log.map((entry) => entry.name)).to.deep.equal([
                    'FileTags', 'JfifTags', 'Tags', 'IptcTags', 'XmpTags', 'PhotoshopTags', 'IccTags', 'CanonTags', 'MpfTags',
                ]);
            });

            it(`should read the PNG groups sync first and the compressed profile last (async: ${async})`, async () => {
                const image = getPng(
                    getExifChunk(getTiff({ifd0: [undefinedBytes(TAG_IPTC_NAA, getIptcDatasets([headline('carried')]))]})),
                    getExifRawProfileChunk(getTiff({ifd0: [ascii(TAG_MODEL, 'raw')]})),
                    getCompressedExifRawProfileChunk(getTiff({ifd0: [ascii(TAG_SOFTWARE, 'z')]})),
                    getPhysChunk()
                );
                const log = [];
                record(log, READERS);

                await load(image, {expanded: true, async});

                const expectedOrder = ['Tags', 'IptcTags', 'PngFileTags', 'PngTextTags', 'Tags', 'PngTags'];
                expect(log.map((entry) => entry.name)).to.deep.equal(async ? [...expectedOrder, 'Tags'] : expectedOrder);
            });
        }

        it('should add the decompressed Exif size times 4 as an allowance to remaining only', async () => {
            const DECOMPRESSED_TIFF_LENGTH = 2000;
            const tiff = getTiff({ifd0: [ascii(TAG_MAKE, 'x'.repeat(DECOMPRESSED_TIFF_LENGTH - 27))]});
            expect(tiff).to.have.lengthOf(DECOMPRESSED_TIFF_LENGTH);
            const image = getPng(getCompressedExifRawProfileChunk(tiff));
            const log = [];
            record(log, READERS);

            await load(image, {expanded: true, async: true});

            const budgets = getRecordedBudgets(log);
            expect(budgets.map((budget) => budget.name)).to.deep.equal(['PngTextTags', 'Tags']);
            expect(budgets[1].object).to.equal(budgets[0].object);
            expect(budgets[0].pristine).to.deep.equal(getPristineBudget(image.length));
            const allowance = 4 * (DECOMPRESSED_TIFF_LENGTH + 'Exif\x00\x00'.length);
            expect(budgets[1].pristine).to.deep.equal(objectAssign(getPristineBudget(image.length), {
                remaining: 4 * image.length + allowance,
                decompressedAllowanceRemaining: MAX_DECOMPRESSED_VALUE_ALLOWANCE - allowance,
            }));
        });

        it('should add no allowance for an uncompressed raw profile', async () => {
            const image = getPng(getExifRawProfileChunk(getTiff({ifd0: [ascii(TAG_MAKE, 'x'.repeat(100))]})));
            const log = [];
            record(log, READERS);

            await load(image, {expanded: true, async: true});

            const budgets = getRecordedBudgets(log);
            expect(budgets.map((budget) => budget.name)).to.deep.equal(['PngTextTags', 'Tags']);
            expect(budgets[1].pristine).to.deep.equal(getPristineBudget(image.length));
        });

        it('should add one IPTC dataset unit per 5 decompressed bytes of a compressed raw IPTC profile', async () => {
            const naaBlock = getNaaBlock([headline('x'.repeat(200))]);
            const image = getPng(getCompressedIptcRawProfileChunk(naaBlock));
            const log = [];
            record(log, READERS);

            await load(image, {expanded: true, async: true});

            const budgets = getRecordedBudgets(log);
            expect(budgets.map((budget) => budget.name)).to.deep.equal(['PngTextTags', 'IptcTags']);
            const allowance = Math.floor(naaBlock.length / 5);
            expect(budgets[1].pristine).to.deep.equal(objectAssign(getPristineBudget(image.length), {
                iptcDatasetsRemaining: 1024 + Math.floor(image.length / 48) + allowance,
                decompressedIptcAllowanceRemaining: MAX_DECOMPRESSED_IPTC_ALLOWANCE - allowance,
            }));
        });

        it('should keep the draws of a failing Exif read for the MPF read', async () => {
            const VALUE_LENGTH = 3000;
            const image = getJpeg(
                getExifSegment(getTiff({ifd0: [bytes(0x7100, 'y'.repeat(VALUE_LENGTH))]})),
                getMpfSegment(getTiff({ifd0: [long(TAG_MPF_NUMBER_OF_IMAGES, 2)]}))
            );
            const realRead = Tags.read;
            swap(Tags, {
                read(...args) {
                    realRead(...args);
                    throw new Error('Exif read failed after decoding its values.');
                }
            });
            const log = [];
            record(log, [['MpfTags', MpfTags]]);

            const tags = await load(image, {expanded: true, includeUnknown: true});

            expect(getRecordedBudgets(log)[0].pristine.remaining).to.equal(4 * image.length - VALUE_LENGTH);
            expect(tags.exif).to.deep.equal({});
            expect(tags.mpf.NumberOfImages.value).to.equal(2);
        });

        it('should parse exactly one of two compressed ApplicationNotes packets that together exceed the brob XMP bound', async () => {
            const LARGE = 120000;
            const SMALL = 100000;
            const bothLarge = getPng(getCompressedApplicationNotesChunk('A', LARGE), getCompressedApplicationNotesChunk('B', LARGE), getPaddingChunk(PADDING_LENGTH));
            const oneLarge = getPng(getCompressedApplicationNotesChunk('A', LARGE), getPaddingChunk(PADDING_LENGTH));
            const bothSmall = getPng(getCompressedApplicationNotesChunk('A', SMALL), getCompressedApplicationNotesChunk('B', SMALL), getPaddingChunk(PADDING_LENGTH));
            expect(2 * LARGE).to.be.above(getBrobXmpSizeBound(bothLarge.length));
            expect(2 * LARGE).to.be.below(getBrobXmpSizeBound(bothLarge.length, 2 * BROB_XMP_SIZE_PER_INPUT_SIZE));
            expect(LARGE).to.be.at.most(getBrobXmpSizeBound(oneLarge.length));
            expect(2 * SMALL).to.be.at.most(getBrobXmpSizeBound(bothSmall.length));
            expect(2 * SMALL).to.be.above(getBrobXmpSizeBound(bothSmall.length, BROB_XMP_SIZE_PER_INPUT_SIZE / 2));
            expect(2 * SMALL).to.be.above(getBrobXmpSizeBound(bothSmall.length) - BROB_XMP_SIZE_ALLOWANCE / 2);

            const bothLargeTags = await load(bothLarge, {expanded: true, async: true});
            const oneLargeTags = await load(oneLarge, {expanded: true, async: true});
            const bothSmallTags = await load(bothSmall, {expanded: true, async: true});

            const parsedLarge = ['A', 'B'].filter((name) => bothLargeTags.xmp[name] !== undefined);
            expect(parsedLarge).to.have.lengthOf(1);
            expect(oneLargeTags.xmp.A.value).to.equal('v');
            expect(bothSmallTags.xmp.A.value).to.equal('v');
            expect(bothSmallTags.xmp.B.value).to.equal('v');
        });

        it('should copy only one of two embedded thumbnails that together exceed 2 times the file size plus 64 KiB', async () => {
            const LARGE = 100000;
            const SMALL = 60000;
            const bothLarge = getPng(getCompressedThumbnailChunk('A', LARGE), getCompressedThumbnailChunk('B', LARGE), getPaddingChunk(PADDING_LENGTH));
            const bothSmall = getPng(getCompressedThumbnailChunk('A', SMALL), getCompressedThumbnailChunk('B', SMALL), getPaddingChunk(PADDING_LENGTH));
            expect(2 * LARGE).to.be.above(getThumbnailSizeBound(bothLarge.length));
            expect(2 * LARGE).to.be.below(getThumbnailSizeBound(bothLarge.length, 2 * EMBEDDED_THUMBNAIL_SIZE_PER_INPUT_SIZE));
            expect(LARGE).to.be.at.most(getThumbnailSizeBound(bothLarge.length));
            expect(2 * SMALL).to.be.at.most(getThumbnailSizeBound(bothSmall.length));
            expect(2 * SMALL).to.be.above(getThumbnailSizeBound(bothSmall.length, EMBEDDED_THUMBNAIL_SIZE_PER_INPUT_SIZE / 2));
            expect(2 * SMALL).to.be.above(getThumbnailSizeBound(bothSmall.length) - EMBEDDED_THUMBNAIL_SIZE_ALLOWANCE / 2);
            const log = [];
            record(log, [['Thumbnail', Thumbnail, 'get']]);

            const bothLargeTags = await load(bothLarge, {expanded: true, async: true});
            const largeCalls = log.length;
            const bothSmallTags = await load(bothSmall, {expanded: true, async: true});

            expect(largeCalls).to.equal(1);
            expect(getThumbnailBytes(bothLargeTags).slice(0, 4)).to.be.oneOf(['\xff\xd8AA', '\xff\xd8BB']);
            expect(log.length - largeCalls).to.equal(2);
            expect(getThumbnailBytes(bothSmallTags).slice(0, 4)).to.be.oneOf(['\xff\xd8AA', '\xff\xd8BB']);
        });

        function getRecordedBudgets(log) {
            return log
                .filter((entry) => BUDGET_ARGUMENT_INDEX[entry.name] !== undefined)
                .map((entry) => ({
                    name: entry.name,
                    object: entry.args[BUDGET_ARGUMENT_INDEX[entry.name]],
                    pristine: entry.pristineBudget,
                }));
        }

        function getPristineBudget(fileLength) {
            return {
                remaining: 4 * fileLength,
                ifdEntriesRemaining: 4 * Math.floor(fileLength / 12),
                decompressedAllowanceRemaining: MAX_DECOMPRESSED_VALUE_ALLOWANCE,
                iptcDatasetsRemaining: 1024 + Math.floor(fileLength / 48),
                decompressedIptcAllowanceRemaining: MAX_DECOMPRESSED_IPTC_ALLOWANCE,
            };
        }

        function getCompressedApplicationNotesChunk(attributeName, packetLength) {
            const unpaddedLength = getXmpPacket({[attributeName]: 'v'}).length;
            const packet = getXmpPacket({[attributeName]: 'v'}, {padding: ' '.repeat(packetLength - unpaddedLength)});
            expect(packet).to.have.lengthOf(packetLength);
            return getCompressedExifRawProfileChunk(getTiff({ifd0: [bytes(TAG_APPLICATION_NOTES, packet)]}));
        }

        function getCompressedThumbnailChunk(marker, length) {
            const image = '\xff\xd8' + marker.repeat(length - 4) + '\xff\xd9';
            return getCompressedExifRawProfileChunk(getTiff({ifd0: [ascii(TAG_MAKE, marker)], thumbnail: {image}}));
        }
    });

    describe('Rule 5: two orderings', () => {
        describe('expanded key order', () => {
            for (const async of MODES) {
                it(`should order a JPEG with every segment with the carried photoshop and makerNotes before exif and the segments after (async: ${async})`, async () => {
                    const tags = await load(getJpegWithEverything(), {expanded: true, async, includeOffsets: true});

                    expect(Object.keys(tags)).to.deep.equal([
                        'file', 'jfif', 'photoshop', 'makerNotes', 'exif', 'iptc', 'xmp', 'icc', 'mpf', 'gps', 'composite', 'Thumbnail', 'metadataRange',
                    ]);
                    expect(getThumbnailBytes(tags)).to.equal('\xff\xd8thumb\xff\xd9');
                    expect(tags.gps).to.deep.equal({Latitude: 1});
                });

                it(`should order a JPEG without segments with all five carried groups before exif (async: ${async})`, async () => {
                    const tags = await load(getJpegWithEverything({segments: false}), {expanded: true, async, includeOffsets: true});

                    expect(Object.keys(tags)).to.deep.equal([
                        'file', 'jfif', 'iptc', 'xmp', 'photoshop', 'icc', 'makerNotes', 'exif', 'mpf', 'gps', 'composite', 'Thumbnail', 'metadataRange',
                    ]);
                    expect(getThumbnailBytes(tags)).to.equal('\xff\xd8thumb\xff\xd9');
                    expect(tags.gps).to.deep.equal({Latitude: 1});
                });

                it(`should keep the iptc key where the eXIf carried group put it when a raw IPTC chunk merges into it (async: ${async})`, async () => {
                    const image = getPng(
                        getExifChunk(getTiff({ifd0: [undefinedBytes(TAG_IPTC_NAA, getIptcDatasets([headline('carried'), objectName('carried only')]))]})),
                        getIptcRawProfileChunk(getNaaBlock([headline('chunk')]))
                    );

                    const tags = await load(image, {expanded: true, async});

                    expect(Object.keys(tags)).to.deep.equal(['iptc', 'exif', 'png', 'pngFile', 'file', 'pngText']);
                    expect(tags.iptc.Headline.description).to.equal('chunk');
                    expect(tags.iptc['Object Name'].description).to.equal('carried only');
                });

                it(`should order a PNG with eXIf carried groups, XMP, text, raw exif, iCCP, pHYs and zTXt chunks (async: ${async})`, async () => {
                    const image = getPng(
                        getExifChunk(getTiff({ifd0: [
                            undefinedBytes(TAG_IPTC_NAA, getIptcDatasets([headline('carried')])),
                            bytes(TAG_APPLICATION_NOTES, getXmpPacket({Title: 'carried'})),
                        ]})),
                        getXmpChunk(getXmpPacket({Title: 'chunk'})),
                        getTextChunk('Comment', 'c'),
                        getExifRawProfileChunk(getTiff({ifd0: [ascii(TAG_MODEL, 'raw')]})),
                        getIccpChunk('icc', 0, deflate(getIccProfile('ICCP'))),
                        getPhysChunk(),
                        getZtxtChunk('Note', 'n')
                    );

                    const tags = await load(image, {expanded: true, async});

                    if (async) {
                        expect(Object.keys(tags)).to.deep.equal(['iptc', 'exif', 'xmp', 'icc', 'png', 'pngFile', 'pngText', 'file']);
                        expect(Object.keys(tags.pngText)).to.deep.equal([...PNG_FILE_TAG_NAMES, 'Comment', 'Note', ...PHYS_TAG_NAMES]);
                    } else {
                        expect(Object.keys(tags)).to.deep.equal(['iptc', 'exif', 'xmp', 'png', 'pngFile', 'pngText', 'file']);
                        expect(Object.keys(tags.pngText)).to.deep.equal(['Comment']);
                    }
                    expect(tags.xmp.Title.value).to.equal('chunk');
                    expect(Object.keys(tags.exif)).to.deep.equal(['ApplicationNotes', 'IPTC-NAA', 'Model']);
                });

                it(`should keep the xmp key before exif when a brob XMP replaces the carried XMP of a JXL (async: ${async})`, async () => {
                    const image = getJxl(getExifBox(getTiffWithCarriedXmp()), getBrobBox('xml ', getXmpPacket({Title: 'brob'})), getJxlcBox());

                    const tags = await load(image, {expanded: true, async});

                    expect(Object.keys(tags)).to.deep.equal(['xmp', 'exif', 'file']);
                    expect(tags.xmp.Title.value).to.equal(async ? 'brob' : 'carried');
                });

                it(`should order a JXL with Exif, xml, brob Exif, brob xml and jxlc boxes (async: ${async})`, async () => {
                    const image = getJxl(
                        getExifBox(getTiffWithCarriedXmp()),
                        getXmlBox(getXmpPacket({Title: 'xml'})),
                        getBrobExifBox(getTiffWithMake('brob')),
                        getBrobBox('xml ', getXmpPacket({Title: 'brob'})),
                        getJxlcBox()
                    );

                    const tags = await load(image, {expanded: true, async});

                    expect(Object.keys(tags)).to.deep.equal(['exif', 'xmp', 'file']);
                    expect(tags.exif.Make.value).to.deep.equal(['box']);
                    expect(tags.xmp.Title.value).to.equal('xml');
                });

                it(`should order a JXL with only brob boxes and a jxlc box (async: ${async})`, async () => {
                    const image = getJxl(
                        getBrobExifBox(getTiff({ifd0: [ascii(TAG_MAKE, 'brob'), undefinedBytes(TAG_IPTC_NAA, getIptcDatasets([headline('brob carried')]))]})),
                        getBrobBox('xml ', getXmpPacket({Title: 'brob'})),
                        getJxlcBox()
                    );

                    const expanded = await load(image, {expanded: true, async});
                    const flat = await load(image, {async});

                    if (async) {
                        expect(Object.keys(expanded)).to.deep.equal(['iptc', 'exif', 'xmp', 'file']);
                        expect(Object.keys(flat)).to.deep.equal(['Headline', 'Make', 'IPTC-NAA', 'about', 'Title', 'Image Height', 'Image Width', 'FileType']);
                    } else {
                        expect(Object.keys(expanded)).to.deep.equal(['file']);
                        expect(Object.keys(flat)).to.deep.equal(['Image Height', 'Image Width', 'FileType']);
                    }
                });

                it(`should order WebP and GIF as their one group then file (async: ${async})`, async () => {
                    const webp = await load(getWebp(), {expanded: true, async});
                    const gif = await load(getGif(), {expanded: true, async});

                    expect(Object.keys(webp)).to.deep.equal(['riff', 'file']);
                    expect(webp.riff.ImageWidth.value).to.equal(1);
                    expect(Object.keys(gif)).to.deep.equal(['gif', 'file']);
                    expect(gif.gif['GIF Version'].value).to.equal('89a');
                });
            }
        });

        describe('flat precedence, later wins', () => {
            for (const async of MODES) {
                it(`should let the carried XMP win over exif in flat output only (async: ${async})`, async () => {
                    const image = getJpeg(getExifSegment(getTiff({ifd0: [ascii(TAG_MAKE, 'exif'), bytes(TAG_APPLICATION_NOTES, getXmpPacket({Make: 'xmp'}))]})));

                    const flat = await load(image, {async});
                    const expanded = await load(image, {expanded: true, async});

                    expect(flat.Make.value).to.equal('xmp');
                    expect(expanded.exif.Make.value).to.deep.equal(['exif']);
                    expect(expanded.xmp.Make.value).to.equal('xmp');
                });

                it(`should let exif win over the carried makerNotes (async: ${async})`, async () => {
                    const image = getJpeg(getExifSegment(getTiff({
                        ifd0: [ascii(TAG_MAKE, 'Canon')],
                        exifIfd: [ascii(TAG_LENS_MODEL, 'exif'), canonMakerNote([ascii(TAG_CANON_LENS_MODEL, 'canon')])],
                    })));

                    const flat = await load(image, {async});
                    const expanded = await load(image, {expanded: true, async});

                    expect(flat.LensModel.value).to.deep.equal(['exif']);
                    expect(expanded.exif.LensModel.value).to.deep.equal(['exif']);
                    expect(expanded.makerNotes.LensModel.value).to.deep.equal(['canon']);
                });

                it(`should let exif win over the carried iptc for an unknown tag of the same id (async: ${async})`, async () => {
                    const image = getJpeg(getExifSegment(getTiff({ifd0: [
                        ascii(IPTC_UNKNOWN_DATASET, 'exif'),
                        undefinedBytes(TAG_IPTC_NAA, getIptcDatasets([{record: 2, dataset: IPTC_UNKNOWN_DATASET & 0xff, value: 'iptc'}])),
                    ]})));

                    const flat = await load(image, {async, includeUnknown: true});
                    const expanded = await load(image, {expanded: true, async, includeUnknown: true});

                    expect(flat[`undefined-${IPTC_UNKNOWN_DATASET}`].value).to.deep.equal(['exif']);
                    expect(expanded.exif[`undefined-${IPTC_UNKNOWN_DATASET}`].value).to.deep.equal(['exif']);
                    expect(expanded.iptc[`undefined-${IPTC_UNKNOWN_DATASET}`].value).to.deep.equal([105, 112, 116, 99]);
                });

                it(`should let the XMP segment win over exif, and MPF over the XMP segment (async: ${async})`, async () => {
                    const xmpOverExif = getJpeg(getExifSegment(getTiffWithMake('exif')), getXmpSegment(getXmpPacket({Make: 'xmp'})));
                    const mpfOverXmp = getJpeg(getXmpSegment(getXmpPacket({NumberOfImages: 'xmp'})), getMpfSegment(getTiff({ifd0: [long(TAG_MPF_NUMBER_OF_IMAGES, 2)]})));

                    expect((await load(xmpOverExif, {async})).Make.value).to.equal('xmp');
                    expect((await load(mpfOverXmp, {async})).NumberOfImages.value).to.equal(2);
                });

                it(`should let PNG text win over pngFile and eXIf exif, and pHYs over text (async: ${async})`, async () => {
                    const textOverFile = getPng(getTextChunk('Image Width', 'text'));
                    const physOverText = getPng(getTextChunk('Pixels Per Unit X', 'text'), getPhysChunk());
                    const textOverExif = getPng(getExifChunk(getTiffWithMake('exif')), getTextChunk('Make', 'text'));

                    expect((await load(textOverFile, {async}))['Image Width'].value).to.equal('text');
                    expect((await load(physOverText, {async}))['Pixels Per Unit X'].value).to.equal(2835);
                    expect((await load(textOverExif, {async})).Make.value).to.equal('text');
                });

                it(`should let uncompressed text win over an uncompressed raw profile exif in either chunk order (async: ${async})`, async () => {
                    const rawFirst = getPng(getExifRawProfileChunk(getTiffWithMake('raw')), getTextChunk('Make', 'text'));
                    const textFirst = getPng(getTextChunk('Make', 'text'), getExifRawProfileChunk(getTiffWithMake('raw')));

                    expect((await load(rawFirst, {async})).Make.value).to.equal('text');
                    expect((await load(textFirst, {async})).Make.value).to.equal('text');
                });
            }

            it('should let the deferred compressed chunks win over the uncompressed ones, in chunk order among themselves', async () => {
                const compressedExifOverText = getPng(getTextChunk('Make', 'text'), getCompressedExifRawProfileChunk(getTiffWithMake('raw')));
                const compressedTextOverExif = getPng(getZtxtChunk('Make', 'ztext'), getExifRawProfileChunk(getTiffWithMake('raw')));
                const compressedTextThenExif = getPng(getZtxtChunk('Make', 'ztext'), getCompressedExifRawProfileChunk(getTiffWithMake('raw')));
                const compressedExifThenText = getPng(getCompressedExifRawProfileChunk(getTiffWithMake('raw')), getZtxtChunk('Make', 'ztext'));

                expect((await load(compressedExifOverText, {async: true})).Make.value).to.deep.equal(['raw']);
                expect((await load(compressedTextOverExif, {async: true})).Make.value).to.equal('ztext');
                expect((await load(compressedTextThenExif, {async: true})).Make.value).to.deep.equal(['raw']);
                expect((await load(compressedExifThenText, {async: true})).Make.value).to.equal('ztext');
            });

            it('should let the brob Exif win over the xml box, and the brob XMP over the brob Exif carried XMP', async () => {
                const brobExifOverXml = getJxl(getXmlBox(getXmpPacket({Make: 'xmp'})), getBrobExifBox(getTiffWithMake('exif')));
                const brobXmpOverCarried = getJxl(
                    getBrobExifBox(getTiff({ifd0: [bytes(TAG_APPLICATION_NOTES, getXmpPacket({Make: 'carried'}))]})),
                    getBrobBox('xml ', getXmpPacket({Make: 'brob'}))
                );

                expect((await load(brobExifOverXml, {async: true})).Make.value).to.deep.equal(['exif']);
                expect((await load(brobXmpOverCarried, {async: true})).Make.value).to.equal('brob');
            });

            it('should let composite win over the XMP segment', async () => {
                const image = getJpeg(
                    getExifSegment(getTiff({exifIfd: [rational(TAG_FOCAL_LENGTH, 50, 1), short(TAG_FOCAL_LENGTH_IN_35MM_FILM, 100)]})),
                    getXmpSegment(getXmpPacket({FocalLength35efl: 'xmp'}))
                );

                const tags = await load(image);

                expect(tags.FocalLength35efl).to.deep.equal({value: 100, description: '100 mm'});
            });

            it('should drop a flat Thumbnail tag from text or XMP and replace a FileType one', async () => {
                const pngWithoutThumbnail = await load(getPng(getTextChunk('Thumbnail', 'text'), getTextChunk('FileType', 'text')));
                const pngWithThumbnail = await load(getPng(getTextChunk('Thumbnail', 'text'), getExifChunk(getTiff({thumbnail: {image: '\xff\xd8t\xff\xd9'}}))));
                const jpeg = await load(getJpeg(getXmpSegment(getXmpPacket({FileType: 'xmp', Thumbnail: 'xmp'}))));

                expect(Object.keys(pngWithoutThumbnail)).to.deep.equal([...PNG_FILE_TAG_NAMES, 'FileType']);
                expect(pngWithoutThumbnail.FileType).to.deep.equal({value: 'png', description: 'PNG'});
                expect(Object.keys(pngWithThumbnail)).to.deep.equal([...PNG_FILE_TAG_NAMES, 'Thumbnail', 'FileType']);
                expect(getThumbnailBytes(pngWithThumbnail)).to.equal('\xff\xd8t\xff\xd9');
                expect(Object.keys(jpeg)).to.deep.equal(['about', 'FileType']);
                expect(jpeg.FileType).to.deep.equal({value: 'jpeg', description: 'JPEG'});
            });
        });
    });

    describe('Rule 6: PNG fan-out', () => {
        for (const async of MODES) {
            it(`should split png into pngFile and pngText with only the text tags in pngText (async: ${async})`, async () => {
                const tags = await load(getPng(getTextChunk('Comment', 'c'), getPhysChunk()), {expanded: true, async});

                expect(Object.keys(tags.png)).to.deep.equal([...PNG_FILE_TAG_NAMES, 'Comment', ...PHYS_TAG_NAMES]);
                expect(Object.keys(tags.pngFile)).to.deep.equal(PNG_FILE_TAG_NAMES);
                expect(tags.pngText).to.deep.equal({Comment: {value: 'c', description: 'c'}});
            });

            it(`should copy png into pngText when a compressed chunk exists in async mode (async: ${async})`, async () => {
                const tags = await load(getPng(getTextChunk('Comment', 'c'), getPhysChunk(), getZtxtChunk('Note', 'n')), {expanded: true, async});

                if (async) {
                    expect(Object.keys(tags.png)).to.deep.equal([...PNG_FILE_TAG_NAMES, 'Comment', 'Note', ...PHYS_TAG_NAMES]);
                    expect(tags.pngText).to.deep.equal(tags.png);
                    expect(tags.pngText).to.not.equal(tags.png);
                } else {
                    expect(Object.keys(tags.png)).to.deep.equal([...PNG_FILE_TAG_NAMES, 'Comment', ...PHYS_TAG_NAMES]);
                    expect(tags.pngText).to.deep.equal({Comment: {value: 'c', description: 'c'}});
                }
            });

            it(`should copy png into pngText when the only text chunk is a raw profile (async: ${async})`, async () => {
                const uncompressed = await load(getPng(getExifRawProfileChunk(getTiffWithMake('raw'))), {expanded: true, async});
                const compressed = await load(getPng(getCompressedExifRawProfileChunk(getTiffWithMake('raw'))), {expanded: true, async});

                expect(Object.keys(uncompressed)).to.deep.equal(['png', 'pngFile', 'exif', 'file', 'pngText']);
                expect(uncompressed.pngText).to.deep.equal(uncompressed.png);
                expect(Object.keys(uncompressed.pngText)).to.deep.equal(PNG_FILE_TAG_NAMES);
                if (async) {
                    expect(Object.keys(compressed)).to.deep.equal(['png', 'pngFile', 'exif', 'file', 'pngText']);
                    expect(compressed.pngText).to.deep.equal(compressed.png);
                } else {
                    expect(Object.keys(compressed)).to.deep.equal(['png', 'pngFile', 'file']);
                }
            });

            it(`should give no pngText without text chunks (async: ${async})`, async () => {
                const tags = await load(getPng(getPhysChunk()), {expanded: true, async});

                expect(Object.keys(tags)).to.deep.equal(['png', 'pngFile', 'file']);
            });

            it(`should merge the png tags at the top level in flat output (async: ${async})`, async () => {
                const tags = await load(getPng(getTextChunk('Comment', 'c'), getPhysChunk()), {async});

                expect(Object.keys(tags)).to.deep.equal([...PNG_FILE_TAG_NAMES, 'Comment', ...PHYS_TAG_NAMES, 'FileType']);
            });
        }
    });

    describe('Rule 7: thumbnail, gps, composite input', () => {
        for (const async of MODES) {
            for (const expanded of MODES) {
                it(`should take the main block thumbnail with an image (async: ${async}, expanded: ${expanded})`, async () => {
                    const tags = await load(getJpeg(getExifSegment(getTiffWithThumbnail('main'))), {async, expanded});

                    expect(getThumbnailBytes(tags)).to.equal('\xff\xd8main\xff\xd9');
                });
            }

            it(`should take the first embedded thumbnail with an image when the main one has none (async: ${async})`, async () => {
                const image = getPng(
                    getExifChunk(getTiffWithThumbnail('main', {offset: 100000})),
                    getExifRawProfileChunk(getTiffWithThumbnail('A')),
                    getExifRawProfileChunk(getTiffWithThumbnail('B'))
                );

                const tags = await load(image, {expanded: true, async});

                expect(getThumbnailBytes(tags)).to.equal('\xff\xd8A\xff\xd9');
            });

            it(`should prefer the main block thumbnail over embedded ones with an image (async: ${async})`, async () => {
                const image = getPng(
                    getExifChunk(getTiffWithThumbnail('main')),
                    getExifRawProfileChunk(getTiffWithThumbnail('A')),
                    getCompressedExifRawProfileChunk(getTiffWithThumbnail('Z'))
                );

                const tags = await load(image, {expanded: true, async});

                expect(getThumbnailBytes(tags)).to.equal('\xff\xd8main\xff\xd9');
            });

            it(`should fall back to the main IFD1 tags without an image, never to an embedded one without (async: ${async})`, async () => {
                const image = getPng(
                    getExifChunk(getTiffWithThumbnail('main', {offset: 100000, declaredLength: 11})),
                    getExifRawProfileChunk(getTiffWithThumbnail('raw', {offset: 100000, declaredLength: 22}))
                );

                const tags = await load(image, {expanded: true, async});

                expect(Object.keys(tags.Thumbnail)).to.deep.equal(['Compression', 'JPEGInterchangeFormat', 'JPEGInterchangeFormatLength']);
                expect(tags.Thumbnail.JPEGInterchangeFormatLength.value).to.equal(11);
                expect(tags.Thumbnail.image).to.be.undefined;
            });

            it(`should give no Thumbnail for an embedded IFD1 without an image (async: ${async})`, async () => {
                const image = getPng(getExifRawProfileChunk(getTiffWithThumbnail('raw', {offset: 100000})));

                const tags = await load(image, {expanded: true, async});

                expect(Object.keys(tags)).to.deep.equal(['png', 'pngFile', 'exif', 'file', 'pngText']);
            });

            it(`should give the gps group in expanded output only (async: ${async})`, async () => {
                const image = getJpeg(getExifSegment(getTiff({
                    ifd0: [ascii(TAG_MAKE, 'gps')],
                    gpsIfd: [ascii(TAG_GPS_LATITUDE_REF, 'N'), rationals(TAG_GPS_LATITUDE, [[1, 1], [0, 1], [0, 1]])],
                })));

                const expanded = await load(image, {expanded: true, async});
                const flat = await load(image, {async});

                expect(expanded.gps).to.deep.equal({Latitude: 1});
                expect(expanded.exif.Make.value).to.deep.equal(['gps']);
                expect(Object.keys(flat)).to.deep.equal(['Make', 'GPS Info IFD Pointer', 'GPSLatitudeRef', 'GPSLatitude', 'FileType']);
            });

            it(`should compute composite from the merged flat tags without a filter and from parsed exif with one (async: ${async})`, async () => {
                const image = getJpeg(
                    getExifSegment(getTiff({exifIfd: [rational(TAG_FOCAL_LENGTH, 50, 1), short(TAG_FOCAL_LENGTH_IN_35MM_FILM, 100)]})),
                    getXmpSegment(getXmpPacket({FocalLength: '25/1'}))
                );

                const flat = await load(image, {async});
                const flatFiltered = await load(image, {async, includeTags: {exif: true, xmp: true, composite: true}});
                const expanded = await load(image, {expanded: true, async});

                expect(flat.ScaleFactorTo35mmEquivalent).to.deep.equal({value: 4, description: '4.0'});
                expect(flatFiltered.ScaleFactorTo35mmEquivalent).to.deep.equal({value: 2, description: '2.0'});
                expect(expanded.composite.ScaleFactorTo35mmEquivalent).to.deep.equal({value: 2, description: '2.0'});
            });
        }
    });

    describe('Rule 8: error granularity', () => {
        // Carries IPTC-NAA, ApplicationNotes and ICC_Profile; ICC is the last of them read.
        const tiffWithCarriedGroups = getTiff({ifd0: [
            ascii(TAG_MAKE, 'raw'),
            undefinedBytes(TAG_IPTC_NAA, getIptcDatasets([headline('h')])),
            bytes(TAG_APPLICATION_NOTES, getXmpPacket({Title: 'x'})),
            undefinedBytes(TAG_ICC_PROFILE, getIccProfile('CARR')),
        ]});

        for (const async of MODES) {
            it(`should throw synchronously when a carried reader of the main Exif block throws (async: ${async})`, () => {
                swap(IptcTags, {read: () => {
                    throw new Error('IPTC read failed.');
                }});
                const dataView = getDataView(getJpeg(getExifSegment(tiffWithCarriedGroups)));

                expect(() => ExifReader.loadView(dataView, {async, domParser})).to.throw('IPTC read failed.');
            });

            it(`should drop every carried group of a PNG raw profile when one of its readers throws (async: ${async})`, async () => {
                swap(IccTags, {read: () => {
                    throw new Error('ICC read failed.');
                }});

                const tags = await load(getPng(getExifRawProfileChunk(tiffWithCarriedGroups)), {expanded: true, async});

                expect(Object.keys(tags)).to.deep.equal(['png', 'pngFile', 'exif', 'file', 'pngText']);
                expect(tags.exif.Make.value).to.deep.equal(['raw']);
            });

            it(`should throw Invalid image format synchronously (async: ${async})`, () => {
                expect(() => ExifReader.loadView(getDataView('not an image'), {async})).to.throw('Invalid image format');
            });

            it(`should throw MetadataMissingError synchronously (async: ${async})`, () => {
                // Unreachable from real bytes: every recognised format sets fileType, which hasPotentialMetaData accepts.
                swap(ImageHeader, {parseAppMarkers: () => ({})});

                expect(() => ExifReader.loadView(getDataView('\xff\xd8\xff\xd9'), {async})).to.throw(ExifReader.errors.MetadataMissingError);
            });

            it(`should give an empty icc group for an unsupported iCCP compression method in async mode only (async: ${async})`, async () => {
                const image = getPng(getIccpChunk('icc', 1, deflate(getIccProfile('ICCP'))));

                const expanded = await load(image, {expanded: true, async});
                const flat = await load(image, {async});

                expect(expanded.icc).to.deep.equal(async ? {} : undefined);
                expect(Object.keys(flat)).to.deep.equal([...PNG_FILE_TAG_NAMES, 'FileType']);
            });
        }

        it('should drop every carried group of a compressed PNG raw profile when one of its readers throws', async () => {
            swap(IccTags, {read: () => {
                throw new Error('ICC read failed.');
            }});

            const tags = await load(getPng(getCompressedExifRawProfileChunk(tiffWithCarriedGroups)), {expanded: true, async: true});

            expect(Object.keys(tags)).to.deep.equal(['png', 'pngFile', 'exif', 'file', 'pngText']);
            expect(tags.exif.Make.value).to.deep.equal(['raw']);
        });

        it('should drop every carried group of a brob Exif when one of its readers throws', async () => {
            swap(IccTags, {read: () => {
                throw new Error('ICC read failed.');
            }});

            const tags = await load(getJxl(getBrobExifBox(tiffWithCarriedGroups)), {expanded: true, async: true});

            expect(Object.keys(tags)).to.deep.equal(['exif', 'file']);
            expect(tags.exif.Make.value).to.deep.equal(['raw']);
        });
    });

    describe('Rule 9: filter interaction', () => {
        const image = getJpeg(getExifSegment(getTiff({
            ifd0: [ascii(TAG_MAKE, 'Canon')],
            exifIfd: [canonMakerNote([ascii(TAG_CANON_LENS_MODEL, 'canon')])],
        })));

        for (const async of MODES) {
            it(`should parse exif for makerNotes without returning it (async: ${async})`, async () => {
                const expanded = await load(image, {expanded: true, async, includeTags: {makerNotes: true}});
                const flat = await load(image, {async, includeTags: {makerNotes: true}});

                expect(Object.keys(expanded)).to.deep.equal(['makerNotes']);
                expect(expanded.makerNotes.LensModel.value).to.deep.equal(['canon']);
                expect(Object.keys(flat)).to.deep.equal(['LensModel']);
            });

            it(`should let excludeTags beat an injected dependency (async: ${async})`, async () => {
                const options = {includeTags: {makerNotes: true}, excludeTags: {exif: ['MakerNote']}};

                expect(await load(image, {expanded: true, async, ...options})).to.deep.equal({});
                expect(await load(image, {async, ...options})).to.deep.equal({});
            });

            it(`should shape the result by includeTags (async: ${async})`, async () => {
                const expanded = await load(image, {expanded: true, async, includeTags: {exif: ['Make']}});
                const flat = await load(image, {async, includeTags: {exif: ['Make']}});

                expect(expanded).to.deep.equal({exif: {Make: {id: TAG_MAKE, value: ['Canon'], description: 'Canon'}}});
                expect(flat).to.deep.equal({Make: {id: TAG_MAKE, value: ['Canon'], description: 'Canon'}});
            });

            it(`should parse file and exif for composite without returning them (async: ${async})`, async () => {
                // 1800 x 1200 pixels at 100 pixels per mm is an 18 x 12 mm sensor, a crop factor of 2.
                const exifSegment = getExifSegment(getTiff({exifIfd: [
                    rational(TAG_FOCAL_LENGTH, 50, 1),
                    rational(TAG_FOCAL_PLANE_X_RESOLUTION, 100, 1),
                    rational(TAG_FOCAL_PLANE_Y_RESOLUTION, 100, 1),
                    short(TAG_FOCAL_PLANE_RESOLUTION_UNIT, 4),
                ]}));
                const compositeImage = getJpeg(getSof0Segment({width: 1800, height: 1200}), exifSegment);

                const expanded = await load(compositeImage, {expanded: true, async, includeTags: {composite: true}});
                const flat = await load(compositeImage, {async, includeTags: {composite: true}});
                const withoutFile = await load(getJpeg(exifSegment), {expanded: true, async, includeTags: {composite: true}});

                expect(Object.keys(expanded)).to.deep.equal(['composite']);
                expect(expanded.composite.FocalLength35efl.value).to.be.closeTo(100, 0.01);
                expect(expanded.composite.ScaleFactorTo35mmEquivalent.value).to.be.closeTo(2, 0.001);
                expect(Object.keys(flat)).to.deep.equal(['FocalLength35efl', 'ScaleFactorTo35mmEquivalent', 'FieldOfView']);
                expect(flat.FocalLength35efl.value).to.be.closeTo(100, 0.01);
                expect(withoutFile).to.deep.equal({});
            });
        }
    });

    describe('Rule 10: depth', () => {
        const tiff = getTiff({
            ifd0: [
                ascii(TAG_MAKE, 'Canon'),
                undefinedBytes(TAG_IPTC_NAA, getIptcDatasets([headline('h')])),
                bytes(TAG_APPLICATION_NOTES, getXmpPacket({Title: 'x'})),
                undefinedBytes(TAG_ICC_PROFILE, getIccProfile('CARR')),
            ],
            exifIfd: [canonMakerNote([ascii(TAG_CANON_LENS_MODEL, 'canon')])],
        });

        for (const async of MODES) {
            it(`should read the groups carried by a raw profile exif chunk, in order before exif (async: ${async})`, async () => {
                const tags = await load(getPng(getExifRawProfileChunk(tiff)), {expanded: true, async});

                expectDeepChain(tags);
            });
        }

        it('should read the groups carried by a compressed raw profile exif chunk, in order before exif', async () => {
            const tags = await load(getPng(getCompressedExifRawProfileChunk(tiff)), {expanded: true, async: true});

            expectDeepChain(tags);
        });

        function expectDeepChain(tags) {
            expect(Object.keys(tags)).to.deep.equal(['png', 'pngFile', 'iptc', 'xmp', 'icc', 'makerNotes', 'exif', 'file', 'pngText']);
            expect(tags.iptc.Headline.description).to.equal('h');
            expect(tags.xmp.Title.value).to.equal('x');
            expect(tags.icc['Device Manufacturer'].value).to.equal('CARR');
            expect(tags.makerNotes.LensModel.value).to.deep.equal(['canon']);
            expect(tags.exif.Make.value).to.deep.equal(['Canon']);
        }
    });

    describe('Rule 11: sync vs async differences', () => {
        for (const async of MODES) {
            it(`should read compressed PNG parts and iCCP in async mode only (async: ${async})`, async () => {
                const image = getPng(getTextChunk('A', 'a'), getZtxtChunk('B', 'b'), getIccpChunk('icc', 0, deflate(getIccProfile('ICCP'))));

                const tags = await load(image, {expanded: true, async});

                if (async) {
                    expect(Object.keys(tags)).to.deep.equal(['icc', 'png', 'pngFile', 'pngText', 'file']);
                    expect(tags.png.B.value).to.equal('b');
                    expect(tags.icc['Device Manufacturer'].value).to.equal('ICCP');
                } else {
                    expect(Object.keys(tags)).to.deep.equal(['png', 'pngFile', 'pngText', 'file']);
                    expect(tags.png.B).to.be.undefined;
                }
                expect(tags.png.A.value).to.equal('a');
            });

            it(`should read brob boxes in async mode only (async: ${async})`, async () => {
                const image = getJxl(getBrobExifBox(getTiffWithMake('brob')), getBrobBox('xml ', getXmpPacket({Title: 'brob'})));

                const expanded = await load(image, {expanded: true, async});
                const flat = await load(image, {async});

                if (async) {
                    expect(Object.keys(expanded)).to.deep.equal(['exif', 'xmp', 'file']);
                    expect(expanded.exif.Make.value).to.deep.equal(['brob']);
                    expect(expanded.xmp.Title.value).to.equal('brob');
                } else {
                    expect(expanded).to.deep.equal({file: {FileType: {value: 'jxl', description: 'JPEG XL'}}});
                    expect(flat).to.deep.equal({FileType: {value: 'jxl', description: 'JPEG XL'}});
                }
            });

            it(`should list the zTXt chunk in metadataRange in async mode only (async: ${async})`, async () => {
                const image = getPng(getTextChunk('A', 'a'), getZtxtChunk('B', 'b'), getPhysChunk());

                const tags = await load(image, {expanded: true, async, includeOffsets: true});

                const syncBlocks = [
                    {type: 'file', start: 8, end: 33},
                    {type: 'png', start: 33, end: 48},
                    {type: 'png', start: 72, end: 93},
                ];
                const asyncBlocks = [syncBlocks[0], syncBlocks[1], {type: 'png', start: 48, end: 72}, syncBlocks[2]];
                expect(tags.metadataRange).to.deep.equal({start: 8, end: 93, complete: true, blocks: async ? asyncBlocks : syncBlocks});
            });

            it(`should drop the XMP _raw in flat output for the segment and the carried XMP (async: ${async})`, async () => {
                const packet = getXmpPacket({Title: 'segment'});
                const segmentImage = getJpeg(getXmpSegment(packet));
                const carriedImage = getJpeg(getExifSegment(getTiffWithCarriedXmp()));

                const segmentExpanded = await load(segmentImage, {expanded: true, async});
                const segmentFlat = await load(segmentImage, {async});
                const carriedExpanded = await load(carriedImage, {expanded: true, async});
                const carriedFlat = await load(carriedImage, {async});

                expect(segmentExpanded.xmp._raw).to.equal(packet);
                expect(segmentFlat).to.not.have.property('_raw');
                expect(segmentFlat.Title.value).to.equal('segment');
                expect(carriedExpanded.xmp._raw).to.be.a('string');
                expect(carriedFlat).to.not.have.property('_raw');
                expect(carriedFlat.Title.value).to.equal('carried');
            });
        }

        it('should drop the XMP _raw in flat output for the brob XMP', async () => {
            const packet = getXmpPacket({Title: 'brob'});
            const image = getJxl(getBrobBox('xml ', packet));

            const expanded = await load(image, {expanded: true, async: true});
            const flat = await load(image, {async: true});

            expect(expanded.xmp._raw).to.equal(packet);
            expect(flat).to.not.have.property('_raw');
            expect(flat.Title.value).to.equal('brob');
        });
    });

    describe('Rule 12: raw profiles', () => {
        const exifProfile = getExifRawProfile(getTiffWithMake('raw'));
        const profileLines = exifProfile.split('\n');

        for (const async of MODES) {
            it(`should keep a Raw profile type xmp chunk as a plain text tag (async: ${async})`, async () => {
                const tags = await load(getPng(getTextChunk('Raw profile type xmp', exifProfile)), {expanded: true, async});

                expect(Object.keys(tags)).to.deep.equal(['png', 'pngFile', 'pngText', 'file']);
                expect(tags.png['Raw profile type xmp'].value).to.equal(exifProfile);
            });

            it(`should keep a Raw profile type exif chunk without exif at positions 1-5 as a plain text tag (async: ${async})`, async () => {
                const value = '\nxxxx' + exifProfile.slice(5);

                const tags = await load(getPng(getTextChunk('Raw profile type exif', value)), {expanded: true, async});

                expect(Object.keys(tags)).to.deep.equal(['png', 'pngFile', 'pngText', 'file']);
                expect(tags.png['Raw profile type exif'].value).to.equal(value);
            });

            it(`should drop a profile with a bad header or an odd hex digit count silently (async: ${async})`, async () => {
                const warnSpy = getConsoleWarnSpy();
                restoreFunctions.push(warnSpy.reset);
                const badHeader = await load(getPng(getTextChunk('Raw profile type exif', '\nexif\n' + profileLines[3])), {expanded: true, async});
                const oddHex = await load(getPng(getTextChunk('Raw profile type exif', exifProfile + 'a')), {expanded: true, async});

                expect(Object.keys(badHeader)).to.deep.equal(['png', 'pngFile', 'file', 'pngText']);
                expect(Object.keys(badHeader.png)).to.deep.equal(PNG_FILE_TAG_NAMES);
                expect(Object.keys(oddHex)).to.deep.equal(['png', 'pngFile', 'file', 'pngText']);
                expect(Object.keys(oddHex.png)).to.deep.equal(PNG_FILE_TAG_NAMES);
                expect(warnSpy.hasWarned).to.be.false;
            });

            it(`should decode hex split over lines and a profile name in any case (async: ${async})`, async () => {
                const multiLine = profileLines.slice(0, 3).join('\n') + '\n' + profileLines[3].match(/.{1,72}/g).join('\n') + '\n';

                const multiLineTags = await load(getPng(getTextChunk('Raw profile type exif', multiLine)), {expanded: true, async});
                const upperCaseTags = await load(getPng(getTextChunk('RAW PROFILE TYPE EXIF', exifProfile)), {expanded: true, async});

                expect(multiLineTags.exif).to.deep.equal({Make: {id: TAG_MAKE, value: ['raw'], description: 'raw'}});
                expect(upperCaseTags.exif).to.deep.equal({Make: {id: TAG_MAKE, value: ['raw'], description: 'raw'}});
            });

            it(`should keep a Raw profile type iptc chunk with an exif payload as a plain text tag (async: ${async})`, async () => {
                const tags = await load(getPng(getTextChunk('Raw profile type iptc', exifProfile)), {expanded: true, async});

                expect(Object.keys(tags)).to.deep.equal(['png', 'pngFile', 'pngText', 'file']);
                expect(tags.png['Raw profile type iptc'].value).to.equal(exifProfile);
            });
        }

        it('should apply the same checks to a compressed chunk', async () => {
            const value = '\nxxxx' + exifProfile.slice(5);

            const plainText = await load(getPng(getZtxtChunk('Raw profile type exif', value)), {expanded: true, async: true});
            const badHeader = await load(getPng(getZtxtChunk('Raw profile type exif', '\nexif\n' + profileLines[3])), {expanded: true, async: true});

            expect(Object.keys(plainText)).to.deep.equal(['png', 'pngFile', 'pngText', 'file']);
            expect(plainText.png['Raw profile type exif'].value).to.equal(value);
            expect(Object.keys(badHeader)).to.deep.equal(['png', 'pngFile', 'file', 'pngText']);
            expect(Object.keys(badHeader.png)).to.deep.equal(PNG_FILE_TAG_NAMES);
        });
    });
});

function load(image, options = {}) {
    return Promise.resolve(ExifReader.loadView(getDataView(image), objectAssign({domParser}, options)));
}

function swap(target, replacement) {
    restoreFunctions.push(swapProperties(target, replacement));
}

// Wraps each module's method so that every call is logged with its name and
// arguments, plus a copy of its value budget before the real call draws from
// it, and then calls through.
function record(log, modules) {
    for (const [name, module, method = 'read'] of modules) {
        const original = module[method];
        swap(module, {
            [method](...args) {
                const budgetIndex = BUDGET_ARGUMENT_INDEX[name];
                log.push({
                    name,
                    args,
                    pristineBudget: budgetIndex === undefined ? undefined : objectAssign({}, args[budgetIndex]),
                });
                return original.apply(this, args);
            }
        });
    }
}

function getThumbnailBytes(tags) {
    return Buffer.from(tags.Thumbnail.image).toString('latin1');
}

function getBrobXmpSizeBound(fileLength, factor = BROB_XMP_SIZE_PER_INPUT_SIZE) {
    return factor * fileLength + BROB_XMP_SIZE_ALLOWANCE;
}

function getThumbnailSizeBound(fileLength, factor = EMBEDDED_THUMBNAIL_SIZE_PER_INPUT_SIZE) {
    return factor * fileLength + EMBEDDED_THUMBNAIL_SIZE_ALLOWANCE;
}

function getTiffWithMake(make) {
    return getTiff({ifd0: [ascii(TAG_MAKE, make)]});
}

function getTiffWithCarriedXmp() {
    return getTiff({ifd0: [ascii(TAG_MAKE, 'box'), bytes(TAG_APPLICATION_NOTES, getXmpPacket({Title: 'carried', Keep: 'carried'}))]});
}

function getTiffWithThumbnail(marker, thumbnailOptions = {}) {
    return getTiff({ifd0: [ascii(TAG_MAKE, marker)], thumbnail: objectAssign({image: '\xff\xd8' + marker + '\xff\xd9'}, thumbnailOptions)});
}

// A JPEG with SOF0, JFIF, an Exif block carrying all five groups plus GPS,
// focal length tags and an IFD1 thumbnail, and an MPF segment; with
// `segments`, also APP13 IPTC, APP1 XMP and APP2 ICC segments.
function getJpegWithEverything({segments = true} = {}) {
    const tiff = getTiff({
        ifd0: [
            ascii(TAG_MAKE, 'Canon'),
            undefinedBytes(TAG_IPTC_NAA, getIptcDatasets([headline('carried')])),
            bytes(TAG_APPLICATION_NOTES, getXmpPacket({Title: 'carried'})),
            bytes(TAG_IMAGE_SOURCE_DATA, 'x'),
            bytes(TAG_PHOTOSHOP_SETTINGS, getPhotoshopResource(0x0bb7, 'path')),
            undefinedBytes(TAG_ICC_PROFILE, getIccProfile('CARR')),
        ],
        exifIfd: [
            rational(TAG_FOCAL_LENGTH, 50, 1),
            short(TAG_FOCAL_LENGTH_IN_35MM_FILM, 100),
            canonMakerNote([ascii(TAG_CANON_LENS_MODEL, 'canon lens')]),
        ],
        gpsIfd: [ascii(TAG_GPS_LATITUDE_REF, 'N'), rationals(TAG_GPS_LATITUDE, [[1, 1], [0, 1], [0, 1]])],
        thumbnail: {image: '\xff\xd8thumb\xff\xd9'},
    });
    const mpfSegment = getMpfSegment(getTiff({ifd0: [long(TAG_MPF_NUMBER_OF_IMAGES, 2)]}));
    if (!segments) {
        return getJpeg(getSof0Segment(), getJfifSegment(), getExifSegment(tiff), mpfSegment);
    }
    return getJpeg(
        getSof0Segment(),
        getJfifSegment(),
        getExifSegment(tiff),
        getIptcSegment(getNaaBlock([headline('segment')])),
        getXmpSegment(getXmpPacket({Title: 'segment'})),
        getIccSegment(getIccProfile('SEGM')),
        mpfSegment
    );
}

function getExifRawProfileChunk(tiff) {
    return getTextChunk('Raw profile type exif', getExifRawProfile(tiff));
}

function getCompressedExifRawProfileChunk(tiff) {
    return getZtxtChunk('Raw profile type exif', getExifRawProfile(tiff));
}

function getIptcRawProfileChunk(naaBlock) {
    return getTextChunk('Raw profile type iptc', getIptcRawProfile(naaBlock));
}

function getCompressedIptcRawProfileChunk(naaBlock) {
    return getZtxtChunk('Raw profile type iptc', getIptcRawProfile(naaBlock));
}

function getBrobExifBox(tiff) {
    return getBrobBox('Exif', getByteStringFromNumber(0, 4) + tiff);
}
