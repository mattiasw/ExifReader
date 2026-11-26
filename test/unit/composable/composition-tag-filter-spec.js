/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {createCompositionTagFilter} from '../../../src/composable/composition-tag-filter.js';
import {createTagFilter, NOOP_TAG_FILTER} from '../../../src/tag-filter.js';
import {
    FILTER_GROUPS,
    EXIF_POINTER_TAGS,
    EXIF_DEPENDENCY_TAGS,
    COMPOSITE_DEPENDENCY_TAGS,
} from '../../../src/tag-filter-config.js';
import * as Groups from '../../../src/composable/groups.js';
import TagNames0thIfd from '../../../src/tag-names-0th-ifd.js';
import TagNamesExifIfd from '../../../src/tag-names-exif-ifd.js';
import TagNamesGpsIfd from '../../../src/tag-names-gps-ifd.js';
import TagNamesInteroperabilityIfd from '../../../src/tag-names-interoperability-ifd.js';
import IptcTagNames from '../../../src/iptc-tag-names.js';
import {IPTCNAA} from '../../../src/composable/tags/exif.js';

const {iptc, mpf, makerNotes, gps, composite, thumbnail} = Groups;
const FORMAT_KEY_SETS = [['file'], ['file', 'jfif'], ['file', 'png'], ['file', 'riff'], ['file', 'gif'], ['file', 'jfif', 'png', 'riff', 'gif']];
// canon and pentax have the key and the dependencies of makerNotes, so they
// would only repeat its cases.
const EXIF_NEEDING_GROUPS = Object.values(Groups)
    .filter((group) => group.exifDependencies !== undefined && group !== Groups.canon && group !== Groups.pentax);
const DESCRIPTOR_NAME_LISTS = [
    [],
    ['DateTime'],
    ['GPSLatitude'],
    ['RelatedImageWidth'],
    ['InteroperabilityIndex'],
    ['gpsaltitude'],
    ['DateTime', 'GPSLatitude', 'RelatedImageWidth', 'InteroperabilityIndex', 'Make'],
];
const IPTC_NAME_LISTS = [['By-line'], ['by-line', 'Headline'], ['Coded Character Set', 'Keywords']];
const PROTOTYPE_NAMES = ['constructor', '__proto__'];
const GROUP_KEYS = Object.keys(FILTER_GROUPS).concat(['pngText'], PROTOTYPE_NAMES);
const NAMES = getNameCorpus();

describe('composable/composition-tag-filter', () => {
    it('should be the no-op filter without includeTags', () => {
        for (const includeTags of [undefined, null, false]) {
            expect(createCompositionTagFilter(includeTags, []), String(includeTags)).to.equal(NOOP_TAG_FILTER);
        }
    });

    describe('should give the verdicts of the full filter with includeTags as a limit', () => {
        for (const groups of getGroupSets()) {
            const label = groups.map((group) => group.key).join('+') || 'no groups';
            it(label, () => {
                for (const formatKeys of FORMAT_KEY_SETS) {
                    for (const exifValue of DESCRIPTOR_NAME_LISTS.concat([true])) {
                        const disagreement = findDisagreement(getConfig(formatKeys, groups, exifValue), getExifDependencies(groups));
                        expect(disagreement, disagreement).to.equal(undefined);
                    }
                }
            });
        }
    });

    describe('with IPTC tag descriptors', () => {
        const groupSets = [[], [gps], [composite, thumbnail], EXIF_NEEDING_GROUPS.filter((group) => group !== iptc), [mpf]];

        it('should give the verdicts of the full filter with includeTags as a limit', () => {
            for (const groups of groupSets) {
                for (const exifValue of DESCRIPTOR_NAME_LISTS.concat([true])) {
                    for (const iptcNames of IPTC_NAME_LISTS) {
                        const config = Object.assign(getConfig(['file', 'jfif'], groups, exifValue), {iptc: iptcNames});
                        const disagreement = findDisagreement(config, getExifDependencies(groups).concat([IPTCNAA.name]));
                        expect(disagreement, disagreement).to.equal(undefined);
                    }
                }
            }
        });

        it('should parse and return only the named IPTC tags, whatever their case', () => {
            const filter = createCompositionTagFilter({file: true, iptc: ['By-line', 'headline']}, [IPTCNAA.name]);

            for (const check of ['shouldParseTag', 'shouldReturnTag']) {
                expect(filter[check]('iptc', 'By-line', 0x0250), check).to.equal(true);
                expect(filter[check]('iptc', 'Headline', 0x0269), check).to.equal(true);
                expect(filter[check]('iptc', 'BY-LINE', 0x0250), check).to.equal(true);
                expect(filter[check]('iptc', 'Keywords', 0x0219), check).to.equal(false);
                expect(filter[check]('iptc', 'undefined-240', 0x02f0), check).to.equal(false);
                expect(filter[check]('iptc', undefined, 0x0250), check).to.equal(false);
            }
            expect(filter.shouldParseGroup('iptc')).to.equal(true);
            expect(filter.shouldReturnGroup('iptc')).to.equal(true);
        });

        it('should keep the verdicts of a group set to true and of an absent group', () => {
            const filter = createCompositionTagFilter({file: true, iptc: true}, [IPTCNAA.name]);
            const exifOnlyFilter = createCompositionTagFilter({file: true, exif: ['DateTime']}, []);

            expect(filter.shouldParseTag('iptc', 'undefined-240', 0x02f0)).to.equal(true);
            expect(filter.shouldReturnTag('iptc', 'Keywords', 0x0219)).to.equal(true);
            expect(exifOnlyFilter.shouldParseTag('iptc', 'By-line', 0x0250)).to.equal(false);
            expect(exifOnlyFilter.shouldReturnTag('iptc', 'By-line', 0x0250)).to.equal(false);
            expect(exifOnlyFilter.shouldParseTag('xmp', 'Title')).to.equal(false);
        });

        it('should parse the IPTC-NAA Exif tag but not return it', () => {
            const filter = createCompositionTagFilter({file: true, iptc: ['By-line']}, [IPTCNAA.name]);

            expect(filter.shouldParseGroup('exif')).to.equal(true);
            expect(filter.shouldParseTag('exif', 'IPTC-NAA', 0x83bb)).to.equal(true);
            expect(filter.shouldParseTag('exif', 'DateTime', 0x0132)).to.equal(false);
            expect(filter.shouldReturnTag('exif', 'IPTC-NAA', 0x83bb)).to.equal(false);
        });

        it('should parse the Model Exif tag for makerNotes but not return it', () => {
            const filter = createCompositionTagFilter({file: true, makerNotes: true}, makerNotes.exifDependencies.map((descriptor) => descriptor.name));

            expect(filter.shouldParseTag('exif', 'Model', 0x0110)).to.equal(true);
            expect(filter.shouldReturnTag('exif', 'Model', 0x0110)).to.equal(false);
        });
    });
});

