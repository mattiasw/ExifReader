/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {createReader} from '../../../src/composable/core.js';
import * as ExifReader from '../../../src/exif-reader.js';
import {jpeg} from '../../../src/composable/formats.js';
import {exifBlockReader} from '../../../src/composable/exif-block-reader.js';
import {iptcBlockReader} from '../../../src/composable/iptc-block-reader.js';
import IptcTagNames from '../../../src/iptc-tag-names.js';
import {
    getModelVersionDescription,
    getEditorialUpdateDescription,
    getSubjectReferenceDescription,
    getActionAdvisedDescription,
    getObjectCycleDescription,
    getRasterizedCaptionDescription,
    getImageOrientationDescription,
    getAudioTypeDescription,
    getAudioSamplingRateDescription,
    getAudioSamplingResolutionDescription,
    getAudioDurationDescription,
    getSizeModeDescription,
    getMaxSubfileSizeDescription,
    getCreationDate,
    getCreationTime,
} from '../../../src/iptc-tag-names-descriptions.js';
import {getDataView} from '../test-utils.js';
import {
    ascii,
    rationals,
    short,
    getTiff,
    getJpeg,
    getSof0Segment,
    getJfifSegment,
    getExifSegment,
    getIptcSegment,
    getNaaBlock,
    TAG_MAKE,
    TAG_GPS_LATITUDE,
} from '../loadview-inventory-images.js';
import * as ExifTagDescriptors from '../../../src/composable/tags/exif.js';
import * as IptcTagDescriptors from '../../../src/composable/tags/iptc.js';

const TAG_DATE_TIME = 0x0132;
const TAG_RESOLUTION_UNIT = 0x0128;
const TAG_WHITE_BALANCE = 0xa403;
const TAG_CONTRAST_SECOND_ID = 0xfe54;
const TAG_INTEROPERABILITY_INDEX = 0x0001;
const COMPOSED_NAMES = ['DateTime', 'ResolutionUnit', 'WhiteBalance', 'Contrast', 'GPSLatitude', 'InteroperabilityIndex'];
const JPEG = getJpeg(
    getSof0Segment(),
    getJfifSegment(),
    getExifSegment(getTiff({
        ifd0: [ascii(TAG_MAKE, 'Canon'), ascii(TAG_DATE_TIME, '2020:01:01 00:00:00'), short(TAG_RESOLUTION_UNIT, 2)],
        exifIfd: [short(TAG_WHITE_BALANCE, 1), short(TAG_CONTRAST_SECOND_ID, 2)],
        gpsIfd: [rationals(TAG_GPS_LATITUDE, [[1, 1], [0, 1], [0, 1]])],
        interopIfd: [ascii(TAG_INTEROPERABILITY_INDEX, 'R98')],
    }))
);

