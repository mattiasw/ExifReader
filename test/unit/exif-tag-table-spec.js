/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import ExifTagTable from '../../src/writer/exif-tag-table.js';
import TagNames0thIfd from '../../src/tag-names-0th-ifd.js';
import TagNamesExifIfd from '../../src/tag-names-exif-ifd.js';
import TagNamesGpsIfd from '../../src/tag-names-gps-ifd.js';
import TagNamesInteroperabilityIfd from '../../src/tag-names-interoperability-ifd.js';
import Types from '../../src/types.js';
import {IFD_TYPE_0TH, IFD_TYPE_EXIF, IFD_TYPE_GPS, IFD_TYPE_INTEROPERABILITY} from '../../src/ifd-types.js';

const {tags, DEFAULT_FROM_SOF, DEFAULT_COMPUTED} = ExifTagTable;

const DICTIONARIES = {
    [IFD_TYPE_0TH]: TagNames0thIfd,
    [IFD_TYPE_EXIF]: TagNamesExifIfd,
    [IFD_TYPE_GPS]: TagNamesGpsIfd,
    [IFD_TYPE_INTEROPERABILITY]: TagNamesInteroperabilityIfd
};
const IFD_ORDER = [IFD_TYPE_0TH, IFD_TYPE_EXIF, IFD_TYPE_GPS, IFD_TYPE_INTEROPERABILITY];
const ALLOWED_KEYS = ['id', 'ifd', 'name', 'type', 'count', 'level', 'thumbnailLevel', 'default', 'writable'];
const LEVELS = ['M', 'R', 'O', 'N', 'J'];

