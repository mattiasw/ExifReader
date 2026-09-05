/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import parseConfig from '../../bin/parse-config.js';
import Constants from '../../src/constants.js';

describe('parseConfig', () => {
    describe('include configurations', () => {
        it('includes the modules that are named', () => {
            const includes = parseConfig({include: {jpeg: true, exif: true}});
            expect(includes.jpeg).to.equal(true);
            expect(includes.exif).to.equal(true);
        });

        it('excludes the modules that are not named', () => {
            const includes = parseConfig({include: {jpeg: true}});
            expect(includes.png).to.equal(false);
            expect(includes.xmp).to.equal(false);
        });

        it('excludes a module that is named with a falsy value', () => {
            expect(parseConfig({include: {jpeg: false}}).jpeg).to.equal(false);
            expect(parseConfig({include: {jpeg: 0}}).jpeg).to.equal(false);
        });

        it('excludes everything for an empty configuration', () => {
            const includes = parseConfig({include: {}});
            expect(Object.values(includes).every((value) => value === false)).to.equal(true);
        });

        it('passes a list of tag names through untouched', () => {
            const tagNames = ['DateTime'];
            expect(parseConfig({include: {tiff: true, exif: tagNames}}).exif).to.equal(tagNames);
        });

        it('keeps a list of tag names when the thumbnail module also needs exif', () => {
            const tagNames = ['DateTime'];
            expect(parseConfig({include: {tiff: true, exif: tagNames, thumbnail: true}}).exif).to.equal(tagNames);
        });

        it('includes exif when only the thumbnail module is named', () => {
            const includes = parseConfig({include: {heic: true, thumbnail: true}});
            expect(includes.exif).to.equal(true);
            expect(includes.thumbnail).to.equal(true);
        });

        it('produces the same modules whether or not exif is named alongside the thumbnail', () => {
            // The jpeg-heic entry in test/build/custom-builds.json relies on
            // this: it dropped its exif key, and its stored outputs stay valid
            // only for as long as both configurations build the same bundle.
            expect(parseConfig({include: {jpeg: true, heic: true, thumbnail: true}}))
                .to.deep.equal(parseConfig({include: {jpeg: true, heic: true, exif: true, thumbnail: true}}));
        });

        it('does not include exif for a thumbnail module that is turned off', () => {
            expect(parseConfig({include: {jpeg: true, thumbnail: false}}).exif).to.equal(false);
        });

        it('includes exif for a thumbnail module that overrides an explicit exclusion', () => {
            expect(parseConfig({include: {jpeg: true, exif: false, thumbnail: true}}).exif).to.equal(true);
        });

        it('includes exif as a boolean when the thumbnail module has a non-boolean value', () => {
            // Otherwise the value would be used as a tag name filter for the
            // Exif tags, which would leave no Exif tags at all.
            expect(parseConfig({include: {jpeg: true, thumbnail: ['Something']}}).exif).to.equal(true);
        });

        it('includes exif when only the maker_notes module is named', () => {
            // Maker notes are read from an Exif tag, so they cannot be
            // produced without the Exif module.
            const includes = parseConfig({include: {heic: true, maker_notes: true}});
            expect(includes.exif).to.equal(true);
            expect(includes.maker_notes).to.equal(true);
        });

        it('does not include exif when only the mpf module is named', () => {
            // MPF has its own JPEG segment and parses without the Exif module.
            const includes = parseConfig({include: {jpeg: true, mpf: true}});
            expect(includes.exif).to.equal(false);
            expect(includes.mpf).to.equal(true);
        });

        it('includes exif when only the photoshop module is named', () => {
            // Photoshop tags are read from an Exif tag, so they cannot be
            // produced without the Exif module.
            const includes = parseConfig({include: {heic: true, photoshop: true}});
            expect(includes.exif).to.equal(true);
            expect(includes.photoshop).to.equal(true);
        });
    });

    describe('exclude configurations', () => {
        it('excludes the modules that are named and keeps the rest', () => {
            const includes = parseConfig({exclude: ['jpeg']});
            expect(includes.jpeg).to.equal(false);
            expect(includes.png).to.equal(true);
            expect(includes.exif).to.equal(true);
        });

        it('excludes the thumbnail module together with exif', () => {
            const includes = parseConfig({exclude: ['exif']});
            expect(includes.exif).to.equal(false);
            expect(includes.thumbnail).to.equal(false);
        });

        it('excludes the maker_notes module together with exif', () => {
            const includes = parseConfig({exclude: ['exif']});
            expect(includes.exif).to.equal(false);
            expect(includes.maker_notes).to.equal(false);
        });

        it('excludes the photoshop module together with exif', () => {
            const includes = parseConfig({exclude: ['exif']});
            expect(includes.exif).to.equal(false);
            expect(includes.photoshop).to.equal(false);
        });

        it('keeps the mpf module when excluding exif', () => {
            // MPF has its own JPEG segment and parses without the Exif module.
            const includes = parseConfig({exclude: ['exif']});
            expect(includes.mpf).to.equal(true);
        });

        it('excludes the mpf module when it is named alongside exif', () => {
            expect(parseConfig({exclude: ['exif', 'mpf']}).mpf).to.equal(false);
        });
    });

    describe('the module list', () => {
        it('covers every constant that the build replaces', () => {
            const constantNames = Object.keys(parseConfig({include: {}})).map((module) => `USE_${module.toUpperCase()}`);
            expect(constantNames.sort()).to.deep.equal(Object.keys(Constants).sort());
        });
    });

    describe('missing configuration', () => {
        it('reports that there is nothing to configure', () => {
            expect(parseConfig(false)).to.equal(false);
        });
    });
});