describe('composable/tags', () => {
    describe('the generated exif descriptors', () => {
        it('should each link to the one Exif block reader and name one of the four Exif dictionaries', () => {
            const descriptors = Object.values(ExifTagDescriptors);

            expect(descriptors.length).to.be.above(0);
            for (const descriptor of descriptors) {
                expect(descriptor.reader, descriptor.name).to.equal(exifBlockReader);
                expect(['0th', 'exif', 'gps', 'interoperability'], descriptor.name).to.include(descriptor.dictionary);
            }
        });

        for (const expanded of [false, true]) {
            it(`should load what includeTags on the default entry loads${expanded ? ', expanded' : ''}`, async () => {
                const reader = createReader({formats: [jpeg], tags: COMPOSED_NAMES.map((name) => ExifTagDescriptors[name])});
                const expected = await ExifReader.load(getDataView(JPEG), {async: true, expanded, includeTags: {exif: COMPOSED_NAMES, file: true, jfif: true}});

                const tags = await reader.load(getDataView(JPEG), {expanded});

                expect(tags).to.deep.equal(expected);
                if (expanded) {
                    expect(Object.keys(tags.exif).sort()).to.deep.equal(COMPOSED_NAMES.slice().sort());
                } else {
                    expect(tags).to.include.all.keys(COMPOSED_NAMES).and.not.have.property('Make');
                }
            });
        }
    });

    describe('the generated iptc descriptors', () => {
        const CODED_CHARACTER_SET_ID = 0x015a;
        const ISO_8859_5 = '\x1b/@';
        // A value each description accepts; a text dataset gets a Cyrillic letter in ISO-8859-5.
        const VALUES = new Map([
            [getModelVersionDescription, '\x00\x04'],
            [getEditorialUpdateDescription, '01'],
            [getSubjectReferenceDescription, 'IPTC:01000000:arts:music'],
            [getActionAdvisedDescription, '02'],
            [getObjectCycleDescription, 'a'],
            [getRasterizedCaptionDescription, '\x01\x02'],
            [getImageOrientationDescription, 'L'],
            [getAudioTypeDescription, '2A'],
            [getAudioSamplingRateDescription, '048000'],
            [getAudioSamplingResolutionDescription, '16'],
            [getAudioDurationDescription, '000130'],
            [getSizeModeDescription, '\x01'],
            [getMaxSubfileSizeDescription, '\x00\x01\x00\x00'],
            [getCreationDate, '20200102'],
            [getCreationTime, '101112+0100'],
        ]);
        const descriptors = Object.values(IptcTagDescriptors);
        const IPTC_JPEG = getJpeg(getSof0Segment(), getIptcSegment(getNaaBlock(getDatasets(descriptors))));

        it('should each link to the IPTC block reader and carry repeatable where the dictionary does', () => {
            expect(descriptors.length).to.be.above(0);
            for (const descriptor of descriptors) {
                const entry = IptcTagNames.iptc[descriptor.ids[0]];
                expect(descriptor.reader, descriptor.name).to.equal(iptcBlockReader);
                expect(descriptor.dictionary, descriptor.name).to.equal('iptc');
                expect(descriptor.repeatable, descriptor.name).to.equal(entry.repeatable === true ? true : undefined);
            }
        });

        it('should export nothing for the datasets named or described from dataset 2:200', () => {
            for (const binding of ['ObjectDataPreviewFileFormat', 'Record2Destination', 'ObjectDataPreviewFileFormatVersion']) {
                expect(IptcTagDescriptors, binding).to.not.have.property(binding);
            }
            expect(descriptors.filter((descriptor) => descriptor.ids.some((id) => id === 0x02c8 || id === 0x02c9))).to.deep.equal([]);
        });

        for (const expanded of [false, true]) {
            it(`should each load what the default entry loads, without includeTags${expanded ? ', expanded' : ''}`, async () => {
                const unfiltered = await ExifReader.load(getDataView(IPTC_JPEG), {async: true, expanded: true});
                for (const descriptor of descriptors) {
                    const tags = await createReader({formats: [jpeg], tags: [descriptor]}).load(getDataView(IPTC_JPEG), {expanded});

                    expect(tags, descriptor.name).to.deep.equal(getCut(unfiltered, [descriptor.name], expanded));
                    expect(unfiltered.iptc[descriptor.name], descriptor.name).to.not.equal(undefined);
                    expect(Array.isArray(unfiltered.iptc[descriptor.name]), descriptor.name).to.equal(descriptor.repeatable === true);
                }
                expect(unfiltered.iptc['Headline'].description).to.equal('\u042f Headline');
            });
        }

        it('should load several descriptors at once as the default entry does', async () => {
            const chosen = [IptcTagDescriptors.ByLine, IptcTagDescriptors.Keywords, IptcTagDescriptors.DateCreated, IptcTagDescriptors.Headline, IptcTagDescriptors.ModelVersion];
            const unfiltered = await ExifReader.load(getDataView(IPTC_JPEG), {async: true, expanded: true});
            for (const expanded of [false, true]) {
                const tags = await createReader({formats: [jpeg], tags: chosen}).load(getDataView(IPTC_JPEG), {expanded});

                expect(tags, String(expanded)).to.deep.equal(getCut(unfiltered, chosen.map((descriptor) => descriptor.name), expanded));
            }
        });

        function getDatasets(iptcDescriptors) {
            const datasets = [{record: 1, dataset: 0x5a, value: ISO_8859_5}];
            for (const descriptor of iptcDescriptors) {
                const id = descriptor.ids[0];
                if (id !== CODED_CHARACTER_SET_ID) {
                    const value = getValue(descriptor);
                    const dataset = {record: id >> 8, dataset: id & 0xff, value};
                    datasets.push(dataset);
                    if (descriptor.repeatable) {
                        datasets.push(Object.assign({}, dataset, {value: value + '2'}));
                    }
                }
            }
            return datasets;
        }

        function getValue(descriptor) {
            if (!descriptor.description) {
                return '\xcf ' + descriptor.name;
            }
            if (VALUES.has(descriptor.description)) {
                return VALUES.get(descriptor.description);
            }
            if (isTwoByteDescription(descriptor.description)) {
                return '\x00\x04';
            }
            throw new Error('No test value for the description of ' + descriptor.name);
        }

        // Model Version and the other descriptions that read a two-byte number.
        function isTwoByteDescription(description) {
            return description([0, 4]) === '4';
        }

        function getCut(unfiltered, names, expanded) {
            const iptc = {};
            names.forEach((name) => {
                iptc[name] = unfiltered.iptc[name];
            });
            if (expanded) {
                return {file: unfiltered.file, iptc};
            }
            return Object.assign({}, unfiltered.file, iptc);
        }
    });
});
