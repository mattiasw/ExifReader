/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils.js';
import ImageHeader from '../../src/image-header.js';
import {allFormats} from '../../src/composable/formats.js';

describe('image-header', () => {
    it('should fail for too short data buffer', () => {
        const dataView = getDataView('\x00');
        expect(() => ImageHeader.parseAppMarkers(dataView, false, allFormats)).to.throw(/Invalid image format/);
    });

    it('should fail for invalid image format', () => {
        const dataView = getDataView('------------');
        expect(() => ImageHeader.parseAppMarkers(dataView, false, allFormats)).to.throw(/Invalid image format/);
    });

    it('should fail for undefined input value', () => {
        expect(() => ImageHeader.parseAppMarkers(undefined, false, allFormats)).to.throw(/Invalid image format/);
    });

    it('should fail for every input when no format is composed', () => {
        const dataView = {};
        const format = getFormat('a', {detect: () => true});

        expect(ImageHeader.parseAppMarkers(dataView, false, [format]).fileType.value).to.equal('a');
        expect(() => ImageHeader.parseAppMarkers(dataView, false, [])).to.throw('Invalid image format');
    });

    it('should run the finder of the first format in list order whose detector matches', () => {
        const dataView = {};
        const calls = [];
        const formats = [
            getFormat('a', {detect: () => false, calls}),
            getFormat('b', {detect: (_dataView) => _dataView === dataView, blocks: ['b'], calls}),
            getFormat('c', {detect: () => true, blocks: ['c'], calls}),
        ];

        expect(ImageHeader.parseAppMarkers(dataView, false, formats)).to.deep.equal({
            fileType: {value: 'b', description: 'B'},
            blocks: ['b'],
        });
        expect(calls).to.deep.equal(['detect a', 'detect b', 'find b']);
    });

    it('should give the finder the data view and the range list and surface its truncated flag', () => {
        const dataView = {};
        const block = {kind: 'pngFile'};
        let received;
        const format = getFormat('a', {
            detect: () => true,
            find(_dataView, ranges) {
                received = {dataView: _dataView, ranges};
                ranges.push({block, start: 8, end: 33});
                ranges.truncated = true;
                return [block];
            },
        });

        const result = ImageHeader.parseAppMarkers(dataView, true, [format]);

        expect(result).to.deep.equal({
            fileType: {value: 'a', description: 'A'},
            blocks: [block],
            ranges: [{block, start: 8, end: 33}],
            truncated: true,
        });
        expect(received.dataView).to.equal(dataView);
        expect(result.ranges).to.equal(received.ranges);
    });

    it('should give a finder that records no range an empty list and no truncation', () => {
        const result = ImageHeader.parseAppMarkers({}, true, [getFormat('a', {detect: () => true})]);

        expect(result.ranges).to.deep.equal([]);
        expect(result.truncated).to.equal(false);
    });

    it('should not include ranges when they are not asked for', () => {
        let receivedRanges = 'not called';
        const format = getFormat('a', {
            detect: () => true,
            find(_dataView, ranges) {
                receivedRanges = ranges;
                return [];
            },
        });

        const result = ImageHeader.parseAppMarkers({}, false, [format]);

        expect(result).to.not.have.property('ranges');
        expect(result).to.not.have.property('truncated');
        expect(receivedRanges).to.equal(undefined);
    });
});

function getFormat(name, {detect, find = undefined, blocks = [], calls = []}) {
    return {
        header: {
            fileType: {value: name, description: name.toUpperCase()},
            detect(dataView) {
                calls.push('detect ' + name);
                return detect(dataView);
            },
            find: find || (() => {
                calls.push('find ' + name);
                return blocks;
            }),
        },
    };
}
