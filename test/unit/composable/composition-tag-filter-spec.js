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
    const dependencyNames = [].concat(...Object.keys(EXIF_DEPENDENCY_TAGS).map((key) => EXIF_DEPENDENCY_TAGS[key]), COMPOSITE_DEPENDENCY_TAGS.file, COMPOSITE_DEPENDENCY_TAGS.exif);
    const otherNames = Object.keys(EXIF_POINTER_TAGS).map((key) => EXIF_POINTER_TAGS[key])
        .concat(dependencyNames, ['Thumbnail', 'FileType', 'Image Width', 'undefined-1', ''], PROTOTYPE_NAMES);
    return names.concat(otherNames.map((name) => [name, undefined]), [[undefined, undefined]]);
}
