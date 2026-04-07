/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export default {
    read
};

const CODESTREAM_SIGNATURE_SIZE = 2;
const SIZE_U32_BITS = [9, 13, 18, 30];
const RATIOS = [0, 1, 12 / 10, 4 / 3, 3 / 2, 16 / 9, 5 / 4, 2];

function read(dataView, codestreamOffset) {
    const tags = {};

    try {
        const reader = createBitReader(dataView, codestreamOffset + CODESTREAM_SIGNATURE_SIZE);
        const {height, width} = parseSizeHeader(reader);

        tags['Image Height'] = {value: height, description: `${height}px`};
        tags['Image Width'] = {value: width, description: `${width}px`};
    } catch (_error) {
        // Truncated or malformed data.
    }

    return tags;
}

function parseSizeHeader(reader) {
    const small = reader.readBits(1);
    let height;
    let width;

    if (small) {
        height = (reader.readBits(5) + 1) * 8;
        const ratio = reader.readBits(3);
        width = ratio === 0 ? (reader.readBits(5) + 1) * 8 : Math.ceil(height * RATIOS[ratio]);
    } else {
        height = readSizeU32(reader);
        const ratio = reader.readBits(3);
        width = ratio === 0 ? readSizeU32(reader) : Math.ceil(height * RATIOS[ratio]);
    }

    return {height, width};
}

function readSizeU32(reader) {
    const selector = reader.readBits(2);
    return 1 + reader.readBits(SIZE_U32_BITS[selector]);
}

function createBitReader(dataView, byteOffset) {
    let currentByte = byteOffset;
    let currentBit = 0;

    return {
        readBits(n) {
            let value = 0;
            for (let i = 0; i < n; i++) {
                if (currentByte >= dataView.byteLength) {
                    throw new Error('Unexpected end of data');
                }
                const bit = (dataView.getUint8(currentByte) >> currentBit) & 1;
                value |= (bit << i);
                currentBit++;
                if (currentBit >= 8) {
                    currentBit = 0;
                    currentByte++;
                }
            }
            return value;
        }
    };
}
