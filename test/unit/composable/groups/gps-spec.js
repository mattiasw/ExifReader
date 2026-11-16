/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {objectAssign} from '../../../../src/utils.js';
import {createTagFilter, filterTagsForReturn} from '../../../../src/tag-filter.js';
import {mergeBlock} from '../../../../src/loadview-pipeline.js';
import {gps} from '../../../../src/composable/groups/gps.js';

describe('composable/groups/gps', () => {
    it('should be a derived group that reads no block', () => {
        expect(gps).to.not.have.property('read');
        expect(gps.merge()).to.deep.equal({slot: 'gps', mode: 'gps'});
    });

    describe('the gps mode', () => {
        it('should give no group without a complete position', () => {
            expect(getGpsGroup({})).to.equal(undefined);
            expect(getGpsGroup({GPSLatitude: {value: [[1, 1], [0, 1], [0, 1]]}})).to.equal(undefined);
            expect(getGpsGroup({GPSLongitudeRef: {value: ['E']}, GPSAltitude: {value: [1, 1]}})).to.equal(undefined);
        });

        it('should give the latitude, longitude and altitude, each negative on the far side', () => {
            const tags = {
                GPSLatitude: {value: [[59, 1], [30, 1], [0, 1]]},
                GPSLatitudeRef: {value: ['N']},
                GPSLongitude: {value: [[18, 1], [30, 1], [0, 1]]},
                GPSLongitudeRef: {value: ['E']},
                GPSAltitude: {value: [50, 2]},
                GPSAltitudeRef: {value: 0},
            };
            expect(getGpsGroup(tags)).to.deep.equal({Latitude: 59.5, Longitude: 18.5, Altitude: 25});

            tags.GPSLatitudeRef = {value: ['S']};
            tags.GPSLongitudeRef = {value: ['W']};
            tags.GPSAltitudeRef = {value: 1};
            expect(getGpsGroup(tags)).to.deep.equal({Latitude: -59.5, Longitude: -18.5, Altitude: -25});
        });

        it('should leave out a value that does not compute and keep the others', () => {
            const tags = {
                GPSLatitude: {value: undefined},
                GPSLatitudeRef: {value: ['N']},
                GPSLongitude: {value: [[18, 1], [0, 1], [0, 1]]},
                GPSLongitudeRef: {value: 'W'},
                GPSAltitude: {value: undefined},
                GPSAltitudeRef: {value: 0},
            };

            expect(getGpsGroup(tags)).to.deep.equal({Longitude: 18});
        });

        it('should add no gps group in flat output', () => {
            const tags = mergeGps({parsedGroups: {exif: COMPLETE_POSITION}, expanded: false});

            expect(tags).to.deep.equal({MyTag: {value: 42}});
        });

        it('should add no gps group without a parsed Exif group', () => {
            const tags = mergeGps({parsedGroups: {}});

            expect(tags).to.deep.equal({MyTag: {value: 42}});
        });

        it('should add no gps group when it is not returned', () => {
            const tags = mergeGps({parsedGroups: {exif: COMPLETE_POSITION}, tagFilter: createTagFilter({includeTags: {exif: true}})});

            expect(tags).to.deep.equal({MyTag: {value: 42}});
        });

        it('should add the returned gps tags only', () => {
            const tags = mergeGps({parsedGroups: {exif: COMPLETE_POSITION}, tagFilter: createTagFilter({includeTags: {gps: ['Latitude']}})});

            expect(tags).to.deep.equal({MyTag: {value: 42}, gps: {Latitude: 59.5}});
        });
    });
});

const COMPLETE_POSITION = {
    GPSLatitude: {value: [[59, 1], [30, 1], [0, 1]]},
    GPSLatitudeRef: {value: ['N']},
    GPSLongitude: {value: [[18, 1], [30, 1], [0, 1]]},
    GPSLongitudeRef: {value: ['E']},
};

function getGpsGroup(exifTags) {
    return mergeGps({parsedGroups: {exif: exifTags}}).gps;
}

function mergeGps({parsedGroups, expanded = true, tagFilter = createTagFilter()}) {
    return mergeBlock({
        block: gps.merge(),
        tags: {MyTag: {value: 42}},
        parsedGroups,
        expanded,
        tagFilter,
        modes: gps.mergeModes,
        deps: {objectAssign, filterTagsForReturn},
    });
}
