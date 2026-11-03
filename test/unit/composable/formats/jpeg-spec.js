/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import Jpeg from '../../../../src/image-header-jpeg.js';
import FileTags from '../../../../src/file-tags.js';
import JfifTags from '../../../../src/jfif-tags.js';
import {createTagFilter} from '../../../../src/tag-filter.js';
import {jpegHeader, file, jfif} from '../../../../src/composable/formats/jpeg.js';
import {getContext, recordCalls} from '../test-context.js';

describe('composable/formats/jpeg', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should give the JPEG file type', () => {
        expect(jpegHeader.fileType).to.deep.equal({value: 'jpeg', description: 'JPEG'});
    });

    it('should detect and find through Jpeg.isJpegFile and Jpeg.findJpegOffsets at call time', () => {
        const dataView = {};
        const ranges = [];
        const detects = recordCalls(Jpeg, 'isJpegFile', 'detected');
        const finds = recordCalls(Jpeg, 'findJpegOffsets', 'blocks');
        restores.push(detects.restore, finds.restore);

        expect(jpegHeader.detect(dataView)).to.equal('detected');
        expect(jpegHeader.find(dataView, ranges)).to.equal('blocks');

        expect(detects.calls).to.have.lengthOf(1);
        expect(detects.calls[0][0]).to.equal(dataView);
        expect(finds.calls).to.have.lengthOf(1);
        expect(finds.calls[0]).to.have.lengthOf(2);
        expect(finds.calls[0][0]).to.equal(dataView);
        expect(finds.calls[0][1]).to.equal(ranges);
    });

    describe('the file reader', () => {
        it('should consume the file kind into the file group', () => {
            expect(file.key).to.equal('file');
            expect(file.consumes).to.deep.equal(['file']);
            expect(file.emits).to.deep.equal([]);
            expect(file.merge({})).to.deep.equal({slot: 'file', mode: 'assign'});
        });

        it('should read the frame header and filter its tags', () => {
            const reads = swapFileTagsRead();
            const ctx = getContext({tagFilter: createTagFilter({includeTags: {file: ['ImageWidth']}})});

            const result = file.read({dataOffset: 4711}, ctx);

            expect(result).to.deep.equal({tags: {ImageWidth: {value: 1}}});
            expect(reads).to.deep.equal([[ctx.dataView, 4711]]);
        });

        it('should skip the frame header when only FileType is asked for', () => {
            const reads = swapFileTagsRead();

            const result = file.read({dataOffset: 0}, getContext({options: {includeTags: {file: ['FileType']}}}));

            expect(result).to.equal(undefined);
            expect(reads).to.have.lengthOf(0);
        });

        for (const [description, includeTags] of [
            ['no tags are asked for', undefined],
            ['FileType and another file tag are asked for', {file: ['FileType', 'ImageWidth']}],
            ['the file tags are not given as a list', {file: 'FileType'}],
            ['composite tags are asked for as a group', {file: ['FileType'], composite: true}],
            ['composite tags are asked for by name', {file: ['FileType'], composite: ['FieldOfView']}],
            ['only other groups are asked for', {exif: true}],
        ]) {
            it(`should read the frame header when ${description}`, () => {
                const reads = swapFileTagsRead();

                file.read({dataOffset: 0}, getContext({options: {includeTags}}));

                expect(reads).to.have.lengthOf(1);
            });
        }

        it('should not count an empty composite list as asking for composite tags', () => {
            const reads = swapFileTagsRead();

            file.read({dataOffset: 0}, getContext({options: {includeTags: {file: ['FileType'], composite: []}}}));

            expect(reads).to.have.lengthOf(0);
        });

        function swapFileTagsRead() {
            const {calls, restore} = recordCalls(FileTags, 'read', () => ({ImageWidth: {value: 1}, ImageHeight: {value: 2}}));
            restores.push(restore);
            return calls;
        }
    });

    describe('the JFIF reader', () => {
        it('should assign its tags to the jfif slot', () => {
            expect(jfif.merge({})).to.deep.equal({slot: 'jfif', mode: 'assign'});
        });

        it('should read the JFIF segment and filter its tags', () => {
            const {calls, restore} = recordCalls(JfifTags, 'read', {JFIFVersion: {value: 1}, XResolution: {value: 72}});
            restores.push(restore);
            const ctx = getContext({tagFilter: createTagFilter({excludeTags: {jfif: ['XResolution']}})});

            const result = jfif.read({dataOffset: 30}, ctx);

            expect(result).to.deep.equal({tags: {JFIFVersion: {value: 1}}});
            expect(calls).to.deep.equal([[ctx.dataView, 30]]);
        });
    });
});