function getGroupSets() {
    const sets = [[]];
    for (const group of EXIF_NEEDING_GROUPS) {
        sets.push([group]);
        for (const partner of [gps, composite, thumbnail, makerNotes]) {
            if (partner !== group) {
                sets.push([group, partner]);
            }
        }
    }
    sets.push(EXIF_NEEDING_GROUPS);
    sets.push(EXIF_NEEDING_GROUPS.concat([mpf]));
    sets.push([mpf]);
    sets.push([mpf, iptc]);
    return sets;
}

// As createReader builds it: file, the format readers' and groups' keys, and
// the descriptors' names under exif.
function getConfig(formatKeys, groups, exifValue) {
    const config = {};
    for (const key of formatKeys) {
        config[key] = true;
    }
    for (const group of groups) {
        config[group.key] = true;
    }
    if (exifValue === true || exifValue.length > 0) {
        config.exif = exifValue;
    }
    return config;
}

// The names of the groups' dependency descriptors, as createReader passes them.
function getExifDependencies(groups) {
    let dependencies = [];
    for (const group of groups) {
        if (group.exifDependencies !== undefined) {
            dependencies = dependencies.concat(group.exifDependencies.map((descriptor) => descriptor.name));
        }
    }
    return dependencies;
}

function findDisagreement(config, exifDependencies) {
    const full = createTagFilter({includeTags: config, includeTagsIsLimit: true});
    const cap = createCompositionTagFilter(config, exifDependencies);
    const getDisagreement = (check, groupKey, name, id) => JSON.stringify({check, config, groupKey, name: String(name), id});

    if (cap.isActive !== full.isActive) {
        return getDisagreement('isActive');
    }
    for (const groupKey of GROUP_KEYS) {
        for (const check of ['shouldReturnGroup', 'shouldParseGroup']) {
            if (cap[check](groupKey) !== full[check](groupKey)) {
                return getDisagreement(check, groupKey);
            }
        }
        for (const [name, id] of NAMES) {
            for (const check of ['shouldReturnTag', 'shouldParseTag']) {
                if (!!cap[check](groupKey, name, id) !== !!full[check](groupKey, name, id)) {
                    return getDisagreement(check, groupKey, name, id);
                }
            }
        }
    }
    return undefined;
}

function getNameCorpus() {
    const names = [];
    for (const dictionary of [TagNames0thIfd, TagNamesExifIfd, TagNamesGpsIfd, TagNamesInteroperabilityIfd]) {
        for (const id of Object.keys(dictionary)) {
            const entry = dictionary[id];
            names.push([typeof entry === 'string' ? entry : entry.name, Number(id)]);
        }
    }
    for (const id of Object.keys(IptcTagNames.iptc)) {
        const entry = IptcTagNames.iptc[id];
        if (typeof entry.name === 'string') {
            names.push([entry.name, Number(id)]);
        }
    }
    const dependencyNames = [].concat(...Object.keys(EXIF_DEPENDENCY_TAGS).map((key) => EXIF_DEPENDENCY_TAGS[key]), COMPOSITE_DEPENDENCY_TAGS.file, COMPOSITE_DEPENDENCY_TAGS.exif);
    const otherNames = Object.keys(EXIF_POINTER_TAGS).map((key) => EXIF_POINTER_TAGS[key])
        .concat(dependencyNames, ['Thumbnail', 'FileType', 'Image Width', 'undefined-1', ''], PROTOTYPE_NAMES);
    return names.concat(otherNames.map((name) => [name, undefined]), [[undefined, undefined]]);
}
