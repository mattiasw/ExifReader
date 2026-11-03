/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {
    getDataView,
    concatDataViews,
    swapProperties,
    LINEAR_TIME_TIMEOUT_MS,
    expectAsyncTimeRatioBelow
} from './test-utils.js';
import ImageHeaderPng, {TYPE_TEXT, TYPE_ITXT, TYPE_ZTXT} from '../../src/image-header-png.js';
import PngTextTags, {hasRawIptcProfile} from '../../src/png-text-tags.js';
import {createContext} from '../../src/engine.js';
import {createTagFilter} from '../../src/tag-filter.js';
import {getStringFromDataView, withDecompressBudget} from '../../src/utils.js';
import {crc32, inflateSync} from 'node:zlib';

const PNG_SIGNATURE = '\x89PNG\r\n\x1a\n';
const UNKNOWN_COMPRESSION_VALUE = '<text using unknown compression>';
const PLACEHOLDER_TAG = {value: UNKNOWN_COMPRESSION_VALUE, description: UNKNOWN_COMPRESSION_VALUE};
const MAX_COMPRESSED_TEXT_CHUNKS = 255;

describe('png-text-tags', () => {
    describe('text tags', () => {
        it('should read a tEXt and an iTXt tag', () => {
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_TEXT, bytes: toBytes('MyTag0\x00My value.')},
                {type: TYPE_ITXT, bytes: toBytes('MyTag1\x00\x00\x00fr\x00MyFrTag1\x00My second value.')},
            ]);

            const {tags, results} = readAllSync(dataView, chunks);

            expect(tags['MyTag0']).to.deep.equal({value: 'My value.', description: 'My value.'});
            expect(tags['MyTag1 (fr)']).to.deep.equal({value: 'My second value.', description: 'My second value.'});
            expect(results[0]).to.deep.equal({tags: {MyTag0: {value: 'My value.', description: 'My value.'}}});
        });

        it('should read a tEXt value relative to the DataView when it has a non-zero byteOffset', () => {
            const textChunks = buildTextChunks([{type: TYPE_TEXT, bytes: toBytes('MyTag0\x00My value.')}]);
            const dataView = getPaddedDataView(textChunks.dataView, 4);

            const {tags} = readAllSync(dataView, textChunks.chunks);

            expect(tags['MyTag0']).to.deep.equal({value: 'My value.', description: 'My value.'});
        });

        it('should not read past the end of an iTXt chunk that is cut off after its compression flag', () => {
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_ITXT, bytes: toBytes('Comment\x00\x01'), declaredLength: 100, withCrc: false}
            ]);

            const {tags} = readAllSync(dataView, chunks);

            expect(tags['Comment']).to.deep.equal({value: '', description: ''});
        });

        it('should read the bytes that are there for a tEXt chunk whose declared length runs past the end of the buffer', () => {
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_TEXT, bytes: toBytes('MyTag\x00abc'), declaredLength: 100, withCrc: false}
            ]);

            const {tags} = readAllSync(dataView, chunks);

            expect(tags['MyTag']).to.deep.equal({value: 'abc', description: 'abc'});
        });

        it('should keep the Latin-1 bytes of a tEXt value as its description even when they would decode as UTF-8', () => {
            const {dataView, chunks} = buildTextChunks([getTextChunk('k', 'h\xc3\xa9')]);

            const {tags} = readAllSync(dataView, chunks);

            expect(tags.k).to.deep.equal({value: 'h\xc3\xa9', description: 'h\xc3\xa9'});
        });

        it('should read a tEXt tag with empty text when TextDecoder is missing', () => {
            const {dataView, chunks} = buildTextChunks([{type: TYPE_TEXT, bytes: toBytes('Comment\x00')}]);
            const restoreGlobal = swapProperties(globalThis, {TextDecoder: undefined});

            let tags;
            try {
                ({tags} = readAllSync(dataView, chunks));
            } finally {
                restoreGlobal();
            }

            expect(tags['Comment']).to.deep.equal({value: '', description: ''});
        });

        it('should read an uncompressed iTXt tag relative to the DataView when it has a non-zero byteOffset', () => {
            const text = 'My value.';
            const textChunks = buildTextChunks([getChunkFromDataView(TYPE_ITXT, getItextDataView('MyTagUtf8', 'en', 'MyTagUtf8', text))]);
            const dataView = getPaddedDataView(textChunks.dataView, 4);

            const {tags} = readAllSync(dataView, textChunks.chunks);

            expect(tags['MyTagUtf8 (en)']).to.deep.equal({value: text, description: text});
        });

        it('should read uncompressed iTXt tags with UTF-8 text', () => {
            const text = 'My emoji value: 🏔️✨';
            const {dataView, chunks} = buildTextChunks([getChunkFromDataView(TYPE_ITXT, getItextDataView('MyTagUtf8', 'en', 'MyTagUtf8', text))]);

            const {tags} = readAllSync(dataView, chunks);

            expect(tags['MyTagUtf8 (en)']).to.deep.equal({value: text, description: text});
        });

        it('should keep an uncompressed tag with the keyword __proto__ as an own tag', () => {
            const {dataView, chunks} = buildTextChunks([{type: TYPE_TEXT, bytes: toBytes('__proto__\x00hello')}]);

            const {tags} = readAllSync(dataView, chunks).results[0];

            expect(Object.keys(tags)).to.deep.equal(['__proto__']);
            expect(Object.getPrototypeOf(tags)).to.equal(Object.prototype);
            expect(Object.getOwnPropertyDescriptor(tags, '__proto__').value).to.deep.equal({value: 'hello', description: 'hello'});
        });

        it('should append _ to an uncompressed tag with the keyword of an Object.prototype method', () => {
            const {dataView, chunks} = buildTextChunks([{type: TYPE_TEXT, bytes: toBytes('hasOwnProperty\x00hello')}]);

            const {tags} = readAllSync(dataView, chunks).results[0];

            expect(Object.keys(tags)).to.deep.equal(['hasOwnProperty_']);
            expect(tags.hasOwnProperty_).to.deep.equal({value: 'hello', description: 'hello'});
            expect(tags.hasOwnProperty).to.equal(Object.prototype.hasOwnProperty);
        });

        it('should read an uncompressed tag with the keyword __exif as a text tag', () => {
            const {dataView, chunks} = buildTextChunks([{type: TYPE_TEXT, bytes: toBytes('__exif\x00FROMFILE')}]);

            const {tags} = readAllSync(dataView, chunks);

            expect(tags).to.deep.equal({__exif: {value: 'FROMFILE', description: 'FROMFILE'}});
        });

        it('should give nothing for a plain text chunk when the tag filter does not parse the png group', () => {
            const {dataView, chunks} = buildTextChunks([getTextChunk('MyTag', 'My value.')]);

            const {results} = readAllSync(dataView, chunks, {tagFilter: createTagFilter({includeTags: {exif: true}})});

            expect(results).to.deep.equal([undefined]);
        });

        it('should filter the text tags by the tag filter', () => {
            const {dataView, chunks} = buildTextChunks([getTextChunk('Kept', 'a'), getTextChunk('Dropped', 'b')]);

            const {tags, results} = readAllSync(dataView, chunks, {tagFilter: createTagFilter({includeTags: {png: ['Kept']}})});

            expect(tags).to.deep.equal({Kept: {value: 'a', description: 'a'}});
            expect(results[1]).to.deep.equal({tags: {}});
        });
    });

    describe('raw profiles', () => {
        const EXIF_DATA = 'Exif\0\0MM\0\x2a\0\0\0\x08<ifd>';
        const IPTC_DATA = '\x1c\x02\x05\x00\x01I';

        it('should emit an exif block for a tEXt Exif raw profile that decodes the profile on demand', () => {
            const {dataView, chunks} = buildTextChunks([getTextChunk('Raw profile type exif', getRawProfileValue('exif', EXIF_DATA))]);

            const {results} = readAllSync(dataView, chunks);

            expect(results[0].tags).to.deep.equal({});
            expect(results[0].blocks).to.have.lengthOf(1);
            const block = results[0].blocks[0];
            expect(block).to.include({kind: 'exif', tiffHeaderOffset: 6, origin: 'rawProfile', decompressed: false});
            expect(block.getDataView).to.be.a('function');
            expect(getStringFromDataView(block.getDataView(), 0, EXIF_DATA.length)).to.equal(EXIF_DATA);
            expect(getStringFromDataView(block.getDataView(), 0, EXIF_DATA.length)).to.equal(EXIF_DATA);
        });

        it('should emit an iptc block for a tEXt IPTC raw profile that decodes the profile on demand', () => {
            const {dataView, chunks} = buildTextChunks([getTextChunk('Raw profile type iptc', getRawProfileValue('iptc', IPTC_DATA))]);

            const {results} = readAllSync(dataView, chunks);

            expect(results[0].tags).to.deep.equal({});
            const block = results[0].blocks[0];
            expect(block).to.include({kind: 'iptc', dataOffset: 0, origin: 'rawProfile', decompressed: false});
            expect(getStringFromDataView(block.getDataView(), 0, IPTC_DATA.length)).to.equal(IPTC_DATA);
        });

        it('should emit an exif block for an uncompressed iTXt Exif raw profile', () => {
            const {dataView, chunks} = buildTextChunks([getUncompressedItxtChunk('Raw profile type exif', getRawProfileValue('exif', EXIF_DATA))]);

            const {results} = readAllSync(dataView, chunks);

            expect(results[0].blocks[0].kind).to.equal('exif');
            expect(getStringFromDataView(results[0].blocks[0].getDataView(), 0, EXIF_DATA.length)).to.equal(EXIF_DATA);
        });

        it('should match the raw profile keyword case-insensitively', () => {
            const {dataView, chunks} = buildTextChunks([getTextChunk('RAW PROFILE TYPE EXIF', getRawProfileValue('exif', EXIF_DATA))]);

            const {results} = readAllSync(dataView, chunks);

            expect(results[0].blocks[0].kind).to.equal('exif');
        });

        it('should keep a raw profile chunk whose payload is not of its keyword\'s type as a plain text tag', () => {
            const exifValue = getRawProfileValue('exif', EXIF_DATA);
            const iptcValue = getRawProfileValue('iptc', IPTC_DATA);
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', iptcValue),
                getTextChunk('Raw profile type iptc', exifValue),
                getTextChunk('Raw profile type xmp', '\nxmp\n       1\n78'),
            ]);

            const {results} = readAllSync(dataView, chunks);

            expect(results).to.deep.equal([
                {tags: {'Raw profile type exif': {value: iptcValue, description: iptcValue}}},
                {tags: {'Raw profile type iptc': {value: exifValue, description: exifValue}}},
                {tags: {'Raw profile type xmp': {value: '\nxmp\n       1\n78', description: '\nxmp\n       1\n78'}}},
            ]);
        });

        it('should throw from getDataView on every call for a profile with a bad header, never a RangeError', () => {
            const {dataView, chunks} = buildTextChunks([getTextChunk('Raw profile type exif', '\nexif\nnot a count\n4578')]);

            const {results} = readAllSync(dataView, chunks);

            const {getDataView: decode} = results[0].blocks[0];
            expect(decode).to.throw(Error, 'Invalid raw profile header.');
            expect(decode).to.throw(Error, 'Invalid raw profile header.');
        });

        it('should throw from getDataView for a profile with an odd number of hex digits', () => {
            const {dataView, chunks} = buildTextChunks([getTextChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0MM') + '0')]);

            const {results} = readAllSync(dataView, chunks);

            expect(results[0].blocks[0].getDataView).to.throw(Error, 'Odd number of hex digits in raw profile.');
        });

        const EVERY_NIBBLE_DATA = '\x01\x23\x45\x67\x89\xab\xcd\xef\xfe\xdc\xba\x98\x76\x54\x32\x10';

        it('should decode uppercase hex digits in a raw profile like lowercase ones', () => {
            const hex = stringToHex(EVERY_NIBBLE_DATA);

            expect(decodeExifRawProfile(getRawProfileValueWithHex('exif', EVERY_NIBBLE_DATA, hex.toUpperCase()))).to.equal(EVERY_NIBBLE_DATA);
        });

        it('should decode raw profile hex split into lines, also inside a digit pair, into a view covering its whole buffer', () => {
            const data = EVERY_NIBBLE_DATA.repeat(3);
            const splitHex = stringToHex(data).replace(/(.{72})/g, '$1\n');
            const hex = splitHex.slice(0, 37) + '\n' + splitHex.slice(37);
            const {dataView, chunks} = buildTextChunks([getTextChunk('Raw profile type exif', getRawProfileValueWithHex('exif', data, hex))]);

            const view = readAllSync(dataView, chunks).results[0].blocks[0].getDataView();

            expect(getStringFromDataView(view, 0, view.byteLength)).to.equal(data);
            expect(view.byteOffset).to.equal(0);
            expect(view.byteLength).to.equal(view.buffer.byteLength);
        });

        it('should skip spaces, carriage returns and other non-hex characters in a raw profile', () => {
            const separators = [' ', '\r\n', '/', ':', '@', 'G', '`', 'g', '\t'];
            const hex = stringToHex(EVERY_NIBBLE_DATA).split('')
                .map((digit, index) => digit + separators[index % separators.length])
                .join('');

            expect(decodeExifRawProfile(getRawProfileValueWithHex('exif', EVERY_NIBBLE_DATA, hex))).to.equal(EVERY_NIBBLE_DATA);
        });

        function decodeExifRawProfile(rawProfileValue) {
            const {dataView, chunks} = buildTextChunks([getTextChunk('Raw profile type exif', rawProfileValue)]);
            const view = readAllSync(dataView, chunks).results[0].blocks[0].getDataView();
            return getStringFromDataView(view, 0, view.byteLength);
        }
    });

    describe('hasRawIptcProfile', () => {
        const IPTC_DATA = '\x1c\x02\x05\x00\x01I';

        it('should find an uncompressed Raw profile type iptc chunk by its payload', () => {
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type iptc', getRawProfileValue('exif', 'Exif\0\0')),
                getTextChunk('Raw profile type iptc', getRawProfileValue('iptc', IPTC_DATA)),
            ]);

            expect(hasRawIptcProfile(chunks, dataView)).to.equal(true);
            expect(hasRawIptcProfile([chunks[0]], dataView)).to.equal(false);
        });

        it('should find a compressed Raw profile type iptc chunk by its keyword alone', () => {
            const {dataView, chunks} = buildTextChunks([getZtxtChunk('Raw profile type iptc', toBytes('not even compressed'))]);

            expect(hasRawIptcProfile(chunks, dataView)).to.equal(true);
        });

        it('should not find a compressed Raw profile type iptc chunk past the first 255 named compressed chunks, which read never decompresses', () => {
            const {dataView, chunks} = buildTextChunks([
                ...new Array(255).fill(getZtxtChunk('Other', toBytes('x'))),
                getZtxtChunk('Raw profile type iptc', toBytes('x')),
            ]);

            expect(hasRawIptcProfile(chunks, dataView)).to.equal(false);
            expect(hasRawIptcProfile(chunks.slice(1), dataView)).to.equal(true);
        });

        it('should find nothing in an exif profile, a plain text chunk, a chunk without a name or a block without text', () => {
            const {dataView, chunks} = buildTextChunks([
                getTextChunk('Raw profile type exif', getRawProfileValue('exif', 'Exif\0\0')),
                getTextChunk('Comment', 'text'),
                getTextChunk('K'.repeat(80), 'text'),
            ]);

            expect(chunks[2].text.name).to.be.undefined;
            expect(hasRawIptcProfile(chunks.concat([{kind: 'iptc'}]), dataView)).to.equal(false);
        });
    });

    describe('compressed chunks', () => {
        it('should read a compressed zTXt tag relative to the DataView when it has a non-zero byteOffset', async () => {
            const textChunks = buildTextChunks([
                getChunkFromDataView(TYPE_ZTXT, await getCompressedTagData(TYPE_ZTXT, 'MyTag', 'My compressed zTXt value.'))
            ]);
            const dataView = getPaddedDataView(textChunks.dataView, 4);

            const {tags} = await readAll(dataView, textChunks.chunks);

            expect(tags['MyTag']).to.deep.equal({value: 'My compressed zTXt value.', description: 'My compressed zTXt value.'});
        });

        it('should give a promise for a compressed chunk and read it through the context', async () => {
            const {dataView, chunks} = buildTextChunks([getChunkFromDataView(TYPE_ZTXT, await getCompressedTagData(TYPE_ZTXT, 'MyTag', 'My compressed zTXt value.'))]);
            const context = getContext(dataView, {async: true});

            const result = PngTextTags.read(chunks[0], context);

            expect(result).to.be.instanceOf(Promise);
            expect((await result).tags['MyTag']).to.deep.equal({value: 'My compressed zTXt value.', description: 'My compressed zTXt value.'});
        });

        it('should emit a decompressed exif block for a zTXt Exif raw profile', async () => {
            const EXIF_DATA = 'Exif\0\0<Exif\ndata>';
            const {dataView, chunks} = buildTextChunks([getChunkFromDataView(TYPE_ZTXT, await getCompressedTagData(TYPE_ZTXT, 'Raw profile type exif', getRawProfileValue('exif', EXIF_DATA)))]);

            const {results} = await readAll(dataView, chunks);

            expect(results[0].tags).to.deep.equal({});
            const block = results[0].blocks[0];
            expect(block).to.include({kind: 'exif', tiffHeaderOffset: 6, origin: 'rawProfile', decompressed: true});
            expect(getStringFromDataView(block.getDataView(), 0, EXIF_DATA.length)).to.equal(EXIF_DATA);
        });

        it('should emit a decompressed iptc block for a zTXt IPTC raw profile', async () => {
            const IPTC_DATA = '\x1c\x02\x05\x00\x01I';
            const {dataView, chunks} = buildTextChunks([getChunkFromDataView(TYPE_ZTXT, await getCompressedTagData(TYPE_ZTXT, 'Raw profile type iptc', getRawProfileValue('iptc', IPTC_DATA)))]);

            const {results} = await readAll(dataView, chunks);

            const block = results[0].blocks[0];
            expect(block).to.include({kind: 'iptc', dataOffset: 0, origin: 'rawProfile', decompressed: true});
            expect(getStringFromDataView(block.getDataView(), 0, IPTC_DATA.length)).to.equal(IPTC_DATA);
        });

        it('should use a custom deflate function when the decompression config has one', async () => {
            const value = 'Custom deflate result.';
            const {dataView, chunks} = buildTextChunks([{type: TYPE_ZTXT, bytes: concatBytes(toBytes('MyTag\x00\x00'), new Uint8Array([1, 2, 3]))}]);
            const decompressConfig = {deflate: () => Uint8Array.from(value, (c) => c.charCodeAt(0))};

            const {tags} = await readAll(dataView, chunks, {decompressConfig});

            expect(tags['MyTag']).to.deep.equal({value, description: value});
        });

        it('should give nothing for a compressed tag without a keyword', async () => {
            const {dataView, chunks} = buildTextChunks([getZtxtChunk('', toBytes('My value.'))]);

            const {results} = await readAll(dataView, chunks, {decompressConfig: {deflate: (bytes) => bytes}});

            expect(results).to.deep.equal([undefined]);
        });

        it('should give nothing for a compressed plain text chunk when the tag filter does not parse the png group', async () => {
            const {dataView, chunks} = buildTextChunks([getZtxtChunk('MyTag', toBytes('My value.'))]);

            const {results} = await readAll(dataView, chunks, {
                tagFilter: createTagFilter({includeTags: {exif: true}}),
                decompressConfig: {deflate: (bytes) => bytes},
            });

            expect(results).to.deep.equal([undefined]);
        });

        it('should keep a compressed tag with the keyword __proto__ as an own tag', async () => {
            const {dataView, chunks} = buildTextChunks([getChunkFromDataView(TYPE_ZTXT, await getCompressedTagData(TYPE_ZTXT, '__proto__', 'hello'))]);

            const {tags} = (await readAll(dataView, chunks)).results[0];

            expect(Object.keys(tags)).to.deep.equal(['__proto__']);
            expect(Object.getPrototypeOf(tags)).to.equal(Object.prototype);
            expect(Object.getOwnPropertyDescriptor(tags, '__proto__').value).to.deep.equal({value: 'hello', description: 'hello'});
        });

        it('should append _ to a compressed tag with the keyword of an Object.prototype method', async () => {
            const {dataView, chunks} = buildTextChunks([getChunkFromDataView(TYPE_ZTXT, await getCompressedTagData(TYPE_ZTXT, 'toString', 'hello'))]);

            const {tags} = (await readAll(dataView, chunks)).results[0];

            expect(Object.keys(tags)).to.deep.equal(['toString_']);
            expect(tags.toString_).to.deep.equal({value: 'hello', description: 'hello'});
            expect(String(tags)).to.equal('[object Object]');
        });

        it('should read compressed tags with the keywords __exif and __iptc as text tags', async () => {
            const {dataView, chunks} = buildTextChunks([
                getZtxtChunk('__exif', toBytes('FROMFILE')),
                getZtxtChunk('__iptc', toBytes('FROMFILE'))
            ]);

            const {results} = await readAll(dataView, chunks, {decompressConfig: {deflate: (bytes) => bytes}});

            expect(results).to.deep.equal([
                {tags: {__exif: {value: 'FROMFILE', description: 'FROMFILE'}}},
                {tags: {__iptc: {value: 'FROMFILE', description: 'FROMFILE'}}}
            ]);
        });

        it('should give the placeholder for a chunk whose decompression fails and keep the others', async () => {
            const decompressConfig = {
                deflate: (bytes) => {
                    if (new TextDecoder().decode(bytes) === 'v1') {
                        return Promise.reject(new Error('Broken chunk.'));
                    }
                    return bytes;
                }
            };
            const {dataView, chunks} = buildTextChunks(Array.from({length: 3}, (_, index) => getZtxtChunk('k' + index, toBytes('v' + index))));

            const {results} = await readAll(dataView, chunks, {decompressConfig});

            expect(results).to.deep.equal([
                {tags: {k0: {value: 'v0', description: 'v0'}}},
                {tags: {k1: PLACEHOLDER_TAG}},
                {tags: {k2: {value: 'v2', description: 'v2'}}}
            ]);
        });

        it('should give the placeholder for chunks whose decompression function throws and leave no unhandled rejection', async () => {
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
                const {dataView, chunks} = buildTextChunks(Array.from({length: 6}, (_, index) => getZtxtChunk('k' + index, toBytes('v' + index))));

                const {results} = await readAll(dataView, chunks, {decompressConfig});
                await flushPromises();

                expect(results).to.deep.equal([
                    {tags: {k0: {value: 'v0', description: 'v0'}}},
                    {tags: {k1: PLACEHOLDER_TAG}},
                    {tags: {k2: {value: 'v2', description: 'v2'}}},
                    {tags: {k3: {value: 'v3', description: 'v3'}}},
                    {tags: {k4: PLACEHOLDER_TAG}},
                    {tags: {k5: {value: 'v5', description: 'v5'}}}
                ]);
                expect(unhandledRejections).to.deep.equal([]);
            } finally {
                process.removeListener('unhandledRejection', onUnhandledRejection);
            }
        });

        it('should give the placeholder for a zTXt chunk with an unknown compression method', async () => {
            const {dataView, chunks} = buildTextChunks([{type: TYPE_ZTXT, bytes: concatBytes(toBytes('bad\x00\x05'), toBytes('whatever'))}]);

            const {results} = await readAll(dataView, chunks);

            expect(results).to.deep.equal([{tags: {bad: PLACEHOLDER_TAG}}]);
        });

        it('should give the placeholder for a compressed iTXt chunk with an unknown compression method', async () => {
            const {dataView, chunks} = buildTextChunks([{type: TYPE_ITXT, bytes: concatBytes(toBytes('bad\x00\x01\x05\x00\x00'), toBytes('whatever'))}]);

            const {results} = await readAll(dataView, chunks);

            expect(results).to.deep.equal([{tags: {bad: PLACEHOLDER_TAG}}]);
        });

        it('should give the placeholder as a text tag for raw profile chunks with an unknown compression method', async () => {
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_ZTXT, bytes: toBytes('Raw profile type exif\x00\x05whatever')},
                {type: TYPE_ITXT, bytes: toBytes('Raw profile type iptc\x00\x01\x05\x00\x00whatever')}
            ]);

            const {results} = await readAll(dataView, chunks);

            expect(results).to.deep.equal([
                {tags: {'Raw profile type exif': PLACEHOLDER_TAG}},
                {tags: {'Raw profile type iptc': PLACEHOLDER_TAG}}
            ]);
        });

        it('should stop keeping decompressed text once the total of all chunks reaches the shared limit', async () => {
            const VALUE_LENGTH = 4 * 1024;
            const MAX_DECOMPRESSED_SIZE = 10 * 1024;
            const value = 'A'.repeat(VALUE_LENGTH);
            const compressedValue = new Uint8Array((await compress(toBytes(value))).buffer);
            const {dataView, chunks} = buildTextChunks(Array.from({length: 8}, (_, index) => getZtxtChunk('k' + index, compressedValue)));

            const restoreWarn = swapProperties(console, {warn: () => undefined});
            let results;
            try {
                ({results} = await readAll(dataView, chunks, {decompressConfig: withDecompressBudget({maxDecompressedSize: MAX_DECOMPRESSED_SIZE})}));
            } finally {
                restoreWarn();
            }

            const values = results.map((result, index) => result.tags['k' + index].value);
            const fullValues = values.filter((tagValue) => tagValue === value);
            const skippedValues = values.filter((tagValue) => tagValue !== value);
            expect(results).to.have.lengthOf(8);
            expect(skippedValues).to.deep.equal(Array(skippedValues.length).fill(UNKNOWN_COMPRESSION_VALUE));
            expect(fullValues.length * VALUE_LENGTH).to.be.at.most(MAX_DECOMPRESSED_SIZE);
            expect(fullValues).to.not.be.empty;
            expect(skippedValues).to.not.be.empty;
        });

        it('should tell a later in-flight chunk what the earlier ones left of the shared limit', async () => {
            const VALUE_LENGTH = 1000;
            const MAX_DECOMPRESSED_SIZE = 1500;
            const value = 'A'.repeat(VALUE_LENGTH);
            const compressedValue = new Uint8Array((await compress(toBytes(value))).buffer);
            const {dataView, chunks} = buildTextChunks(Array.from({length: 8}, (_, index) => getZtxtChunk('k' + index, compressedValue)));
            const limits = [];
            const decompressConfig = withDecompressBudget({
                maxDecompressedSize: MAX_DECOMPRESSED_SIZE,
                deflate: (data, {maxOutputLength}) => {
                    limits.push(maxOutputLength);
                    return inflateSync(data, {maxOutputLength});
                }
            });

            const restoreWarn = swapProperties(console, {warn: () => undefined});
            let results;
            try {
                ({results} = await readAll(dataView, chunks, {decompressConfig}));
            } finally {
                restoreWarn();
            }

            const values = results.map((result, index) => result.tags['k' + index].value);
            expect(limits).to.deep.equal([MAX_DECOMPRESSED_SIZE + 1, MAX_DECOMPRESSED_SIZE - VALUE_LENGTH + 1]);
            expect(values).to.deep.equal([value].concat(Array(7).fill(UNKNOWN_COMPRESSION_VALUE)));
        });
    });

    describe('many compressed text chunks', () => {
        it('should decompress only the first 255 of 8000 zTXt chunks, in chunk order, well under a second', async function () {
            this.timeout(LINEAR_TIME_TIMEOUT_MS);
            this.retries(2);
            const compressedValue = new Uint8Array((await compress(Uint8Array.from([0x76]))).buffer);
            const baseline = buildZtxtChunks(MAX_COMPRESSED_TEXT_CHUNKS, compressedValue);
            const {dataView, chunks} = buildZtxtChunks(8000, compressedValue);

            // The 7745 chunks past the cap are only header-parsed; decompressing all 8000 is about 31 times the baseline.
            const {results} = await expectAsyncTimeRatioBelow(
                () => readAll(baseline.dataView, baseline.chunks),
                () => readAll(dataView, chunks),
                8
            );

            // The finder reports the first 4096 text chunks only.
            expect(chunks).to.have.lengthOf(4096);
            expect(results.slice(0, MAX_COMPRESSED_TEXT_CHUNKS)).to.deep.equal(getExpectedResults(0, MAX_COMPRESSED_TEXT_CHUNKS).map((result, i) => ({tags: {['k' + i]: {value: 'v', description: 'v'}}})));
            expect(results.slice(MAX_COMPRESSED_TEXT_CHUNKS)).to.deep.equal(Array(chunks.length - MAX_COMPRESSED_TEXT_CHUNKS).fill(undefined));
        });

        function buildZtxtChunks(numberOfChunks, compressedValue) {
            return buildTextChunks(Array.from({length: numberOfChunks}, (_, index) => getZtxtChunk('k' + index, compressedValue)));
        }

        it('should call a custom decompression function for at most 255 chunks of one context', async () => {
            let calls = 0;
            const decompressConfig = {
                deflate: (bytes) => {
                    calls++;
                    return bytes;
                }
            };
            const {dataView, chunks} = buildTextChunks(Array.from({length: 300}, (_, index) => getZtxtChunk('k' + index, toBytes('v' + index))));

            const {results} = await readAll(dataView, chunks, {decompressConfig});

            expect(calls).to.equal(MAX_COMPRESSED_TEXT_CHUNKS);
            expect(results.slice(0, MAX_COMPRESSED_TEXT_CHUNKS)).to.deep.equal(getExpectedResults(0, MAX_COMPRESSED_TEXT_CHUNKS));
            expect(results.slice(MAX_COMPRESSED_TEXT_CHUNKS)).to.deep.equal(Array(45).fill(undefined));
        });

        it('should count the chunks per context', async () => {
            const {dataView, chunks} = buildTextChunks(Array.from({length: 300}, (_, index) => getZtxtChunk('k' + index, toBytes('v' + index))));
            const decompressConfig = {deflate: (bytes) => bytes};

            const first = await readAll(dataView, chunks, {decompressConfig});
            const second = await readAll(dataView, chunks, {decompressConfig});

            expect(first.results.filter(Boolean)).to.have.lengthOf(MAX_COMPRESSED_TEXT_CHUNKS);
            expect(second.results.filter(Boolean)).to.have.lengthOf(MAX_COMPRESSED_TEXT_CHUNKS);
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

            const {results} = await readAll(dataView, chunks, {decompressConfig});

            expect(calledValues).to.have.lengthOf(MAX_COMPRESSED_TEXT_CHUNKS);
            expect(calledValues).to.not.include('v255');
            expect(results.slice(0, MAX_COMPRESSED_TEXT_CHUNKS)).to.deep.equal(getExpectedResults(0, MAX_COMPRESSED_TEXT_CHUNKS));
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

            const {tags} = await readAll(dataView, chunks, {decompressConfig});

            expect(tags).to.deep.include({
                First: {value: 'first value', description: 'first value'},
                Middle: {value: 'middle value', description: 'middle value'},
                Last: {value: 'last value', description: 'last value'},
                LastItxt: {value: 'last iTXt value', description: 'last iTXt value'}
            });
            expect(calls).to.equal(MAX_COMPRESSED_TEXT_CHUNKS);
            expect(tags.k254).to.deep.equal({value: 'v254', description: 'v254'});
            expect(tags.k255).to.be.undefined;
        });

        function getExpectedResults(start, end) {
            const results = [];
            for (let i = start; i < end; i++) {
                results.push({tags: {['k' + i]: {value: 'v' + i, description: 'v' + i}}});
            }
            return results;
        }
    });

    describe('truncated compressed text chunks', () => {
        it('should give the placeholder without calling a custom deflate function for a zTXt chunk that ends after its compression method', async () => {
            const {decompressConfig, calledValues} = getRecordingDecompressConfig('deflate');
            const {dataView, chunks} = buildTextChunks([
                getZtxtChunk('k', new Uint8Array(0)),
                getZtxtChunk('good', toBytes('fine'))
            ]);

            const {results} = await readAll(dataView, chunks, {decompressConfig});

            expect(results).to.deep.equal([
                {tags: {k: PLACEHOLDER_TAG}},
                {tags: {good: {value: 'fine', description: 'fine'}}}
            ]);
            expect(calledValues).to.deep.equal(['fine']);
        });

        it('should give the placeholder without calling a custom brotli function for zTXt chunks with compression method 1', async () => {
            const {decompressConfig, calledValues} = getRecordingDecompressConfig('brotli');
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_ZTXT, bytes: toBytes('k\x00\x01')},
                {type: TYPE_ZTXT, bytes: toBytes('good\x00\x01fine')}
            ]);

            const {results} = await readAll(dataView, chunks, {decompressConfig});

            expect(results).to.deep.equal([{tags: {k: PLACEHOLDER_TAG}}, {tags: {good: PLACEHOLDER_TAG}}]);
            expect(calledValues).to.deep.equal([]);
        });

        it('should give the placeholder without calling a custom brotli function for a compressed iTXt chunk with compression method 1', async () => {
            const {decompressConfig, calledValues} = getRecordingDecompressConfig('brotli');
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_ITXT, bytes: concatBytes(toBytes('keyword\x00\x01\x01\x00\x00'), toBytes('fine'))}
            ]);

            const {results} = await readAll(dataView, chunks, {decompressConfig});

            expect(results).to.deep.equal([{tags: {keyword: PLACEHOLDER_TAG}}]);
            expect(calledValues).to.deep.equal([]);
        });

        it('should give the placeholder without calling a custom deflate function for a compressed iTXt chunk that ends after its compression method', async () => {
            const {decompressConfig, calledValues} = getRecordingDecompressConfig('deflate');
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_ITXT, bytes: toBytes('k\x00\x01\x00')},
                getCompressedItxtChunk('good', toBytes('fine'))
            ]);

            const {results} = await readAll(dataView, chunks, {decompressConfig});

            expect(results).to.deep.equal([
                {tags: {k: PLACEHOLDER_TAG}},
                {tags: {good: {value: 'fine', description: 'fine'}}}
            ]);
            expect(calledValues).to.deep.equal(['fine']);
        });

        it('should give a compressed iTXt chunk that ends after its compression flag the same tag whether or not a chunk follows it', () => {
            const truncatedItxtChunk = {type: TYPE_ITXT, bytes: toBytes('k\x00\x01')};
            const isolatedChunks = buildTextChunks([truncatedItxtChunk]);
            const followedChunks = buildTextChunks([truncatedItxtChunk, getTextChunk('good', 'fine')]);

            const isolated = readAllSync(isolatedChunks.dataView, isolatedChunks.chunks, {async: true});
            const followed = readAllSync(followedChunks.dataView, followedChunks.chunks, {async: true});

            expect(isolated.tags.k).to.deep.equal({value: '', description: ''});
            expect(followed.tags.k).to.deep.equal(isolated.tags.k);
            expect(isolated.results[0]).to.not.be.instanceOf(Promise);
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
                const {results} = await readAll(dataView, chunks);

                expect(results).to.deep.equal([
                    {tags: {k: PLACEHOLDER_TAG}},
                    {tags: {good: {value: 'fine', description: 'fine'}}}
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

            const {tags} = readAllSync(dataView, chunks);

            expect(tags).to.deep.equal({[KEYWORD_79]: {value: 'value', description: 'value'}});
        });

        it('should read a tEXt chunk that ends after a 79-byte keyword with no terminator', () => {
            const {dataView, chunks} = buildTextChunks([{type: TYPE_TEXT, bytes: toBytes(KEYWORD_79)}]);

            const {tags} = readAllSync(dataView, chunks);

            expect(tags).to.deep.equal({[KEYWORD_79]: {value: '', description: ''}});
        });

        it('should skip a tEXt chunk with an 80-byte keyword and still read the next chunk', () => {
            const {dataView, chunks} = buildTextChunks([
                getTextChunk(KEYWORD_80, 'value'),
                getTextChunk('good', 'fine')
            ]);

            const {tags, results} = readAllSync(dataView, chunks);

            expect(results[0]).to.be.undefined;
            expect(tags).to.deep.equal({good: {value: 'fine', description: 'fine'}});
        });

        it('should skip a tEXt chunk whose keyword has no terminator', () => {
            const {dataView, chunks} = buildTextChunks([{type: TYPE_TEXT, bytes: ONE_MIB_OF_A}]);

            const {results} = readAllSync(dataView, chunks);

            expect(results).to.deep.equal([undefined]);
        });

        it('should skip a zTXt chunk with an 80-byte keyword without decompressing it', () => {
            const {decompressConfig, getCallCount} = getCountingDecompressConfig();
            const {dataView, chunks} = buildTextChunks([getZtxtChunk(KEYWORD_80, toBytes('compressed'))]);

            const {results} = readAllSync(dataView, chunks, {async: true, decompressConfig});

            expect(results).to.deep.equal([undefined]);
            expect(getCallCount()).to.equal(0);
        });

        it('should skip a compressed iTXt chunk with an 80-byte keyword without decompressing it', () => {
            const {decompressConfig, getCallCount} = getCountingDecompressConfig();
            const {dataView, chunks} = buildTextChunks([getCompressedItxtChunk(KEYWORD_80, toBytes('compressed'))]);

            const {results} = readAllSync(dataView, chunks, {async: true, decompressConfig});

            expect(results).to.deep.equal([undefined]);
            expect(getCallCount()).to.equal(0);
        });

        it('should read an iTXt chunk with a 79-byte language tag', () => {
            const {dataView, chunks} = buildTextChunks([getItxtChunkWithLang('k', LANG_79, 'tk', 'value')]);

            const {tags} = readAllSync(dataView, chunks);

            expect(tags).to.deep.equal({[`k (${LANG_79})`]: {value: 'value', description: 'value'}});
        });

        it('should skip an iTXt chunk with an 80-byte language tag', () => {
            const {dataView, chunks} = buildTextChunks([getItxtChunkWithLang('k', LANG_80, 'tk', 'value')]);

            const {results} = readAllSync(dataView, chunks);

            expect(results).to.deep.equal([undefined]);
        });

        it('should skip an iTXt chunk whose language tag has no terminator', () => {
            const {dataView, chunks} = buildTextChunks([
                {type: TYPE_ITXT, bytes: concatBytes(toBytes('k\x00\x00\x00'), ONE_MIB_OF_A)}
            ]);

            const {results} = readAllSync(dataView, chunks);

            expect(results).to.deep.equal([undefined]);
        });

        it('should read an uncompressed iTXt chunk with a long translated keyword', () => {
            const {dataView, chunks} = buildTextChunks([getItxtChunkWithLang('k', 'en', 'T'.repeat(1000), 'value')]);

            const {tags} = readAllSync(dataView, chunks);

            expect(tags).to.deep.equal({'k (en)': {value: 'value', description: 'value'}});
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

    // The decompression config is given as is: a test that wants the shared
    // decompression budget wraps it with withDecompressBudget itself.
    function getContext(dataView, {async = false, tagFilter = createTagFilter(), decompressConfig = undefined} = {}) {
        return createContext({dataView, options: {async}, tagFilter, decompressConfig});
    }

    // Reads every block with one context, as the engine does for a file, and
    // keeps each result, the text tags merged across the results and the
    // emitted blocks.
    function readAllSync(dataView, chunks, options) {
        const context = getContext(dataView, options);
        return collectResults(chunks.map((block) => PngTextTags.read(block, context)));
    }

    function readAll(dataView, chunks, options = {}) {
        const context = getContext(dataView, Object.assign({async: true}, options));
        return Promise.all(chunks.map((block) => PngTextTags.read(block, context))).then(collectResults);
    }

    function collectResults(results) {
        const tags = {};
        const blocks = [];
        for (const result of results) {
            if (result === undefined) {
                continue;
            }
            for (const name of Object.keys(result.tags)) {
                Object.defineProperty(tags, name, {value: result.tags[name], enumerable: true, writable: true, configurable: true});
            }
            blocks.push(...(result.blocks || []));
        }
        return {tags, blocks, results};
    }

    function flushPromises() {
        return new Promise(setImmediate);
    }

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

    function stringToHex(text) {
        return text.split('').map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    }

    function getPaddedDataView(contentDataView, pad) {
        const buffer = new ArrayBuffer(pad + contentDataView.byteLength);
        const view = new Uint8Array(buffer);
        view.fill(0x99, 0, pad);
        view.set(new Uint8Array(contentDataView.buffer, contentDataView.byteOffset, contentDataView.byteLength), pad);
        return new DataView(buffer, pad);
    }

    // Each entry becomes a whole PNG chunk (length, type, data, CRC) after the PNG
    // signature, and `chunks` holds the text-chunk blocks the real PNG finder
    // reports for them. Pass a larger declaredLength and withCrc: false to make a
    // final chunk that is cut off.
    function buildTextChunks(textChunks) {
        const chunkBytes = [toBytes(PNG_SIGNATURE)].concat(textChunks.map(getPngChunkBytes));
        const bytes = new Uint8Array(chunkBytes.reduce((total, chunk) => total + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunkBytes) {
            bytes.set(chunk, offset);
            offset += chunk.length;
        }
        const dataView = new DataView(bytes.buffer);
        const chunks = ImageHeaderPng.findPngOffsets(dataView).filter((block) => block.text !== undefined);
        return {dataView, chunks};
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
