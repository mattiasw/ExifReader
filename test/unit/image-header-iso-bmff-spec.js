/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getByteStringFromNumber, getConsoleWarnSpy} from './test-utils.js';
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

        it('should parse box of type idat', () => {
            const idatContent = '<some content>';
            const dataView = getDataView(getBox('idat', idatContent));

            // idat is a plain box: an 8-byte header (4 length + 4 type) with no
            // version/flags, so the item data starts at offset 8.
            expect(parseBox(dataView, 0)).to.deep.equal({
                type: 'idat',
                contentOffset: 8,
                length: 8 + idatContent.length,
            });
        });

        it('should parse a box that uses a 64-bit extended size', () => {
            const EXTENDED_SIZE_FLAG = getByteStringFromNumber(1, 4);
            const highBits = getByteStringFromNumber(0, 4);
            const lowBits = getByteStringFromNumber(17, 4);
            const content = '\x00';
            const dataView = getDataView(EXTENDED_SIZE_FLAG + 'free' + highBits + lowBits + content);

            expect(parseBox(dataView, 0)).to.deep.equal({type: undefined, length: 17});
        });
    });

    describe('findOffsets', () => {
        it('should not find offsets if there is no meta box', () => {
            const dataView = getDataView('');

            expect(findOffsets(dataView)).to.deep.equal({hasAppMarkers: false});
        });

        it('should find offsets', () => {
            const EXIF_ITEM_ID = 2;
            const XMP_ITEM_ID = 3;
            const EXIF_PREFIX = 'Exif\x00\x00';
            const tiffHeaderOffsetBytes = getByteStringFromNumber(EXIF_PREFIX.length, 4);
            const exifDataPadding = '\x00'.repeat(9);
            const exifData = tiffHeaderOffsetBytes + EXIF_PREFIX + '<Exif data>';
            const baseOffsetValue = exifDataPadding.length;

            // The Exif extent offset is chosen so baseOffset + extentOffset
            // lands at the start of `exifData` (which sits after boxes +
            // padding). 185 is also boxes.length below.
            const EXIF_EXTENT_OFFSET = 185;
            const XMP_EXTENT_OFFSET = 5014;

            const boxes = getFullBox(
                'meta',
                0,
                buildIinfBox([
                    {itemId: EXIF_ITEM_ID, itemType: ITEM_INFO_TYPE_EXIF},
                    {itemId: XMP_ITEM_ID, itemType: ITEM_INFO_TYPE_MIME, contentType: 'application/rdf+xml'},
                ])
                + buildIprpColrBox('<ICC content>')
                + buildIlocBox({
                    version: 0,
                    items: [
                        {itemId: EXIF_ITEM_ID, baseOffset: baseOffsetValue, extents: [{extentOffset: EXIF_EXTENT_OFFSET, extentLength: 128}]},
                        {itemId: XMP_ITEM_ID, baseOffset: baseOffsetValue, extents: [{extentOffset: XMP_EXTENT_OFFSET, extentLength: 256}]},
                    ],
                })
            );

            const dataView = getDataView(boxes + exifDataPadding + exifData);

            expect(findOffsets(dataView)).to.deep.equal({
                hasAppMarkers: true,
                tiffHeaderOffset: boxes.length + exifDataPadding.length + tiffHeaderOffsetBytes.length + EXIF_PREFIX.length,
                xmpChunks: [{
                    dataOffset: baseOffsetValue + XMP_EXTENT_OFFSET,
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

        describe('metadataBlocks', () => {
            it('should leave metadataBlocks empty when no meta box is found', () => {
                const dataView = getDataView('');
                const metadataBlocks = [];
                findOffsets(dataView, metadataBlocks);
                expect(metadataBlocks).to.deep.equal([]);
            });

            it('should emit exif, xmp and icc blocks from iloc extents', () => {
                const EXIF_ITEM_ID = 2;
                const XMP_ITEM_ID = 3;
                const exifDataPadding = '\x00'.repeat(9);
                const exifData = buildExifBlock('<Exif data>');
                const baseOffsetValue = exifDataPadding.length;
                const EXIF_EXTENT_OFFSET = 185;
                const XMP_EXTENT_OFFSET = 5014;

                const boxes = getFullBox(
                    'meta',
                    0,
                    buildIinfBox([
                        {itemId: EXIF_ITEM_ID, itemType: ITEM_INFO_TYPE_EXIF},
                        {itemId: XMP_ITEM_ID, itemType: ITEM_INFO_TYPE_MIME, contentType: 'application/rdf+xml'},
                    ])
                    + buildIprpColrBox('<ICC content>')
                    + buildIlocBox({
                        version: 0,
                        items: [
                            {itemId: EXIF_ITEM_ID, baseOffset: baseOffsetValue, extents: [{extentOffset: EXIF_EXTENT_OFFSET, extentLength: 128}]},
                            {itemId: XMP_ITEM_ID, baseOffset: baseOffsetValue, extents: [{extentOffset: XMP_EXTENT_OFFSET, extentLength: 256}]},
                        ],
                    })
                );

                const dataView = getDataView(boxes + exifDataPadding + exifData);
                const metadataBlocks = [];
                findOffsets(dataView, metadataBlocks);

                // Order matches the call order in findOffsets (exif, xmp, icc).
                // The pipeline merge step sorts blocks by start before exposing them.
                expect(metadataBlocks).to.deep.equal([
                    {type: 'exif', start: baseOffsetValue + EXIF_EXTENT_OFFSET, end: baseOffsetValue + EXIF_EXTENT_OFFSET + 128},
                    {type: 'xmp', start: baseOffsetValue + XMP_EXTENT_OFFSET, end: baseOffsetValue + XMP_EXTENT_OFFSET + 256},
                    {type: 'icc', start: 116, end: 116 + 17},
                ]);
            });

            it('should resolve constructionMethod 1 (idat) Exif items to file offsets via the idat box', () => {
                const EXIF_ITEM_ID = 2;
                const exifBlock = buildExifBlock('<TIFF>');

                const iinfBox = buildIinfBox([{itemId: EXIF_ITEM_ID, itemType: ITEM_INFO_TYPE_EXIF}]);
                const idatBox = getBox('idat', exifBlock);
                const ilocBox = buildIlocBox({
                    version: 1,
                    items: [{
                        itemId: EXIF_ITEM_ID,
                        constructionMethod: 1,
                        baseOffset: 0,
                        extents: [{extentOffset: 0, extentLength: exifBlock.length}],
                    }],
                });
                const boxes = getFullBox('meta', 0, iinfBox + idatBox + ilocBox);

                const idatContentOffset = FULL_BOX_HEADER_SIZE + iinfBox.length + PLAIN_BOX_HEADER_SIZE;
                const expectedExifBlockOffset = idatContentOffset; // baseOffset + extentOffset = 0
                const expectedTiffHeaderOffset = expectedExifBlockOffset + 4 + 'Exif\x00\x00'.length;

                const dataView = getDataView(boxes);
                const metadataBlocks = [];
                const result = findOffsets(dataView, metadataBlocks);

                expect(result.tiffHeaderOffset).to.equal(expectedTiffHeaderOffset);
                expect(metadataBlocks).to.deep.equal([
                    {type: 'exif', start: expectedExifBlockOffset, end: expectedExifBlockOffset + exifBlock.length},
                ]);
            });

            it('should resolve constructionMethod 1 (idat) XMP items to file offsets via the idat box', () => {
                const XMP_ITEM_ID = 3;
                const xmpBytes = '<x:xmpmeta/>';

                const iinfBox = buildIinfBox([{
                    itemId: XMP_ITEM_ID,
                    itemType: ITEM_INFO_TYPE_MIME,
                    contentType: 'application/rdf+xml',
                }]);
                const idatBox = getBox('idat', xmpBytes);
                const ilocBox = buildIlocBox({
                    version: 1,
                    items: [{
                        itemId: XMP_ITEM_ID,
                        constructionMethod: 1,
                        baseOffset: 0,
                        extents: [{extentOffset: 0, extentLength: xmpBytes.length}],
                    }],
                });
                const boxes = getFullBox('meta', 0, iinfBox + idatBox + ilocBox);

                const idatContentOffset = FULL_BOX_HEADER_SIZE + iinfBox.length + PLAIN_BOX_HEADER_SIZE;

                const dataView = getDataView(boxes);
                const metadataBlocks = [];
                const result = findOffsets(dataView, metadataBlocks);

                expect(result.xmpChunks).to.deep.equal([
                    {dataOffset: idatContentOffset, length: xmpBytes.length},
                ]);
                expect(metadataBlocks).to.deep.equal([
                    {type: 'xmp', start: idatContentOffset, end: idatContentOffset + xmpBytes.length},
                ]);
            });

            it('should skip constructionMethod 2 items and warn', () => {
                const EXIF_ITEM_ID = 2;
                const iinfBox = buildIinfBox([{itemId: EXIF_ITEM_ID, itemType: ITEM_INFO_TYPE_EXIF}]);
                const ilocBox = buildIlocBox({
                    version: 1,
                    items: [{
                        itemId: EXIF_ITEM_ID,
                        constructionMethod: 2,
                        baseOffset: 0,
                        extents: [{extentOffset: 0, extentLength: 16}],
                    }],
                });
                const boxes = getFullBox('meta', 0, iinfBox + ilocBox);

                const dataView = getDataView(boxes + '\x00'.repeat(64));
                const metadataBlocks = [];
                const warnSpy = getConsoleWarnSpy();
                try {
                    const result = findOffsets(dataView, metadataBlocks);
                    expect(result.tiffHeaderOffset).to.be.undefined;
                    expect(metadataBlocks).to.deep.equal([]);
                    expect(warnSpy.hasWarned).to.be.true;
                } finally {
                    warnSpy.reset();
                }
            });

            it('should expose a synthetic exif dataView covering all extents for multi-extent items', () => {
                const EXIF_ITEM_ID = 2;
                const exifBlock = buildExifBlock('TIFFTIFF');
                const splitAt = 7;
                const extentAData = exifBlock.substring(0, splitAt);
                const extentBData = exifBlock.substring(splitAt);

                const iinfBox = buildIinfBox([{itemId: EXIF_ITEM_ID, itemType: ITEM_INFO_TYPE_EXIF}]);
                // The iloc bytes have a fixed size for a given item/extent shape,
                // so we can compute where the trailer (with the real extent bytes)
                // will sit by building the box with placeholder offsets first.
                const ilocForExtents = (extentAOffset, extentBOffset) => buildIlocBox({
                    version: 0,
                    items: [{
                        itemId: EXIF_ITEM_ID,
                        baseOffset: 0,
                        extents: [
                            {extentOffset: extentAOffset, extentLength: extentAData.length},
                            {extentOffset: extentBOffset, extentLength: extentBData.length},
                        ],
                    }],
                });
                const ilocBoxStub = ilocForExtents(0, 0);

                const trailerStart = FULL_BOX_HEADER_SIZE + iinfBox.length + ilocBoxStub.length;
                const gap = 4;
                const extentAFileOffset = trailerStart + gap;
                const extentBFileOffset = extentAFileOffset + extentAData.length + gap;

                const ilocBox = ilocForExtents(extentAFileOffset, extentBFileOffset);
                const boxes = getFullBox('meta', 0, iinfBox + ilocBox);
                const trailer = '\x00'.repeat(gap) + extentAData + '\x00'.repeat(gap) + extentBData;

                const dataView = getDataView(boxes + trailer);
                const metadataBlocks = [];
                const result = findOffsets(dataView, metadataBlocks);

                expect(result.exifDataView).to.not.be.undefined;
                expect(result.exifDataView.byteLength).to.equal(exifBlock.length);
                expect(result.tiffHeaderOffset).to.equal(4 + 'Exif\x00\x00'.length);
                expect(readAll(result.exifDataView)).to.equal(exifBlock);
                expect(metadataBlocks).to.deep.equal([
                    {type: 'exif', start: extentAFileOffset, end: extentAFileOffset + extentAData.length},
                    {type: 'exif', start: extentBFileOffset, end: extentBFileOffset + extentBData.length},
                ]);
            });

            it('should expose a synthetic xmp dataView covering all extents for multi-extent items', () => {
                const XMP_ITEM_ID = 3;
                const xmpBytes = '<x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta>';
                const splitAt = 20;
                const extentAData = xmpBytes.substring(0, splitAt);
                const extentBData = xmpBytes.substring(splitAt);

                const iinfBox = buildIinfBox([{
                    itemId: XMP_ITEM_ID,
                    itemType: ITEM_INFO_TYPE_MIME,
                    contentType: 'application/rdf+xml',
                }]);
                const ilocForExtents = (extentAOffset, extentBOffset) => buildIlocBox({
                    version: 0,
                    items: [{
                        itemId: XMP_ITEM_ID,
                        baseOffset: 0,
                        extents: [
                            {extentOffset: extentAOffset, extentLength: extentAData.length},
                            {extentOffset: extentBOffset, extentLength: extentBData.length},
                        ],
                    }],
                });
                const ilocBoxStub = ilocForExtents(0, 0);

                const trailerStart = FULL_BOX_HEADER_SIZE + iinfBox.length + ilocBoxStub.length;
                const gap = 5;
                const extentAFileOffset = trailerStart + gap;
                const extentBFileOffset = extentAFileOffset + extentAData.length + gap;

                const ilocBox = ilocForExtents(extentAFileOffset, extentBFileOffset);
                const boxes = getFullBox('meta', 0, iinfBox + ilocBox);
                const trailer = '\x00'.repeat(gap) + extentAData + '\x00'.repeat(gap) + extentBData;

                const dataView = getDataView(boxes + trailer);
                const metadataBlocks = [];
                const result = findOffsets(dataView, metadataBlocks);

                expect(result.xmpDataView).to.not.be.undefined;
                expect(result.xmpDataView.byteLength).to.equal(xmpBytes.length);
                expect(result.xmpChunks).to.deep.equal([{dataOffset: 0, length: xmpBytes.length}]);
                expect(readAll(result.xmpDataView)).to.equal(xmpBytes);
                expect(metadataBlocks).to.deep.equal([
                    {type: 'xmp', start: extentAFileOffset, end: extentAFileOffset + extentAData.length},
                    {type: 'xmp', start: extentBFileOffset, end: extentBFileOffset + extentBData.length},
                ]);
            });

            it('should assemble multi-extent cm 1 items by resolving each extent through the idat box', () => {
                const EXIF_ITEM_ID = 2;
                const exifBlock = buildExifBlock('TIFFTIFF');
                const splitAt = 8;
                const extentAData = exifBlock.substring(0, splitAt);
                const extentBData = exifBlock.substring(splitAt);

                // idat content layout: gap | extentA | gap | extentB
                const gap = 3;
                const extentAOffsetWithinIdat = gap;
                const extentBOffsetWithinIdat = gap + extentAData.length + gap;
                const idatContent = '\x00'.repeat(gap) + extentAData + '\x00'.repeat(gap) + extentBData;

                const iinfBox = buildIinfBox([{itemId: EXIF_ITEM_ID, itemType: ITEM_INFO_TYPE_EXIF}]);
                const idatBox = getBox('idat', idatContent);
                const ilocBox = buildIlocBox({
                    version: 1,
                    items: [{
                        itemId: EXIF_ITEM_ID,
                        constructionMethod: 1,
                        baseOffset: 0,
                        extents: [
                            {extentOffset: extentAOffsetWithinIdat, extentLength: extentAData.length},
                            {extentOffset: extentBOffsetWithinIdat, extentLength: extentBData.length},
                        ],
                    }],
                });
                const boxes = getFullBox('meta', 0, iinfBox + idatBox + ilocBox);

                const idatContentOffset = FULL_BOX_HEADER_SIZE + iinfBox.length + PLAIN_BOX_HEADER_SIZE;
                const extentAFileOffset = idatContentOffset + extentAOffsetWithinIdat;
                const extentBFileOffset = idatContentOffset + extentBOffsetWithinIdat;

                const dataView = getDataView(boxes);
                const metadataBlocks = [];
                const result = findOffsets(dataView, metadataBlocks);

                expect(result.exifDataView).to.not.be.undefined;
                expect(result.exifDataView.byteLength).to.equal(exifBlock.length);
                expect(result.tiffHeaderOffset).to.equal(4 + 'Exif\x00\x00'.length);
                expect(readAll(result.exifDataView)).to.equal(exifBlock);
                expect(metadataBlocks).to.deep.equal([
                    {type: 'exif', start: extentAFileOffset, end: extentAFileOffset + extentAData.length},
                    {type: 'exif', start: extentBFileOffset, end: extentBFileOffset + extentBData.length},
                ]);
            });

            it('should emit blocks but skip parsing when a multi-extent item extends past EOF', () => {
                const EXIF_ITEM_ID = 2;
                const boxes = getFullBox(
                    'meta',
                    0,
                    buildIinfBox([{itemId: EXIF_ITEM_ID, itemType: ITEM_INFO_TYPE_EXIF}])
                    + buildIlocBox({
                        version: 0,
                        items: [{
                            itemId: EXIF_ITEM_ID,
                            baseOffset: 1000,
                            extents: [
                                {extentOffset: 100, extentLength: 50},
                                // Extent 2 points past EOF on purpose.
                                {extentOffset: 999000, extentLength: 80},
                            ],
                        }],
                    })
                );

                // dataView large enough for extent 1 but not extent 2.
                const dataView = getDataView(boxes + '\x00'.repeat(2000));
                const metadataBlocks = [];
                const result = findOffsets(dataView, metadataBlocks);

                expect(result.tiffHeaderOffset).to.be.undefined;
                expect(result.exifDataView).to.be.undefined;
                expect(metadataBlocks).to.deep.equal([
                    {type: 'exif', start: 1100, end: 1150},
                    {type: 'exif', start: 1000000, end: 1000080},
                ]);
            });

            it('should skip assembly when the combined extent length exceeds the buffer', () => {
                const EXIF_ITEM_ID = 2;
                const extents = [];
                for (let i = 0; i < 100; i++) {
                    extents.push({extentOffset: 100, extentLength: 50});
                }
                const boxes = getFullBox(
                    'meta',
                    0,
                    buildIinfBox([{itemId: EXIF_ITEM_ID, itemType: ITEM_INFO_TYPE_EXIF}])
                    + buildIlocBox({version: 0, items: [{itemId: EXIF_ITEM_ID, baseOffset: 1000, extents}]})
                );

                const dataView = getDataView(boxes + '\x00'.repeat(2000));
                let result;
                expect(() => {
                    result = findOffsets(dataView);
                }).to.not.throw();
                expect(result.exifDataView).to.be.undefined;
                expect(result.tiffHeaderOffset).to.be.undefined;
            });

            it('should emit one block per extent for multi-extent iloc items', () => {
                const EXIF_ITEM_ID = 2;
                const boxes = getFullBox(
                    'meta',
                    0,
                    buildIinfBox([{itemId: EXIF_ITEM_ID, itemType: ITEM_INFO_TYPE_EXIF}])
                    + buildIlocBox({
                        version: 0,
                        items: [{
                            itemId: EXIF_ITEM_ID,
                            baseOffset: 1000,
                            extents: [
                                {extentOffset: 100, extentLength: 50},
                                {extentOffset: 500, extentLength: 80},
                            ],
                        }],
                    })
                );

                const dataView = getDataView(boxes + '\x00'.repeat(2000));
                const metadataBlocks = [];
                findOffsets(dataView, metadataBlocks);

                expect(metadataBlocks).to.deep.equal([
                    {type: 'exif', start: 1100, end: 1150},
                    {type: 'exif', start: 1500, end: 1580},
                ]);
            });
        });
    });

    describe('malformed boxes', () => {
        it('should return no app markers for an empty box after a HEIC ftyp box', () => {
            const dataView = getDataView(getBox('ftyp', 'heic') + getBox('free', ''));
            let result;
            expect(() => {
                result = findOffsets(dataView);
            }).to.not.throw();
            expect(result).to.deep.equal({hasAppMarkers: false});
        });

        it('should return no app markers for an unknown box after an AVIF ftyp box', () => {
            const dataView = getDataView(getBox('ftyp', 'avif') + getBox('abcd', ''));
            let result;
            expect(() => {
                result = findOffsets(dataView);
            }).to.not.throw();
            expect(result).to.deep.equal({hasAppMarkers: false});
        });

        it('should return no app markers for a truncated extended-size box', () => {
            // boxLength === 1 signals a 64-bit extended size that is absent here.
            const truncatedExtendedBox = getByteStringFromNumber(1, 4) + 'free';
            const dataView = getDataView(getBox('ftyp', 'heic') + truncatedExtendedBox);
            let result;
            expect(() => {
                result = findOffsets(dataView);
            }).to.not.throw();
            expect(result).to.deep.equal({hasAppMarkers: false});
        });

        it('should return no app markers when an iloc claims more items than the buffer holds', () => {
            // iloc claims 50 items but supplies none, so parsing must stop cleanly.
            const sizesByte = getByteStringFromNumber(0x44, 1);
            const baseOffsetAndIndexByte = getByteStringFromNumber(0x40, 1);
            const itemCountClaimingMany = getByteStringFromNumber(50, 2);
            const truncatedIloc = getFullBox('iloc', 0, sizesByte + baseOffsetAndIndexByte + itemCountClaimingMany);
            const dataView = getDataView(getFullBox('meta', 0, truncatedIloc));
            let result;
            expect(() => {
                result = findOffsets(dataView);
            }).to.not.throw();
            expect(result.hasAppMarkers).to.be.false;
        });

        describe('parseBox header guards', () => {
            it('should return undefined for a full box whose version byte is missing', () => {
                // 8-byte box: the header is present but the version byte is not.
                const dataView = getDataView(getBox('free', ''));
                expect(parseBox(dataView, 0)).to.be.undefined;
            });

            it('should return undefined for a box whose extended size field is missing', () => {
                const dataView = getDataView(getByteStringFromNumber(1, 4) + 'free');
                expect(parseBox(dataView, 0)).to.be.undefined;
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

// Full-box header is 4 (length) + 4 (type) + 1 (version) + 3 (flags) = 12 bytes.
const FULL_BOX_HEADER_SIZE = 12;

// Plain-box header is 4 (length) + 4 (type) = 8 bytes (no version/flags).
const PLAIN_BOX_HEADER_SIZE = 8;

function buildInfeEntry({itemId, itemType, contentType}) {
    const ITEM_PROTECTION_INDEX = getByteStringFromNumber(0, 2);
    const ITEM_NAME_NULL = '\x00';
    return getByteStringFromNumber(itemId, 2)
        + ITEM_PROTECTION_INDEX
        + getByteStringFromNumber(itemType, 4)
        + ITEM_NAME_NULL
        + (contentType !== undefined ? `${contentType}\x00` : '');
}

function buildIinfBox(entries) {
    const entryCount = getByteStringFromNumber(entries.length, 2);
    const infes = entries.map((entry) => getFullBox('infe', 2, buildInfeEntry(entry))).join('');
    return getFullBox('iinf', 0, entryCount + infes);
}

// Build an `iloc` full box with fixed 4-byte sizes for offset/length/baseOffset
// and indexSize=0. Each item: {itemId, constructionMethod?, baseOffset, extents: [{extentOffset, extentLength}, ...]}.
function buildIlocBox({version, items}) {
    const SIZES_BYTE = getByteStringFromNumber(0x44, 1);
    const BASE_OFFSET_AND_INDEX_BYTE = getByteStringFromNumber(0x40, 1);
    const itemCount = getByteStringFromNumber(items.length, 2);
    const DATA_REFERENCE_INDEX = getByteStringFromNumber(0, 2);

    const hasCmField = (version === 1) || (version === 2);
    const itemBytes = items.map((item) => {
        const cmField = hasCmField ? getByteStringFromNumber(item.constructionMethod || 0, 2) : '';
        const extentBytes = item.extents.map((extent) =>
            getByteStringFromNumber(extent.extentOffset, 4)
            + getByteStringFromNumber(extent.extentLength, 4)
        ).join('');
        return getByteStringFromNumber(item.itemId, 2)
            + cmField
            + DATA_REFERENCE_INDEX
            + getByteStringFromNumber(item.baseOffset, 4)
            + getByteStringFromNumber(item.extents.length, 2)
            + extentBytes;
    }).join('');

    return getFullBox('iloc', version, SIZES_BYTE + BASE_OFFSET_AND_INDEX_BYTE + itemCount + itemBytes);
}

// Bytes of an Exif item: [4-byte tiff-header-offset][Exif\0\0][tiff data].
function buildExifBlock(tiffData) {
    const EXIF_PREFIX = 'Exif\x00\x00';
    return getByteStringFromNumber(EXIF_PREFIX.length, 4) + EXIF_PREFIX + tiffData;
}

// Builds the `iprp > ipco > colr` nesting that carries the ICC profile.
function buildIprpColrBox(iccContent) {
    const COLOR_TYPE = 'prof';
    const colrContent = COLOR_TYPE + getByteStringFromNumber(iccContent.length + 4, 4) + iccContent;
    return getBox('iprp', getBox('ipco', getBox('colr', colrContent)));
}

function readAll(dataView) {
    let s = '';
    for (let i = 0; i < dataView.byteLength; i++) {
        s += String.fromCharCode(dataView.getUint8(i));
    }
    return s;
}
