/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {
    EXIF_POINTER_TAGS,
    EXIF_DEPENDENCY_TAGS,
    COMPOSITE_DEPENDENCY_TAGS,
    THUMBNAIL_EXIF_DEPENDENCY_TAGS,
    IPTC_EXIF_DEPENDENCY_TAGS,
    XMP_EXIF_DEPENDENCY_TAGS,
    ICC_EXIF_DEPENDENCY_TAGS,
    PHOTOSHOP_EXIF_DEPENDENCY_TAGS,
    MAKER_NOTES_EXIF_DEPENDENCY_TAGS,
    GPS_EXIF_DEPENDENCY_TAGS,
    COMPOSITE_EXIF_DEPENDENCY_TAGS,
    getExifTagDependenciesForInclude,
    addExifTagNamePointers,
} from '../../src/tag-filter-config.js';
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

    describe('addExifTagNamePointers', function () {
        it('should add the GPS pointer for a name that starts with GPS in any case', function () {
            for (const name of ['GPSLatitude', 'gpsaltitude', 'Gps']) {
                const pointers = {};
                addExifTagNamePointers(pointers, name);

                expect(pointers, name).to.deep.equal({[EXIF_POINTER_TAGS.gpsInfoIfdPointer]: true});
            }
        });

        it('should add the Interoperability pointer for a name that starts with Interoperability or RelatedImage in any case', function () {
            for (const name of ['InteroperabilityIndex', 'interoperabilityversion', 'RelatedImageWidth', 'RELATEDIMAGELENGTH']) {
                const pointers = {};
                addExifTagNamePointers(pointers, name);

                expect(pointers, name).to.deep.equal({[EXIF_POINTER_TAGS.interoperabilityIfdPointer]: true});
            }
        });

        it('should add nothing for another name', function () {
            for (const name of ['DateTime', 'MyGPSLatitude', 'ImageInteroperability', '']) {
                const pointers = {};
                addExifTagNamePointers(pointers, name);

                expect(pointers, name).to.deep.equal({});
            }
        });
    });

    describe('dependency tables', function () {
        it('should build the Exif dependency table from the per-group lists', function () {
            expect(EXIF_DEPENDENCY_TAGS).to.have.all.keys('thumbnail', 'iptc', 'xmp', 'icc', 'photoshop', 'makerNotes', 'gps');
            expect(EXIF_DEPENDENCY_TAGS.thumbnail).to.equal(THUMBNAIL_EXIF_DEPENDENCY_TAGS);
            expect(EXIF_DEPENDENCY_TAGS.iptc).to.equal(IPTC_EXIF_DEPENDENCY_TAGS);
            expect(EXIF_DEPENDENCY_TAGS.xmp).to.equal(XMP_EXIF_DEPENDENCY_TAGS);
            expect(EXIF_DEPENDENCY_TAGS.icc).to.equal(ICC_EXIF_DEPENDENCY_TAGS);
            expect(EXIF_DEPENDENCY_TAGS.photoshop).to.equal(PHOTOSHOP_EXIF_DEPENDENCY_TAGS);
            expect(EXIF_DEPENDENCY_TAGS.makerNotes).to.equal(MAKER_NOTES_EXIF_DEPENDENCY_TAGS);
            expect(EXIF_DEPENDENCY_TAGS.gps).to.equal(GPS_EXIF_DEPENDENCY_TAGS);
        });

        it('should take the composite table\'s Exif list from its own export', function () {
            expect(COMPOSITE_DEPENDENCY_TAGS).to.have.all.keys('file', 'exif');
            expect(COMPOSITE_DEPENDENCY_TAGS.exif).to.equal(COMPOSITE_EXIF_DEPENDENCY_TAGS);
        });
    });
});
