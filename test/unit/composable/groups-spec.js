/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import * as Groups from '../../../src/composable/groups.js';
import {GROUP_BRAND} from '../../../src/composable/brand.js';
import {EXIF_DEPENDENCY_TAGS, COMPOSITE_DEPENDENCY_TAGS} from '../../../src/tag-filter-config.js';
import {EXIF_EMITTED_KINDS} from '../../../src/composable/exif-block-reader.js';
import {getTagBindingName} from '../../../src/composable/tag-binding-name.js';
import * as ExifTags from '../../../src/composable/tags/exif.js';
import TagNames0thIfd from '../../../src/tag-names-0th-ifd.js';
import {allFormats} from '../../../src/composable/formats.js';
import {exif} from '../../../src/composable/groups/exif.js';
import {composedIptc} from '../../../src/composable/groups/iptc.js';
import {xmp} from '../../../src/composable/groups/xmp.js';
import {icc} from '../../../src/composable/groups/icc.js';
import {photoshop} from '../../../src/composable/groups/photoshop.js';
import {mpf} from '../../../src/composable/groups/mpf.js';
import {canon} from '../../../src/composable/groups/canon.js';
import {pentax} from '../../../src/composable/groups/pentax.js';
import {makerNotes} from '../../../src/composable/groups/maker-notes.js';
import {gps} from '../../../src/composable/groups/gps.js';
import {composite} from '../../../src/composable/groups/composite.js';
import {thumbnail} from '../../../src/composable/groups/thumbnail.js';

const MODULE_GROUPS = {exif, iptc: composedIptc, xmp, icc, photoshop, mpf, canon, pentax, makerNotes, gps, composite, thumbnail};
const GROUP_NAMES = Object.keys(MODULE_GROUPS);
const COPIED_NAMES = GROUP_NAMES.filter((name) => name !== 'exif' && name !== 'mpf');

describe('composable/groups', () => {
    it('should export each group by name', () => {
        expect(Object.keys(Groups).sort()).to.deep.equal(['allGroups'].concat(GROUP_NAMES).sort());
    });

    it('should export exif and mpf as their own modules\' objects', () => {
        expect(Groups.exif).to.equal(exif);
        expect(Groups.mpf).to.equal(mpf);
    });

    it('should export every other group as a copy of its module\'s object with its Exif dependencies', () => {
        for (const name of COPIED_NAMES) {
            const moduleGroup = MODULE_GROUPS[name];
            const group = Groups[name];
            const added = name === 'thumbnail' ? ['exifDependencies', 'ifd1TagNames'] : ['exifDependencies'];
            expect(group, name).to.not.equal(moduleGroup);
            expect(Object.keys(group).sort(), name).to.deep.equal(Object.keys(moduleGroup).concat(added).sort());
            for (const key of Object.keys(moduleGroup)) {
                expect(group[key], `${name}.${key}`).to.equal(moduleGroup[key]);
            }
        }
    });

    it('should give the thumbnail copy the full 0th dictionary for the thumbnail IFD', () => {
        expect(Groups.thumbnail.ifd1TagNames).to.equal(TagNames0thIfd);
    });

    it('should carry the generated descriptors of the Exif tags each group reads through Exif, in the order of the tag filter\'s lists', () => {
        for (const name of COPIED_NAMES) {
            const group = Groups[name];
            const expectedNames = group.key === 'composite' ? COMPOSITE_DEPENDENCY_TAGS.exif : EXIF_DEPENDENCY_TAGS[group.key];
            expect(expectedNames, name).to.be.an('array').that.is.not.empty;
            expect(group.exifDependencies.map((descriptor) => descriptor.name), name).to.deep.equal(expectedNames);
            for (const descriptor of group.exifDependencies) {
                expect(descriptor, `${name} ${descriptor.name}`).to.equal(ExifTags[getTagBindingName(descriptor.name)]);
            }
        }
    });

    it('should carry Exif dependencies exactly on the groups that consume a kind an Exif block carries or are derived', () => {
        for (const name of GROUP_NAMES) {
            const group = Groups[name];
            const readsThroughExif = group.consumes.some((kind) => EXIF_EMITTED_KINDS.indexOf(kind) !== -1) || group.mergeDeps !== undefined;
            const hasDependencies = Array.isArray(group.exifDependencies) && group.exifDependencies.length > 0;
            expect(hasDependencies, name).to.equal(readsThroughExif);
        }
    });

    it('should list every group, with makerNotes standing for canon and pentax', () => {
        expect(Groups.allGroups).to.have.ordered.members([
            Groups.exif, Groups.iptc, Groups.xmp, Groups.icc, Groups.photoshop, Groups.mpf, Groups.makerNotes, Groups.gps, Groups.composite, Groups.thumbnail,
        ]);
        expect(Groups.allGroups).to.not.include(Groups.canon);
        expect(Groups.allGroups).to.not.include(Groups.pentax);
    });

    it('should brand every exported group, canon and pentax included', () => {
        for (const name of GROUP_NAMES) {
            expect(Groups[name].brand, name).to.equal(GROUP_BRAND);
        }
    });

    it('should have no format reader consume a kind an Exif block carries', () => {
        for (const format of allFormats) {
            for (const reader of format.readers) {
                for (const kind of reader.consumes) {
                    expect(EXIF_EMITTED_KINDS, `${format.header.fileType.value} ${reader.key}`).to.not.include(kind);
                }
            }
        }
    });
});
