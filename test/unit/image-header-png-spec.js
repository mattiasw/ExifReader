/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getByteStringFromNumber, getDataView, swapProperties} from './test-utils.js';
import Constants from '../../src/constants.js';
import ImageHeaderPng from '../../src/image-header-png.js';

const PNG_IMAGE_START = '\x89\x50\x4e\x47\x0d\x0a\x1a\x0a';
const CRC_CHECKSUM = '\x00\x00\x00\x00';
const CHUNK_HEADER_SIZE = 8;
const XMP_PREFIX = 'XML:com.adobe.xmp\x00';
const FIRST_CHUNK_DATA_OFFSET = PNG_IMAGE_START.length + CHUNK_HEADER_SIZE;

describe('image-header-png', () => {
    let restoreConstants;

    afterEach(() => {
        if (restoreConstants) {
            restoreConstants();
            restoreConstants = undefined;
        }
    });

    it('should recognize a PNG file', () => {
        expect(ImageHeaderPng.isPngFile(getDataView(PNG_IMAGE_START))).to.be.true;
    });

    it('should not recognize something else as a PNG file', () => {
        expect(ImageHeaderPng.isPngFile(getDataView('RIFFxxxxWEBP'))).to.be.false;
    });

    it('should not recognize undefined input as PNG', () => {
        expect(ImageHeaderPng.isPngFile(undefined)).to.be.false;
    });

    it('should find the image header as a pngFile block', () => {
        const otherChunk = getChunk('abcd', '\x48\x12\x49\x13');

        const blocks = findBlocks(otherChunk + getChunk('IHDR', '\x47\x11'));

        expect(blocks).to.deep.equal([
            {kind: 'pngFile', dataOffset: PNG_IMAGE_START.length + otherChunk.length + CHUNK_HEADER_SIZE},
        ]);
    });

    it('should keep the last image header when there are two', () => {
        const firstChunk = getChunk('IHDR', '\x47\x11');
        const ranges = [];

        const blocks = findBlocks(firstChunk + getChunk('IHDR', '\x47\x12'), ranges);

        expect(blocks).to.deep.equal([
            {kind: 'pngFile', dataOffset: PNG_IMAGE_START.length + firstChunk.length + CHUNK_HEADER_SIZE},
        ]);
        expect(ranges.map((range) => range.block)).to.deep.equal([blocks[0], blocks[0]]);
    });

    it('should find the XMP iTXt chunk as an xmp block', () => {
        const chunkAdditionalFields = '\x00\x00\x00\x00';
        const otherChunk = getChunk('abcd', '\x48\x12\x49\x13');

        const blocks = findBlocks(otherChunk + getChunk('iTXt', `${XMP_PREFIX}${chunkAdditionalFields}\x47\x11`));

        expect(blocks).to.deep.equal([{
            kind: 'xmp',
            chunks: [{
                dataOffset: PNG_IMAGE_START.length + otherChunk.length + CHUNK_HEADER_SIZE + XMP_PREFIX.length + chunkAdditionalFields.length,
                length: 2,
            }],
        }]);
    });

    it('should keep the last XMP iTXt chunk when there are two, listing both', () => {
        const firstChunk = getChunk('iTXt', `${XMP_PREFIX}\x00\x00\x00\x00\x47\x11`);
        const ranges = [];

        const blocks = findBlocks(firstChunk + getChunk('iTXt', `${XMP_PREFIX}\x00\x00\x00\x00\x47\x12\x13`), ranges);

        expect(blocks).to.deep.equal([{
            kind: 'xmp',
            chunks: [{
                dataOffset: PNG_IMAGE_START.length + firstChunk.length + CHUNK_HEADER_SIZE + XMP_PREFIX.length + 4,
                length: 3,
            }],
        }]);
        expect(ranges).to.deep.equal([
            {block: blocks[0], start: PNG_IMAGE_START.length, end: PNG_IMAGE_START.length + firstChunk.length},
            {block: blocks[0], start: PNG_IMAGE_START.length + firstChunk.length, end: PNG_IMAGE_START.length + firstChunk.length + 'iTXt'.length + XMP_PREFIX.length + 4 + 3 + CHUNK_HEADER_SIZE},
        ]);
    });

    it('should not report an XMP iTXt chunk without its two null separators, neither as XMP nor as text', () => {
        const chunkData = `${XMP_PREFIX}\x00\x00ab`;
        const ranges = [];

        const blocks = findBlocks(getByteStringFromNumber(chunkData.length, 4) + 'iTXt' + chunkData, ranges);

        expect(blocks).to.deep.equal([]);
        expect(ranges).to.deep.equal([]);
    });

    describe('text chunks', () => {
        it('should find tEXt and non-XMP iTXt chunks as pngText blocks that point at their text', () => {
            const chunkData0 = 'MyTag0\x00My value.';
            const chunk0 = getChunk('tEXt', chunkData0);
            const chunkData1 = 'MyTag1\x00\x00\x00\x00\x00My other value.';
            const chunk1 = getChunk('iTXt', chunkData1);
            const chunk1DataOffset = PNG_IMAGE_START.length + chunk0.length + CHUNK_HEADER_SIZE;

            const blocks = findBlocks(chunk0 + chunk1);

            expect(blocks).to.deep.equal([
                {kind: 'pngText', text: {chunkType: 'tEXt', name: 'MyTag0', valueOffset: FIRST_CHUNK_DATA_OFFSET + 7, valueLength: chunkData0.length - 7}},
                {kind: 'pngText', text: {chunkType: 'iTXt', name: 'MyTag1', valueOffset: chunk1DataOffset + 11, valueLength: chunkData1.length - 11}},
            ]);
        });

        it('should name an iTXt chunk with a language tag after its keyword and language', () => {
            const chunkData = 'MyTag\x00\x00\x00en\x00Translated\x00Value';

            const blocks = findBlocks(getChunk('iTXt', chunkData));

            expect(blocks[0].text).to.deep.equal({
                chunkType: 'iTXt',
                name: 'MyTag (en)',
                valueOffset: FIRST_CHUNK_DATA_OFFSET + chunkData.indexOf('Value'),
                valueLength: 'Value'.length,
            });
        });

        it('should find zTXt chunks whatever mode the file is read in', () => {
            const chunkData = 'MyTag0\x00\x00My compressed value.';

            const blocks = findBlocks(getChunk('zTXt', chunkData));

            expect(blocks).to.deep.equal([{
                kind: 'pngText',
                compression: 'deflate',
                text: {chunkType: 'zTXt', name: 'MyTag0', valueOffset: FIRST_CHUNK_DATA_OFFSET + 8, valueLength: chunkData.length - 8},
            }]);
        });

        it('should keep the declared length of a text value that runs past the end of the buffer', () => {
            const chunkData = 'MyTag\x00abc';

            const blocks = findBlocks(getByteStringFromNumber(100, 4) + 'tEXt' + chunkData);

            expect(blocks[0].text).to.deep.equal({chunkType: 'tEXt', name: 'MyTag', valueOffset: FIRST_CHUNK_DATA_OFFSET + 6, valueLength: 100 - 6});
        });

        it('should give a text chunk whose keyword is never terminated a name and no value', () => {
            for (const chunkType of ['tEXt', 'iTXt', 'zTXt']) {
                const blocks = findBlocks(getChunk(chunkType, 'abc'));

                expect(blocks, chunkType).to.deep.equal([
                    {kind: 'pngText', text: {chunkType, name: 'abc', valueOffset: undefined, valueLength: undefined}},
                ]);
            }
        });

        it('should give a text chunk with a keyword over 79 bytes a block without a name and still list it', () => {
            const ranges = [];

            const blocks = findBlocks(getChunk('tEXt', `${'A'.repeat(80)}\x00value`), ranges);

            expect(blocks).to.deep.equal([
                {kind: 'pngText', text: {chunkType: 'tEXt', name: undefined, valueOffset: undefined, valueLength: undefined}},
            ]);
            expect(ranges).to.have.lengthOf(1);
            expect(ranges[0].block).to.equal(blocks[0]);
        });

        it('should stop making text-chunk blocks after 4096 text chunks and only list the rest', () => {
            const textChunk = getChunk('tEXt', 'k\x00v');
            const droppedChunks = {tEXt: textChunk, iTXt: getChunk('iTXt', 'i\x00\x00\x00\x00\x00v'), zTXt: getChunk('zTXt', 'z\x00\x00v')};

            for (const chunkType of Object.keys(droppedChunks)) {
                const image = textChunk.repeat(4096) + getChunk('eXIf', '\x01\x02\x03') + droppedChunks[chunkType];
                const ranges = [];

                const blocks = findBlocks(image, ranges);

                expect(blocks, chunkType).to.have.lengthOf(4097);
                expect(blocks.filter((block) => block.text !== undefined), chunkType).to.have.lengthOf(4096);
                expect(blocks[4096], chunkType).to.deep.equal({kind: 'exif', tiffHeaderOffset: PNG_IMAGE_START.length + 4096 * textChunk.length + CHUNK_HEADER_SIZE});
                expect(ranges, chunkType).to.have.lengthOf(4096);
                expect(ranges[4095].block, chunkType).to.equal(blocks[4095]);
                // The last span widened over the eXIf chunk and the dropped text chunk after it.
                expect(ranges[4095].end, chunkType).to.equal(PNG_IMAGE_START.length + image.length);
            }
        });

        it('should give a text chunk with a keyword of 79 bytes its name', () => {
            const blocks = findBlocks(getChunk('tEXt', `${'A'.repeat(79)}\x00value`));

            expect(blocks[0].text.name).to.equal('A'.repeat(79));
        });

        it('should give an iTXt chunk with a language tag over 79 bytes a block without a name', () => {
            const blocks = findBlocks(getChunk('iTXt', `k\x00\x00\x00${'l'.repeat(80)}\x00tk\x00value`));

            expect(blocks).to.deep.equal([
                {kind: 'pngText', text: {chunkType: 'iTXt', name: undefined, valueOffset: undefined, valueLength: undefined}},
            ]);
        });

        describe('keyword classification', () => {
            it('should classify a raw Exif profile chunk as exif', () => {
                const blocks = findBlocks(getChunk('tEXt', 'Raw profile type exif\x00\nexif\n'));

                expect(blocks[0].kind).to.equal('exif');
                expect(blocks[0].text.name).to.equal('Raw profile type exif');
            });

            it('should classify a raw IPTC profile chunk as iptc', () => {
                const blocks = findBlocks(getChunk('tEXt', 'Raw profile type iptc\x00\niptc\n'));

                expect(blocks[0].kind).to.equal('iptc');
            });

            it('should classify a compressed raw profile chunk by its keyword before any decompression', () => {
                const blocks = findBlocks(getChunk('zTXt', 'Raw profile type exif\x00\x00<deflated>') + getChunk('iTXt', 'Raw profile type iptc\x00\x01\x00\x00\x00<deflated>'));

                expect(blocks.map((block) => [block.kind, block.compression])).to.deep.equal([['exif', 'deflate'], ['iptc', 'deflate']]);
            });

            it('should match the keyword without regard to case', () => {
                const blocks = findBlocks(getChunk('tEXt', 'RAW PROFILE TYPE EXIF\x00\nexif\n'));

                expect(blocks[0].kind).to.equal('exif');
            });

            it('should keep a raw XMP profile chunk as pngText', () => {
                const blocks = findBlocks(getChunk('tEXt', 'Raw profile type xmp\x00\nxmp\n'));

                expect(blocks[0].kind).to.equal('pngText');
            });

            it('should keep an iTXt raw profile with a language tag as pngText, since its name carries the language', () => {
                const blocks = findBlocks(getChunk('iTXt', 'Raw profile type exif\x00\x00\x00en\x00\x00\nexif\n'));

                expect(blocks[0].kind).to.equal('pngText');
                expect(blocks[0].text.name).to.equal('Raw profile type exif (en)');
            });

            it('should keep any other keyword as pngText', () => {
                const blocks = findBlocks(getChunk('tEXt', 'Raw profile type exif2\x00\nexif\n'));

                expect(blocks[0].kind).to.equal('pngText');
            });
        });

        describe('compression', () => {
            it('should not set compression on a tEXt chunk', () => {
                const blocks = findBlocks(getChunk('tEXt', 'k\x00\x00v'));

                expect(blocks[0]).to.not.have.property('compression');
            });

            it('should not set compression on an iTXt chunk whose compression flag is 0', () => {
                const blocks = findBlocks(getChunk('iTXt', 'k\x00\x00\x00\x00\x00v'));

                expect(blocks[0]).to.not.have.property('compression');
            });

            it('should set deflate on an iTXt chunk whose compression flag is 1 and method is 0', () => {
                const blocks = findBlocks(getChunk('iTXt', 'k\x00\x01\x00\x00\x00v'));

                expect(blocks[0].compression).to.equal('deflate');
                expect(blocks[0].text.valueOffset).to.equal(FIRST_CHUNK_DATA_OFFSET + 6);
            });

            it('should set unknown on a compressed iTXt chunk whose method is not 0', () => {
                const blocks = findBlocks(getChunk('iTXt', 'k\x00\x01\x02\x00\x00v'));

                expect(blocks[0].compression).to.equal('unknown');
            });

            it('should set unknown on a zTXt chunk whose method is not 0', () => {
                const blocks = findBlocks(getChunk('zTXt', 'k\x00\x01v'));

                expect(blocks[0].compression).to.equal('unknown');
            });

            it('should not set compression on a zTXt chunk that ends right after its keyword', () => {
                const blocks = findBlocks(getChunk('zTXt', 'k\x00'));

                expect(blocks[0]).to.deep.equal({kind: 'pngText', text: {chunkType: 'zTXt', name: 'k', valueOffset: undefined, valueLength: undefined}});
            });

            it('should not set compression on an iTXt chunk that ends right after its compression flag', () => {
                const blocks = findBlocks(getChunk('iTXt', 'k\x00\x01'));

                expect(blocks[0]).to.deep.equal({kind: 'pngText', text: {chunkType: 'iTXt', name: 'k', valueOffset: undefined, valueLength: undefined}});
            });

            it('should set compression on a zTXt chunk that ends right after its method byte, with no value', () => {
                const blocks = findBlocks(getChunk('zTXt', 'k\x00\x00'));

                expect(blocks[0]).to.deep.equal({kind: 'pngText', compression: 'deflate', text: {chunkType: 'zTXt', name: 'k', valueOffset: undefined, valueLength: undefined}});
            });
        });
    });

    describe('iCCP chunks', () => {
        const CHUNK_DATA_HEADER = 'ProfileName\x00\x00';
        const COMPRESSED_PROFILE = '<compressed profile>';
        const ICC_DATA_OFFSET = FIRST_CHUNK_DATA_OFFSET;

        it('should find an iCCP chunk as an icc block with deflate compression whatever mode the file is read in', () => {
            const blocks = findBlocks(getChunk('iCCP', CHUNK_DATA_HEADER + COMPRESSED_PROFILE));

            expect(blocks).to.deep.equal([{
                kind: 'icc',
                compression: 'deflate',
                chunks: [{
                    offset: ICC_DATA_OFFSET + CHUNK_DATA_HEADER.length,
                    length: COMPRESSED_PROFILE.length,
                    chunkNumber: 1,
                    chunksTotal: 1,
                    profileName: 'ProfileName',
                    compressionMethod: 0
                }],
            }]);
        });

        it('should mark an iCCP chunk with another compression method as unknown and keep the method on the chunk', () => {
            const blocks = findBlocks(getChunk('iCCP', 'ProfileName\x00\x01' + COMPRESSED_PROFILE));

            expect(blocks[0].compression).to.equal('unknown');
            expect(blocks[0].chunks[0].compressionMethod).to.equal(1);
        });

        it('should not throw on a truncated iCCP chunk that ends at the profile name', () => {
            // The chunk type and a profile name + null terminator are present, but
            // the buffer ends before the compression-method byte. Reading it must
            // not run past the end of the DataView.
            const chunkDataHeader = 'ProfileName\x00';
            const image = getByteStringFromNumber(chunkDataHeader.length + 1, 4) + 'iCCP' + chunkDataHeader;

            expect(() => findBlocks(image)).to.not.throw();
            expect(findBlocks(image)).to.deep.equal([]);
        });

        describe('profile name bounds', () => {
            it('should accept a profile name of 79 bytes', () => {
                const profileName = 'A'.repeat(79);
                const chunkDataHeader = `${profileName}\x00\x00`;

                const blocks = findBlocks(getChunk('iCCP', chunkDataHeader + COMPRESSED_PROFILE));

                expect(blocks).to.deep.equal([{
                    kind: 'icc',
                    compression: 'deflate',
                    chunks: [{
                        offset: ICC_DATA_OFFSET + chunkDataHeader.length,
                        length: COMPRESSED_PROFILE.length,
                        chunkNumber: 1,
                        chunksTotal: 1,
                        profileName,
                        compressionMethod: 0
                    }],
                }]);
            });

            it('should skip an iCCP chunk with a profile name of 80 bytes, listing no span for it', () => {
                const ranges = [];

                const blocks = findBlocks(getChunk('iCCP', `${'A'.repeat(80)}\x00\x00${COMPRESSED_PROFILE}`), ranges);

                expect(blocks).to.deep.equal([]);
                expect(ranges).to.deep.equal([]);
            });

            it('should stop scanning an unterminated profile name after 80 bytes and continue the chunk walk', () => {
                const iccChunkData = 'A'.repeat(4000);
                const physChunk = getChunk('pHYs', '\x01\x02\x03\x04\x02\x03\x04\x05\x01');
                const bytes = getDataView(PNG_IMAGE_START + getChunk('iCCP', iccChunkData) + physChunk);
                const reads = [];
                class ReadRecordingDataView extends DataView {
                    getUint8(byteOffset) {
                        reads.push(byteOffset);
                        return super.getUint8(byteOffset);
                    }
                }
                const dataView = new ReadRecordingDataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
                const iccDataEnd = ICC_DATA_OFFSET + iccChunkData.length;

                const blocks = ImageHeaderPng.findPngOffsets(dataView);

                expect(blocks).to.deep.equal([{kind: 'pngChunk', dataOffset: iccDataEnd + CRC_CHECKSUM.length}]);
                expect(reads).to.include(ICC_DATA_OFFSET);
                expect(reads.filter((byteOffset) => byteOffset >= ICC_DATA_OFFSET + 80 && byteOffset < iccDataEnd))
                    .to.deep.equal([]);
            });

            it('should skip an iCCP chunk whose declared length ends inside the profile name', () => {
                expect(findBlocks(getByteStringFromNumber(4, 4) + 'iCCP' + 'Name' + '\x00\x00XXXX' + 'more bytes')).to.deep.equal([]);
            });

            it('should skip an iCCP chunk whose declared length ends before the compression method', () => {
                expect(findBlocks(getByteStringFromNumber(5, 4) + 'iCCP' + 'Name\x00' + CRC_CHECKSUM + 'XXXX')).to.deep.equal([]);
            });

            it('should not throw on an unterminated profile name that runs to the end of the buffer', () => {
                const image = getByteStringFromNumber(100, 4) + 'iCCP' + 'Name';

                expect(() => findBlocks(image)).to.not.throw();
                expect(findBlocks(image)).to.deep.equal([]);
            });

            it('should accept an empty profile name', () => {
                const blocks = findBlocks(getChunk('iCCP', '\x00\x00' + COMPRESSED_PROFILE));

                expect(blocks[0].chunks).to.deep.equal([{
                    offset: ICC_DATA_OFFSET + 2,
                    length: COMPRESSED_PROFILE.length,
                    chunkNumber: 1,
                    chunksTotal: 1,
                    profileName: '',
                    compressionMethod: 0
                }]);
            });

            it('should keep an iCCP chunk that ends right after the compression method with length 0', () => {
                const blocks = findBlocks(getChunk('iCCP', 'Name\x00\x00'));

                expect(blocks[0].chunks).to.deep.equal([{
                    offset: ICC_DATA_OFFSET + 6,
                    length: 0,
                    chunkNumber: 1,
                    chunksTotal: 1,
                    profileName: 'Name',
                    compressionMethod: 0
                }]);
            });
        });

        describe('only the first valid iCCP chunk', () => {
            it('should keep only the first of two valid iCCP chunks and link both spans to it', () => {
                const firstChunk = getChunk('iCCP', 'FirstProfile\x00\x00<first profile>');
                const secondChunk = getChunk('iCCP', 'SecondProfile\x00\x00<second profile>');
                const secondChunkStart = PNG_IMAGE_START.length + firstChunk.length;
                const ranges = [];

                const blocks = findBlocks(firstChunk + secondChunk, ranges);

                expect(blocks).to.deep.equal([{
                    kind: 'icc',
                    compression: 'deflate',
                    chunks: [{
                        offset: ICC_DATA_OFFSET + 'FirstProfile\x00\x00'.length,
                        length: '<first profile>'.length,
                        chunkNumber: 1,
                        chunksTotal: 1,
                        profileName: 'FirstProfile',
                        compressionMethod: 0
                    }],
                }]);
                expect(ranges).to.deep.equal([
                    {block: blocks[0], start: PNG_IMAGE_START.length, end: secondChunkStart},
                    {block: blocks[0], start: secondChunkStart, end: secondChunkStart + secondChunk.length},
                ]);
                expect(ranges[1].block).to.equal(blocks[0]);
            });

            it('should keep a single block for many minimal iCCP chunks', () => {
                const blocks = findBlocks(getChunk('iCCP', '\x00\x00').repeat(1000));

                expect(blocks).to.have.lengthOf(1);
                expect(blocks[0].chunks).to.deep.equal([{
                    offset: ICC_DATA_OFFSET + 2,
                    length: 0,
                    chunkNumber: 1,
                    chunksTotal: 1,
                    profileName: '',
                    compressionMethod: 0
                }]);
            });

            it('should keep a valid iCCP chunk that follows one with an invalid profile name', () => {
                const invalidChunk = getChunk('iCCP', `${'A'.repeat(80)}\x00\x00<invalid profile>`);
                const validChunkDataHeader = 'ValidProfile\x00\x00';

                const blocks = findBlocks(invalidChunk + getChunk('iCCP', `${validChunkDataHeader}<valid profile>`));

                expect(blocks[0].chunks).to.deep.equal([{
                    offset: ICC_DATA_OFFSET + invalidChunk.length + validChunkDataHeader.length,
                    length: '<valid profile>'.length,
                    chunkNumber: 1,
                    chunksTotal: 1,
                    profileName: 'ValidProfile',
                    compressionMethod: 0
                }]);
            });
        });
    });

    it('should find pHYs chunks as pngChunk blocks', () => {
        const blocks = findBlocks(getChunk('pHYs', '\x01\x02\x03\x04\x02\x03\x04\x05\x01'));

        expect(blocks).to.deep.equal([{kind: 'pngChunk', dataOffset: PNG_IMAGE_START.length}]);
    });

    it('should find tIME chunks as pngChunk blocks, one block per chunk', () => {
        const timeChunk = getChunk('tIME', '\x01\x02\x03\x04\x05\x06\x07');

        const blocks = findBlocks(timeChunk + timeChunk);

        expect(blocks).to.deep.equal([
            {kind: 'pngChunk', dataOffset: PNG_IMAGE_START.length},
            {kind: 'pngChunk', dataOffset: PNG_IMAGE_START.length + timeChunk.length},
        ]);
    });

    it('should find an eXIf chunk as an exif block', () => {
        const blocks = findBlocks(getChunk('eXIf', '\x01\x02\x03'));

        expect(blocks).to.deep.equal([{kind: 'exif', tiffHeaderOffset: FIRST_CHUNK_DATA_OFFSET}]);
    });

    it('should keep the last eXIf chunk when there are two, listing both', () => {
        const firstChunk = getChunk('eXIf', '\x01\x02\x03');
        const ranges = [];

        const blocks = findBlocks(firstChunk + getChunk('eXIf', '\x04\x05'), ranges);

        expect(blocks).to.deep.equal([{kind: 'exif', tiffHeaderOffset: PNG_IMAGE_START.length + firstChunk.length + CHUNK_HEADER_SIZE}]);
        expect(ranges.map((range) => range.block)).to.deep.equal([blocks[0], blocks[0]]);
    });

    it('should report the image header even if PNG file tags are excluded from custom build', () => {
        restoreConstants = swapProperties(Constants, {USE_PNG: true, USE_PNG_FILE: false});
        const otherChunk = getChunk('abcd', '\x48\x12\x49\x13');

        expect(findBlocks(otherChunk + getChunk('IHDR', '\x47\x11'))).to.deep.equal([
            {kind: 'pngFile', dataOffset: PNG_IMAGE_START.length + otherChunk.length + CHUNK_HEADER_SIZE},
        ]);
    });

    it('should report an XMP iTXt chunk as XMP, not as text, even if XMP is excluded from custom build', () => {
        restoreConstants = swapProperties(Constants, {USE_XMP: false});
        const chunkAdditionalFields = '\x00\x00\x00\x00';
        const ranges = [];

        const blocks = findBlocks(getChunk('iTXt', XMP_PREFIX + chunkAdditionalFields + '\x47\x11'), ranges);

        expect(blocks).to.deep.equal([{
            kind: 'xmp',
            chunks: [{
                dataOffset: FIRST_CHUNK_DATA_OFFSET + XMP_PREFIX.length + chunkAdditionalFields.length,
                length: 2,
            }],
        }]);
        expect(ranges.map((range) => range.block.kind)).to.deep.equal(['xmp']);
    });

    it('should report an iCCP chunk even if ICC is excluded from custom build', () => {
        restoreConstants = swapProperties(Constants, {USE_ICC: false});
        const ranges = [];

        const blocks = findBlocks(getChunk('iCCP', 'ProfileName\x00\x00<compressed profile>'), ranges);

        expect(blocks.map((block) => block.kind)).to.deep.equal(['icc']);
        expect(ranges.map((range) => range.block.kind)).to.deep.equal(['icc']);
    });

    describe('ranges', () => {
        it('should not attach truncated to the blocks when ranges are not asked for', () => {
            const blocks = findBlocks(getChunk('IHDR', '\x47\x11'));

            expect(blocks).to.not.have.property('truncated');
        });

        it('should list the span of every recognized chunk, linked to its block', () => {
            const ihdrChunk = getChunk('IHDR', '\x47\x11');
            const exifChunk = getChunk('eXIf', '\x01\x02\x03');
            const xmpChunk = getChunk('iTXt', `${XMP_PREFIX}\x00\x00\x00\x00\x47\x11`);
            const textChunk = getChunk('tEXt', 'MyTag0\x00My value.');
            const ztxtChunk = getChunk('zTXt', 'MyTag1\x00\x00My compressed value.');
            const iccpChunk = getChunk('iCCP', 'ProfileName\x00\x00<compressed profile>');
            const physChunk = getChunk('pHYs', '\x01\x02\x03\x04\x02\x03\x04\x05\x01');
            const timeChunk = getChunk('tIME', '\x01\x02\x03\x04\x05\x06\x07');
            const otherChunk = getChunk('abcd', '\x48\x12\x49\x13');
            const chunks = [ihdrChunk, exifChunk, xmpChunk, textChunk, ztxtChunk, iccpChunk, physChunk, otherChunk, timeChunk];
            const ranges = [];

            const blocks = findBlocks(chunks.join(''), ranges);

            const expectedRanges = [];
            let start = PNG_IMAGE_START.length;
            for (let i = 0; i < chunks.length; i++) {
                if (chunks[i] !== otherChunk) {
                    expectedRanges.push({block: blocks[expectedRanges.length], start, end: start + chunks[i].length});
                }
                start += chunks[i].length;
            }
            expect(blocks.map((block) => block.kind)).to.deep.equal(['pngFile', 'exif', 'xmp', 'pngText', 'pngText', 'icc', 'pngChunk', 'pngChunk']);
            expect(ranges).to.deep.equal(expectedRanges);
            for (let i = 0; i < ranges.length; i++) {
                expect(ranges[i].block).to.equal(blocks[i]);
            }
        });

        it('should widen the last span instead of recording more than 4096 chunks', () => {
            const emptyChunk = getChunk('pHYs', '');
            const iendChunk = getChunk('IEND', '');
            const ranges = [];

            const blocks = findBlocks(emptyChunk.repeat(5000) + iendChunk, ranges);

            expect(blocks).to.have.lengthOf(5000);
            expect(ranges).to.have.lengthOf(4096);
            expect(ranges[0]).to.deep.equal({block: blocks[0], start: 8, end: 20});
            expect(ranges[4095]).to.deep.equal({block: blocks[4095], start: 8 + 4095 * 12, end: 8 + 5000 * 12});
            expect(ranges.truncated).to.equal(false);
        });

        it('should mark the ranges as truncated when IEND was not reached', () => {
            const ranges = [];

            findBlocks(getChunk('IHDR', '\x47\x11'), ranges);

            expect(ranges.truncated).to.equal(true);
        });

        it('should mark the ranges as not truncated when IEND was reached', () => {
            const ranges = [];

            findBlocks(getChunk('IHDR', '\x47\x11') + getChunk('IEND', ''), ranges);

            expect(ranges.truncated).to.equal(false);
        });
    });

    function findBlocks(chunks, ranges) {
        return ImageHeaderPng.findPngOffsets(getDataView(PNG_IMAGE_START + chunks), ranges);
    }

    function getChunk(type, data) {
        return getByteStringFromNumber(data.length, 4) + type + data + CRC_CHECKSUM;
    }
});
