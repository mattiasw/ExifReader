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
import {swapProperties} from '../test-utils.js';

const MODULE_GROUPS = {exif, iptc: composedIptc, xmp, icc, photoshop, mpf, canon, pentax, makerNotes, gps, composite, thumbnail};
const GROUP_NAMES = Object.keys(MODULE_GROUPS);
const COPIED_NAMES = GROUP_NAMES.filter((name) => name !== 'exif');
const EXIF_DEPENDENT_NAMES = COPIED_NAMES.filter((name) => name !== 'mpf');
const ADDED_KEYS = {
    xmp: ['exifDependencies', 'environment', 'assertEnvironment'],
    thumbnail: ['exifDependencies', 'ifd1TagNames', 'environment'],
    mpf: ['environment'],
};
const DOM_PARSER_MESSAGE = 'reader.load: xmp is in groups but no DOM parser is available: pass domParser to createReader, for example new DOMParser({onError: onErrorStopParsing}) from @xmldom/xmldom, or leave xmp out of groups';

describe('composable/groups', () => {
    it('should export each group by name', () => {
        expect(Object.keys(Groups).sort()).to.deep.equal(['allGroups'].concat(GROUP_NAMES).sort());
    });

    it('should export exif as its module\'s object', () => {
        expect(Groups.exif).to.equal(exif);
    });

    it('should export every other group as a copy of its module\'s object with what the composable reader needs added', () => {
        for (const name of COPIED_NAMES) {
            const moduleGroup = MODULE_GROUPS[name];
            const group = Groups[name];
            const added = ADDED_KEYS[name] || ['exifDependencies'];
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
        for (const name of EXIF_DEPENDENT_NAMES) {
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

    it('should carry an environment exactly on xmp, thumbnail and mpf and a check of it only on xmp', () => {
        for (const name of GROUP_NAMES) {
            expect(Groups[name].environment !== undefined, name + ' environment').to.equal(Object.hasOwn(ADDED_KEYS, name));
            expect(Groups[name].assertEnvironment !== undefined, name + ' assertEnvironment').to.equal(name === 'xmp');
        }
    });

    describe('the DOM parser getter of xmp', () => {
        let restores;

        beforeEach(() => {
            restores = [];
        });

        afterEach(() => {
            restores.forEach((restore) => restore());
        });

        it('should give the parser it is given', () => {
            const parser = {};

            expect(Groups.xmp.environment.getDomParser(parser).parser).to.equal(parser);
        });

        it('should construct the global DOMParser without a parser', () => {
            let constructed = 0;
            class CountingParser {
                constructor() {
                    constructed++;
                }
            }
            restores.push(swapProperties(globalThis, {DOMParser: CountingParser}));

            const {parser} = Groups.xmp.environment.getDomParser(undefined);

            expect(parser).to.be.an.instanceOf(CountingParser);
            expect(constructed).to.equal(1);
        });

        it('should refuse without a parser and without a global DOMParser, with the message of load', () => {
            restores.push(swapProperties(globalThis, {DOMParser: undefined}));

            expect(() => Groups.xmp.assertEnvironment(undefined)).to.throw(Error, DOM_PARSER_MESSAGE);
        });

        it('should accept a parser', () => {
            restores.push(swapProperties(globalThis, {DOMParser: undefined}));

            expect(() => Groups.xmp.assertEnvironment({})).to.not.throw();
        });

        it('should accept a global DOMParser', () => {
            restores.push(swapProperties(globalThis, {DOMParser: class {}}));

            expect(() => Groups.xmp.assertEnvironment(undefined)).to.not.throw();
        });
    });

    describe('the base64 helper of thumbnail and mpf', () => {
        let restores;

        beforeEach(() => {
            restores = [];
        });

        afterEach(() => {
            restores.forEach((restore) => restore());
        });

        it('should be one function shared by both', () => {
            expect(Groups.thumbnail.environment.getBase64Image).to.be.a('function');
            expect(Groups.mpf.environment.getBase64Image).to.equal(Groups.thumbnail.environment.getBase64Image);
        });

        it('should give btoa of the bytes of an ArrayBuffer', () => {
            const image = new Uint8Array([0xff, 0xd8, 0x00, 0x41, 0x80]).buffer;

            expect(Groups.mpf.environment.getBase64Image(image)).to.equal(btoa('\xff\xd8\x00A\x80'));
        });

        it('should give undefined without btoa', () => {
            restores.push(swapProperties(globalThis, {btoa: undefined}));

            expect(Groups.mpf.environment.getBase64Image(new ArrayBuffer(2))).to.equal(undefined);
        });
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
