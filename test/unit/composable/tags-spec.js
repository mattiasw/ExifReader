/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {createReader} from '../../../src/composable/core.js';
import * as ExifReader from '../../../src/exif-reader.js';
import {jpeg} from '../../../src/composable/formats.js';
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
    TAG_MAKE,
    TAG_GPS_LATITUDE,
} from '../loadview-inventory-images.js';

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
        for (const expanded of [false, true]) {
            it(`should load what includeTags on the default entry loads${expanded ? ', expanded' : ''}`, async () => {
                const Tags = await import('../../../src/composable/tags/exif.js');
                const reader = createReader({formats: [jpeg], tags: COMPOSED_NAMES.map((name) => Tags[name])});
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

    describe('the generated iptc and mpf descriptors', () => {
        it('should be rejected by createReader', async () => {
            const {ByLine} = await import('../../../src/composable/tags/iptc.js');
            const {MPFVersion} = await import('../../../src/composable/tags/mpf.js');

            for (const tag of [ByLine, MPFVersion]) {
                expect(() => createReader({formats: [jpeg], tags: [tag]}), tag.name)
                    .to.throw(TypeError, 'createReader: tags[0] is not a value imported from \'exifreader/tags/exif\'');
            }
        });
    });
});
