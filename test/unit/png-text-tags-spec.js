/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, concatDataViews, swapProperties} from './test-utils.js';
import {TYPE_TEXT, TYPE_ITXT, TYPE_ZTXT} from '../../src/image-header-png.js';
import PngTextTags from '../../src/png-text-tags.js';
import Tags from '../../src/tags.js';
import IptcTags from '../../src/iptc-tags.js';
import {getStringFromDataView, withDecompressBudget} from '../../src/utils.js';
import DataViewWrapper from '../../src/dataview.js';

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
        const dataView = getDataView(tagDatatEXt + tagDataiTXt);
        const chunks = [
            {type: TYPE_TEXT, offset: 0, length: tagDatatEXt.length},
            {type: TYPE_ITXT, offset: tagDatatEXt.length, length: tagDataiTXt.length},
        ];

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
        const dataView = getPaddedDataView(tagDatatEXt, 4);
        const chunks = [
            {type: TYPE_TEXT, offset: 0, length: tagDatatEXt.length}
        ];

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(readTags['MyTag0']).to.deep.equal({
            value: 'My value.',
            description: 'My value.'
        });
    });

    it('should not read past the end of an iTXt chunk that is cut off after its compression flag', () => {
        const tagData = 'Comment\x00\x01';
        const dataView = getDataView(tagData);
        const chunks = [
            {type: TYPE_ITXT, offset: 0, length: 100}
        ];

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(readTags['Comment']).to.deep.equal({
            value: '',
            description: ''
        });
    });

    it('should read a tEXt tag from a Node Buffer backed DataView wrapper', () => {
        const tagDatatEXt = 'MyTag0\x00My value.';
        const dataView = toBufferBackedDataView(getDataView(tagDatatEXt));
        const chunks = [
            {type: TYPE_TEXT, offset: 0, length: tagDatatEXt.length}
        ];

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(readTags['MyTag0']).to.deep.equal({
            value: 'My value.',
            description: 'My value.'
        });
    });

    it('should read an uncompressed iTXt tag from a Node Buffer backed DataView wrapper', () => {
        const text = 'My value.';
        const dataView = toBufferBackedDataView(getItextDataView('MyTagUtf8', 'en', 'MyTagUtf8', text));
        const chunks = [
            {type: TYPE_ITXT, offset: 0, length: dataView.byteLength}
        ];

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(readTags['MyTagUtf8 (en)']).to.deep.equal({
            value: text,
            description: text
        });
    });

    it('should read a compressed zTXt tag from a Node Buffer backed DataView wrapper', async () => {
        const dataView = toBufferBackedDataView(await getCompressedTagData(TYPE_ZTXT, 'MyTag', 'My compressed zTXt value.'));
        const chunks = [
            {type: TYPE_ZTXT, offset: 0, length: dataView.byteLength}
        ];

        const {readTagsPromise} = PngTextTags.read(dataView, chunks, true);
        const tags = await readTagsPromise;

        expect(tags[0].readTags['MyTag']).to.deep.equal({
            value: 'My compressed zTXt value.',
            description: 'My compressed zTXt value.'
        });
    });

    it('should read compressed zTXt tags', async () => {
        const dataView = await getCompressedTagData(TYPE_ZTXT, 'MyTag', 'My compressed zTXt value.');
        const chunks = [
            {type: TYPE_ZTXT, offset: 0, length: dataView.byteLength}
        ];

        const {readTagsPromise} = PngTextTags.read(dataView, chunks, true);
        const tags = await readTagsPromise;

        expect(tags[0].readTags['MyTag']).to.deep.equal({
            value: 'My compressed zTXt value.',
            description: 'My compressed zTXt value.'
        });
    });

    it('should read uncompressed iTXt tags with UTF-8 text', () => {
        const text = 'My emoji value: 🏔️✨';
        const dataView = getItextDataView('MyTagUtf8', 'en', 'MyTagUtf8', text);
        const chunks = [
            {type: TYPE_ITXT, offset: 0, length: dataView.byteLength}
        ];

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
    //     const dataView = await getCompressedTagData(TYPE_ITXT, 'MyTag', text);
    //     const chunks = [
    //         {type: TYPE_ITXT, offset: 0, length: dataView.byteLength}
    //     ];

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
        const dataView = await getCompressedTagData(TYPE_ZTXT, 'Raw profile type exif', `\nexif\n${('' + EXIF_DATA.length).padStart(8, ' ')}\n${stringToHex(EXIF_DATA)}`);
        const chunks = [
            {type: TYPE_ZTXT, offset: 0, length: dataView.byteLength}
        ];

        const {readTagsPromise} = PngTextTags.read(dataView, chunks, true);
        const tags = await readTagsPromise;

        expect(tags[0].embeddedExifTags).to.equal(EXIF_DATA.substring(6));
    });

    it('should read zTXt tags with IPTC data', async () => {
        restoreTagReaders = swapProperties(IptcTags, {
            read: (data, offset) => getStringFromDataView(data, offset, data.byteLength)
        });
        const IPTC_DATA = '<IPTC data>';
        const dataView = await getCompressedTagData(TYPE_ZTXT, 'Raw profile type iptc', `\niptc\n${('' + IPTC_DATA.length).padStart(8, ' ')}\n${stringToHex(IPTC_DATA)}`);
        const chunks = [
            {type: TYPE_ZTXT, offset: 0, length: dataView.byteLength}
        ];

        const {readTagsPromise} = PngTextTags.read(dataView, chunks, true);
        const tags = await readTagsPromise;

        expect(tags[0].embeddedIptcTags).to.equal(IPTC_DATA);
    });

    it('should ignore tags that use compression when async is not passed', async () => {
        const dataView = await getCompressedTagData(TYPE_ZTXT, 'MyTag', 'My compressed zTXt value.');
        const chunks = [
            {type: TYPE_ZTXT, offset: 0, length: dataView.byteLength}
        ];

        const {readTags, readTagsPromise} = PngTextTags.read(dataView, chunks);

        expect(readTagsPromise).to.be.undefined;
        expect(readTags).to.deep.equal({});
    });

    it('should use custom deflate function when decompressConfig is provided', async () => {
        const name = 'MyTag';
        const value = 'Custom deflate result.';
        const compressedBytes = new Uint8Array([1, 2, 3]);
        const headerStr = `${name}\x00\x00`;
        const header = getDataView(headerStr);
        const dataView = concatDataViews(header, new DataView(compressedBytes.buffer));
        const chunks = [
            {type: TYPE_ZTXT, offset: 0, length: dataView.byteLength}
        ];

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
        const dataView = getDataView(tagData);
        const chunks = [
            {type: TYPE_TEXT, offset: 0, length: tagData.length}
        ];

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(Object.keys(readTags)).to.deep.equal(['__proto__']);
        expect(Object.getPrototypeOf(readTags)).to.equal(Object.prototype);
        expect(Object.getOwnPropertyDescriptor(readTags, '__proto__').value).to.deep.equal({
            value: 'hello',
            description: 'hello'
        });
    });

    it('should keep a compressed tag with the keyword __proto__ as an own tag', async () => {
        const dataView = await getCompressedTagData(TYPE_ZTXT, '__proto__', 'hello');
        const chunks = [
            {type: TYPE_ZTXT, offset: 0, length: dataView.byteLength}
        ];

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

    it('should read an uncompressed tag with the keyword __exif as a text tag', () => {
        const tagData = '__exif\x00FROMFILE';
        const dataView = getDataView(tagData);
        const chunks = [
            {type: TYPE_TEXT, offset: 0, length: tagData.length}
        ];

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

            const unknownCompressionValue = '<text using unknown compression>'.split('');

            const tags = await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig).readTagsPromise;

            expect(tags).to.deep.equal([
                {readTags: {k0: {value: 'v0', description: 'v0'}}},
                {readTags: {k1: {value: unknownCompressionValue, description: unknownCompressionValue}}},
                {readTags: {k2: {value: 'v2', description: 'v2'}}}
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
                const unknownCompressionValue = '<text using unknown compression>'.split('');

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
            const unknownCompressionValue = '<text using unknown compression>'.split('');

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
        const unknownCompressionValue = '<text using unknown compression>'.split('');

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

        it('should give the placeholder without calling a custom brotli function for a zTXt chunk that ends after its compression method', async () => {
            const {decompressConfig, calledValues} = getRecordingDecompressConfig('brotli');
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_ZTXT, bytes: toBytes('k\x00\x01')},
                {type: TYPE_ZTXT, bytes: toBytes('good\x00\x01fine')}
            ]);

            const tags = await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig).readTagsPromise;

            expect(tags).to.deep.equal([
                {readTags: {k: {value: unknownCompressionValue, description: unknownCompressionValue}}},
                {readTags: {good: {value: 'fine', description: 'fine'}}}
            ]);
            expect(calledValues).to.deep.equal(['fine']);
        });

        it('should give the fallback tag without calling a custom deflate function for a compressed iTXt chunk that ends after its compression method', async () => {
            const truncatedChunk = {type: TYPE_ITXT, bytes: toBytes('k\x00\x01\x00')};
            const truncatedOnly = buildTextChunks([truncatedChunk]);
            const [fallbackTag] = await PngTextTags.read(truncatedOnly.dataView, truncatedOnly.chunks, true).readTagsPromise;
            const {decompressConfig, calledValues} = getRecordingDecompressConfig('deflate');
            const {dataView, chunks} = buildTextChunks([
                truncatedChunk,
                getCompressedItxtChunk('good', toBytes('fine'))
            ]);

            const tags = await PngTextTags.read(dataView, chunks, true, false, false, undefined, decompressConfig).readTagsPromise;

            expect(tags).to.deep.equal([fallbackTag, {readTags: {good: {value: 'fine', description: 'fine'}}}]);
            expect(tags[0].readTags.k.value).to.deep.equal(unknownCompressionValue);
            expect(calledValues).to.deep.equal(['fine']);
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

    function stringToHex(text) {
        return text.split('').map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    }

    function toBufferBackedDataView(dataView) {
        const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
        return new DataViewWrapper(Buffer.from(bytes));
    }

    function getPaddedDataView(content, pad) {
        const buffer = new ArrayBuffer(pad + content.length);
        const view = new Uint8Array(buffer);
        view.fill(0x99, 0, pad);
        for (let i = 0; i < content.length; i++) {
            view[pad + i] = content.charCodeAt(i);
        }
        return new DataView(buffer, pad);
    }

    function buildTextChunks(textChunks) {
        const length = textChunks.reduce((total, {bytes}) => total + bytes.length, 0);
        const bytes = new Uint8Array(length);
        const chunks = [];
        let offset = 0;
        for (const textChunk of textChunks) {
            bytes.set(textChunk.bytes, offset);
            chunks.push({type: textChunk.type, offset, length: textChunk.bytes.length});
            offset += textChunk.bytes.length;
        }
        return {dataView: new DataView(bytes.buffer), chunks};
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
