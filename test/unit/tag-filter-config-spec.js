/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {EXIF_POINTER_TAGS, getExifTagDependenciesForInclude} from '../../src/tag-filter-config.js';
import TagNamesGpsIfd from '../../src/tag-names-gps-ifd.js';
import TagNamesInteroperabilityIfd from '../../src/tag-names-interoperability-ifd.js';

describe('tag-filter-config', function () {
    describe('getExifTagDependenciesForInclude', function () {
        it('should add the GPS pointer for every GPS IFD tag id', function () {
            for (const key in TagNamesGpsIfd) {
                const id = Number(key);
                const requiredTags = getExifTagDependenciesForInclude({exif: [id]});
                expect(requiredTags[EXIF_POINTER_TAGS.gpsInfoIfdPointer], `GPS id ${key}`).to.equal(true);
            }
        });

        it('should add the Interoperability pointer for every Interoperability IFD tag id', function () {
            for (const key in TagNamesInteroperabilityIfd) {
                const id = Number(key);
                const requiredTags = getExifTagDependenciesForInclude({exif: [id]});
                expect(requiredTags[EXIF_POINTER_TAGS.interoperabilityIfdPointer], `Interoperability id ${key}`).to.equal(true);
            }
        });

        it('should add only the Exif pointer for an id outside the GPS and Interoperability tables', function () {
            const requiredTags = getExifTagDependenciesForInclude({exif: [0x0110]});

            expect(Object.keys(requiredTags)).to.deep.equal([EXIF_POINTER_TAGS.exifIfdPointer]);
        });

        it('should add both pointers for an id that is in both tables', function () {
            const requiredTags = getExifTagDependenciesForInclude({exif: [2]});

            expect(requiredTags[EXIF_POINTER_TAGS.gpsInfoIfdPointer]).to.equal(true);
            expect(requiredTags[EXIF_POINTER_TAGS.interoperabilityIfdPointer]).to.equal(true);
        });

        it('should add only the Interoperability pointer for an id that is only in the Interoperability table', function () {
            const requiredTags = getExifTagDependenciesForInclude({exif: [0x1001]});

            expect(requiredTags[EXIF_POINTER_TAGS.interoperabilityIfdPointer]).to.equal(true);
            expect(requiredTags[EXIF_POINTER_TAGS.gpsInfoIfdPointer]).to.equal(undefined);
        });

        it('should add only the GPS pointer for an id that is only in the GPS table', function () {
            const requiredTags = getExifTagDependenciesForInclude({exif: [0x0005]});

            expect(requiredTags[EXIF_POINTER_TAGS.gpsInfoIfdPointer]).to.equal(true);
            expect(requiredTags[EXIF_POINTER_TAGS.interoperabilityIfdPointer]).to.equal(undefined);
        });

        it('should add no sub-IFD pointer for a non-integer id', function () {
            const requiredTags = getExifTagDependenciesForInclude({exif: [2.5]});

            expect(Object.keys(requiredTags)).to.deep.equal([EXIF_POINTER_TAGS.exifIfdPointer]);
        });

        it('should add only the GPS pointer for a tag name that starts with GPS', function () {
            const requiredTags = getExifTagDependenciesForInclude({exif: ['GPSLatitude']});

            expect(requiredTags[EXIF_POINTER_TAGS.gpsInfoIfdPointer]).to.equal(true);
            expect(requiredTags[EXIF_POINTER_TAGS.interoperabilityIfdPointer]).to.equal(undefined);
        });

        it('should add only the Interoperability pointer for a tag name that starts with Interoperability or RelatedImage', function () {
            for (const name of ['InteroperabilityIndex', 'RelatedImageWidth']) {
                const requiredTags = getExifTagDependenciesForInclude({exif: [name]});

                expect(requiredTags[EXIF_POINTER_TAGS.interoperabilityIfdPointer], name).to.equal(true);
                expect(requiredTags[EXIF_POINTER_TAGS.gpsInfoIfdPointer], name).to.equal(undefined);
            }
        });
    });
});
