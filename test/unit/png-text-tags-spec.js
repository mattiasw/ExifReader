/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, concatDataViews, swapProperties} from './test-utils.js';
import {TYPE_TEXT, TYPE_ITXT, TYPE_ZTXT} from '../../src/image-header-png.js';
import PngTextTags from '../../src/png-text-tags.js';
import Tags from '../../src/tags.js';
import IptcTags from '../../src/iptc-tags.js';
import Constants from '../../src/constants.js';
import {getStringFromDataView, withDecompressBudget} from '../../src/utils.js';
import DataViewWrapper from '../../src/dataview.js';
import {crc32} from 'node:zlib';

describe('png-text-tags', () => {
    let restoreTagReaders;

    afterEach(() => {
        if (restoreTagReaders) {
            restoreTagReaders();
            restoreTagReaders = undefined;
        }
    });

    it('should read image tags', () => {
        const tagDatatEXt = 'MyTag0\x00My value.';
        const tagDataiTXt = 'MyTag1\x00\x00\x00fr\x00MyFrTag1\x00My second value.';
        const {dataView, chunks} = buildTextChunks([
            {type: TYPE_TEXT, bytes: toBytes(tagDatatEXt)},
            {type: TYPE_ITXT, bytes: toBytes(tagDataiTXt)},
        ]);

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(readTags['MyTag0']).to.deep.equal({
            value: 'My value.',
            description: 'My value.'
        });
        expect(readTags['MyTag1 (fr)']).to.deep.equal({
            value: 'My second value.',
            description: 'My second value.'
        });
    });

    it('should read a tEXt value relative to the DataView when it has a non-zero byteOffset', () => {
        const tagDatatEXt = 'MyTag0\x00My value.';
        const textChunks = buildTextChunks([{type: TYPE_TEXT, bytes: toBytes(tagDatatEXt)}]);
        const dataView = getPaddedDataView(textChunks.dataView, 4);
        const chunks = [0];

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(readTags['MyTag0']).to.deep.equal({
            value: 'My value.',
            description: 'My value.'
        });
    });

    it('should not read past the end of an iTXt chunk that is cut off after its compression flag', () => {
        const tagData = 'Comment\x00\x01';
        const {dataView, chunks} = buildTextChunks([
            {type: TYPE_ITXT, bytes: toBytes(tagData), declaredLength: 100, withCrc: false}
        ]);

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(readTags['Comment']).to.deep.equal({
            value: '',
            description: ''
        });
    });

    it('should read the bytes that are there for a tEXt chunk whose declared length runs past the end of the buffer', () => {
        const {dataView, chunks} = buildTextChunks([
            {type: TYPE_TEXT, bytes: toBytes('MyTag\x00abc'), declaredLength: 100, withCrc: false}
        ]);

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(readTags['MyTag']).to.deep.equal({
            value: 'abc',
            description: 'abc'
        });
    });

    it('should read a tEXt tag with empty text when TextDecoder is missing', () => {
        const {dataView, chunks} = buildTextChunks([
            {type: TYPE_TEXT, bytes: toBytes('Comment\x00')}
        ]);
        const restoreGlobal = swapProperties(globalThis, {TextDecoder: undefined});

        let readTags;
        try {
            ({readTags} = PngTextTags.read(dataView, chunks));
        } finally {
            restoreGlobal();
        }

        expect(readTags['Comment']).to.deep.equal({
            value: '',
            description: ''
        });
    });

    it('should read a tEXt tag from a Node Buffer backed DataView wrapper', () => {
        const tagDatatEXt = 'MyTag0\x00My value.';
        const textChunks = buildTextChunks([{type: TYPE_TEXT, bytes: toBytes(tagDatatEXt)}]);
        const dataView = toBufferBackedDataView(textChunks.dataView);
        const chunks = textChunks.chunks;

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(readTags['MyTag0']).to.deep.equal({
            value: 'My value.',
            description: 'My value.'
        });
    });

    it('should read an uncompressed iTXt tag from a Node Buffer backed DataView wrapper', () => {
        const text = 'My value.';
        const textChunks = buildTextChunks([getChunkFromDataView(TYPE_ITXT, getItextDataView('MyTagUtf8', 'en', 'MyTagUtf8', text))]);
        const dataView = toBufferBackedDataView(textChunks.dataView);
        const chunks = textChunks.chunks;

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(readTags['MyTagUtf8 (en)']).to.deep.equal({
            value: text,
            description: text
        });
    });

    it('should read a compressed zTXt tag from a Node Buffer backed DataView wrapper', async () => {
        const textChunks = buildTextChunks([
            getChunkFromDataView(TYPE_ZTXT, await getCompressedTagData(TYPE_ZTXT, 'MyTag', 'My compressed zTXt value.'))
        ]);
        const dataView = toBufferBackedDataView(textChunks.dataView);
        const chunks = textChunks.chunks;

        const {readTagsPromise} = PngTextTags.read(dataView, chunks, true);
        const tags = await readTagsPromise;

        expect(tags[0].readTags['MyTag']).to.deep.equal({
            value: 'My compressed zTXt value.',
            description: 'My compressed zTXt value.'
        });
    });

    it('should read compressed zTXt tags', async () => {
        const {dataView, chunks} = buildTextChunks([getChunkFromDataView(TYPE_ZTXT, await getCompressedTagData(TYPE_ZTXT, 'MyTag', 'My compressed zTXt value.'))]);

        const {readTagsPromise} = PngTextTags.read(dataView, chunks, true);
        const tags = await readTagsPromise;

        expect(tags[0].readTags['MyTag']).to.deep.equal({
            value: 'My compressed zTXt value.',
            description: 'My compressed zTXt value.'
        });
    });

    it('should read uncompressed iTXt tags with UTF-8 text', () => {
        const text = 'My emoji value: 🏔️✨';
        const {dataView, chunks} = buildTextChunks([getChunkFromDataView(TYPE_ITXT, getItextDataView('MyTagUtf8', 'en', 'MyTagUtf8', text))]);

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(readTags['MyTagUtf8 (en)']).to.deep.equal({
            value: text,
            description: text
        });
    });

    // It can't handle the encode/decode process for iTXt in testing. It's
    // unclear why. The process should be the same as currently coded.
    // it('should read compressed iTXt tags', async () => {
    //     const text = 'My compressed iTXt value.';
    //     const {dataView, chunks} = buildTextChunks([getChunkFromDataView(TYPE_ITXT, await getCompressedTagData(TYPE_ITXT, 'MyTag', text))]);

    //     const {readTagsPromise} = PngTextTags.read(dataView, chunks, true);
    //     const tags = await readTagsPromise;

    //     expect(tags[0]['MyTag (en-uk)']).to.deep.equal({
    //         value: text,
    //         description: text
    //     });
    // });

    it('should read zTXt tags with Exif data', async () => {
        restoreTagReaders = swapProperties(Tags, {
            read: (data, offset) => ({tags: getStringFromDataView(data, offset, data.byteLength)})
        });
        const EXIF_DATA = 'Exif\0\0<Exif\ndata>';
        const {dataView, chunks} = buildTextChunks([getChunkFromDataView(TYPE_ZTXT, await getCompressedTagData(TYPE_ZTXT, 'Raw profile type exif', `\nexif\n${('' + EXIF_DATA.length).padStart(8, ' ')}\n${stringToHex(EXIF_DATA)}`))]);

        const {readTagsPromise} = PngTextTags.read(dataView, chunks, true);
        const tags = await readTagsPromise;

        expect(tags[0].embeddedExifTags).to.equal(EXIF_DATA.substring(6));
    });

    it('should pass the same decoded-value budget to the Exif read of every zTXt Exif chunk', async () => {
        const passedBudgets = [];
        restoreTagReaders = swapProperties(Tags, {
            read: (...args) => {
                passedBudgets.push(args[5]);
                return {tags: {}};
            }
        });
        const exifValue = `\nexif\n       6\n${stringToHex('Exif\0\0')}`;
        const {dataView, chunks} = buildTextChunks([
            getZtxtChunk('Raw profile type exif', toBytes(exifValue)),
            getZtxtChunk('Raw profile type exif', toBytes(exifValue))
        ]);
        const decompressConfig = {deflate: (bytes) => bytes};
        const valueBudget = {remaining: 1000, ifdEntriesRemaining: 1000, decompressedAllowanceRemaining: 1024 * 1024};

        await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig, valueBudget).readTagsPromise;

        expect(passedBudgets).to.have.lengthOf(2);
        expect(passedBudgets[0]).to.equal(valueBudget);
        expect(passedBudgets[1]).to.equal(valueBudget);
    });

    it('should not return the internal offset on MakerNote in zTXt Exif', async () => {
        restoreTagReaders = swapProperties(Tags, {
            read: () => ({tags: {Model: {value: 'abc'}, MakerNote: {value: [1, 2, 3], __offset: 728}}})
        });
        const exifValue = `\nexif\n       6\n${stringToHex('Exif\0\0')}`;
        const {dataView, chunks} = buildTextChunks([
            getZtxtChunk('Raw profile type exif', toBytes(exifValue))
        ]);
        const decompressConfig = {deflate: (bytes) => bytes};

        const tags = await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig).readTagsPromise;

        expect(tags[0].embeddedExifTags).to.deep.equal({Model: {value: 'abc'}, MakerNote: {value: [1, 2, 3]}});
    });

    it('should add 4 times the decoded size of zTXt Exif to the decoded-value budget before reading it', async () => {
        const seenAtRead = [];
        restoreTagReaders = swapProperties(Tags, {
            read: (...args) => {
                seenAtRead.push({
                    byteLength: args[0].byteLength,
                    remaining: args[5].remaining,
                    decompressedAllowanceRemaining: args[5].decompressedAllowanceRemaining
                });
                return {tags: {}};
            }
        });
        const exifData = 'Exif\0\0' + '\0'.repeat(10);
        const exifValue = `\nexif\n      ${exifData.length}\n${stringToHex(exifData)}`;
        const {dataView, chunks} = buildTextChunks([
            getZtxtChunk('Raw profile type exif', toBytes(exifValue))
        ]);
        const decompressConfig = {deflate: (bytes) => bytes};
        const valueBudget = {
            remaining: 1000,
            ifdEntriesRemaining: 1000,
            decompressedAllowanceRemaining: 1024 * 1024,
            iptcDatasetsRemaining: 7,
            decompressedIptcAllowanceRemaining: 8192
        };

        await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig, valueBudget).readTagsPromise;

        expect(seenAtRead).to.deep.equal([{
            byteLength: exifData.length,
            remaining: 1000 + 4 * exifData.length,
            decompressedAllowanceRemaining: 1024 * 1024 - 4 * exifData.length
        }]);
        expect(valueBudget.iptcDatasetsRemaining).to.equal(7);
        expect(valueBudget.decompressedIptcAllowanceRemaining).to.equal(8192);
    });

    it('should raise the IPTC dataset count by one per 5 decoded bytes of zTXt IPTC before reading it', async () => {
        const seenAtRead = [];
        restoreTagReaders = swapProperties(IptcTags, {
            read: (...args) => {
                seenAtRead.push({
                    byteLength: args[0].byteLength,
                    valueBudget: args[4],
                    remaining: args[4].remaining,
                    iptcDatasetsRemaining: args[4].iptcDatasetsRemaining,
                    decompressedIptcAllowanceRemaining: args[4].decompressedIptcAllowanceRemaining
                });
                return {};
            }
        });
        // 22 bytes: 4 empty datasets and 2 more bytes, which add 4 units.
        const iptcData = '\x1c\x02\x19\x00\x00'.repeat(4) + '\x00\x00';
        const {dataView, chunks} = buildTextChunks([
            getZtxtChunk('Raw profile type iptc', toBytes(getRawProfileValue('iptc', iptcData)))
        ]);
        const decompressConfig = {deflate: (bytes) => bytes};
        const valueBudget = {
            remaining: 1000,
            ifdEntriesRemaining: 1000,
            decompressedAllowanceRemaining: 1024 * 1024,
            iptcDatasetsRemaining: 7,
            decompressedIptcAllowanceRemaining: 8192
        };

        await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig, valueBudget).readTagsPromise;

        expect(seenAtRead).to.deep.equal([{
            byteLength: iptcData.length,
            valueBudget,
            remaining: 1000,
            iptcDatasetsRemaining: 7 + 4,
            decompressedIptcAllowanceRemaining: 8192 - 4
        }]);
        expect(seenAtRead[0].valueBudget).to.equal(valueBudget);
    });

    it('should read zTXt tags with IPTC data', async () => {
        restoreTagReaders = swapProperties(IptcTags, {
            read: (data, offset) => getStringFromDataView(data, offset, data.byteLength)
        });
        const IPTC_DATA = '<IPTC data>';
        const {dataView, chunks} = buildTextChunks([getChunkFromDataView(TYPE_ZTXT, await getCompressedTagData(TYPE_ZTXT, 'Raw profile type iptc', `\niptc\n${('' + IPTC_DATA.length).padStart(8, ' ')}\n${stringToHex(IPTC_DATA)}`))]);

        const {readTagsPromise} = PngTextTags.read(dataView, chunks, true);
        const tags = await readTagsPromise;

        expect(tags[0].embeddedIptcTags).to.equal(IPTC_DATA);
    });

    it('should ignore tags that use compression when async is not passed', async () => {
        const {dataView, chunks} = buildTextChunks([getChunkFromDataView(TYPE_ZTXT, await getCompressedTagData(TYPE_ZTXT, 'MyTag', 'My compressed zTXt value.'))]);

        const {readTags, readTagsPromise} = PngTextTags.read(dataView, chunks);

        expect(readTagsPromise).to.be.undefined;
        expect(readTags).to.deep.equal({});
    });

    it('should use custom deflate function when decompressConfig is provided', async () => {
        const name = 'MyTag';
        const value = 'Custom deflate result.';
        const compressedBytes = new Uint8Array([1, 2, 3]);
        const headerStr = `${name}\x00\x00`;
        const {dataView, chunks} = buildTextChunks([
            {type: TYPE_ZTXT, bytes: concatBytes(toBytes(headerStr), compressedBytes)}
        ]);

        const decompressConfig = {
            deflate: () => Uint8Array.from(value, (c) => c.charCodeAt(0))
        };

        const {readTagsPromise} = PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig);
        const tags = await readTagsPromise;

        expect(tags[0].readTags[name]).to.deep.equal({
            value,
            description: value
        });
    });

    it('should skip compressed Exif and IPTC tags when the tag filter excludes their groups', async () => {
        let readCalls = 0;
        restoreTagReaders = swapProperties(Tags, {
            read: () => {
                readCalls++;
                return {tags: {}};
            }
        });
        const restoreIptcTags = swapProperties(IptcTags, {
            read: () => {
                readCalls++;
                return {};
            }
        });
        const exifValue = `\nexif\n       6\n${stringToHex('Exif\0\0')}`;
        const iptcValue = `\niptc\n       1\n${stringToHex('I')}`;
        const {dataView, chunks} = buildTextChunks([
            getZtxtChunk('Raw profile type exif', toBytes(exifValue)),
            getZtxtChunk('Raw profile type iptc', toBytes(iptcValue)),
            getZtxtChunk('MyTag', toBytes('My value.'))
        ]);
        const tagFilter = {shouldParseGroup: (group) => group === 'png'};
        const decompressConfig = {deflate: (bytes) => bytes};

        try {
            const tags = await PngTextTags.read(dataView, chunks, true, false, false, tagFilter, decompressConfig).readTagsPromise;

            expect(readCalls).to.equal(0);
            expect(tags).to.deep.equal([{}, {}, {readTags: {MyTag: {value: 'My value.', description: 'My value.'}}}]);
        } finally {
            restoreIptcTags();
        }
    });

    it('should skip compressed PNG text tags when the tag filter excludes the png group', async () => {
        const {dataView, chunks} = buildTextChunks([getZtxtChunk('MyTag', toBytes('My value.'))]);
        const tagFilter = {shouldParseGroup: (group) => group !== 'png'};
        const decompressConfig = {deflate: (bytes) => bytes};

        const tags = await PngTextTags.read(dataView, chunks, true, false, false, tagFilter, decompressConfig).readTagsPromise;

        expect(tags).to.deep.equal([{}]);
    });

    it('should return an empty object for a compressed tag without a keyword', async () => {
        const {dataView, chunks} = buildTextChunks([getZtxtChunk('', toBytes('My value.'))]);
        const decompressConfig = {deflate: (bytes) => bytes};

        const tags = await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig).readTagsPromise;

        expect(tags).to.deep.equal([{}]);
    });

    it('should keep an uncompressed tag with the keyword __proto__ as an own tag', () => {
        const tagData = '__proto__\x00hello';
        const {dataView, chunks} = buildTextChunks([{type: TYPE_TEXT, bytes: toBytes(tagData)}]);

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(Object.keys(readTags)).to.deep.equal(['__proto__']);
        expect(Object.getPrototypeOf(readTags)).to.equal(Object.prototype);
        expect(Object.getOwnPropertyDescriptor(readTags, '__proto__').value).to.deep.equal({
            value: 'hello',
            description: 'hello'
        });
    });

    it('should keep a compressed tag with the keyword __proto__ as an own tag', async () => {
        const {dataView, chunks} = buildTextChunks([getChunkFromDataView(TYPE_ZTXT, await getCompressedTagData(TYPE_ZTXT, '__proto__', 'hello'))]);

        const tags = await PngTextTags.read(dataView, chunks, true).readTagsPromise;

        expect(Object.keys(tags[0])).to.deep.equal(['readTags']);
        const readTags = tags[0].readTags;
        expect(Object.keys(readTags)).to.deep.equal(['__proto__']);
        expect(Object.getPrototypeOf(readTags)).to.equal(Object.prototype);
        expect(Object.getOwnPropertyDescriptor(readTags, '__proto__').value).to.deep.equal({
            value: 'hello',
            description: 'hello'
        });
    });

    it('should append _ to an uncompressed tag with the keyword of an Object.prototype method', () => {
        const tagData = 'hasOwnProperty\x00hello';
        const {dataView, chunks} = buildTextChunks([{type: TYPE_TEXT, bytes: toBytes(tagData)}]);

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(Object.keys(readTags)).to.deep.equal(['hasOwnProperty_']);
        expect(readTags.hasOwnProperty_).to.deep.equal({
            value: 'hello',
            description: 'hello'
        });
        expect(readTags.hasOwnProperty).to.equal(Object.prototype.hasOwnProperty);
    });

    it('should append _ to a compressed tag with the keyword of an Object.prototype method', async () => {
        const {dataView, chunks} = buildTextChunks([getChunkFromDataView(TYPE_ZTXT, await getCompressedTagData(TYPE_ZTXT, 'toString', 'hello'))]);

        const tags = await PngTextTags.read(dataView, chunks, true).readTagsPromise;

        const readTags = tags[0].readTags;
        expect(Object.keys(readTags)).to.deep.equal(['toString_']);
        expect(readTags.toString_).to.deep.equal({
            value: 'hello',
            description: 'hello'
        });
        expect(String(readTags)).to.equal('[object Object]');
    });

    it('should read an uncompressed tag with the keyword __exif as a text tag', () => {
        const tagData = '__exif\x00FROMFILE';
        const {dataView, chunks} = buildTextChunks([{type: TYPE_TEXT, bytes: toBytes(tagData)}]);

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(readTags).to.deep.equal({__exif: {value: 'FROMFILE', description: 'FROMFILE'}});
    });

    it('should read compressed tags with the keywords __exif and __iptc as text tags', async () => {
        const {dataView, chunks} = buildTextChunks([
            getZtxtChunk('__exif', toBytes('FROMFILE')),
            getZtxtChunk('__iptc', toBytes('FROMFILE'))
        ]);
        const decompressConfig = {deflate: (bytes) => bytes};

        const tags = await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig).readTagsPromise;

        expect(tags).to.deep.equal([
            {readTags: {__exif: {value: 'FROMFILE', description: 'FROMFILE'}}},
            {readTags: {__iptc: {value: 'FROMFILE', description: 'FROMFILE'}}}
        ]);
    });

    describe('uncompressed raw profiles', () => {
        it('should read a tEXt Exif raw profile synchronously into embedded Exif tags', () => {
            const readArgs = [];
            restoreTagReaders = swapProperties(Tags, {
                read: (data, offset) => {
                    readArgs.push({data: getStringFromDataView(data, 0, data.byteLength), offset});
                    return {tags: {Model: {value: 'abc'}}};
                }
            });
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0MM'))
            ]);

            const result = PngTextTags.read(dataView, chunks);

            expect(readArgs).to.deep.equal([{data: 'Exif\0\0MM', offset: 6}]);
            expect(result.embeddedExifTags).to.deep.equal({Model: {value: 'abc'}});
            expect(result.embeddedIptcTags).to.be.undefined;
            expect(result.readTags).to.deep.equal({});
            expect(result.readTagsPromise).to.be.undefined;
        });

        it('should not return the internal offset on MakerNote in a tEXt Exif raw profile', () => {
            restoreTagReaders = swapProperties(Tags, {
                read: () => ({tags: {Model: {value: 'abc'}, MakerNote: {value: [1, 2, 3], __offset: 728}}})
            });
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0MM'))
            ]);

            const result = PngTextTags.read(dataView, chunks);

            expect(result.embeddedExifTags).to.deep.equal({Model: {value: 'abc'}, MakerNote: {value: [1, 2, 3]}});
        });

        it('should read a tEXt IPTC raw profile synchronously into embedded IPTC tags', () => {
            const readArgs = [];
            restoreTagReaders = swapProperties(IptcTags, {
                read: (data, offset) => {
                    readArgs.push({data: getStringFromDataView(data, 0, data.byteLength), offset});
                    return {Headline: {value: 'abc'}};
                }
            });
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type iptc', getRawProfileValue('iptc', '<IPTC data>'))
            ]);

            const result = PngTextTags.read(dataView, chunks);

            expect(readArgs).to.deep.equal([{data: '<IPTC data>', offset: 0}]);
            expect(result.embeddedIptcTags).to.deep.equal({Headline: {value: 'abc'}});
            expect(result.embeddedExifTags).to.be.undefined;
            expect(result.readTags).to.deep.equal({});
            expect(result.readTagsPromise).to.be.undefined;
        });

        it('should read an uncompressed iTXt Exif raw profile', () => {
            restoreTagReaders = swapProperties(Tags, {
                read: () => ({tags: {Model: {value: 'abc'}}})
            });
            const {dataView, chunks} = buildTextChunks([
                getUncompressedItxtChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0MM'))
            ]);

            const result = PngTextTags.read(dataView, chunks, true);

            expect(result.embeddedExifTags).to.deep.equal({Model: {value: 'abc'}});
            expect(result.readTags).to.deep.equal({});
            expect(result.readTagsPromise).to.be.undefined;
        });

        it('should merge the tags of several tEXt Exif raw profiles with the later chunk winning', () => {
            const results = [
                {tags: {Model: {value: 'first'}, Make: {value: 'make'}}},
                {tags: {Model: {value: 'second'}, Artist: {value: 'artist'}}}
            ];
            restoreTagReaders = swapProperties(Tags, {
                read: () => results.shift()
            });
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0MM')),
                getTextChunk('MyTag', 'My value.'),
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0MM'))
            ]);

            const result = PngTextTags.read(dataView, chunks);

            expect(result.embeddedExifTags).to.deep.equal({
                Model: {value: 'second'},
                Make: {value: 'make'},
                Artist: {value: 'artist'}
            });
            expect(result.readTags).to.deep.equal({MyTag: {value: 'My value.', description: 'My value.'}});
        });

        it('should merge the tags of several tEXt IPTC raw profiles with the later chunk winning', () => {
            const results = [
                {Headline: {value: 'first'}, Credit: {value: 'credit'}},
                {Headline: {value: 'second'}}
            ];
            restoreTagReaders = swapProperties(IptcTags, {
                read: () => results.shift()
            });
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type iptc', getRawProfileValue('iptc', 'I')),
                getTextChunk('Raw profile type iptc', getRawProfileValue('iptc', 'I'))
            ]);

            const result = PngTextTags.read(dataView, chunks);

            expect(result.embeddedIptcTags).to.deep.equal({
                Headline: {value: 'second'},
                Credit: {value: 'credit'}
            });
        });

        it('should drop malformed tEXt raw profiles without throwing and still read the next chunk', () => {
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', '\nexif\nzz'),
                getTextChunk('Raw profile type exif', `\nexif\n       6\n${stringToHex('Exif\0\0')}0`),
                getTextChunk('Raw profile type exif', '\nexif\n0\n'),
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0')),
                getTextChunk('Raw profile type iptc', '\niptc\nzz'),
                getTextChunk('MyTag', 'My value.')
            ]);

            const result = PngTextTags.read(dataView, chunks);

            expect(result.embeddedExifTags).to.be.undefined;
            expect(result.embeddedIptcTags).to.be.undefined;
            expect(result.readTags).to.deep.equal({MyTag: {value: 'My value.', description: 'My value.'}});
        });

        it('should skip tEXt Exif and IPTC raw profiles when the tag filter excludes their groups', () => {
            let readCalls = 0;
            restoreTagReaders = swapProperties(Tags, {
                read: () => {
                    readCalls++;
                    return {tags: {}};
                }
            });
            const restoreIptcTags = swapProperties(IptcTags, {
                read: () => {
                    readCalls++;
                    return {};
                }
            });
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0')),
                getTextChunk('Raw profile type iptc', getRawProfileValue('iptc', 'I')),
                getTextChunk('MyTag', 'My value.')
            ]);
            const tagFilter = {shouldParseGroup: (group) => group === 'png'};

            try {
                const result = PngTextTags.read(dataView, chunks, false, false, false, tagFilter);

                expect(readCalls).to.equal(0);
                expect(result.embeddedExifTags).to.be.undefined;
                expect(result.embeddedIptcTags).to.be.undefined;
                expect(result.readTags).to.deep.equal({MyTag: {value: 'My value.', description: 'My value.'}});
            } finally {
                restoreIptcTags();
            }
        });

        it('should read a tEXt Exif raw profile but skip plain tEXt tags when the tag filter excludes the png group', () => {
            restoreTagReaders = swapProperties(Tags, {
                read: () => ({tags: {Model: {value: 'abc'}}})
            });
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0MM')),
                getTextChunk('MyTag', 'My value.')
            ]);
            const tagFilter = {shouldParseGroup: (group) => group !== 'png'};

            const result = PngTextTags.read(dataView, chunks, false, false, false, tagFilter);

            expect(result.embeddedExifTags).to.deep.equal({Model: {value: 'abc'}});
            expect(result.readTags).to.deep.equal({});
        });

        it('should pass the same decoded-value budget to the Exif read of every tEXt Exif raw profile', () => {
            const passedBudgets = [];
            restoreTagReaders = swapProperties(Tags, {
                read: (...args) => {
                    passedBudgets.push(args[5]);
                    return {tags: {}};
                }
            });
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0')),
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0'))
            ]);
            const valueBudget = {remaining: 1000};

            PngTextTags.read(dataView, chunks, false, false, false, undefined, undefined, valueBudget);

            expect(passedBudgets).to.have.lengthOf(2);
            expect(passedBudgets[0]).to.equal(valueBudget);
            expect(passedBudgets[1]).to.equal(valueBudget);
        });

        it('should not add to the decoded-value budget for tEXt Exif raw profiles', () => {
            const seenAtRead = [];
            restoreTagReaders = swapProperties(Tags, {
                read: (...args) => {
                    seenAtRead.push({
                        remaining: args[5].remaining,
                        decompressedAllowanceRemaining: args[5].decompressedAllowanceRemaining
                    });
                    return {tags: {}};
                }
            });
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0' + '\0'.repeat(10)))
            ]);
            const valueBudget = {remaining: 1000, ifdEntriesRemaining: 1000, decompressedAllowanceRemaining: 1024 * 1024};

            PngTextTags.read(dataView, chunks, false, false, false, undefined, undefined, valueBudget);

            expect(seenAtRead).to.deep.equal([{remaining: 1000, decompressedAllowanceRemaining: 1024 * 1024}]);
        });

        it('should pass the IPTC read of a tEXt IPTC raw profile the budget without an allowance', () => {
            const seenAtRead = [];
            restoreTagReaders = swapProperties(IptcTags, {
                read: (...args) => {
                    seenAtRead.push({
                        valueBudget: args[4],
                        iptcDatasetsRemaining: args[4].iptcDatasetsRemaining,
                        decompressedIptcAllowanceRemaining: args[4].decompressedIptcAllowanceRemaining
                    });
                    return {};
                }
            });
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type iptc', getRawProfileValue('iptc', '\x1c\x02\x19\x00\x00'.repeat(4)))
            ]);
            const valueBudget = {iptcDatasetsRemaining: 7, decompressedIptcAllowanceRemaining: 8192};

            PngTextTags.read(dataView, chunks, false, false, false, undefined, undefined, valueBudget);

            expect(seenAtRead).to.have.lengthOf(1);
            expect(seenAtRead[0].valueBudget).to.equal(valueBudget);
            expect(seenAtRead[0].iptcDatasetsRemaining).to.equal(7);
            expect(seenAtRead[0].decompressedIptcAllowanceRemaining).to.equal(8192);
        });

        it('should drop tEXt Exif and IPTC raw profiles in a build without Exif and IPTC support', () => {
            let readCalls = 0;
            restoreTagReaders = swapProperties(Tags, {
                read: () => {
                    readCalls++;
                    return {tags: {}};
                }
            });
            const restoreIptcTags = swapProperties(IptcTags, {
                read: () => {
                    readCalls++;
                    return {};
                }
            });
            const restoreConstants = swapProperties(Constants, {USE_EXIF: false, USE_IPTC: false});
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0')),
                getTextChunk('Raw profile type iptc', getRawProfileValue('iptc', 'I'))
            ]);

            try {
                const result = PngTextTags.read(dataView, chunks);

                expect(readCalls).to.equal(0);
                expect(result.embeddedExifTags).to.be.undefined;
                expect(result.embeddedIptcTags).to.be.undefined;
                expect(result.readTags).to.deep.equal({});
            } finally {
                restoreConstants();
                restoreIptcTags();
            }
        });

        it('should merge the tags of 10000 tEXt Exif raw profiles well under a second', () => {
            const NUMBER_OF_CHUNKS = 10000;
            const textChunks = [];
            for (let i = 0; i < NUMBER_OF_CHUNKS; i++) {
                textChunks.push(getTextChunk('Raw profile type exif', getRawProfileValue('exif', getExifWithOneUnknownTag(0x5000 + i))));
            }
            const {dataView, chunks} = buildTextChunks(textChunks);

            const start = performance.now();
            const result = PngTextTags.read(dataView, chunks, false, true);
            const elapsed = performance.now() - start;

            expect(Object.keys(result.embeddedExifTags)).to.have.lengthOf(NUMBER_OF_CHUNKS);
            expect(elapsed).to.be.below(1000);
        });

        const EVERY_NIBBLE_DATA = '\x01\x23\x45\x67\x89\xab\xcd\xef\xfe\xdc\xba\x98\x76\x54\x32\x10';

        it('should decode uppercase hex digits in a tEXt raw profile like lowercase ones', () => {
            const hex = stringToHex(EVERY_NIBBLE_DATA);

            const decoded = readDecodedExifRawProfile(getRawProfileValueWithHex('exif', EVERY_NIBBLE_DATA, hex.toUpperCase()));

            expect(decoded).to.deep.equal([EVERY_NIBBLE_DATA]);
        });

        it('should decode tEXt raw profile hex split into lines, also inside a digit pair, into a view covering its whole buffer', () => {
            const data = EVERY_NIBBLE_DATA.repeat(3);
            const splitHex = stringToHex(data).replace(/(.{72})/g, '$1\n');
            const hex = splitHex.slice(0, 37) + '\n' + splitHex.slice(37);
            const views = [];
            restoreTagReaders = swapProperties(Tags, {
                read: (dataView) => {
                    views.push(dataView);
                    return {tags: {}};
                }
            });
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValueWithHex('exif', data, hex))
            ]);

            PngTextTags.read(dataView, chunks);

            expect(views).to.have.lengthOf(1);
            expect(getStringFromDataView(views[0], 0, views[0].byteLength)).to.equal(data);
            expect(views[0].byteOffset).to.equal(0);
            expect(views[0].byteLength).to.equal(views[0].buffer.byteLength);
        });

        it('should skip spaces, carriage returns and other non-hex characters in a tEXt raw profile', () => {
            const separators = [' ', '\r\n', '/', ':', '@', 'G', '`', 'g', '\t'];
            const hex = stringToHex(EVERY_NIBBLE_DATA).split('')
                .map((digit, index) => digit + separators[index % separators.length])
                .join('');

            const decoded = readDecodedExifRawProfile(getRawProfileValueWithHex('exif', EVERY_NIBBLE_DATA, hex));

            expect(decoded).to.deep.equal([EVERY_NIBBLE_DATA]);
        });

        it('should drop a tEXt raw profile with an odd number of hex digits and still read the next chunk', () => {
            let readCalls = 0;
            restoreTagReaders = swapProperties(Tags, {
                read: () => {
                    readCalls++;
                    return {tags: {Model: {value: 'abc'}}};
                }
            });
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0MM') + '0'),
                getTextChunk('MyTag', 'My value.')
            ]);

            const result = PngTextTags.read(dataView, chunks);

            expect(readCalls).to.equal(0);
            expect(result.embeddedExifTags).to.be.undefined;
            expect(result.readTags).to.deep.equal({MyTag: {value: 'My value.', description: 'My value.'}});
        });

        function getExifWithOneUnknownTag(tagId) {
            const tagIdBytes = String.fromCharCode(tagId >> 8, tagId & 0xff);
            return 'Exif\0\0'
                + 'MM\0\x2a\0\0\0\x08'
                + '\0\x01'
                + tagIdBytes + '\0\x03' + '\0\0\0\x01' + '\0\x01\0\0'
                + '\0\0\0\0';
        }
    });

    describe('raw profile thumbnails', () => {
        const EXIF_DATA = 'Exif\0\0MM\0\x2a\0\0\0\x08<thumbnail>';

        function swapTagsReadWithThumbnail(readCount = {calls: 0}) {
            restoreTagReaders = swapProperties(Tags, {
                read: () => {
                    readCount.calls++;
                    return {
                        tags: {
                            Model: {value: 'abc'},
                            Thumbnail: {JPEGInterchangeFormat: {value: 8}, JPEGInterchangeFormatLength: {value: 2}}
                        }
                    };
                }
            });
            return readCount;
        }

        function getRecordingGetThumbnail(results) {
            const calls = [];
            function getThumbnail(dataView, thumbnailIfdTags, tiffHeaderOffset) {
                calls.push({dataView, thumbnailIfdTags, tiffHeaderOffset});
                return results.shift();
            }
            return {getThumbnail, calls};
        }

        it('should pass the decoded profile and its thumbnail IFD tags to getThumbnail and return the thumbnail with an image', () => {
            swapTagsReadWithThumbnail();
            const thumbnail = {image: 'image'};
            const {getThumbnail, calls} = getRecordingGetThumbnail([thumbnail]);
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', EXIF_DATA))
            ]);

            const result = PngTextTags.read(dataView, chunks, false, false, false, undefined, undefined, undefined, getThumbnail);

            expect(calls).to.have.lengthOf(1);
            expect(calls[0].dataView.byteOffset).to.equal(0);
            expect(calls[0].dataView.byteLength).to.equal(EXIF_DATA.length);
            expect(getStringFromDataView(calls[0].dataView, 0, EXIF_DATA.length)).to.equal(EXIF_DATA);
            expect(calls[0].thumbnailIfdTags).to.deep.equal({JPEGInterchangeFormat: {value: 8}, JPEGInterchangeFormatLength: {value: 2}});
            expect(calls[0].tiffHeaderOffset).to.equal(6);
            expect(result.embeddedExifThumbnail).to.equal(thumbnail);
            expect(result.embeddedExifTags).to.deep.equal({Model: {value: 'abc'}});
        });

        it('should return no thumbnail when getThumbnail gives no image', () => {
            swapTagsReadWithThumbnail();
            const {getThumbnail} = getRecordingGetThumbnail([{type: 'image/jpeg'}]);
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', EXIF_DATA))
            ]);

            const result = PngTextTags.read(dataView, chunks, false, false, false, undefined, undefined, undefined, getThumbnail);

            expect(result.embeddedExifThumbnail).to.be.undefined;
            expect(result.embeddedExifTags).to.deep.equal({Model: {value: 'abc'}});
        });

        it('should return no thumbnail and drop the thumbnail IFD tags when no getThumbnail is passed', () => {
            swapTagsReadWithThumbnail();
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', EXIF_DATA))
            ]);

            const result = PngTextTags.read(dataView, chunks);

            expect(result.embeddedExifThumbnail).to.be.undefined;
            expect(result.embeddedExifTags).to.deep.equal({Model: {value: 'abc'}});
        });

        it('should keep the first tEXt thumbnail with an image and not look for one in later chunks', () => {
            swapTagsReadWithThumbnail();
            const firstWithImage = {image: 'first'};
            const {getThumbnail, calls} = getRecordingGetThumbnail([{}, firstWithImage, {image: 'second'}]);
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', EXIF_DATA)),
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', EXIF_DATA)),
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', EXIF_DATA))
            ]);

            const result = PngTextTags.read(dataView, chunks, false, false, false, undefined, undefined, undefined, getThumbnail);

            expect(calls).to.have.lengthOf(2);
            expect(result.embeddedExifThumbnail).to.equal(firstWithImage);
            expect(result.embeddedExifTags).to.deep.equal({Model: {value: 'abc'}});
        });

        it('should return the thumbnail of a zTXt raw profile with its entry', async () => {
            swapTagsReadWithThumbnail();
            const thumbnail = {image: 'image'};
            const {getThumbnail, calls} = getRecordingGetThumbnail([thumbnail]);
            const {dataView, chunks} = buildTextChunks([
                getZtxtChunk('Raw profile type exif', toBytes(getRawProfileValue('exif', EXIF_DATA)))
            ]);
            const decompressConfig = {deflate: (bytes) => bytes};

            const tagList = await PngTextTags.read(
                dataView, chunks, true, false, false, undefined, decompressConfig, undefined, getThumbnail
            ).readTagsPromise;

            expect(calls).to.have.lengthOf(1);
            expect(calls[0].dataView.byteLength).to.equal(EXIF_DATA.length);
            expect(calls[0].tiffHeaderOffset).to.equal(6);
            expect(tagList).to.deep.equal([{embeddedExifTags: {Model: {value: 'abc'}}, embeddedExifThumbnail: thumbnail}]);
        });

        it('should give a zTXt entry no thumbnail key when getThumbnail gives no image', async () => {
            swapTagsReadWithThumbnail();
            const {getThumbnail} = getRecordingGetThumbnail([{}]);
            const {dataView, chunks} = buildTextChunks([
                getZtxtChunk('Raw profile type exif', toBytes(getRawProfileValue('exif', EXIF_DATA)))
            ]);
            const decompressConfig = {deflate: (bytes) => bytes};

            const tagList = await PngTextTags.read(
                dataView, chunks, true, false, false, undefined, decompressConfig, undefined, getThumbnail
            ).readTagsPromise;

            expect(tagList).to.deep.equal([{embeddedExifTags: {Model: {value: 'abc'}}}]);
        });

        it('should not look for a zTXt thumbnail, even in an earlier chunk, when a tEXt chunk has one', async () => {
            swapTagsReadWithThumbnail();
            const textThumbnail = {image: 'text'};
            const {getThumbnail, calls} = getRecordingGetThumbnail([textThumbnail, {image: 'compressed'}]);
            const {dataView, chunks} = buildTextChunks([
                getZtxtChunk('Raw profile type exif', toBytes(getRawProfileValue('exif', EXIF_DATA))),
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', EXIF_DATA))
            ]);
            const decompressConfig = {deflate: (bytes) => bytes};

            const result = PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig, undefined, getThumbnail);
            const tagList = await result.readTagsPromise;

            expect(calls).to.have.lengthOf(1);
            expect(result.embeddedExifThumbnail).to.equal(textThumbnail);
            expect(tagList).to.deep.equal([{embeddedExifTags: {Model: {value: 'abc'}}}]);
        });

        it('should not call getThumbnail when the tag filter excludes the exif group', () => {
            const readCount = swapTagsReadWithThumbnail();
            const {getThumbnail, calls} = getRecordingGetThumbnail([{image: 'image'}]);
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', EXIF_DATA))
            ]);
            const tagFilter = {shouldParseGroup: (group) => group !== 'exif'};

            const result = PngTextTags.read(dataView, chunks, false, false, false, tagFilter, undefined, undefined, getThumbnail);

            expect(readCount.calls).to.equal(0);
            expect(calls).to.have.lengthOf(0);
            expect(result.embeddedExifThumbnail).to.be.undefined;
        });
    });

    describe('many compressed text chunks', () => {
        const MAX_COMPRESSED_TEXT_CHUNKS = 255;
        const MAX_DECOMPRESSIONS_IN_FLIGHT = 4;

        it('should decompress only the first 255 of 8000 zTXt chunks, in chunk order, well under a second', async () => {
            const compressedValue = new Uint8Array((await compress(Uint8Array.from([0x76]))).buffer);
            const {dataView, chunks} = buildTextChunks(
                Array.from({length: 8000}, (_, index) => getZtxtChunk('k' + index, compressedValue))
            );

            const start = performance.now();
            const {readTagsPromise} = PngTextTags.read(dataView, chunks, true);
            const tags = await readTagsPromise;
            const elapsed = performance.now() - start;

            expect(elapsed).to.be.below(500);
            expect(tags).to.have.lengthOf(MAX_COMPRESSED_TEXT_CHUNKS);
            for (let i = 0; i < MAX_COMPRESSED_TEXT_CHUNKS; i++) {
                expect(tags[i]).to.deep.equal({readTags: {['k' + i]: {value: 'v', description: 'v'}}});
            }
        });

        it('should call a custom decompression function for at most 255 chunks', async () => {
            let calls = 0;
            const decompressConfig = {
                deflate: (bytes) => {
                    calls++;
                    return bytes;
                }
            };
            const {dataView, chunks} = buildTextChunks(
                Array.from({length: 300}, (_, index) => getZtxtChunk('k' + index, toBytes('v' + index)))
            );

            const tags = await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig).readTagsPromise;

            expect(calls).to.equal(MAX_COMPRESSED_TEXT_CHUNKS);
            expect(tags).to.deep.equal(getExpectedTags(0, MAX_COMPRESSED_TEXT_CHUNKS));
        });

        it('should count compressed zTXt and iTXt chunks against the same cap', async () => {
            const calledValues = [];
            const decompressConfig = {
                deflate: (bytes) => {
                    calledValues.push(new TextDecoder().decode(bytes));
                    return bytes;
                }
            };
            const {dataView, chunks} = buildTextChunks([
                ...Array.from({length: 200}, (_, index) => getZtxtChunk('k' + index, toBytes('v' + index))),
                ...Array.from({length: 100}, (_, index) => getCompressedItxtChunk('k' + (200 + index), toBytes('v' + (200 + index))))
            ]);

            const tags = await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig).readTagsPromise;

            expect(calledValues).to.have.lengthOf(MAX_COMPRESSED_TEXT_CHUNKS);
            expect(calledValues).to.not.include('v255');
            expect(tags).to.deep.equal(getExpectedTags(0, MAX_COMPRESSED_TEXT_CHUNKS));
        });

        it('should still read uncompressed text chunks and not count them against the cap', async () => {
            let calls = 0;
            const decompressConfig = {
                deflate: (bytes) => {
                    calls++;
                    return bytes;
                }
            };
            const compressedChunks = Array.from({length: 300}, (_, index) => getZtxtChunk('k' + index, toBytes('v' + index)));
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('First', 'first value'),
                ...compressedChunks.slice(0, 150),
                getTextChunk('Middle', 'middle value'),
                ...compressedChunks.slice(150),
                getTextChunk('Last', 'last value'),
                getUncompressedItxtChunk('LastItxt', 'last iTXt value')
            ]);

            const {readTags, readTagsPromise} = PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig);
            const tags = await readTagsPromise;

            expect(readTags).to.deep.equal({
                First: {value: 'first value', description: 'first value'},
                Middle: {value: 'middle value', description: 'middle value'},
                Last: {value: 'last value', description: 'last value'},
                LastItxt: {value: 'last iTXt value', description: 'last iTXt value'}
            });
            expect(calls).to.equal(MAX_COMPRESSED_TEXT_CHUNKS);
            expect(tags).to.deep.equal(getExpectedTags(0, MAX_COMPRESSED_TEXT_CHUNKS));
        });

        it('should keep at most 4 decompressions in flight and return the results in chunk order', async () => {
            const NUMBER_OF_CHUNKS = 10;
            const pending = [];
            let calls = 0;
            let maxPending = 0;
            const decompressConfig = {
                deflate: (bytes) => {
                    calls++;
                    return new Promise((resolve) => {
                        pending.push(() => resolve(bytes));
                        maxPending = Math.max(maxPending, pending.length);
                    });
                }
            };
            const {dataView, chunks} = buildTextChunks(
                Array.from({length: NUMBER_OF_CHUNKS}, (_, index) => getZtxtChunk('k' + index, toBytes('v' + index)))
            );

            const {readTagsPromise} = PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig);
            let resolved = false;
            readTagsPromise.then(() => {
                resolved = true;
            });

            const pendingPerRound = [];
            await flushPromises();
            while (pending.length > 0) {
                pendingPerRound.push(pending.length);
                expect(resolved).to.be.false;
                pending.splice(0).reverse().forEach((resolve) => resolve());
                await flushPromises();
            }

            expect(resolved).to.be.true;
            expect(pendingPerRound).to.deep.equal([4, 4, 2]);
            expect(maxPending).to.equal(MAX_DECOMPRESSIONS_IN_FLIGHT);
            expect(calls).to.equal(NUMBER_OF_CHUNKS);
            expect(await readTagsPromise).to.deep.equal(getExpectedTags(0, NUMBER_OF_CHUNKS));
        });

        it('should keep the other chunks when one decompression fails', async () => {
            const decompressConfig = {
                deflate: (bytes) => {
                    if (new TextDecoder().decode(bytes) === 'v1') {
                        return Promise.reject(new Error('Broken chunk.'));
                    }
                    return bytes;
                }
            };
            const {dataView, chunks} = buildTextChunks(
                Array.from({length: 3}, (_, index) => getZtxtChunk('k' + index, toBytes('v' + index)))
            );

            const unknownCompressionValue = '<text using unknown compression>';

            const tags = await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig).readTagsPromise;

            expect(tags).to.deep.equal([
                {readTags: {k0: {value: 'v0', description: 'v0'}}},
                {readTags: {k1: {value: unknownCompressionValue, description: unknownCompressionValue}}},
                {readTags: {k2: {value: 'v2', description: 'v2'}}}
            ]);
        });

        it('should give the placeholder for a zTXt chunk with an unknown compression method and keep the good chunk', async () => {
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_ZTXT, bytes: concatBytes(toBytes('bad\x00\x05'), toBytes('whatever'))},
                getTextChunk('good', 'fine')
            ]);
            const unknownCompressionValue = '<text using unknown compression>';

            const {readTags, readTagsPromise} = PngTextTags.read(dataView, chunks, true);

            expect(readTags).to.deep.equal({good: {value: 'fine', description: 'fine'}});
            expect(await readTagsPromise).to.deep.equal([
                {readTags: {bad: {value: unknownCompressionValue, description: unknownCompressionValue}}}
            ]);
        });

        it('should give the placeholder for a compressed iTXt chunk with an unknown compression method and keep the good chunk', async () => {
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_ITXT, bytes: concatBytes(toBytes('bad\x00\x01\x05\x00\x00'), toBytes('whatever'))},
                getUncompressedItxtChunk('good', 'fine')
            ]);
            const unknownCompressionValue = '<text using unknown compression>';

            const {readTags, readTagsPromise} = PngTextTags.read(dataView, chunks, true);

            expect(readTags).to.deep.equal({good: {value: 'fine', description: 'fine'}});
            expect(await readTagsPromise).to.deep.equal([
                {readTags: {bad: {value: unknownCompressionValue, description: unknownCompressionValue}}}
            ]);
        });

        it('should give the placeholder for raw profile chunks with an unknown compression method', async () => {
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_ZTXT, bytes: toBytes('Raw profile type exif\x00\x05whatever')},
                {type: TYPE_ITXT, bytes: toBytes('Raw profile type iptc\x00\x01\x05\x00\x00whatever')}
            ]);
            const unknownCompressionValue = '<text using unknown compression>';
            const placeholderTag = {value: unknownCompressionValue, description: unknownCompressionValue};

            const tags = await PngTextTags.read(dataView, chunks, true).readTagsPromise;

            expect(tags).to.deep.equal([
                {readTags: {'Raw profile type exif': placeholderTag}},
                {readTags: {'Raw profile type iptc': placeholderTag}}
            ]);
        });

        it('should not decompress anything when async is not passed', () => {
            let calls = 0;
            const decompressConfig = {
                deflate: (bytes) => {
                    calls++;
                    return bytes;
                }
            };
            const {dataView, chunks} = buildTextChunks(
                Array.from({length: 3}, (_, index) => getZtxtChunk('k' + index, toBytes('v' + index)))
            );

            const {readTags, readTagsPromise} = PngTextTags.read(dataView, chunks, false, false, false, undefined, decompressConfig);

            expect(calls).to.equal(0);
            expect(readTagsPromise).to.be.undefined;
            expect(readTags).to.deep.equal({});
        });

        it('should give the placeholder for chunks whose decompression function throws, keep the others, and leave no unhandled rejection', async () => {
            const unhandledRejections = [];
            const onUnhandledRejection = (reason) => unhandledRejections.push(reason);
            process.on('unhandledRejection', onUnhandledRejection);
            try {
                const decompressConfig = {
                    deflate: (bytes) => {
                        const value = new TextDecoder().decode(bytes);
                        if (value === 'v1' || value === 'v4') {
                            throw new Error(`Broken ${value}.`);
                        }
                        return bytes;
                    }
                };
                const {dataView, chunks} = buildTextChunks(
                    Array.from({length: 6}, (_, index) => getZtxtChunk('k' + index, toBytes('v' + index)))
                );
                const unknownCompressionValue = '<text using unknown compression>';

                const {readTagsPromise} = PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig);

                const tags = await readTagsPromise;
                await flushPromises();

                expect(tags).to.deep.equal([
                    {readTags: {k0: {value: 'v0', description: 'v0'}}},
                    {readTags: {k1: {value: unknownCompressionValue, description: unknownCompressionValue}}},
                    {readTags: {k2: {value: 'v2', description: 'v2'}}},
                    {readTags: {k3: {value: 'v3', description: 'v3'}}},
                    {readTags: {k4: {value: unknownCompressionValue, description: unknownCompressionValue}}},
                    {readTags: {k5: {value: 'v5', description: 'v5'}}}
                ]);
                expect(unhandledRejections).to.deep.equal([]);
            } finally {
                process.removeListener('unhandledRejection', onUnhandledRejection);
            }
        });

        it('should stop keeping decompressed text once the total of all chunks reaches the shared limit', async () => {
            const VALUE_LENGTH = 4 * 1024;
            const MAX_DECOMPRESSED_SIZE = 10 * 1024;
            const value = 'A'.repeat(VALUE_LENGTH);
            const compressedValue = new Uint8Array((await compress(toBytes(value))).buffer);
            const {dataView, chunks} = buildTextChunks(
                Array.from({length: 8}, (_, index) => getZtxtChunk('k' + index, compressedValue))
            );
            const decompressConfig = withDecompressBudget({maxDecompressedSize: MAX_DECOMPRESSED_SIZE});
            const unknownCompressionValue = '<text using unknown compression>';

            const restoreWarn = swapProperties(console, {warn: () => undefined});
            let tags;
            try {
                tags = await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig).readTagsPromise;
            } finally {
                restoreWarn();
            }

            const values = tags.map((tag, index) => tag.readTags['k' + index].value);
            const fullValues = values.filter((tagValue) => tagValue === value);
            const skippedValues = values.filter((tagValue) => tagValue !== value);
            expect(tags).to.have.lengthOf(8);
            expect(skippedValues).to.deep.equal(Array(skippedValues.length).fill(unknownCompressionValue));
            expect(fullValues.length * VALUE_LENGTH).to.be.at.most(MAX_DECOMPRESSED_SIZE);
            expect(fullValues).to.not.be.empty;
            expect(skippedValues).to.not.be.empty;
        });

        function getExpectedTags(start, end) {
            const tags = [];
            for (let i = start; i < end; i++) {
                tags.push({readTags: {['k' + i]: {value: 'v' + i, description: 'v' + i}}});
            }
            return tags;
        }

        function flushPromises() {
            return new Promise(setImmediate);
        }
    });

    describe('truncated compressed text chunks', () => {
        const unknownCompressionValue = '<text using unknown compression>';

        it('should give the placeholder without calling a custom deflate function for a zTXt chunk that ends after its compression method', async () => {
            const {decompressConfig, calledValues} = getRecordingDecompressConfig('deflate');
            const {dataView, chunks} = buildTextChunks([
                getZtxtChunk('k', new Uint8Array(0)),
                getZtxtChunk('good', toBytes('fine'))
            ]);

            const tags = await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig).readTagsPromise;

            expect(tags).to.deep.equal([
                {readTags: {k: {value: unknownCompressionValue, description: unknownCompressionValue}}},
                {readTags: {good: {value: 'fine', description: 'fine'}}}
            ]);
            expect(calledValues).to.deep.equal(['fine']);
        });

        it('should give the placeholder without calling a custom brotli function for zTXt chunks with compression method 1', async () => {
            const {decompressConfig, calledValues} = getRecordingDecompressConfig('brotli');
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_ZTXT, bytes: toBytes('k\x00\x01')},
                {type: TYPE_ZTXT, bytes: toBytes('good\x00\x01fine')}
            ]);

            const tags = await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig).readTagsPromise;

            expect(tags).to.deep.equal([
                {readTags: {k: {value: unknownCompressionValue, description: unknownCompressionValue}}},
                {readTags: {good: {value: unknownCompressionValue, description: unknownCompressionValue}}}
            ]);
            expect(calledValues).to.deep.equal([]);
        });

        it('should give the placeholder without calling a custom brotli function for a compressed iTXt chunk with compression method 1', async () => {
            const {decompressConfig, calledValues} = getRecordingDecompressConfig('brotli');
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_ITXT, bytes: concatBytes(toBytes('keyword\x00\x01\x01\x00\x00'), toBytes('fine'))}
            ]);

            const tags = await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig).readTagsPromise;

            expect(tags).to.deep.equal([
                {readTags: {keyword: {value: unknownCompressionValue, description: unknownCompressionValue}}}
            ]);
            expect(calledValues).to.deep.equal([]);
        });

        it('should give the placeholder without calling a custom deflate function for a compressed iTXt chunk that ends after its compression method', async () => {
            const {decompressConfig, calledValues} = getRecordingDecompressConfig('deflate');
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_ITXT, bytes: toBytes('k\x00\x01\x00')},
                getCompressedItxtChunk('good', toBytes('fine'))
            ]);

            const tags = await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig).readTagsPromise;

            expect(tags).to.deep.equal([
                {readTags: {k: {value: unknownCompressionValue, description: unknownCompressionValue}}},
                {readTags: {good: {value: 'fine', description: 'fine'}}}
            ]);
            expect(calledValues).to.deep.equal(['fine']);
        });

        it('should give a compressed iTXt chunk that ends after its compression flag the same tag whether or not a chunk follows it', () => {
            const truncatedItxtChunk = {type: TYPE_ITXT, bytes: toBytes('k\x00\x01')};
            const isolatedChunks = buildTextChunks([truncatedItxtChunk]);
            const followedChunks = buildTextChunks([truncatedItxtChunk, getTextChunk('good', 'fine')]);

            const isolated = PngTextTags.read(isolatedChunks.dataView, isolatedChunks.chunks, true, false);
            const followed = PngTextTags.read(followedChunks.dataView, followedChunks.chunks, true, false);

            expect(isolated.readTags.k).to.deep.equal({value: '', description: ''});
            expect(followed.readTags.k).to.deep.equal(isolated.readTags.k);
            expect(isolated.readTagsPromise).to.equal(undefined);
            expect(followed.readTagsPromise).to.equal(undefined);
        });

        it('should give the placeholder without constructing a DecompressionStream for a zTXt chunk that ends after its compression method', async () => {
            const {dataView, chunks} = buildTextChunks([
                getZtxtChunk('k', new Uint8Array(0)),
                getZtxtChunk('good', new Uint8Array((await compress(toBytes('fine'))).buffer))
            ]);
            const OriginalDecompressionStream = globalThis.DecompressionStream;
            let constructed = 0;
            const restore = swapProperties(globalThis, {
                DecompressionStream: class extends OriginalDecompressionStream {
                    constructor(format) {
                        super(format);
                        constructed++;
                    }
                }
            });

            try {
                const tags = await PngTextTags.read(dataView, chunks, true, false).readTagsPromise;

                expect(tags).to.deep.equal([
                    {readTags: {k: {value: unknownCompressionValue, description: unknownCompressionValue}}},
                    {readTags: {good: {value: 'fine', description: 'fine'}}}
                ]);
                expect(constructed).to.equal(1);
            } finally {
                restore();
            }
        });

        function getRecordingDecompressConfig(decompressType) {
            const calledValues = [];
            const decompressConfig = {
                [decompressType]: (bytes) => {
                    calledValues.push(new TextDecoder().decode(bytes));
                    return bytes;
                }
            };
            return {decompressConfig, calledValues};
        }
    });

    describe('text chunk field lengths', () => {
        const KEYWORD_79 = 'K'.repeat(79);
        const KEYWORD_80 = 'K'.repeat(80);
        const LANG_79 = 'l'.repeat(79);
        const LANG_80 = 'l'.repeat(80);
        const ONE_MIB_OF_A = new Uint8Array(1024 * 1024).fill(0x41);

        it('should read a tEXt chunk with a 79-byte keyword', () => {
            const {dataView, chunks} = buildTextChunks([getTextChunk(KEYWORD_79, 'value')]);

            const {readTags} = PngTextTags.read(dataView, chunks);

            expect(readTags).to.deep.equal({[KEYWORD_79]: {value: 'value', description: 'value'}});
        });

        it('should read a tEXt chunk that ends after a 79-byte keyword with no terminator', () => {
            const {dataView, chunks} = buildTextChunks([{type: TYPE_TEXT, bytes: toBytes(KEYWORD_79)}]);

            const {readTags} = PngTextTags.read(dataView, chunks);

            expect(readTags).to.deep.equal({[KEYWORD_79]: {value: '', description: ''}});
        });

        it('should skip a tEXt chunk with an 80-byte keyword and still read the next chunk', () => {
            const {dataView, chunks} = buildTextChunks([
                getTextChunk(KEYWORD_80, 'value'),
                getTextChunk('good', 'fine')
            ]);

            const {readTags} = PngTextTags.read(dataView, chunks);

            expect(readTags).to.deep.equal({good: {value: 'fine', description: 'fine'}});
        });

        it('should skip a tEXt chunk whose keyword has no terminator', () => {
            const {dataView, chunks} = buildTextChunks([{type: TYPE_TEXT, bytes: ONE_MIB_OF_A}]);

            const {readTags} = PngTextTags.read(dataView, chunks);

            expect(readTags).to.deep.equal({});
        });

        it('should skip a zTXt chunk with an 80-byte keyword without decompressing it', () => {
            const {decompressConfig, getCallCount} = getCountingDecompressConfig();
            const {dataView, chunks} = buildTextChunks([getZtxtChunk(KEYWORD_80, toBytes('compressed'))]);

            const {readTags, readTagsPromise} = PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig);

            expect(readTags).to.deep.equal({});
            expect(readTagsPromise).to.be.undefined;
            expect(getCallCount()).to.equal(0);
        });

        it('should skip a compressed iTXt chunk with an 80-byte keyword without decompressing it', () => {
            const {decompressConfig, getCallCount} = getCountingDecompressConfig();
            const {dataView, chunks} = buildTextChunks([getCompressedItxtChunk(KEYWORD_80, toBytes('compressed'))]);

            const {readTags, readTagsPromise} = PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig);

            expect(readTags).to.deep.equal({});
            expect(readTagsPromise).to.be.undefined;
            expect(getCallCount()).to.equal(0);
        });

        it('should read an iTXt chunk with a 79-byte language tag', () => {
            const {dataView, chunks} = buildTextChunks([getItxtChunkWithLang('k', LANG_79, 'tk', 'value')]);

            const {readTags} = PngTextTags.read(dataView, chunks);

            expect(readTags).to.deep.equal({[`k (${LANG_79})`]: {value: 'value', description: 'value'}});
        });

        it('should skip an iTXt chunk with an 80-byte language tag', () => {
            const {dataView, chunks} = buildTextChunks([getItxtChunkWithLang('k', LANG_80, 'tk', 'value')]);

            const {readTags} = PngTextTags.read(dataView, chunks);

            expect(readTags).to.deep.equal({});
        });

        it('should skip an iTXt chunk whose language tag has no terminator', () => {
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_ITXT, bytes: concatBytes(toBytes('k\x00\x00\x00'), ONE_MIB_OF_A)}
            ]);

            const {readTags} = PngTextTags.read(dataView, chunks);

            expect(readTags).to.deep.equal({});
        });

        it('should read an uncompressed iTXt chunk with a long translated keyword', () => {
            const {dataView, chunks} = buildTextChunks([getItxtChunkWithLang('k', 'en', 'T'.repeat(1000), 'value')]);

            const {readTags} = PngTextTags.read(dataView, chunks);

            expect(readTags).to.deep.equal({'k (en)': {value: 'value', description: 'value'}});
        });

        function getCountingDecompressConfig() {
            let callCount = 0;
            const decompressConfig = {
                deflate: (bytes) => {
                    callCount++;
                    return bytes;
                }
            };
            return {decompressConfig, getCallCount: () => callCount};
        }

        function getItxtChunkWithLang(keyword, lang, translatedKeyword, text) {
            return {type: TYPE_ITXT, bytes: toBytes(keyword + '\x00\x00\x00' + lang + '\x00' + translatedKeyword + '\x00' + text)};
        }
    });

    async function getCompressedTagData(type, name, value) {
        const COMPRESSION_FLAG = '\x01';
        const COMPRESSION_METHOD = '\x00';
        const tagDataHeader = getDataView(`${name}\x00` + (type === TYPE_ITXT ? `${COMPRESSION_FLAG}${COMPRESSION_METHOD}en-uk\x00${name}\x00` : COMPRESSION_METHOD));
        const compressedValue = await compress(type === TYPE_ITXT ? new TextEncoder().encode(value) : Uint8Array.from(value, (char) => char.charCodeAt(0)));
        return concatDataViews(tagDataHeader, compressedValue);
    }

    async function compress(text) {
        const compressedStream = new Blob([text]).stream().pipeThrough(
            new CompressionStream('deflate')
        );
        return new DataView(await new Response(compressedStream).arrayBuffer());
    }

    function getItextDataView(keyword, lang, translatedKeyword, text) {
        const encoder = new TextEncoder();
        const parts = [
            encoder.encode(keyword),
            Uint8Array.from([0x00]), // null separator
            Uint8Array.from([0x00, 0x00]), // compression flag + method (no compression)
            encoder.encode(lang),
            Uint8Array.from([0x00]),
            encoder.encode(translatedKeyword),
            Uint8Array.from([0x00]),
            encoder.encode(text),
        ];
        const length = parts.reduce((total, part) => total + part.length, 0);
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const part of parts) {
            bytes.set(part, offset);
            offset += part.length;
        }
        return new DataView(bytes.buffer);
    }

    function getRawProfileValue(type, data) {
        return `\n${type}\n${String(data.length).padStart(8, ' ')}\n${stringToHex(data)}`;
    }

    function getRawProfileValueWithHex(type, data, hex) {
        return `\n${type}\n${String(data.length).padStart(8, ' ')}\n${hex}`;
    }

    function readDecodedExifRawProfile(rawProfileValue) {
        const decoded = [];
        restoreTagReaders = swapProperties(Tags, {
            read: (dataView) => {
                decoded.push(getStringFromDataView(dataView, 0, dataView.byteLength));
                return {tags: {}};
            }
        });
        const {dataView, chunks} = buildTextChunks([getTextChunk('Raw profile type exif', rawProfileValue)]);
        PngTextTags.read(dataView, chunks);
        return decoded;
    }

    function stringToHex(text) {
        return text.split('').map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    }

    function toBufferBackedDataView(dataView) {
        const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
        return new DataViewWrapper(Buffer.from(bytes));
    }

    function getPaddedDataView(contentDataView, pad) {
        const buffer = new ArrayBuffer(pad + contentDataView.byteLength);
        const view = new Uint8Array(buffer);
        view.fill(0x99, 0, pad);
        view.set(new Uint8Array(contentDataView.buffer, contentDataView.byteOffset, contentDataView.byteLength), pad);
        return new DataView(buffer, pad);
    }

    // Each entry becomes a whole PNG chunk (length, type, data, CRC). Pass a larger
    // declaredLength and withCrc: false to make a final chunk that is cut off.
    function buildTextChunks(textChunks) {
        const chunkBytes = textChunks.map(getPngChunkBytes);
        const bytes = new Uint8Array(chunkBytes.reduce((total, chunk) => total + chunk.length, 0));
        const chunks = [];
        let offset = 0;
        for (const chunk of chunkBytes) {
            bytes.set(chunk, offset);
            chunks.push(offset);
            offset += chunk.length;
        }
        return {dataView: new DataView(bytes.buffer), chunks};
    }

    function getPngChunkBytes({type, bytes, declaredLength = bytes.length, withCrc = true}) {
        const typeAndData = concatBytes(toBytes(type), bytes);
        const chunk = new Uint8Array(4 + typeAndData.length + (withCrc ? 4 : 0));
        const chunkView = new DataView(chunk.buffer);
        chunkView.setUint32(0, declaredLength);
        chunk.set(typeAndData, 4);
        if (withCrc) {
            chunkView.setUint32(4 + typeAndData.length, crc32(typeAndData));
        }
        return chunk;
    }

    function getChunkFromDataView(type, dataView) {
        return {type, bytes: new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength)};
    }

    function getZtxtChunk(keyword, compressedBytes) {
        return {type: TYPE_ZTXT, bytes: concatBytes(toBytes(keyword + '\x00\x00'), compressedBytes)};
    }

    function getCompressedItxtChunk(keyword, compressedBytes) {
        return {type: TYPE_ITXT, bytes: concatBytes(toBytes(keyword + '\x00\x01\x00\x00\x00'), compressedBytes)};
    }

    function getTextChunk(keyword, text) {
        return {type: TYPE_TEXT, bytes: toBytes(keyword + '\x00' + text)};
    }

    function getUncompressedItxtChunk(keyword, text) {
        return {type: TYPE_ITXT, bytes: toBytes(keyword + '\x00\x00\x00\x00\x00' + text)};
    }

    function toBytes(text) {
        return Uint8Array.from(text, (char) => char.charCodeAt(0));
    }

    function concatBytes(first, second) {
        const bytes = new Uint8Array(first.length + second.length);
        bytes.set(first);
        bytes.set(second, first.length);
        return bytes;
    }
});
