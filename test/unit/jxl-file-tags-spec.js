/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import JxlFileTags from '../../src/jxl-file-tags';

describe('jxl-file-tags', () => {
    describe('non-small images', () => {
        it('should parse 1x1 image (U32 selector 0, 9 bits)', () => {
            // small=0, U32 sel=0 (2 bits), height value=0 (9 bits) → height=1
            // ratio=0 (3 bits), U32 sel=0, width value=0 (9 bits) → width=1
            // Bit layout (LSB first within each byte):
            //   bit 0: small=0
            //   bits 1-2: selector=0 (00)
            //   bits 3-11: height_value=0 (000000000)
            //   bits 12-14: ratio=0 (000)
            //   bits 15-16: selector=0 (00)
            //   bits 17-25: width_value=0 (000000000)
            // All zeros → 4 zero bytes suffice (26 bits needed)
            const dataView = getDataView('\xff\x0a\x00\x00\x00\x00');
            const tags = JxlFileTags.read(dataView, 0);

            expect(tags['Image Width'].value).to.equal(1);
            expect(tags['Image Width'].description).to.equal('1px');
            expect(tags['Image Height'].value).to.equal(1);
            expect(tags['Image Height'].description).to.equal('1px');
        });

        it('should parse image with U32 selector 1 (13-bit values)', () => {
            // Encoding 500x606:
            // small=0
            // height U32: sel=1 (01 LSB-first), value=605 (13 bits LSB-first)
            //   605 = 0b0001001011101
            //   LSB-first 13 bits: 1,0,1,1,1,0,1,0,0,1,0,0,0
            // ratio=0 (000)
            // width U32: sel=0 (00), value=499 (9 bits LSB-first)
            //   499 = 0b111110011
            //   LSB-first 9 bits: 1,1,0,0,1,1,1,1,1
            //
            // Full bitstream:
            //   0: small=0
            //   1-2: sel=1 → 10 (LSB first for 01)
            //   3-15: 605 → 1011101001000
            //   16-18: ratio=0 → 000
            //   19-20: sel=0 → 00
            //   21-29: 499 → 110011111
            //
            // Pack into bytes (LSB first):
            //   byte 0 bits 0-7: 0,1,0,1,0,1,1,1 = 0b11101010 = 0xea
            //   byte 1 bits 0-7: 0,1,0,0,1,0,0,0 = 0b00010010 = 0x12
            //   byte 2 bits 0-7: 0,0,0,0,0,1,1,0 = 0b01100000 = 0x60
            //   byte 3 bits 0-7: 0,1,1,1,1,1,0,0 = 0b00111110 = 0x3e (wait...)
            // Let me recalculate carefully.

            // Bitstream positions:
            // pos 0: small=0
            // pos 1: sel bit0=1 (LSB of 01)
            // pos 2: sel bit1=0
            // pos 3-15: 605 in 13 bits LSB first
            //   605 = 512+64+16+8+4+1 = 0b01001011101
            //   Hmm, 605 in binary: 512+64+16+8+4+1=605. 0b1001011101 = 605. That's 10 bits.
            //   13 bits: 0001001011101
            //   LSB first: 1,0,1,1,1,0,1,0,0,1,0,0,0
            // pos 16-18: ratio=0 → 0,0,0
            // pos 19-20: sel=0 → 0,0
            // pos 21-29: 499 in 9 bits LSB first
            //   499 = 256+128+64+32+16+2+1 = 499. 0b111110011
            //   LSB first: 1,1,0,0,1,1,1,1,1
            //
            // Byte packing (pos→bit within byte):
            // Byte 0: pos0=0, pos1=1, pos2=0, pos3=1, pos4=0, pos5=1, pos6=1, pos7=1
            //   = 0b11101010 = 0xea
            // Byte 1: pos8=0, pos9=1, pos10=0, pos11=0, pos12=1, pos13=0, pos14=0, pos15=0
            //   = 0b00010010 = 0x12 (wait, pos8-15 are height bits continued)
            //   pos8=0 (height bit5), pos9=1 (bit6), pos10=0 (bit7), pos11=0 (bit8),
            //   pos12=1 (bit9), pos13=0 (bit10), pos14=0 (bit11), pos15=0 (bit12)
            //   Hmm, 605 LSB-first 13 bits: index 0..12
            //   605 = 0b0001001011101
            //   bit index: 0→1, 1→0, 2→1, 3→1, 4→1, 5→0, 6→1, 7→0, 8→0, 9→1, 10→0, 11→0, 12→0
            //
            // Let me just use the actual bytes from the bench test file.
            // From earlier hex dump: after 0xff 0x0a, the bytes are: ea 12 60 be
            const dataView = getDataView('\xff\x0a\xea\x12\x60\xbe');
            const tags = JxlFileTags.read(dataView, 0);

            expect(tags['Image Height'].value).to.equal(606);
            expect(tags['Image Height'].description).to.equal('606px');
            expect(tags['Image Width'].value).to.equal(500);
            expect(tags['Image Width'].description).to.equal('500px');
        });
    });

    describe('small images', () => {
        it('should parse small image with explicit width', () => {
            // small=1
            // ysize_div8_minus_1=2 (5 bits) → height=(2+1)*8=24
            // ratio=0 (3 bits)
            // xsize_div8_minus_1=3 (5 bits) → width=(3+1)*8=32
            //
            // pos 0: small=1
            // pos 1-5: ysize=2 → 01000 LSB-first (2=0b00010)
            // pos 6-8: ratio=0 → 000
            // pos 9-13: xsize=3 → 11000 LSB-first (3=0b00011)
            //
            // Byte 0: pos0=1, pos1=0, pos2=1, pos3=0, pos4=0, pos5=0, pos6=0, pos7=0
            //   = 0b00000101 = 0x05
            // Byte 1: pos8=0, pos9=1, pos10=1, pos11=0, pos12=0, pos13=0, ...
            //   = 0b00000110 = 0x06
            const dataView = getDataView('\xff\x0a\x05\x06');
            const tags = JxlFileTags.read(dataView, 0);

            expect(tags['Image Height'].value).to.equal(24);
            expect(tags['Image Height'].description).to.equal('24px');
            expect(tags['Image Width'].value).to.equal(32);
            expect(tags['Image Width'].description).to.equal('32px');
        });

        it('should derive width from ratio for small images', () => {
            // small=1
            // ysize_div8_minus_1=11 (5 bits) → height=(11+1)*8=96
            // ratio=1 (3 bits) → width=height=96
            //
            // pos 0: small=1
            // pos 1-5: 11 = 0b01011 → LSB first: 1,1,0,1,0
            // pos 6-8: ratio=1 → LSB first: 1,0,0
            //
            // Byte 0: 1, 1,1,0,1,0, 1,0 = 0b01011011 wait...
            // pos0=1, pos1=1, pos2=1, pos3=0, pos4=1, pos5=0, pos6=1, pos7=0
            //   = 0b01010111 = 0x57
            // Byte 1: pos8=0, ... = 0x00
            const dataView = getDataView('\xff\x0a\x57\x00');
            const tags = JxlFileTags.read(dataView, 0);

            expect(tags['Image Height'].value).to.equal(96);
            expect(tags['Image Width'].value).to.equal(96);
        });
    });

    describe('ratio derivation', () => {
        it('should derive width using ratio 4 (3/2) for non-small image', () => {
            // small=0, height=100, ratio=4
            // height U32: sel=0 (00), value=99 (9 bits) → 1+99=100
            //   99 = 0b001100011, LSB-first: 1,1,0,0,0,1,1,0,0
            // ratio=4 → 100 (3 bits LSB-first)
            //
            // pos 0: small=0
            // pos 1-2: sel=0 → 0,0
            // pos 3-11: 99 LSB → 1,1,0,0,0,1,1,0,0
            // pos 12-14: ratio=4=0b100 LSB → 0,0,1
            //
            // Byte 0: 0, 0,0, 1,1,0,0,0 = 0b00011000 = 0x18
            // Byte 1: 1,1,0,0, 0,0,1, 0 = 0b01001100 = 0x4c (wait)
            // pos8=1 pos9=1 pos10=0 pos11=0 pos12=0 pos13=0 pos14=1 pos15=0(pad)
            // = 0b01000011 = 0x43
            // Actually let me recalculate more carefully:
            // pos 0: 0 (small)
            // pos 1: 0 (sel bit0)
            // pos 2: 0 (sel bit1)
            // pos 3: 1 (99 bit0)
            // pos 4: 1 (99 bit1)
            // pos 5: 0 (99 bit2)
            // pos 6: 0 (99 bit3)
            // pos 7: 0 (99 bit4)
            // byte 0 = bits[7..0] = 0,0,0,1,1,0,0,0 = 0x18
            // pos 8: 1 (99 bit5)
            // pos 9: 1 (99 bit6)
            // pos 10: 0 (99 bit7)
            // pos 11: 0 (99 bit8)
            // pos 12: 0 (ratio bit0)
            // pos 13: 0 (ratio bit1)
            // pos 14: 1 (ratio bit2)
            // pos 15: 0 (pad)
            // byte 1 = bits[15..8] = 0,1,0,0,0,0,1,1 = 0x43
            const dataView = getDataView('\xff\x0a\x18\x43');
            const tags = JxlFileTags.read(dataView, 0);

            expect(tags['Image Height'].value).to.equal(100);
            // width = ceil(100 * 3/2) = 150
            expect(tags['Image Width'].value).to.equal(150);
        });
    });

    describe('bounds checking', () => {
        it('should return empty object for truncated data', () => {
            const dataView = getDataView('\xff\x0a');
            const tags = JxlFileTags.read(dataView, 0);

            expect(tags['Image Width']).to.be.undefined;
            expect(tags['Image Height']).to.be.undefined;
        });

        it('should handle non-zero codestream offset', () => {
            // Prefix with 10 dummy bytes, then the codestream
            const dataView = getDataView('\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\x0a\x00\x00\x00\x00');
            const tags = JxlFileTags.read(dataView, 10);

            expect(tags['Image Width'].value).to.equal(1);
            expect(tags['Image Height'].value).to.equal(1);
        });
    });
});
