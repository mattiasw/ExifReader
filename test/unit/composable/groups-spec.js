/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import * as Groups from '../../../src/composable/groups.js';
import {GROUP_BRAND} from '../../../src/composable/brand.js';
import {EXIF_DEPENDENCY_TAGS, COMPOSITE_DEPENDENCY_TAGS} from '../../../src/tag-filter-config.js';
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

describe('composable/groups', () => {
    it('should export each group by name, as its own module\'s object', () => {
        expect(Object.keys(Groups).sort()).to.deep.equal([
            'allGroups', 'canon', 'composite', 'exif', 'gps', 'icc', 'iptc', 'makerNotes', 'mpf', 'pentax', 'photoshop', 'thumbnail', 'xmp',
        ]);
        expect(Groups.exif).to.equal(exif);
        expect(Groups.iptc).to.equal(composedIptc);
        expect(Groups.xmp).to.equal(xmp);
        expect(Groups.icc).to.equal(icc);
        expect(Groups.photoshop).to.equal(photoshop);
        expect(Groups.mpf).to.equal(mpf);
        expect(Groups.canon).to.equal(canon);
        expect(Groups.pentax).to.equal(pentax);
        expect(Groups.makerNotes).to.equal(makerNotes);
        expect(Groups.gps).to.equal(gps);
        expect(Groups.composite).to.equal(composite);
        expect(Groups.thumbnail).to.equal(thumbnail);
    });

    it('should list every group, with makerNotes standing for canon and pentax', () => {
        expect(Groups.allGroups).to.deep.equal([exif, composedIptc, xmp, icc, photoshop, mpf, makerNotes, gps, composite, thumbnail]);
        expect(Groups.allGroups).to.not.include(canon);
        expect(Groups.allGroups).to.not.include(pentax);
    });

    it('should brand every exported group, canon and pentax included', () => {
        for (const name of Object.keys(Groups).filter((key) => key !== 'allGroups')) {
            expect(Groups[name].brand, name).to.equal(GROUP_BRAND);
        }
    });

    it('should carry the Exif tags each group reads through Exif as exifDependencies', () => {
        const names = Object.keys(Groups).filter((key) => key !== 'allGroups');
        expect(names).to.include.members(['canon', 'pentax']);
        for (const name of names) {
            const group = Groups[name];
            if (group.key === 'composite') {
                expect(group.exifDependencies, name).to.equal(COMPOSITE_DEPENDENCY_TAGS.exif);
            } else if (group.key === 'exif' || group.key === 'mpf') {
                expect(Object.prototype.hasOwnProperty.call(group, 'exifDependencies'), name).to.equal(false);
            } else {
                expect(EXIF_DEPENDENCY_TAGS[group.key], name).to.be.an('array');
                expect(group.exifDependencies, name).to.equal(EXIF_DEPENDENCY_TAGS[group.key]);
            }
        }
    });
});