describe('exif-tag-table', () => {
    it('has exactly the ids of each dictionary', () => {
        for (const ifd of IFD_ORDER) {
            const tableIds = tags.filter((entry) => entry.ifd === ifd).map((entry) => entry.id).sort(numeric);
            const dictionaryIds = Object.keys(DICTIONARIES[ifd]).map(Number).sort(numeric);
            expect(tableIds, ifd).to.deep.equal(dictionaryIds);
        }
        for (const entry of tags) {
            expect(IFD_ORDER, entry.name).to.include(entry.ifd);
        }
    });

    it('groups entries by ifd in ascending id order', () => {
        for (let index = 1; index < tags.length; index++) {
            const previous = tags[index - 1];
            const current = tags[index];
            const previousGroup = IFD_ORDER.indexOf(previous.ifd);
            const currentGroup = IFD_ORDER.indexOf(current.ifd);
            const inOrder = (currentGroup > previousGroup) || ((currentGroup === previousGroup) && (current.id > previous.id));
            expect(inOrder, `${current.ifd} ${current.name} after ${previous.ifd} ${previous.name}`).to.be.true;
        }
    });

    it('uses the dictionary name for every entry', () => {
        for (const entry of tags) {
            expect(entry.name).to.equal(dictionaryName(entry));
        }
    });

    it('uses only the known keys, in their fixed order, and the shared ifd names', () => {
        for (const entry of tags) {
            expect(Object.keys(entry), entry.name).to.deep.equal(ALLOWED_KEYS.filter((key) => key in entry));
        }
        const ifds = tags.map((entry) => entry.ifd).filter((ifd, index, all) => all.indexOf(ifd) === index);
        expect(ifds).to.deep.equal([IFD_TYPE_0TH, IFD_TYPE_EXIF, IFD_TYPE_GPS, IFD_TYPE_INTEROPERABILITY]);
    });

    it('gives a type and count exactly to the writable entries', () => {
        for (const entry of tags) {
            if ('writable' in entry) {
                expect(entry.writable, entry.name).to.equal(false);
                expect(entry, entry.name).to.not.have.any.keys('type', 'count');
            } else {
                expect(entry, entry.name).to.include.all.keys('type', 'count');
            }
        }
    });

    it('uses only known type names', () => {
        for (const entry of tags.filter(isWritable)) {
            const typeNames = Array.isArray(entry.type) ? entry.type : [entry.type];
            for (const typeName of typeNames) {
                expect(Types.tagTypes, entry.name).to.have.own.property(typeName);
            }
            if (Array.isArray(entry.type)) {
                expect(new Set(entry.type).size, entry.name).to.be.at.least(2);
            }
        }
    });

    it('uses a positive integer or any as count', () => {
        for (const entry of tags.filter(isWritable)) {
            if (entry.count !== 'any') {
                expect(Number.isInteger(entry.count), entry.name).to.be.true;
                expect(entry.count, entry.name).to.be.above(0);
            }
        }
    });

    it('uses only the DC-008 support levels', () => {
        for (const entry of tags) {
            expect(LEVELS, entry.name).to.include(entry.level);
            if ('thumbnailLevel' in entry) {
                expect(LEVELS, entry.name).to.include(entry.thumbnailLevel);
                expect(entry.thumbnailLevel, entry.name).to.not.equal(entry.level);
            }
        }
    });

    it('carries a thumbnail level where Table 21 differs from Table 17', () => {
        const thumbnailLevels = tags
            .filter((entry) => 'thumbnailLevel' in entry)
            .map((entry) => [entry.ifd, entry.name, entry.thumbnailLevel]);
        expect(thumbnailLevels).to.deep.equal([
            ['0th', 'Compression', 'M'],
            ['0th', 'PhotometricInterpretation', 'J'],
            ['0th', 'ImageDescription', 'O'],
            ['0th', 'Make', 'O'],
            ['0th', 'Model', 'O'],
            ['0th', 'Orientation', 'O'],
            ['0th', 'DateTime', 'O'],
            ['0th', 'JPEGInterchangeFormat', 'M'],
            ['0th', 'JPEGInterchangeFormatLength', 'M'],
            ['0th', 'YCbCrPositioning', 'O'],
            ['0th', 'Exif IFD Pointer', 'O']
        ]);
    });

    it('gives a default exactly to the mandatory entries', () => {
        const mandatory = tags.filter((entry) => (entry.level === 'M') || (entry.thumbnailLevel === 'M'));
        expect(mandatory.map((entry) => [entry.ifd, entry.name, entry.default])).to.deep.equal([
            ['0th', 'Compression', 6],
            ['0th', 'XResolution', [72, 1]],
            ['0th', 'YResolution', [72, 1]],
            ['0th', 'ResolutionUnit', 2],
            ['0th', 'JPEGInterchangeFormat', DEFAULT_COMPUTED],
            ['0th', 'JPEGInterchangeFormatLength', DEFAULT_COMPUTED],
            ['0th', 'YCbCrPositioning', 1],
            ['0th', 'Exif IFD Pointer', DEFAULT_COMPUTED],
            ['exif', 'ExifVersion', [0x30, 0x32, 0x33, 0x32]],
            ['exif', 'ComponentsConfiguration', [1, 2, 3, 0]],
            ['exif', 'FlashpixVersion', [0x30, 0x31, 0x30, 0x30]],
            ['exif', 'ColorSpace', 0xffff],
            ['exif', 'PixelXDimension', DEFAULT_FROM_SOF],
            ['exif', 'PixelYDimension', DEFAULT_FROM_SOF],
            ['gps', 'GPSVersionID', [2, 3, 0, 0]]
        ]);
        expect(tags.filter((entry) => 'default' in entry)).to.deep.equal(mandatory);
    });

    it('marks the SOF-derived and computed defaults with two distinct string markers', () => {
        expect(findEntry(IFD_TYPE_EXIF, 0xa002).default).to.equal(DEFAULT_FROM_SOF);
        expect(findEntry(IFD_TYPE_EXIF, 0xa003).default).to.equal(DEFAULT_FROM_SOF);
        expect(findEntry(IFD_TYPE_0TH, 0x8769).default).to.equal(DEFAULT_COMPUTED);
        expect(DEFAULT_FROM_SOF).to.be.a('string');
        expect(DEFAULT_COMPUTED).to.be.a('string');
        expect(DEFAULT_FROM_SOF).to.not.equal(DEFAULT_COMPUTED);
    });

    it('tells the colliding GPS and Interoperability ids apart by ifd', () => {
        expect(findEntry(IFD_TYPE_GPS, 0x0001).name).to.equal('GPSLatitudeRef');
        expect(findEntry(IFD_TYPE_GPS, 0x0002).name).to.equal('GPSLatitude');
        expect(findEntry(IFD_TYPE_INTEROPERABILITY, 0x0001).name).to.equal('InteroperabilityIndex');
        expect(findEntry(IFD_TYPE_INTEROPERABILITY, 0x0002).name).to.equal('InteroperabilityVersion');
    });

    it('matches DC-008 for a sample of tags', () => {
        expect(summary(IFD_TYPE_0TH, 0x0100)).to.deep.equal([['SHORT', 'LONG'], 1, 'J']);
        expect(summary(IFD_TYPE_0TH, 0x0112)).to.deep.equal(['SHORT', 1, 'R']);
        expect(summary(IFD_TYPE_0TH, 0x0111)).to.deep.equal([['SHORT', 'LONG'], 'any', 'N']);
        expect(summary(IFD_TYPE_0TH, 0x012d)).to.deep.equal(['SHORT', 768, 'O']);
        expect(summary(IFD_TYPE_0TH, 0x0132)).to.deep.equal(['ASCII', 20, 'R']);
        expect(summary(IFD_TYPE_EXIF, 0x9000)).to.deep.equal(['UNDEFINED', 4, 'M']);
        expect(summary(IFD_TYPE_EXIF, 0xa407)).to.deep.equal(['SHORT', 1, 'O']);
        expect(summary(IFD_TYPE_EXIF, 0x9214)).to.deep.equal(['SHORT', 'any', 'O']);
        expect(summary(IFD_TYPE_GPS, 0x0000)).to.deep.equal(['BYTE', 4, 'M']);
        expect(summary(IFD_TYPE_GPS, 0x0005)).to.deep.equal(['BYTE', 1, 'O']);
        expect(summary(IFD_TYPE_INTEROPERABILITY, 0x0001)).to.deep.equal(['ASCII', 'any', 'O']);
        expect(summary(IFD_TYPE_EXIF, 0xa005)).to.deep.equal(['LONG', 1, 'O']);
        expect(findEntry(IFD_TYPE_0TH, 0x9c9b)).to.deep.equal({id: 0x9c9b, ifd: '0th', name: 'XPTitle', level: 'O', writable: false});
        expect(findEntry(IFD_TYPE_0TH, 0x0142)).to.deep.equal({id: 0x0142, ifd: '0th', name: 'TileWidth', level: 'N', writable: false});
    });

    it('keeps the outside-DC-008 entries off JPEG output where they describe TIFF storage or a marker payload', () => {
        const unwritable = tags.filter((entry) => !isWritable(entry));
        expect(namesAtLevel(unwritable, 'N')).to.deep.equal([
            'SubfileType', 'OldSubfileType', 'Thresholding', 'CellWidth', 'CellLength', 'FillOrder',
            'MinSampleValue', 'MaxSampleValue', 'GrayResponseUnit', 'Predictor', 'TileWidth', 'TileLength',
            'A100DataOffset', 'InkSet', 'ExtraSamples', 'SampleFormat', 'ProfileIFD'
        ]);
        expect(namesAtLevel(unwritable, 'J')).to.deep.equal(['ApplicationNotes', 'IPTC-NAA', 'PhotoshopSettings', 'ICC_Profile']);
    });

    it('marks every tag DC-008 does not define as not writable', () => {
        const counts = {};
        for (const ifd of IFD_ORDER) {
            counts[ifd] = tags.filter((entry) => (entry.ifd === ifd) && !isWritable(entry)).length;
        }
        expect(counts).to.deep.equal({'0th': 117, exif: 23, gps: 0, interoperability: 4});
    });
});

function numeric(a, b) {
    return a - b;
}

function dictionaryName(entry) {
    const dictionaryEntry = DICTIONARIES[entry.ifd][entry.id];
    return typeof dictionaryEntry === 'string' ? dictionaryEntry : dictionaryEntry.name;
}

function isWritable(entry) {
    return entry.writable !== false;
}

function findEntry(ifd, id) {
    return tags.find((entry) => (entry.ifd === ifd) && (entry.id === id));
}

function summary(ifd, id) {
    const entry = findEntry(ifd, id);
    return [entry.type, entry.count, entry.level];
}

function namesAtLevel(entries, level) {
    return entries.filter((entry) => entry.level === level).map((entry) => entry.name);
}
