/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getByteStringFromNumber} from './test-utils';
import {parseBox, findOffsets, ITEM_INFO_TYPE_EXIF, ITEM_INFO_TYPE_MIME} from '../../src/image-header-iso-bmff.js';

describe('image-header-iso-bmff', () => {
    describe('parseBox', () => {
        it('should return undefined if box length is less than minimum box size', () => {
            expect(parseBox(new DataView(new ArrayBuffer(7)), 0)).to.be.undefined;
        });

        it('should return an undefined box if box type if not handled', () => {
            const dataView = getDataView(getBox('test', '<some content>'));

            expect(parseBox(dataView, 0)).to.deep.equal({type: undefined, length: 22});
        });

        it('should parse box of type ftyp', () => {
            const dataView = getDataView(getBox('ftyp', 'heic'));

            expect(parseBox(dataView, 0)).to.deep.equal({type: 'ftyp', majorBrand: 'heic', length: 0xc});
        });

        it('should parse box of type colr', () => {
            const COLOR_TYPE = 'prof';
            const ICC_CONTENT = '<ICC content>';
            const ICC_LENGTH = ICC_CONTENT.length;
            const dataView = getDataView(
                getBox(
                    'colr',
                    COLOR_TYPE + getByteStringFromNumber(ICC_LENGTH, 4) + ICC_CONTENT
                )
            );

            expect(parseBox(dataView, 0)).to.deep.equal({
                type: 'colr',
                icc: {offset: 12, length: 13, chunkNumber: 1, chunksTotal: 1},
                length: 29
            });
        });

        it('should parse box of type ipco', () => {
            const COLOR_TYPE = 'prof';
            const ICC_CONTENT = '<ICC content>';
            const ICC_LENGTH = ICC_CONTENT.length;

            const dataView = getDataView(
                getBox(
                    'ipco',
                    getBox(
                        'colr',
                        COLOR_TYPE + getByteStringFromNumber(ICC_LENGTH + 4, 4) + ICC_CONTENT
                    )
                )
            );

            expect(parseBox(dataView, 0)).to.deep.equal({
                type: 'ipco',
                properties: [{
                    type: 'colr',
                    icc: {offset: 20, length: 17, chunkNumber: 1, chunksTotal: 1},
                    length: 29
                }],
                length: 37
            });
        });

        it('should parse box of type iprp', () => {
            const COLOR_TYPE = 'prof';
            const ICC_CONTENT = '<ICC content>';
            const ICC_LENGTH = ICC_CONTENT.length;

            const dataView = getDataView(
                getBox(
                    'iprp',
                    getBox(
                        'ipco',
                        getBox(
                            'colr',
                            COLOR_TYPE + getByteStringFromNumber(ICC_LENGTH + 4, 4) + ICC_CONTENT
                        )
                    )
                )
            );

            expect(parseBox(dataView, 0)).to.deep.equal({
                type: 'iprp',
                subBoxes: [{
                    type: 'ipco',
                    properties: [{
                        type: 'colr',
                        icc: {offset: 28, length: 17, chunkNumber: 1, chunksTotal: 1},
                        length: 29
                    }],
                    length: 37
                }],
                length: 45
            });
        });

        it('should parse box of type infe with entry item of type Exif', () => {
            const itemId = getByteStringFromNumber(2, 2);
            const itemProtectionIndex = getByteStringFromNumber(0, 2);
            const itemType = getByteStringFromNumber(ITEM_INFO_TYPE_EXIF, 4);
            const itemName = 'A name\x00';
            const dataView = getDataView(
                getFullBox(
                    'infe',
                    2,
                    itemId + itemProtectionIndex + itemType + itemName,
                )
            );

            expect(parseBox(dataView, 0)).to.deep.equal({
                type: 'infe',
                itemId: 2,
                itemProtectionIndex: 0,
                itemType: ITEM_INFO_TYPE_EXIF,
                itemName: itemName.substring(0, itemName.length - 1),
                length: 27
            });
        });

        it('should parse box of type infe with entry item of type mime', () => {
            const itemId = getByteStringFromNumber(3, 2);
            const itemProtectionIndex = getByteStringFromNumber(0, 2);
            const itemType = getByteStringFromNumber(ITEM_INFO_TYPE_MIME, 4);
            const itemName = '\x00';
            const contentType = 'application/rdf+xml\x00';
            const dataView = getDataView(
                getFullBox(
                    'infe',
                    2,
                    itemId + itemProtectionIndex + itemType + itemName + contentType,
                )
            );

            expect(parseBox(dataView, 0)).to.deep.equal({
                type: 'infe',
                itemId: 3,
                itemProtectionIndex: 0,
                itemType: ITEM_INFO_TYPE_MIME,
                itemName: '',
                contentType: contentType.substring(0, contentType.length - 1),
                length: 41
            });
        });

        it('should parse box of type iinf', () => {
            const entryCount = getByteStringFromNumber(1, 2);
            const itemId = getByteStringFromNumber(2, 2);
            const itemProtectionIndex = getByteStringFromNumber(0, 2);
            const itemType = getByteStringFromNumber(ITEM_INFO_TYPE_EXIF, 4);
            const itemName = '\x00';
            const dataView = getDataView(
                getFullBox(
                    'iinf',
                    0,
                    entryCount
                    + getFullBox(
                        'infe',
                        2,
                        itemId + itemProtectionIndex + itemType + itemName,
                    )
                )
            );

            expect(parseBox(dataView, 0)).to.deep.equal({
                type: 'iinf',
                itemInfos: [{
                    type: 'infe',
                    itemId: 2,
                    itemProtectionIndex: 0,
                    itemType: ITEM_INFO_TYPE_EXIF,
                    itemName: '',
                    length: 21
                }],
                length: 35
            });
        });

        it('should parse box of type meta', () => {
            const dataView = getDataView(
                getFullBox(
                    'meta',
                    0,
                    getFullBox('iloc', 3, '\x00\x00')
                )
            );

            expect(parseBox(dataView, 0)).to.deep.equal({
                type: 'meta',
                subBoxes: [{
                    type: 'iloc',
                    items: [],
                    length: 14
                }],
                length: 26
            });
        });

        it('should parse box of type iloc', () => {
            const offsetSizeAndLengthSize = getByteStringFromNumber(0x44, 1);
            const baseOffsetSizeAndReserved = getByteStringFromNumber(0x40, 1);
            const itemCount = getByteStringFromNumber(1, 2);
            const itemId = getByteStringFromNumber(2, 2);
            const dataReferenceIndex = getByteStringFromNumber(4711, 2);
            const baseOffset = getByteStringFromNumber(4812, 4);
            const extentOffset = getByteStringFromNumber(4913, 4);
            const extentLength = getByteStringFromNumber(5014, 4);
            const extentCount = getByteStringFromNumber(1, 2);
            const dataView = getDataView(
                getFullBox(
                    'iloc',
                    0,
                    offsetSizeAndLengthSize + baseOffsetSizeAndReserved + itemCount
                    + itemId + dataReferenceIndex + baseOffset + extentCount + extentOffset + extentLength
                )
            );

            expect(parseBox(dataView, 0)).to.deep.equal({
                type: 'iloc',
                items: [{
                    itemId: 2,
                    constructionMethod: undefined,
                    dataReferenceIndex: 4711,
                    baseOffset: 4812,
                    extentCount: 1,
                    extents: [{
                        extentIndex: undefined,
                        extentOffset: 4913,
                        extentLength: 5014
                    }]
                }],
                length: 34
            });
        });
    });

    describe('findOffsets', () => {
        it('should not find offsets if there is no meta box', () => {
            const dataView = getDataView('');

            expect(findOffsets(dataView)).to.deep.equal({hasAppMarkers: false});
        });

        it('should find offsets', () => {
            const entryCount = getByteStringFromNumber(2, 2);
            const itemProtectionIndex = getByteStringFromNumber(0, 2);
            const itemName = '\x00';

            // Exif
            const exifItemId = getByteStringFromNumber(2, 2);
            const exifItemType = getByteStringFromNumber(ITEM_INFO_TYPE_EXIF, 4);
            const exifPrefix = 'Exif\x00\x00';
            const tiffHeaderOffset = getByteStringFromNumber(exifPrefix.length, 4);
            const exifData = tiffHeaderOffset + exifPrefix + '<Exif data>';
            // XMP
            const xmpItemId = getByteStringFromNumber(3, 2);
            const xmpItemType = getByteStringFromNumber(ITEM_INFO_TYPE_MIME, 4);
            const xmpContentType = 'application/rdf+xml\x00';
            // ICC
            const colorType = 'prof';
            const iccContent = '<ICC content>';
            const iccLength = iccContent.length;

            // iloc
            const offsetSizeAndLengthSize = getByteStringFromNumber(0x44, 1);
            const baseOffsetSizeAndReserved = getByteStringFromNumber(0x40, 1);
            const itemCount = getByteStringFromNumber(2, 2);
            const dataReferenceIndex = getByteStringFromNumber(4711, 2);
            const baseOffset = getByteStringFromNumber(4812, 4);
            const exifExtentLength = getByteStringFromNumber(128, 4);
            const xmpExtentLength = getByteStringFromNumber(256, 4);
            const extentCount = getByteStringFromNumber(1, 2);
            const exifExtentOffset = getByteStringFromNumber(185, 4); // Value should be the same as `boxes.length` below.
            const xmpExtentOffset = getByteStringFromNumber(5014, 4);

            const boxes = getFullBox(
                'meta',
                0,
                getFullBox(
                    'iinf',
                    0,
                    entryCount
                    + getFullBox(
                        'infe',
                        2,
                        exifItemId + itemProtectionIndex + exifItemType + itemName,
                    )
                    + getFullBox(
                        'infe',
                        2,
                        xmpItemId + itemProtectionIndex + xmpItemType + itemName + xmpContentType,
                    )
                )
                + getBox(
                    'iprp',
                    getBox(
                        'ipco',
                        getBox(
                            'colr',
                            colorType + getByteStringFromNumber(iccLength + 4, 4) + iccContent
                        )
                    )
                )
                + getFullBox(
                    'iloc',
                    0,
                    offsetSizeAndLengthSize + baseOffsetSizeAndReserved + itemCount
                    + exifItemId + dataReferenceIndex + baseOffset + extentCount + exifExtentOffset + exifExtentLength
                    + xmpItemId + dataReferenceIndex + baseOffset + extentCount + xmpExtentOffset + xmpExtentLength
                )
            );

            const dataView = getDataView(boxes + exifData);

            expect(findOffsets(dataView)).to.deep.equal({
                hasAppMarkers: true,
                tiffHeaderOffset: boxes.length + tiffHeaderOffset.length + exifPrefix.length,
                xmpChunks: [{
                    dataOffset: 5014,
                    length: 256
                }],
                iccChunks: [{
                    offset: 116,
                    length: 17,
                    chunkNumber: 1,
                    chunksTotal: 1
                }]
            });
        });
    });
});

export function getBox(type, content) {
    const LENGTH_SIZE = 4;
    const size = LENGTH_SIZE + type.length + content.length;

    return getByteStringFromNumber(size, 4)
        + type
        + content;
}

function getFullBox(type, version, content) {
    const FLAGS = '\x00\x00\x00';
    return getBox(type, String.fromCharCode(version) + FLAGS + content);
}
