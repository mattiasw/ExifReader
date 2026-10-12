/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView, getByteStringFromNumber, getConsoleWarnSpy, swapProperties} from './test-utils.js';
import Constants from '../../src/constants.js';
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
                    uses64BitFields: false,
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
                uses64BitFields: false,
                length: 34
            });
        });

        it('should read the low 32 bits of 8-byte iloc fields without warning', () => {
            const dataView = getDataView(buildSizedIlocBox({
                version: 0,
                offsetSize: 8,
                lengthSize: 8,
                baseOffsetSize: 8,
                indexSize: 0,
                baseOffset: 4812,
                extents: [{extentOffset: 4913, extentLength: 5014}]
            }));

            const warnSpy = getConsoleWarnSpy();
            let box;
            try {
                box = parseBox(dataView, 0);
            } finally {
                warnSpy.reset();
            }

            expect(box).to.deep.equal({
                type: 'iloc',
                items: [{
                    itemId: SIZED_ILOC_ITEM_ID,
                    constructionMethod: undefined,
                    dataReferenceIndex: 0,
                    baseOffset: 4812,
                    extentCount: 1,
                    extents: [{
                        extentIndex: undefined,
                        extentOffset: 4913,
                        extentLength: 5014
                    }]
                }],
                uses64BitFields: true,
                length: 46
            });
            expect(warnSpy.callCount).to.equal(0);
        });

        [
            {field: 'offsetSize', version: 0, offsetSize: 8, lengthSize: 4, baseOffsetSize: 4, indexSize: 0},
            {field: 'lengthSize', version: 0, offsetSize: 4, lengthSize: 8, baseOffsetSize: 4, indexSize: 0},
            {field: 'baseOffsetSize', version: 0, offsetSize: 4, lengthSize: 4, baseOffsetSize: 8, indexSize: 0},
            {field: 'indexSize', version: 1, offsetSize: 4, lengthSize: 4, baseOffsetSize: 4, indexSize: 8},
        ].forEach(({field, version, offsetSize, lengthSize, baseOffsetSize, indexSize}) => {
            it(`should flag an iloc box whose ${field} alone is 8 bytes`, () => {
                const dataView = getDataView(buildSizedIlocBox({
                    version,
                    offsetSize,
                    lengthSize,
                    baseOffsetSize,
                    indexSize,
                    baseOffset: 1,
                    extents: [{extentIndex: 2, extentOffset: 3, extentLength: 4}]
                }));

                const box = parseBox(dataView, 0);

                expect(box.items[0].extents).to.have.lengthOf(1);
                expect(box.uses64BitFields).to.be.true;
            });
        });

        it('should not flag a version 0 iloc box whose reserved nibble is 8', () => {
            const dataView = getDataView(buildSizedIlocBox({
                version: 0,
                offsetSize: 4,
                lengthSize: 4,
                baseOffsetSize: 4,
                indexSize: 8,
                baseOffset: 1,
                extents: [{extentOffset: 3, extentLength: 4}]
            }));

            expect(parseBox(dataView, 0).uses64BitFields).to.be.false;
        });

        it('should not flag an iloc box whose field sizes are all above 8', () => {
            const INVALID_SIZE = 12;
            const dataView = getDataView(buildSizedIlocBox({
                version: 1,
                offsetSize: INVALID_SIZE,
                lengthSize: INVALID_SIZE,
                baseOffsetSize: INVALID_SIZE,
                indexSize: INVALID_SIZE,
                baseOffset: 1,
                extents: []
            }));

            expect(parseBox(dataView, 0).uses64BitFields).to.be.false;
        });

        it('should not allocate extents for an iloc whose extent size fields are all zero', () => {
            // GHSA-pj96-35fp-cfcc: with offset/length/index sizes all zero, each
            // extent occupies no bytes and carries no location, so a huge
            // extentCount must not be honored (it would allocate up to
            // itemCount x 65535 objects and exhaust memory).
            const sizesByte = getByteStringFromNumber(0x00, 1);
            const baseOffsetAndIndexByte = getByteStringFromNumber(0x00, 1);
            const itemCount = getByteStringFromNumber(1, 2);
            const itemId = getByteStringFromNumber(1, 2);
            const dataReferenceIndex = getByteStringFromNumber(0, 2);
            const extentCount = getByteStringFromNumber(0xffff, 2);
            // One spare byte, so that the count really is decided by the
            // zero-size check. With none, the box ends exactly where the extents
            // would start and the division below yields NaN, which stops the
            // loop on its own and hides whether the check works at all.
            const spareByte = '\x00';
            const dataView = getDataView(
                getFullBox(
                    'iloc',
                    0,
                    sizesByte + baseOffsetAndIndexByte + itemCount
                    + itemId + dataReferenceIndex + extentCount + spareByte
                )
            );

            expect(parseBox(dataView, 0).items[0].extents).to.have.lengthOf(0);
        });

        it('should cap iloc extents at what the box has room for when extentCount is over-declared', () => {
            // offsetSize=4, lengthSize=4 (0x44) so each extent needs 8 bytes,
            // but only two extents worth of data are present after a declared
            // count of 65535. The parser must read the two that fit rather than
            // allocating 65535 objects or discarding the whole box.
            const sizesByte = getByteStringFromNumber(0x44, 1);
            const baseOffsetAndIndexByte = getByteStringFromNumber(0x40, 1);
            const itemCount = getByteStringFromNumber(1, 2);
            const itemId = getByteStringFromNumber(1, 2);
            const dataReferenceIndex = getByteStringFromNumber(0, 2);
            const baseOffset = getByteStringFromNumber(0, 4);
            const extentCount = getByteStringFromNumber(0xffff, 2);
            const twoExtents = getByteStringFromNumber(10, 4) + getByteStringFromNumber(20, 4)
                + getByteStringFromNumber(30, 4) + getByteStringFromNumber(40, 4);
            const dataView = getDataView(
                getFullBox(
                    'iloc',
                    0,
                    sizesByte + baseOffsetAndIndexByte + itemCount
                    + itemId + dataReferenceIndex + baseOffset + extentCount + twoExtents
                )
            );

            expect(parseBox(dataView, 0).items[0].extents).to.deep.equal([
                {extentIndex: undefined, extentOffset: 10, extentLength: 20},
                {extentIndex: undefined, extentOffset: 30, extentLength: 40}
            ]);
        });

        it('should return the items whose headers fit when an iloc is truncated mid-item-header', () => {
            // The buffer ends two bytes into the second item's header. The
            // complete first item must be returned instead of the whole box
            // being discarded.
            const sizesByte = getByteStringFromNumber(0x44, 1);
            const baseOffsetAndIndexByte = getByteStringFromNumber(0x40, 1);
            const itemCount = getByteStringFromNumber(2, 2);
            const itemId = getByteStringFromNumber(2, 2);
            const dataReferenceIndex = getByteStringFromNumber(0, 2);
            const baseOffset = getByteStringFromNumber(0, 4);
            const extentCount = getByteStringFromNumber(1, 2);
            const extent = getByteStringFromNumber(10, 4) + getByteStringFromNumber(20, 4);
            const completeItem = itemId + dataReferenceIndex + baseOffset + extentCount + extent;
            const truncatedItemHeader = getByteStringFromNumber(3, 2);
            const dataView = getDataView(
                getFullBox(
                    'iloc',
                    0,
                    sizesByte + baseOffsetAndIndexByte + itemCount + completeItem + truncatedItemHeader
                )
            );

            expect(parseBox(dataView, 0).items).to.deep.equal([{
                itemId: 2,
                constructionMethod: undefined,
                dataReferenceIndex: 0,
                baseOffset: 0,
                extentCount: 1,
                extents: [{extentIndex: undefined, extentOffset: 10, extentLength: 20}]
            }]);
        });

        it('should not read iloc items that lie outside the declared length of their box', () => {
            // The box declares a length ending after the first item, but a
            // second well-formed item follows it in the buffer. Only the item
            // the box actually claims may be returned.
            const declaredLength = ILOC_ITEMS_OFFSET + ILOC_ITEM_HEADER_SIZE + ILOC_EXTENT_SIZE;
            const dataView = getDataView(withDeclaredLength(buildIlocBoxWithTwoItems(), declaredLength));

            expect(parseBox(dataView, 0).items).to.deep.equal([{
                itemId: 1,
                constructionMethod: undefined,
                dataReferenceIndex: 0,
                baseOffset: 0,
                extentCount: 1,
                extents: [{extentIndex: undefined, extentOffset: 10, extentLength: 20}]
            }]);
        });

        it('should keep an iloc item whose header ends exactly at the end of the box', () => {
            // The item header uses the very last bytes the box declares, so it
            // is fully inside it and must not be dropped.
            const ITEM_ID = 7;
            const sizesByte = getByteStringFromNumber(0x01, 1);
            const baseOffsetAndIndexByte = getByteStringFromNumber(0x00, 1);
            const itemCount = getByteStringFromNumber(1, 2);
            const itemId = getByteStringFromNumber(ITEM_ID, 2);
            const dataReferenceIndex = getByteStringFromNumber(0, 2);
            const extentCount = getByteStringFromNumber(0, 2);
            const dataView = getDataView(getFullBox(
                'iloc',
                0,
                sizesByte + baseOffsetAndIndexByte + itemCount
                + itemId + dataReferenceIndex + extentCount
            ));

            expect(parseBox(dataView, 0).items).to.deep.equal([{
                itemId: ITEM_ID,
                constructionMethod: undefined,
                dataReferenceIndex: 0,
                baseOffset: 0,
                extentCount: 0,
                extents: []
            }]);
        });

        it('should let an iloc whose length field is zero run to the end of the buffer', () => {
            // A length of 0 means the box extends to the end of the file, so the
            // bound is the buffer and both items are inside the box.
            const EXTENDS_TO_END_OF_FILE = 0;
            const dataView = getDataView(
                withDeclaredLength(buildIlocBoxWithTwoItems(), EXTENDS_TO_END_OF_FILE)
            );

            expect(parseBox(dataView, 0).items.map((item) => item.itemId)).to.deep.equal([1, 2]);
        });

        it('should measure the declared length of an iloc from the box, not from the buffer', () => {
            // The iloc follows another box, so the bound has to be measured from
            // where this box starts rather than from the start of the buffer.
            const precedingBox = getBox('free', '\x00'.repeat(8));
            const declaredLength = ILOC_ITEMS_OFFSET + ILOC_ITEM_HEADER_SIZE + ILOC_EXTENT_SIZE;
            const dataView = getDataView(
                precedingBox + withDeclaredLength(buildIlocBoxWithTwoItems(), declaredLength)
            );

            expect(parseBox(dataView, precedingBox.length).items).to.deep.equal([{
                itemId: 1,
                constructionMethod: undefined,
                dataReferenceIndex: 0,
                baseOffset: 0,
                extentCount: 1,
                extents: [{extentIndex: undefined, extentOffset: 10, extentLength: 20}]
            }]);
        });

        it('should return the items that fit when an iloc declares a length past the end of the buffer', () => {
            // The declared length claims a second item, but the buffer ends two
            // bytes into its header. The bound is the buffer here, so the
            // complete first item is still returned instead of the box being
            // discarded.
            const TRUNCATED_HEADER_BYTES = 2;
            const lengthClaimingBothItems = ILOC_ITEMS_OFFSET + (ILOC_ITEM_HEADER_SIZE + ILOC_EXTENT_SIZE) * 2;
            const cutOffMidSecondHeader = ILOC_ITEMS_OFFSET + ILOC_ITEM_HEADER_SIZE + ILOC_EXTENT_SIZE
                + TRUNCATED_HEADER_BYTES;
            const dataView = getDataView(withDeclaredLength(
                buildIlocBoxWithTwoItems().substring(0, cutOffMidSecondHeader),
                lengthClaimingBothItems
            ));
            const box = parseBox(dataView, 0);

            expect(box.items).to.deep.equal([{
                itemId: 1,
                constructionMethod: undefined,
                dataReferenceIndex: 0,
                baseOffset: 0,
                extentCount: 1,
                extents: [{extentIndex: undefined, extentOffset: 10, extentLength: 20}]
            }]);
            // The reported length stays the declared one even though the buffer
            // is shorter, since the sub-box walk advances by it.
            expect(box.length).to.equal(lengthClaimingBothItems);
        });

        it('should not read iloc extents that lie outside the declared length of their box', () => {
            // The item header fits, but the box ends after its first extent
            // while the second extent's bytes are present in the buffer just
            // after the box.
            const declaredLength = ILOC_ITEMS_OFFSET + ILOC_ITEM_HEADER_SIZE + ILOC_EXTENT_SIZE;
            const dataView = getDataView(withDeclaredLength(
                buildIlocBoxWithTwoExtents(),
                declaredLength
            ));

            expect(parseBox(dataView, 0).items[0].extents).to.deep.equal([
                {extentIndex: undefined, extentOffset: 10, extentLength: 20}
            ]);
        });

        it('should drop an iloc extent that is only partly inside the box', () => {
            // The box ends in the middle of the second extent. A partly present
            // extent must be dropped rather than rounded up to a whole one,
            // which would read bytes the box does not cover.
            const PARTIAL_EXTENT_BYTES = 4;
            const declaredLength = ILOC_ITEMS_OFFSET + ILOC_ITEM_HEADER_SIZE + ILOC_EXTENT_SIZE
                + PARTIAL_EXTENT_BYTES;
            const dataView = getDataView(withDeclaredLength(
                buildIlocBoxWithTwoExtents(),
                declaredLength
            ));

            expect(parseBox(dataView, 0).items[0].extents).to.deep.equal([
                {extentIndex: undefined, extentOffset: 10, extentLength: 20}
            ]);
        });

        it('should stop at an iloc item whose extent list the box cuts short', () => {
            // Once an extent list is cut short the walk no longer sits on an
            // item boundary, so reading on would build an item out of extent
            // payload bytes. The items read so far are returned instead.
            const SPARE_BYTES = 7;
            const sizesByte = getByteStringFromNumber(0x44, 1);
            const baseOffsetAndIndexByte = getByteStringFromNumber(0x00, 1);
            const itemCount = getByteStringFromNumber(2, 2);
            const secondExtentPayload = getByteStringFromNumber(0x22222222, 4)
                + getByteStringFromNumber(0x22222222, 4);
            const firstItem = getByteStringFromNumber(1, 2) + getByteStringFromNumber(0, 2)
                + getByteStringFromNumber(2, 2)
                + getByteStringFromNumber(10, 4) + getByteStringFromNumber(20, 4)
                + secondExtentPayload;
            const secondItem = getByteStringFromNumber(99, 2) + getByteStringFromNumber(0, 2)
                + getByteStringFromNumber(1, 2)
                + getByteStringFromNumber(50, 4) + getByteStringFromNumber(60, 4);
            // Room for the first item's header and one of its two extents, plus
            // enough slack that another item header would otherwise fit.
            const declaredLength = ILOC_ITEMS_OFFSET + ILOC_ITEM_HEADER_SIZE_NO_BASE_OFFSET
                + ILOC_EXTENT_SIZE + SPARE_BYTES;
            const dataView = getDataView(withDeclaredLength(
                getFullBox(
                    'iloc',
                    0,
                    sizesByte + baseOffsetAndIndexByte + itemCount + firstItem + secondItem
                ),
                declaredLength
            ));

            expect(parseBox(dataView, 0).items.map((item) => item.itemId)).to.deep.equal([1]);
        });

        it('should keep reading iloc items when zero-size extents consume no bytes', () => {
            // With every extent size nibble 0 an extent occupies nothing, so
            // dropping the extents leaves the walk exactly on the next item and
            // the later items must survive.
            const sizesByte = getByteStringFromNumber(0x00, 1);
            const baseOffsetAndIndexByte = getByteStringFromNumber(0x00, 1);
            const itemCount = getByteStringFromNumber(2, 2);
            const firstItem = getByteStringFromNumber(11, 2) + getByteStringFromNumber(0, 2)
                + getByteStringFromNumber(1, 2);
            const secondItem = getByteStringFromNumber(22, 2) + getByteStringFromNumber(0, 2)
                + getByteStringFromNumber(1, 2);
            const dataView = getDataView(getFullBox(
                'iloc',
                0,
                sizesByte + baseOffsetAndIndexByte + itemCount + firstItem + secondItem
            ));

            expect(parseBox(dataView, 0).items.map((item) => item.itemId)).to.deep.equal([11, 22]);
        });

        it('should count exactly the single-byte iloc extents the box has room for', () => {
            // offsetSize 0 and lengthSize 1 make each extent a single byte, so
            // the declared length decides exactly how many fit. Three are
            // declared and a third byte does follow, but the box has room for
            // two.
            const EXTENTS_INSIDE_BOX = 2;
            const sizesByte = getByteStringFromNumber(0x01, 1);
            const baseOffsetAndIndexByte = getByteStringFromNumber(0x00, 1);
            const itemCount = getByteStringFromNumber(1, 2);
            const item = getByteStringFromNumber(1, 2)
                + getByteStringFromNumber(0, 2)
                + getByteStringFromNumber(3, 2)
                + '\x00\x00\x00';
            const declaredLength = ILOC_ITEMS_OFFSET + ILOC_ITEM_HEADER_SIZE_NO_BASE_OFFSET
                + EXTENTS_INSIDE_BOX;
            const dataView = getDataView(withDeclaredLength(
                getFullBox('iloc', 0, sizesByte + baseOffsetAndIndexByte + itemCount + item),
                declaredLength
            ));

            expect(parseBox(dataView, 0).items[0].extents).to.have.lengthOf(EXTENTS_INSIDE_BOX);
        });

        it('should bound iloc extents by the declared length of an extended-size box', () => {
            // Same as the previous test but with a 64-bit extended size, which
            // puts the content 8 bytes further in. The bound therefore has to
            // come from the real box start, not from a fixed offset back from
            // the content.
            const declaredLength = ILOC_ITEMS_OFFSET + BOX_EXTENDED_SIZE + ILOC_ITEM_HEADER_SIZE + ILOC_EXTENT_SIZE;
            const dataView = getDataView(
                asExtendedSizeBox(buildIlocBoxWithTwoExtents(), declaredLength)
            );

            expect(parseBox(dataView, 0).items[0].extents).to.deep.equal([
                {extentIndex: undefined, extentOffset: 10, extentLength: 20}
            ]);
        });

        it('should cap the extents of one iloc box at 1024 * 1024 in total', () => {
            // Guards the absolute backstop of GHSA-pj96-35fp-cfcc. Every item
            // fits in the box, so only the cap can stop the walk. 17 items of
            // 0xffff extents (1,114,095) exceed it, so the walk has to end
            // inside the 17th item and never reach the 18th. Two-byte extents
            // (lengthSize 2) tell a cap on extents from a cap on bytes.
            const MAX_TOTAL_EXTENTS = 1024 * 1024;
            const ITEM_COUNT = 18;
            const ITEMS_REACHED = 17;
            const EXTENTS_PER_ITEM = 0xffff;
            const EXTENT_SIZE = 2;
            const sizesByte = getByteStringFromNumber(EXTENT_SIZE, 1);
            const baseOffsetAndIndexByte = getByteStringFromNumber(0x00, 1);
            const itemCount = getByteStringFromNumber(ITEM_COUNT, 2);
            let items = '';
            for (let itemId = 1; itemId <= ITEM_COUNT; itemId++) {
                items += getByteStringFromNumber(itemId, 2)
                    + getByteStringFromNumber(0, 2)
                    + getByteStringFromNumber(EXTENTS_PER_ITEM, 2)
                    + '\x00'.repeat(EXTENTS_PER_ITEM * EXTENT_SIZE);
            }
            const dataView = getDataView(
                getFullBox('iloc', 0, sizesByte + baseOffsetAndIndexByte + itemCount + items)
            );

            const parsedItems = parseBox(dataView, 0).items;

            const totalExtents = parsedItems.reduce((total, item) => total + item.extents.length, 0);
            expect(parsedItems).to.have.lengthOf(ITEMS_REACHED);
            expect(totalExtents).to.equal(MAX_TOTAL_EXTENTS);
        });

        it('should read no items from the tiny iloc boxes a packed meta box holds', () => {
            // Each iloc declares only the 16 bytes of its own header, so its
            // item list would start exactly where the box ends and no item
            // fits. Without the bound every box walked to the end of the buffer
            // instead, and N boxes re-walking the same tail made both the
            // allocation and the work quadratic in the file size.
            const ILOC_BOX_COUNT = 16;
            // offsetSize 0 and lengthSize 1, so an extent takes a single byte,
            // the densest it can be.
            const sizesByte = getByteStringFromNumber(0x01, 1);
            const baseOffsetAndIndexByte = getByteStringFromNumber(0x00, 1);
            const itemCount = getByteStringFromNumber(0xffff, 2);
            const tinyIloc = getFullBox(
                'iloc',
                0,
                sizesByte + baseOffsetAndIndexByte + itemCount
            );
            const dataView = getDataView(getFullBox('meta', 0, tinyIloc.repeat(ILOC_BOX_COUNT)));

            const ilocBoxes = parseBox(dataView, 0).subBoxes.filter((box) => box.type === 'iloc');

            // Every box is still parsed, so this cannot pass by the sub-box walk
            // bailing out early.
            expect(ilocBoxes).to.have.lengthOf(ILOC_BOX_COUNT);
            expect(ilocBoxes.map((box) => box.items.length)).to.deep.equal(new Array(ILOC_BOX_COUNT).fill(0));
        });

        it('should not let a sub box read past the container that declares it', () => {
            // The ipco declares just its own header plus the iloc's 16-byte one,
            // so the iloc's item list would start exactly where the ipco ends.
            // The iloc declares a length reaching far beyond that, but it may
            // only read what the container holds.
            const wouldBeWalked = '\x00'.repeat(64);
            const dataView = getDataView(
                getBox('ipco', buildOverDeclaringTinyIloc()) + wouldBeWalked
            );

            expect(parseBox(dataView, 0).properties[0].items).to.have.lengthOf(0);
        });

        it('should keep every sub box inside its container for a meta box packed with them', () => {
            // The attack shape: each container is small and well formed, but the
            // iloc inside it over-declares its length. Bounding only where a
            // child starts let every one of them re-walk the whole tail, which
            // made the work and the allocation quadratic in the file size.
            const CONTAINER_COUNT = 16;
            const wrappedIloc = getBox('ipco', buildOverDeclaringTinyIloc());
            const dataView = getDataView(getFullBox('meta', 0, wrappedIloc.repeat(CONTAINER_COUNT)));

            const containers = parseBox(dataView, 0).subBoxes.filter((box) => box.type === 'ipco');

            // Every container is still parsed, so this cannot pass by the walk
            // bailing out early.
            expect(containers).to.have.lengthOf(CONTAINER_COUNT);
            expect(containers.map((box) => box.properties[0].items.length))
                .to.deep.equal(new Array(CONTAINER_COUNT).fill(0));
        });

        it('should not build a sub box out of bytes its container does not fully hold', () => {
            // The ipco has four bytes left, too few for a box header, so the
            // type would have to be read from the box after it. Doing that
            // invents a child that is not there, and an invented iloc or iinf
            // shadows the real one when metadata is looked up by type.
            const lengthOfAPhantom = getByteStringFromNumber(16, 4);
            const ipco = getBox('ipco', lengthOfAPhantom);
            // This box's length field spells "iloc" when read as four characters.
            const nextBoxWhoseLengthSpellsAType = getByteStringFromNumber(0x696c6f63, 4)
                + 'free' + '\x00'.repeat(24);
            const dataView = getDataView(getBox('iprp', ipco + nextBoxWhoseLengthSpellsAType));

            expect(parseBox(dataView, 0).subBoxes[0].properties).to.have.lengthOf(0);
        });

        it('should not let a nested container hand its children more than it was given', () => {
            // Every box between the meta box and the iloc over-declares its
            // length. Only the meta box is honest, so its end is what all of
            // them are held to, however deep they sit.
            const outsideTheMetaBox = '\x00'.repeat(64);
            const overDeclaringIpco = withDeclaredLength(
                getBox('ipco', buildOverDeclaringTinyIloc()),
                OVER_DECLARED_BOX_LENGTH
            );
            const overDeclaringIprp = withDeclaredLength(
                getBox('iprp', overDeclaringIpco),
                OVER_DECLARED_BOX_LENGTH
            );
            const dataView = getDataView(
                getFullBox('meta', 0, overDeclaringIprp) + outsideTheMetaBox
            );

            const iprp = parseBox(dataView, 0).subBoxes[0];

            expect(iprp.subBoxes[0].properties[0].items).to.have.lengthOf(0);
        });

        it('should not let an over-declaring meta hand its children more than it was given', () => {
            // A meta box is normally outermost, where the data end is its bound,
            // but the walk will follow one nested inside another box too, and
            // there it is held to that box like any other child.
            const outsideTheIprpBox = '\x00'.repeat(64);
            const overDeclaringMeta = withDeclaredLength(
                getFullBox('meta', 0, buildOverDeclaringTinyIloc()),
                OVER_DECLARED_BOX_LENGTH
            );
            const dataView = getDataView(getBox('iprp', overDeclaringMeta) + outsideTheIprpBox);

            expect(parseBox(dataView, 0).subBoxes[0].subBoxes[0].items).to.have.lengthOf(0);
        });

        it('should not let an over-declaring iinf hand its children more than it was given', () => {
            // Same as above for the other container that holds sub boxes, since
            // each one passes the bound down separately.
            const outsideTheMetaBox = '\x00'.repeat(64);
            const entryCount = getByteStringFromNumber(1, 2);
            const overDeclaringIinf = withDeclaredLength(
                getFullBox('iinf', 0, entryCount + buildOverDeclaringTinyIloc()),
                OVER_DECLARED_BOX_LENGTH
            );
            const dataView = getDataView(
                getFullBox('meta', 0, overDeclaringIinf) + outsideTheMetaBox
            );

            expect(parseBox(dataView, 0).subBoxes[0].itemInfos[0].items).to.have.lengthOf(0);
        });

        it('should still return the items a truncated meta box does hold', () => {
            // Both the meta box and the iloc inside it declare more than the
            // buffer holds, and the buffer stops partway through the second
            // item's header. The container bound must not cost us the item that
            // is fully present.
            const TRUNCATED_HEADER_BYTES = 2;
            const cutOffMidSecondHeader = ILOC_ITEMS_OFFSET + ILOC_ITEM_HEADER_SIZE + ILOC_EXTENT_SIZE
                + TRUNCATED_HEADER_BYTES;
            const truncatedIloc = withDeclaredLength(
                buildIlocBoxWithTwoItems().substring(0, cutOffMidSecondHeader),
                OVER_DECLARED_BOX_LENGTH
            );
            const dataView = getDataView(withDeclaredLength(
                getFullBox('meta', 0, truncatedIloc),
                OVER_DECLARED_BOX_LENGTH
            ));

            expect(parseBox(dataView, 0).subBoxes[0].items.map((item) => item.itemId))
                .to.deep.equal([1]);
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

        describe('pitm', () => {
            it('should read a 16-bit item ID from a version 0 box', () => {
                const dataView = getDataView(getFullBox('pitm', 0, getByteStringFromNumber(0x1234, 2)));

                expect(parseBox(dataView, 0)).to.deep.equal({type: 'pitm', itemId: 0x1234, length: 14});
            });

            it('should read a 32-bit item ID from a version 1 box', () => {
                const dataView = getDataView(getFullBox('pitm', 1, getByteStringFromNumber(0x12345678, 4)));

                expect(parseBox(dataView, 0)).to.deep.equal({type: 'pitm', itemId: 0x12345678, length: 16});
            });

            it('should treat a box too short for its item ID as unknown', () => {
                const tooShortForAVersion1Id = getFullBox('pitm', 1, getByteStringFromNumber(1, 2));
                const dataView = getDataView(tooShortForAVersion1Id + '\x00\x00');

                expect(parseBox(dataView, 0)).to.deep.equal({type: undefined, length: 14});
            });
        });

        describe('ispe', () => {
            it('should point at the dimensions after the version and flags', () => {
                const dataView = getDataView(buildIspeBox(4032, 3024));

                expect(parseBox(dataView, 0)).to.deep.equal({type: 'ispe', dimensionsOffset: 12, length: 20});
            });

            it('should point at the dimensions after an extended-size header', () => {
                const EXTENDED_SIZE_FLAG = getByteStringFromNumber(1, 4);
                const length = 28;
                const dataView = getDataView(
                    EXTENDED_SIZE_FLAG + 'ispe' + getByteStringFromNumber(0, 4) + getByteStringFromNumber(length, 4)
                    + '\x00\x00\x00\x00' + getByteStringFromNumber(4032, 4) + getByteStringFromNumber(3024, 4)
                );

                expect(parseBox(dataView, 0)).to.deep.equal({type: 'ispe', dimensionsOffset: 20, length});
            });

            it('should treat a box shorter than its dimensions as unknown', () => {
                const tooShort = getFullBox('ispe', 0, getByteStringFromNumber(4032, 4) + getByteStringFromNumber(3024, 3));
                const dataView = getDataView(tooShort + '\x00');

                expect(parseBox(dataView, 0)).to.deep.equal({type: undefined, length: 19});
            });

            it('should treat a box whose dimensions run past its container as unknown', () => {
                const dataView = getDataView(buildIspeBox(4032, 3024));

                expect(parseBox(dataView, 0, 19)).to.deep.equal({type: undefined, length: 20});
            });

            it('should treat a box whose dimensions run past the data as unknown', () => {
                const dataView = getDataView(buildIspeBox(4032, 3024).slice(0, 19));

                expect(parseBox(dataView, 0)).to.deep.equal({type: undefined, length: 20});
            });
        });

        describe('pixi', () => {
            const PADDING = '\x00\x00\x00\x00';

            it('should point at the channel count after the version and flags', () => {
                const dataView = getDataView(buildPixiBox([8, 8, 8]));

                expect(parseBox(dataView, 0)).to.deep.equal({type: 'pixi', channelCountOffset: 12, length: 16});
            });

            it('should point at the channel count after an extended-size header', () => {
                const EXTENDED_SIZE_FLAG = getByteStringFromNumber(1, 4);
                const length = 24;
                const dataView = getDataView(
                    EXTENDED_SIZE_FLAG + 'pixi' + getByteStringFromNumber(0, 4) + getByteStringFromNumber(length, 4)
                    + '\x00\x00\x00\x00' + '\x03\x08\x08\x08'
                );

                expect(parseBox(dataView, 0)).to.deep.equal({type: 'pixi', channelCountOffset: 20, length});
            });

            it('should accept a box with no channels', () => {
                const dataView = getDataView(buildPixiBox([]) + PADDING);

                expect(parseBox(dataView, 0)).to.deep.equal({type: 'pixi', channelCountOffset: 12, length: 13});
            });

            it('should treat a box ending before the channel count at the end of the data as unknown', () => {
                const dataView = getDataView(getFullBox('pixi', 0, ''));

                expect(parseBox(dataView, 0)).to.deep.equal({type: undefined, length: 12});
            });

            it('should treat a box ending before the channel count as unknown', () => {
                const dataView = getDataView(getFullBox('pixi', 0, '') + PADDING);

                expect(parseBox(dataView, 0)).to.deep.equal({type: undefined, length: 12});
            });

            it('should accept bit depths that exactly fill the box', () => {
                const dataView = getDataView(buildPixiBox([10, 8, 8]) + PADDING);

                expect(parseBox(dataView, 0)).to.deep.equal({type: 'pixi', channelCountOffset: 12, length: 16});
            });

            it('should treat a box shorter than its bit depths as unknown', () => {
                const tooShort = getFullBox('pixi', 0, '\x03\x08\x08');
                const dataView = getDataView(tooShort + PADDING);

                expect(parseBox(dataView, 0)).to.deep.equal({type: undefined, length: 15});
            });

            it('should treat a box whose bit depths run past its container as unknown', () => {
                const dataView = getDataView(buildPixiBox([8, 8, 8]) + PADDING);

                expect(parseBox(dataView, 0, 15)).to.deep.equal({type: undefined, length: 16});
            });

            it('should treat a box whose bit depths run past the data as unknown', () => {
                const dataView = getDataView(buildPixiBox([8, 8, 8]).slice(0, 15));

                expect(parseBox(dataView, 0)).to.deep.equal({type: undefined, length: 16});
            });

            it('should treat a box of another version as unknown', () => {
                const dataView = getDataView(getFullBox('pixi', 1, '\x03\x08\x08\x08'));

                expect(parseBox(dataView, 0)).to.deep.equal({type: undefined, length: 16});
            });
        });

        describe('ipma', () => {
            it('should read the version, the flags and where the entry count is', () => {
                const dataView = getDataView(getFullBoxWithFlags('ipma', 1, 1, getByteStringFromNumber(0, 4)));

                expect(parseBox(dataView, 0)).to.deep.equal({
                    type: 'ipma',
                    version: 1,
                    flags: 1,
                    entryCountOffset: 12,
                    end: 16,
                    length: 16
                });
            });

            it('should read all 24 bits of the flags', () => {
                const dataView = getDataView(getFullBoxWithFlags('ipma', 0, 0xabcdef, getByteStringFromNumber(0, 4)));

                expect(parseBox(dataView, 0).flags).to.equal(0xabcdef);
            });

            it('should end the box at its container when that comes first', () => {
                const dataView = getDataView(getFullBoxWithFlags('ipma', 0, 0, getByteStringFromNumber(0, 4) + '\x00'));

                expect(parseBox(dataView, 0, 16).end).to.equal(16);
            });

            it('should end the box at the data when that comes first', () => {
                const overDeclaringIpma = withDeclaredLength(
                    getFullBoxWithFlags('ipma', 0, 0, getByteStringFromNumber(0, 4)),
                    OVER_DECLARED_BOX_LENGTH
                );
                const dataView = getDataView(overDeclaringIpma);

                expect(parseBox(dataView, 0, OVER_DECLARED_BOX_LENGTH).end).to.equal(16);
            });

            it('should treat a box too short for its entry count as unknown', () => {
                const tooShort = getFullBoxWithFlags('ipma', 0, 0, getByteStringFromNumber(0, 3));
                const dataView = getDataView(tooShort + '\x00');

                expect(parseBox(dataView, 0)).to.deep.equal({type: undefined, length: 15});
            });
        });

        describe('ipco property indexes', () => {
            it('should keep an entry for an unknown property so the indexes line up', () => {
                const dataView = getDataView(getBox('ipco', getBox('hvcC', '<config>') + buildIspeBox(12, 2)));

                const {properties} = parseBox(dataView, 0);

                expect(properties).to.have.lengthOf(2);
                expect(properties[0].type).to.be.undefined;
                expect(properties[1]).to.deep.equal({type: 'ispe', dimensionsOffset: 8 + 16 + 12, length: 20});
            });

            it('should share one entry between all unknown properties', () => {
                const dataView = getDataView(getBox('ipco', getBox('hvcC', '<config>') + getBox('pasp', '<pasp>')));

                const {properties} = parseBox(dataView, 0);

                expect(properties).to.have.lengthOf(2);
                expect(properties[0]).to.equal(properties[1]);
            });

            it('should keep a too short ispe as an unknown property', () => {
                const tooShortIspe = getFullBox('ispe', 0, getByteStringFromNumber(12, 4));
                const dataView = getDataView(getBox('ipco', tooShortIspe + buildIspeBox(12, 2)));

                const {properties} = parseBox(dataView, 0);

                expect(properties).to.have.lengthOf(2);
                expect(properties[0].type).to.be.undefined;
                expect(properties[1].type).to.equal('ispe');
            });

            it('should keep a pixi at its index', () => {
                const dataView = getDataView(getBox('ipco', getBox('hvcC', '<config>') + buildPixiBox([8, 8, 8])));

                const {properties} = parseBox(dataView, 0);

                expect(properties).to.have.lengthOf(2);
                expect(properties[1]).to.deep.equal({type: 'pixi', channelCountOffset: 8 + 16 + 12, length: 16});
            });

            it('should keep a too short pixi as an unknown property', () => {
                const tooShortPixi = getFullBox('pixi', 0, '\x03\x08\x08');
                const dataView = getDataView(getBox('ipco', tooShortPixi + buildIspeBox(12, 2)));

                const {properties} = parseBox(dataView, 0);

                expect(properties).to.have.lengthOf(2);
                expect(properties[0].type).to.be.undefined;
                expect(properties[1].type).to.equal('ispe');
            });

            it('should still drop unknown boxes from the other containers', () => {
                const dataView = getDataView(getBox('iprp', getBox('free', '') + getBox('ipco', '')));

                expect(parseBox(dataView, 0).subBoxes).to.deep.equal([{type: 'ipco', properties: [], length: 8}]);
            });
        });
    });

    describe('findOffsets', () => {
        it('should not find offsets if there is no meta box', () => {
            const dataView = getDataView('');

            expect(findOffsets(dataView)).to.deep.equal({hasAppMarkers: false});
        });

        it('should report app markers for a meta box with only an Exif item', () => {
            const EXIF_ITEM_ID = 2;
            const exifData = buildExifBlock('<Exif data>');
            const metaBox = getFullBox(
                'meta',
                0,
                buildIinfBox([{itemId: EXIF_ITEM_ID, itemType: ITEM_INFO_TYPE_EXIF}])
                + buildIlocBox({
                    version: 0,
                    items: [{itemId: EXIF_ITEM_ID, baseOffset: 0, extents: [{extentOffset: 200, extentLength: exifData.length}]}],
                })
            );

            const offsets = findOffsets(getDataView(metaBox.padEnd(200, '\x00') + exifData));

            expect(offsets.hasAppMarkers).to.be.true;
            expect(offsets.tiffHeaderOffset).to.be.a('number');
            expect(offsets.xmpChunks).to.be.undefined;
            expect(offsets.iccChunks).to.be.undefined;
        });

        it('should report app markers for a meta box with only an ICC profile', () => {
            const dataView = getDataView(getFullBox('meta', 0, buildIprpColrBox('<ICC content>')));

            const offsets = findOffsets(dataView);

            expect(offsets.hasAppMarkers).to.be.true;
            expect(offsets.iccChunks).to.have.lengthOf(1);
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

            it('should report Exif, XMP and ICC even if they are excluded from custom build', () => {
                const EXIF_ITEM_ID = 2;
                const XMP_ITEM_ID = 3;
                const xmpData = '<x:xmpmeta/>';
                const exifData = buildExifBlock('<Exif data>');
                const metaBox = getFullBox(
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
                            {itemId: EXIF_ITEM_ID, baseOffset: 0, extents: [{extentOffset: 200, extentLength: exifData.length}]},
                            {itemId: XMP_ITEM_ID, baseOffset: 0, extents: [{extentOffset: 300, extentLength: xmpData.length}]},
                        ],
                    })
                );
                const data = metaBox.padEnd(200, '\x00') + exifData.padEnd(100, '\x00') + xmpData;
                const restoreConstants = swapProperties(Constants, {USE_EXIF: false, USE_XMP: false, USE_ICC: false});
                try {
                    const metadataBlocks = [];
                    const offsets = findOffsets(getDataView(data), metadataBlocks);

                    expect(offsets.hasAppMarkers).to.be.true;
                    expect(offsets.tiffHeaderOffset).to.be.a('number');
                    expect(offsets.xmpChunks).to.deep.equal([{dataOffset: 300, length: xmpData.length}]);
                    expect(offsets.iccChunks).to.have.lengthOf(1);
                    expect(metadataBlocks.map((block) => block.type)).to.deep.equal(['exif', 'xmp', 'icc']);
                } finally {
                    restoreConstants();
                }
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

        describe('8-byte iloc field warning', () => {
            it('should warn once for an iloc box with thousands of 8-byte extents', () => {
                const dataView = getDataView(getFullBox('meta', 0, buildSizedIlocExifIinfBox() + build64BitIlocBoxWithManyExtents()));

                expect(countWarnings(() => findOffsets(dataView))).to.equal(1);
            });

            it('should warn once for an 8-byte iloc box in a meta box without an iinf box', () => {
                const dataView = getDataView(getFullBox('meta', 0, build64BitIlocBoxWithManyExtents()));

                expect(countWarnings(() => findOffsets(dataView))).to.equal(1);
            });

            it('should warn even if Exif, XMP and ICC are excluded from custom build', () => {
                const dataView = getDataView(getFullBox('meta', 0, buildSizedIlocExifIinfBox() + build64BitIlocBoxWithManyExtents()));
                const restoreConstants = swapProperties(Constants, {USE_EXIF: false, USE_XMP: false, USE_ICC: false});
                try {
                    expect(countWarnings(() => findOffsets(dataView))).to.equal(1);
                } finally {
                    restoreConstants();
                }
            });

            it('should not warn for an iloc box with 4-byte fields', () => {
                const ilocBox = buildIlocBox({
                    version: 0,
                    items: [{itemId: SIZED_ILOC_ITEM_ID, baseOffset: 0, extents: [{extentOffset: 0, extentLength: 16}]}],
                });
                const dataView = getDataView(getFullBox('meta', 0, buildSizedIlocExifIinfBox() + ilocBox) + '\x00'.repeat(64));

                expect(countWarnings(() => findOffsets(dataView))).to.equal(0);
            });

            it('should not warn or throw for a meta box without an iloc box', () => {
                const dataView = getDataView(getFullBox('meta', 0, buildSizedIlocExifIinfBox()));

                expect(countWarnings(() => findOffsets(dataView))).to.equal(0);
            });

            it('should not warn when only an iloc box after the first one has 8-byte fields', () => {
                const dataView = getDataView(getFullBox('meta', 0, buildSizedIlocExifIinfBox() + buildIlocBoxWithTwoItems() + build64BitIlocBoxWithManyExtents()));

                expect(countWarnings(() => findOffsets(dataView))).to.equal(0);
            });

            function countWarnings(callback) {
                const warnSpy = getConsoleWarnSpy();
                try {
                    callback();
                } finally {
                    warnSpy.reset();
                }
                return warnSpy.callCount;
            }
        });

        describe('primary item image spatial extents', () => {
            const PRIMARY_ITEM_ID = 49;
            const UNKNOWN_PROPERTY_BOX = getBox('hvcC', '<config>');
            const COLR_PROPERTY_BOX = getBox('colr', 'nclx\x00\x01\x00\x0d\x00\x06\x80');

            it('should point at the ispe associated with the primary item', () => {
                const ispe = buildIspeBox(12, 2);
                const data = buildPrimaryItemMetaBox({
                    properties: [UNKNOWN_PROPERTY_BOX, ispe],
                    ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1, 2]}])],
                });

                const offsets = findOffsets(getDataView(data));

                expect(offsets.imageDimensionsOffset).to.equal(getDimensionsOffset(data, ispe));
                expect(offsets.hasAppMarkers).to.be.false;
            });

            it('should pick the primary item\'s ispe over a tile\'s before it', () => {
                const tileIspe = buildIspeBox(512, 512);
                const primaryIspe = buildIspeBox(4032, 3024);
                const thumbnailIspe = buildIspeBox(320, 240);
                const data = buildPrimaryItemMetaBox({
                    properties: [tileIspe, primaryIspe, thumbnailIspe],
                    ipmas: [buildIpmaBox([
                        {itemId: 1, associations: [1]},
                        {itemId: PRIMARY_ITEM_ID, associations: [2]},
                        {itemId: 50, associations: [3]},
                    ])],
                });

                expect(findOffsets(getDataView(data)).imageDimensionsOffset)
                    .to.equal(getDimensionsOffset(data, primaryIspe));
            });

            it('should read 32-bit item IDs from a version 1 ipma', () => {
                const LARGE_ITEM_ID = 0x10031;
                const ispe = buildIspeBox(12, 2);
                const data = buildPrimaryItemMetaBox({
                    pitm: buildPitmBox(LARGE_ITEM_ID, 1),
                    properties: [ispe],
                    ipmas: [buildIpmaBox([{itemId: LARGE_ITEM_ID, associations: [1]}], {version: 1})],
                });

                expect(findOffsets(getDataView(data)).imageDimensionsOffset)
                    .to.equal(getDimensionsOffset(data, ispe));
            });

            it('should read 15-bit property indexes when flags bit 0 is set', () => {
                const ispe = buildIspeBox(12, 2);
                const unknownProperties = new Array(200).fill(UNKNOWN_PROPERTY_BOX);
                const data = buildPrimaryItemMetaBox({
                    properties: unknownProperties.concat([ispe]),
                    ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [201]}], {flags: 1})],
                });

                expect(findOffsets(getDataView(data)).imageDimensionsOffset)
                    .to.equal(getDimensionsOffset(data, ispe));
            });

            it('should ignore the essential bit of a 7-bit property index', () => {
                const ESSENTIAL = 0x80;
                const ispe = buildIspeBox(12, 2);
                const data = buildPrimaryItemMetaBox({
                    properties: [UNKNOWN_PROPERTY_BOX, ispe],
                    ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [ESSENTIAL | 2]}])],
                });

                expect(findOffsets(getDataView(data)).imageDimensionsOffset)
                    .to.equal(getDimensionsOffset(data, ispe));
            });

            it('should ignore the essential bit of a 15-bit property index', () => {
                const ESSENTIAL = 0x8000;
                const ispe = buildIspeBox(12, 2);
                const unknownProperties = new Array(200).fill(UNKNOWN_PROPERTY_BOX);
                const data = buildPrimaryItemMetaBox({
                    properties: unknownProperties.concat([ispe]),
                    ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [ESSENTIAL | 201]}], {flags: 1})],
                });

                expect(findOffsets(getDataView(data)).imageDimensionsOffset)
                    .to.equal(getDimensionsOffset(data, ispe));
            });

            it('should skip a too short ispe for a later one', () => {
                const tooShortIspe = getFullBox('ispe', 0, getByteStringFromNumber(12, 4));
                const ispe = buildIspeBox(12, 2);
                const data = buildPrimaryItemMetaBox({
                    properties: [tooShortIspe, ispe],
                    ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1, 2]}])],
                });

                expect(findOffsets(getDataView(data)).imageDimensionsOffset)
                    .to.equal(getDimensionsOffset(data, ispe));
            });

            it('should look for the primary item in a later ipma', () => {
                const ispe = buildIspeBox(12, 2);
                const data = buildPrimaryItemMetaBox({
                    properties: [ispe],
                    ipmas: [
                        buildIpmaBox([{itemId: 1, associations: []}]),
                        buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1]}]),
                    ],
                });

                expect(findOffsets(getDataView(data)).imageDimensionsOffset)
                    .to.equal(getDimensionsOffset(data, ispe));
            });

            it('should only use the first entry for the primary item', () => {
                const data = buildPrimaryItemMetaBox({
                    properties: [UNKNOWN_PROPERTY_BOX, buildIspeBox(12, 2)],
                    ipmas: [
                        buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1]}]),
                        buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [2]}]),
                    ],
                });

                expect(findOffsets(getDataView(data))).to.not.have.property('imageDimensionsOffset');
            });

            it('should find the ispe and no pixi when the primary item has only an ispe', () => {
                const ispe = buildIspeBox(12, 2);
                const data = buildPrimaryItemMetaBox({
                    properties: [ispe],
                    ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1]}])],
                });

                const offsets = findOffsets(getDataView(data));

                expect(offsets.imageDimensionsOffset).to.equal(getDimensionsOffset(data, ispe));
                expect(offsets).to.not.have.property('pixelInformationOffset');
            });

            it('should return neither an ispe nor a pixi offset without a pitm', () => {
                const data = buildPrimaryItemMetaBox({
                    pitm: '',
                    properties: [buildIspeBox(12, 2), buildPixiBox([8, 8, 8])],
                    ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1, 2]}])],
                });

                const offsets = findOffsets(getDataView(data));

                expect(offsets).to.not.have.property('imageDimensionsOffset');
                expect(offsets).to.not.have.property('pixelInformationOffset');
            });

            describe('without a resolvable ispe', () => {
                const ispe = buildIspeBox(12, 2);
                const primaryToIspe = buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1]}]);

                function expectNoOffset(data) {
                    expect(findOffsets(getDataView(data))).to.not.have.property('imageDimensionsOffset');
                }

                it('should return no offset without a pitm', () => {
                    expectNoOffset(buildPrimaryItemMetaBox({pitm: '', properties: [ispe], ipmas: [primaryToIspe]}));
                });

                it('should return no offset for a too short pitm', () => {
                    const tooShortPitm = getFullBox('pitm', 1, getByteStringFromNumber(PRIMARY_ITEM_ID, 2));
                    expectNoOffset(buildPrimaryItemMetaBox({pitm: tooShortPitm, properties: [ispe], ipmas: [primaryToIspe]}));
                });

                it('should return no offset without an iprp', () => {
                    expectNoOffset(getFullBox('meta', 0, buildPitmBox(PRIMARY_ITEM_ID)));
                });

                it('should return no offset for an iprp without an ipco', () => {
                    expectNoOffset(getFullBox('meta', 0, buildPitmBox(PRIMARY_ITEM_ID) + getBox('iprp', primaryToIspe)));
                });

                it('should return no offset without an ipma', () => {
                    expectNoOffset(buildPrimaryItemMetaBox({properties: [ispe], ipmas: []}));
                });

                it('should return no offset when the primary item has no ipma entry', () => {
                    expectNoOffset(buildPrimaryItemMetaBox({
                        properties: [ispe],
                        ipmas: [buildIpmaBox([{itemId: 1, associations: [1]}])],
                    }));
                });

                it('should return no offset when the primary item has no ispe', () => {
                    expectNoOffset(buildPrimaryItemMetaBox({
                        properties: [UNKNOWN_PROPERTY_BOX, COLR_PROPERTY_BOX, ispe],
                        ipmas: [buildIpmaBox([
                            {itemId: PRIMARY_ITEM_ID, associations: [1, 2]},
                            {itemId: 1, associations: [3]},
                        ])],
                    }));
                });

                it('should return no offset for property index 0', () => {
                    expectNoOffset(buildPrimaryItemMetaBox({
                        properties: [ispe],
                        ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [0]}])],
                    }));
                });

                it('should return no offset for a property index past the last property', () => {
                    expectNoOffset(buildPrimaryItemMetaBox({
                        properties: [ispe],
                        ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [2]}])],
                    }));
                });

                it('should return no offset when the primary item\'s only ispe is too short', () => {
                    const tooShortIspe = getFullBox('ispe', 0, getByteStringFromNumber(12, 4));
                    expectNoOffset(buildPrimaryItemMetaBox({properties: [tooShortIspe], ipmas: [primaryToIspe]}));
                });

                it('should return no offset when the ipma ends before the primary item\'s entry', () => {
                    const ipma = buildIpmaBox([
                        {itemId: 1, associations: [1]},
                        {itemId: PRIMARY_ITEM_ID, associations: [1]},
                    ]);
                    const ENTRY_SIZE = 4;
                    const endsInsideTheSecondEntry = withDeclaredLength(ipma, ipma.length - ENTRY_SIZE + 2);
                    expectNoOffset(buildPrimaryItemMetaBox({properties: [ispe], ipmas: [endsInsideTheSecondEntry]}));
                });

                it('should return no offset when the ipma ends before the primary item\'s association', () => {
                    const ipma = buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1]}]);
                    const endsBeforeTheAssociation = withDeclaredLength(ipma, ipma.length - 1);
                    expectNoOffset(buildPrimaryItemMetaBox({properties: [ispe], ipmas: [endsBeforeTheAssociation]}));
                });

                it('should return no offset when a 15-bit association runs past the ipma', () => {
                    const ipma = buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1]}], {flags: 1});
                    const endsInsideTheAssociation = withDeclaredLength(ipma, ipma.length - 1);
                    expectNoOffset(buildPrimaryItemMetaBox({properties: [ispe], ipmas: [endsInsideTheAssociation]}));
                });

                it('should only read the associations inside the ipma', () => {
                    // The entry declares more associations than the box holds,
                    // and the byte after the box would point at the ispe.
                    const entries = getByteStringFromNumber(PRIMARY_ITEM_ID, 2) + getByteStringFromNumber(255, 1)
                        + getByteStringFromNumber(1, 1);
                    const ipma = getFullBox('ipma', 0, getByteStringFromNumber(1, 4) + entries);
                    const pastTheIpma = getByteStringFromNumber(2, 1);
                    expectNoOffset(buildPrimaryItemMetaBox({
                        properties: [UNKNOWN_PROPERTY_BOX, ispe],
                        ipmas: [ipma + pastTheIpma],
                    }));
                });

                it('should stop at the ipma end whatever entry count it declares', () => {
                    // The bytes after the box would read as the primary item's entry.
                    const otherItemEntry = getByteStringFromNumber(1, 2) + getByteStringFromNumber(1, 1)
                        + getByteStringFromNumber(1, 1);
                    const primaryItemEntry = getByteStringFromNumber(PRIMARY_ITEM_ID, 2) + getByteStringFromNumber(1, 1)
                        + getByteStringFromNumber(1, 1);
                    const ipma = getFullBox('ipma', 0, getByteStringFromNumber(0xffffffff, 4) + otherItemEntry);
                    expectNoOffset(buildPrimaryItemMetaBox({properties: [ispe], ipmas: [ipma + primaryItemEntry]}));
                });

                it('should return no offset when the declared entry count ends the scan first', () => {
                    const ipma = buildIpmaBox([
                        {itemId: 1, associations: [1]},
                        {itemId: PRIMARY_ITEM_ID, associations: [1]},
                    ]);
                    const ENTRY_COUNT_OFFSET = FULL_BOX_HEADER_SIZE;
                    const declaringOneEntry = ipma.substring(0, ENTRY_COUNT_OFFSET)
                        + getByteStringFromNumber(1, 4) + ipma.substring(ENTRY_COUNT_OFFSET + 4);
                    expectNoOffset(buildPrimaryItemMetaBox({properties: [ispe], ipmas: [declaringOneEntry]}));
                });
            });

            describe('pixel information', () => {
                it('should pick the primary item\'s pixi over a tile\'s before it and a thumbnail\'s after it', () => {
                    const tilePixi = buildPixiBox([10, 10, 10]);
                    const primaryPixi = buildPixiBox([8, 8, 8]);
                    const thumbnailPixi = buildPixiBox([12, 12, 12]);
                    const data = buildPrimaryItemMetaBox({
                        properties: [tilePixi, primaryPixi, thumbnailPixi],
                        ipmas: [buildIpmaBox([
                            {itemId: 1, associations: [1]},
                            {itemId: PRIMARY_ITEM_ID, associations: [2]},
                            {itemId: 50, associations: [3]},
                        ])],
                    });

                    expect(findOffsets(getDataView(data)).pixelInformationOffset)
                        .to.equal(getChannelCountOffset(data, primaryPixi));
                });

                it('should not use a pixi associated only with another item', () => {
                    const ispe = buildIspeBox(12, 2);
                    const data = buildPrimaryItemMetaBox({
                        properties: [ispe, buildPixiBox([8, 8, 8])],
                        ipmas: [buildIpmaBox([
                            {itemId: PRIMARY_ITEM_ID, associations: [1]},
                            {itemId: 1, associations: [2]},
                        ])],
                    });

                    const offsets = findOffsets(getDataView(data));

                    expect(offsets).to.not.have.property('pixelInformationOffset');
                    expect(offsets.imageDimensionsOffset).to.equal(getDimensionsOffset(data, ispe));
                });

                it('should return no offset without a pixi', () => {
                    const data = buildPrimaryItemMetaBox({
                        properties: [buildIspeBox(12, 2)],
                        ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1]}])],
                    });

                    expect(findOffsets(getDataView(data))).to.not.have.property('pixelInformationOffset');
                });

                it('should return no offset when the primary item\'s only pixi is too short', () => {
                    const ispe = buildIspeBox(12, 2);
                    const tooShortPixi = getFullBox('pixi', 0, '\x03\x08\x08');
                    const data = buildPrimaryItemMetaBox({
                        properties: [ispe, tooShortPixi],
                        ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1, 2]}])],
                    });

                    const offsets = findOffsets(getDataView(data));

                    expect(offsets).to.not.have.property('pixelInformationOffset');
                    expect(offsets.imageDimensionsOffset).to.equal(getDimensionsOffset(data, ispe));
                });

                it('should resolve the ispe and a pixi after it from one association list', () => {
                    const ispe = buildIspeBox(12, 2);
                    const pixi = buildPixiBox([8, 8, 8]);
                    const data = buildPrimaryItemMetaBox({
                        properties: [ispe, pixi],
                        ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1, 2]}])],
                    });

                    const offsets = findOffsets(getDataView(data));

                    expect(offsets.imageDimensionsOffset).to.equal(getDimensionsOffset(data, ispe));
                    expect(offsets.pixelInformationOffset).to.equal(getChannelCountOffset(data, pixi));
                });

                it('should resolve a pixi and the ispe after it from one association list', () => {
                    const pixi = buildPixiBox([8, 8, 8]);
                    const ispe = buildIspeBox(12, 2);
                    const data = buildPrimaryItemMetaBox({
                        properties: [pixi, ispe],
                        ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1, 2]}])],
                    });

                    const offsets = findOffsets(getDataView(data));

                    expect(offsets.imageDimensionsOffset).to.equal(getDimensionsOffset(data, ispe));
                    expect(offsets.pixelInformationOffset).to.equal(getChannelCountOffset(data, pixi));
                });

                it('should find only the ispe and the pixi offsets of an otherwise empty meta box', () => {
                    const ispe = buildIspeBox(12, 2);
                    const pixi = buildPixiBox([8, 8, 8]);
                    const data = buildPrimaryItemMetaBox({
                        properties: [ispe, pixi],
                        ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1, 2]}])],
                    });

                    expect(findOffsets(getDataView(data))).to.deep.equal({
                        hasAppMarkers: false,
                        iccChunks: undefined,
                        imageDimensionsOffset: getDimensionsOffset(data, ispe),
                        pixelInformationOffset: getChannelCountOffset(data, pixi),
                    });
                });

                it('should find the pixi without an ispe', () => {
                    const pixi = buildPixiBox([8, 8, 8]);
                    const data = buildPrimaryItemMetaBox({
                        properties: [UNKNOWN_PROPERTY_BOX, pixi],
                        ipmas: [buildIpmaBox([{itemId: PRIMARY_ITEM_ID, associations: [1, 2]}])],
                    });

                    const offsets = findOffsets(getDataView(data));

                    expect(offsets.pixelInformationOffset).to.equal(getChannelCountOffset(data, pixi));
                    expect(offsets).to.not.have.property('imageDimensionsOffset');
                });
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

        it('should still find the Exif offset when a later iloc item header is truncated', () => {
            // The Exif payload sits in a skipped box before the meta box so it
            // survives when the buffer ends mid-header of the second iloc item.
            const EXIF_ITEM_ID = 2;
            const exifBlock = buildExifBlock('<TIFF data>');
            const payloadBox = getBox('mdat', exifBlock);
            const iinfBox = buildIinfBox([{itemId: EXIF_ITEM_ID, itemType: ITEM_INFO_TYPE_EXIF}]);
            const sizesByte = getByteStringFromNumber(0x44, 1);
            const baseOffsetAndIndexByte = getByteStringFromNumber(0x40, 1);
            const itemCount = getByteStringFromNumber(2, 2);
            const dataReferenceIndex = getByteStringFromNumber(0, 2);
            const baseOffset = getByteStringFromNumber(0, 4);
            const extentCount = getByteStringFromNumber(1, 2);
            const extent = getByteStringFromNumber(PLAIN_BOX_HEADER_SIZE, 4)
                + getByteStringFromNumber(exifBlock.length, 4);
            const exifItem = getByteStringFromNumber(EXIF_ITEM_ID, 2)
                + dataReferenceIndex + baseOffset + extentCount + extent;
            const truncatedItemHeader = getByteStringFromNumber(3, 2);
            const truncatedIloc = getFullBox(
                'iloc',
                0,
                sizesByte + baseOffsetAndIndexByte + itemCount + exifItem + truncatedItemHeader
            );
            const dataView = getDataView(payloadBox + getFullBox('meta', 0, iinfBox + truncatedIloc));

            const result = findOffsets(dataView);

            expect(result.tiffHeaderOffset).to.equal(PLAIN_BOX_HEADER_SIZE + 4 + 'Exif\x00\x00'.length);
        });

        describe('infe string bounds', () => {
            const ITEM_ID = getByteStringFromNumber(2, 2);
            const ITEM_PROTECTION_INDEX = getByteStringFromNumber(0, 2);
            const EXIF_TYPE = getByteStringFromNumber(ITEM_INFO_TYPE_EXIF, 4);
            const MIME_TYPE = getByteStringFromNumber(ITEM_INFO_TYPE_MIME, 4);
            const URI_TYPE = 'uri ';
            const XMP_CONTENT_TYPE = 'application/rdf+xml';

            it('should stop a version 2 item name without NUL at the box end', () => {
                const box = getFullBox('infe', 2, ITEM_ID + ITEM_PROTECTION_INDEX + EXIF_TYPE + 'A name');
                const dataView = getDataView(box + NON_NUL_TRAILING_BYTES);

                expect(parseBox(dataView, 0)).to.deep.equal({
                    type: 'infe',
                    itemId: 2,
                    itemProtectionIndex: 0,
                    itemType: ITEM_INFO_TYPE_EXIF,
                    itemName: 'A name',
                    length: box.length
                });
            });

            it('should stop a version 0 item name without NUL at the box end', () => {
                const box = getFullBox('infe', 0, ITEM_ID + ITEM_PROTECTION_INDEX + 'A name');
                const dataView = getDataView(box + NON_NUL_TRAILING_BYTES);

                expect(parseBox(dataView, 0)).to.deep.equal({
                    type: 'infe',
                    itemId: 2,
                    itemProtectionIndex: 0,
                    itemName: 'A name',
                    length: box.length
                });
            });

            it('should stop a content type without NUL at the box end and read no content encoding', () => {
                const box = getFullBox(
                    'infe',
                    2,
                    ITEM_ID + ITEM_PROTECTION_INDEX + MIME_TYPE + '\x00' + XMP_CONTENT_TYPE
                );
                const dataView = getDataView(box + NON_NUL_TRAILING_BYTES);

                expect(parseBox(dataView, 0)).to.deep.equal({
                    type: 'infe',
                    itemId: 2,
                    itemProtectionIndex: 0,
                    itemType: ITEM_INFO_TYPE_MIME,
                    itemName: '',
                    contentType: XMP_CONTENT_TYPE,
                    length: box.length
                });
            });

            it('should stop a content encoding without NUL at the box end', () => {
                const box = getFullBox(
                    'infe',
                    2,
                    ITEM_ID + ITEM_PROTECTION_INDEX + MIME_TYPE + '\x00' + XMP_CONTENT_TYPE + '\x00' + 'gzip'
                );
                const dataView = getDataView(box + NON_NUL_TRAILING_BYTES);

                expect(parseBox(dataView, 0).contentEncoding).to.equal('gzip');
            });

            it('should stop an item URI without NUL at the box end', () => {
                const box = getFullBox(
                    'infe',
                    2,
                    ITEM_ID + ITEM_PROTECTION_INDEX + URI_TYPE + '\x00' + 'urn:example'
                );
                const dataView = getDataView(box + NON_NUL_TRAILING_BYTES);

                expect(parseBox(dataView, 0).itemUri).to.equal('urn:example');
            });

            it('should stop the item name of an over-declaring infe at the end of its iinf', () => {
                const entryCount = getByteStringFromNumber(1, 2);
                const infe = withDeclaredLength(
                    getFullBox('infe', 2, ITEM_ID + ITEM_PROTECTION_INDEX + EXIF_TYPE + 'A name'),
                    OVER_DECLARED_BOX_LENGTH
                );
                const dataView = getDataView(getFullBox('iinf', 0, entryCount + infe) + NON_NUL_TRAILING_BYTES);

                expect(parseBox(dataView, 0).itemInfos[0].itemName).to.equal('A name');
            });

            it('should read no content encoding past the end of the iinf of an over-declaring infe', () => {
                const entryCount = getByteStringFromNumber(1, 2);
                const infe = withDeclaredLength(
                    getFullBox('infe', 2, ITEM_ID + ITEM_PROTECTION_INDEX + MIME_TYPE + '\x00' + XMP_CONTENT_TYPE + '\x00'),
                    OVER_DECLARED_BOX_LENGTH
                );
                const dataView = getDataView(getFullBox('iinf', 0, entryCount + infe) + 'gzip\x00');

                const entry = parseBox(dataView, 0).itemInfos[0];

                expect(entry.contentType).to.equal(XMP_CONTENT_TYPE);
                expect(entry).to.not.have.property('contentEncoding');
            });

            it('should cut an item name at the length cap and read no further strings', () => {
                const longName = 'a'.repeat(MAX_INFE_STRING_LENGTH + 10);
                const box = getFullBox(
                    'infe',
                    2,
                    ITEM_ID + ITEM_PROTECTION_INDEX + MIME_TYPE + longName + '\x00' + XMP_CONTENT_TYPE + '\x00'
                );

                const entry = parseBox(getDataView(box), 0);

                expect(entry.itemName).to.equal('a'.repeat(MAX_INFE_STRING_LENGTH));
                expect(entry).to.not.have.property('contentType');
            });

            it('should cut a content type at the length cap and read no content encoding', () => {
                const longContentType = 'a'.repeat(MAX_INFE_STRING_LENGTH + 10);
                const box = getFullBox(
                    'infe',
                    2,
                    ITEM_ID + ITEM_PROTECTION_INDEX + MIME_TYPE + '\x00' + longContentType + '\x00' + 'gzip\x00'
                );

                const entry = parseBox(getDataView(box), 0);

                expect(entry.contentType).to.equal('a'.repeat(MAX_INFE_STRING_LENGTH));
                expect(entry).to.not.have.property('contentEncoding');
            });

            it('should read the strings after an item name one byte shorter than the length cap', () => {
                const longName = 'a'.repeat(MAX_INFE_STRING_LENGTH - 1);
                const box = getFullBox(
                    'infe',
                    2,
                    ITEM_ID + ITEM_PROTECTION_INDEX + MIME_TYPE + longName + '\x00' + XMP_CONTENT_TYPE + '\x00'
                );

                const entry = parseBox(getDataView(box), 0);

                expect(entry.itemName).to.equal(longName);
                expect(entry.contentType).to.equal(XMP_CONTENT_TYPE);
            });

            it('should still parse the next infe after an item name without NUL', () => {
                const entryCount = getByteStringFromNumber(2, 2);
                const unterminatedInfe = getFullBox('infe', 2, ITEM_ID + ITEM_PROTECTION_INDEX + EXIF_TYPE + 'A name');
                const xmpInfe = getFullBox(
                    'infe',
                    2,
                    buildInfeEntry({itemId: 3, itemType: ITEM_INFO_TYPE_MIME, contentType: XMP_CONTENT_TYPE})
                );
                const dataView = getDataView(getFullBox('iinf', 0, entryCount + unterminatedInfe + xmpInfe));

                const {itemInfos} = parseBox(dataView, 0);

                expect(itemInfos).to.have.lengthOf(2);
                expect(itemInfos[0].itemName).to.equal('A name');
                expect(itemInfos[1]).to.include({itemId: 3, contentType: XMP_CONTENT_TYPE});
            });

            it('should find the Exif offset when the Exif item name has no NUL', () => {
                const EXIF_ITEM_ID = 2;
                const exifBlock = buildExifBlock('<TIFF data>');
                const payloadBox = getBox('mdat', exifBlock);
                const entryCount = getByteStringFromNumber(1, 2);
                const iinfBox = getFullBox(
                    'iinf',
                    0,
                    entryCount + getFullBox(
                        'infe',
                        2,
                        getByteStringFromNumber(EXIF_ITEM_ID, 2) + ITEM_PROTECTION_INDEX + EXIF_TYPE + 'A name'
                    )
                );
                const ilocBox = buildIlocBox({
                    version: 0,
                    items: [{
                        itemId: EXIF_ITEM_ID,
                        baseOffset: 0,
                        extents: [{extentOffset: PLAIN_BOX_HEADER_SIZE, extentLength: exifBlock.length}]
                    }]
                });
                const dataView = getDataView(payloadBox + getFullBox('meta', 0, iinfBox + ilocBox));

                const result = findOffsets(dataView);

                expect(result.tiffHeaderOffset).to.equal(PLAIN_BOX_HEADER_SIZE + 4 + 'Exif\x00\x00'.length);
            });
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

            it('should return undefined for a box whose extended size is zero', () => {
                // The trailing bytes keep the version-byte check from also returning undefined.
                const dataView = getDataView(
                    getByteStringFromNumber(1, 4) + 'free'
                    + getByteStringFromNumber(0, 4) + getByteStringFromNumber(0, 4)
                    + '\x00'.repeat(8)
                );
                expect(parseBox(dataView, 0)).to.be.undefined;
            });

            it('should return undefined for a box whose extended size is shorter than its 16-byte header', () => {
                const dataView = getDataView(getExtendedSizeFreeBox(8));
                expect(parseBox(dataView, 0)).to.be.undefined;
            });

            it('should require an extended size of at least 16', () => {
                expect(parseBox(getDataView(getExtendedSizeFreeBox(15)), 0)).to.be.undefined;
                expect(parseBox(getDataView(getExtendedSizeFreeBox(16)), 0).length).to.equal(16);
            });

            it('should return undefined for an extended-size box whose header crosses the container end', () => {
                const dataView = getDataView(getExtendedSizeFreeBox(16));
                expect(parseBox(dataView, 0, 12)).to.be.undefined;
                expect(parseBox(dataView, 0, 16).length).to.equal(16);
            });

            it('should stop walking the sub boxes of a container at such a header', () => {
                const iprpWithChildHeaderCrossingItsEnd = withDeclaredLength(getBox('iprp', getExtendedSizeFreeBox(16)), 8 + 12);
                const dataView = getDataView(iprpWithChildHeaderCrossingItsEnd);
                expect(parseBox(dataView, 0).subBoxes).to.deep.equal([]);
            });

            function getExtendedSizeFreeBox(extendedSize) {
                // The trailing bytes keep the version-byte check from also returning undefined.
                return getByteStringFromNumber(1, 4) + 'free'
                    + getByteStringFromNumber(0, 4) + getByteStringFromNumber(extendedSize, 4)
                    + '\x00'.repeat(8);
            }
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
    return getFullBoxWithFlags(type, version, 0, content);
}

function getFullBoxWithFlags(type, version, flags, content) {
    const FLAGS_SIZE = 3;
    return getBox(type, String.fromCharCode(version) + getByteStringFromNumber(flags, FLAGS_SIZE) + content);
}

function buildIspeBox(width, height) {
    return getFullBox('ispe', 0, getByteStringFromNumber(width, 4) + getByteStringFromNumber(height, 4));
}

function buildPixiBox(depths) {
    return getFullBox(
        'pixi',
        0,
        getByteStringFromNumber(depths.length, 1) + depths.map((depth) => getByteStringFromNumber(depth, 1)).join('')
    );
}

function buildPitmBox(itemId, version = 0) {
    return getFullBox('pitm', version, getByteStringFromNumber(itemId, version === 0 ? 2 : 4));
}

function buildIpmaBox(entries, {version = 0, flags = 0} = {}) {
    const itemIdSize = version < 1 ? 2 : 4;
    const associationSize = (flags & 1) ? 2 : 1;
    const entryBytes = entries.map(({itemId, associations}) =>
        getByteStringFromNumber(itemId, itemIdSize)
        + getByteStringFromNumber(associations.length, 1)
        + associations.map((association) => getByteStringFromNumber(association, associationSize)).join('')
    ).join('');
    return getFullBoxWithFlags('ipma', version, flags, getByteStringFromNumber(entries.length, 4) + entryBytes);
}

// A meta box holding pitm and iprp > (ipco, ipma...), item 49 primary by default.
function buildPrimaryItemMetaBox({pitm = buildPitmBox(49), properties, ipmas}) {
    return getFullBox('meta', 0, pitm + getBox('iprp', getBox('ipco', properties.join('')) + ipmas.join('')));
}

function getDimensionsOffset(data, ispeBox) {
    return data.indexOf(ispeBox) + FULL_BOX_HEADER_SIZE;
}

function getChannelCountOffset(data, pixiBox) {
    return data.indexOf(pixiBox) + FULL_BOX_HEADER_SIZE;
}

// Full-box header is 4 (length) + 4 (type) + 1 (version) + 3 (flags) = 12 bytes.
const FULL_BOX_HEADER_SIZE = 12;

// Plain-box header is 4 (length) + 4 (type) = 8 bytes (no version/flags).
const PLAIN_BOX_HEADER_SIZE = 8;

const BOX_TYPE_SIZE = 4;

// The 64-bit size field an extended-size box carries after its type.
const BOX_EXTENDED_SIZE = 8;

// Where a version 0 iloc built by buildIlocBox puts its first item: the
// full-box header, the two size-nibble bytes, and the 2-byte itemCount.
const ILOC_ITEMS_OFFSET = FULL_BOX_HEADER_SIZE + 4;

// Sizes implied by the 0x44/0x40 size nibbles buildIlocBox uses: a 4-byte base
// offset in the item header, and a 4-byte offset and length per extent.
const ILOC_ITEM_HEADER_SIZE = 10;
const ILOC_EXTENT_SIZE = 8;

// The same item header when the base offset size nibble is 0 instead of 4.
const ILOC_ITEM_HEADER_SIZE_NO_BASE_OFFSET = 6;

// Rewrites a built box's length field so it declares something other than the
// number of bytes actually written, which getFullBox cannot express.
function withDeclaredLength(box, declaredLength) {
    return getByteStringFromNumber(declaredLength, 4) + box.substring(4);
}

// A length no test buffer comes near, for boxes that claim far more than they
// or their container actually hold.
const OVER_DECLARED_BOX_LENGTH = 0x00ffffff;

// Bytes after a box that an unbounded string read would run into.
const NON_NUL_TRAILING_BYTES = 'TRAILING';

// Kept separate from the source value so that a change to the cap there fails a test.
const MAX_INFE_STRING_LENGTH = 65536;

// Just the 16-byte header of an iloc, declaring a length that reaches well past
// whatever container it is put in. Its item list would start exactly where the
// header ends, so a correctly bounded parse reads no items from it.
function buildOverDeclaringTinyIloc() {
    // offsetSize 0 and lengthSize 1, so an extent takes a single byte.
    const sizesByte = getByteStringFromNumber(0x01, 1);
    const baseOffsetAndIndexByte = getByteStringFromNumber(0x00, 1);
    const itemCount = getByteStringFromNumber(0xffff, 2);

    return withDeclaredLength(
        getFullBox('iloc', 0, sizesByte + baseOffsetAndIndexByte + itemCount),
        OVER_DECLARED_BOX_LENGTH
    );
}

// Two iloc items of one extent each, used to check that the second item is
// dropped when the box's declared length stops after the first.
function buildIlocBoxWithTwoItems() {
    return buildIlocBox({
        version: 0,
        items: [
            {itemId: 1, baseOffset: 0, extents: [{extentOffset: 10, extentLength: 20}]},
            {itemId: 2, baseOffset: 0, extents: [{extentOffset: 30, extentLength: 40}]},
        ],
    });
}

// One iloc item declaring two extents, used to check that the second extent is
// dropped when the box's declared length stops after the first.
function buildIlocBoxWithTwoExtents() {
    return buildIlocBox({
        version: 0,
        items: [{
            itemId: 1,
            baseOffset: 0,
            extents: [
                {extentOffset: 10, extentLength: 20},
                {extentOffset: 30, extentLength: 40},
            ],
        }],
    });
}

// Re-wraps a built box as a 64-bit extended-size box, which carries its real
// size after the type and so moves the content 8 bytes further in.
function asExtendedSizeBox(box, declaredLength) {
    const EXTENDED_SIZE_FLAG = getByteStringFromNumber(1, 4);
    const HIGH_BITS = getByteStringFromNumber(0, 4);
    const typeAndContent = box.substring(4);

    return EXTENDED_SIZE_FLAG
        + typeAndContent.substring(0, BOX_TYPE_SIZE)
        + HIGH_BITS
        + getByteStringFromNumber(declaredLength, 4)
        + typeAndContent.substring(BOX_TYPE_SIZE);
}

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

const SIZED_ILOC_ITEM_ID = 2;

function build64BitIlocBoxWithManyExtents() {
    const EXTENT_COUNT = 5000;
    return buildSizedIlocBox({
        version: 0,
        offsetSize: 8,
        lengthSize: 8,
        baseOffsetSize: 8,
        indexSize: 0,
        baseOffset: 0,
        extents: Array.from({length: EXTENT_COUNT}, () => ({extentOffset: 0, extentLength: 0}))
    });
}

// One item whose fields have the given byte sizes. Only sizes 4 and 8 write
// bytes. Version 0 writes indexSize into the reserved nibble but no extent
// index bytes.
function buildSizedIlocBox({version, offsetSize, lengthSize, baseOffsetSize, indexSize, baseOffset, extents}) {
    const hasIndexAndConstructionMethod = version === 1;
    const sizesByte = getByteStringFromNumber((offsetSize << 4) | lengthSize, 1);
    const baseOffsetSizeAndIndexByte = getByteStringFromNumber((baseOffsetSize << 4) | indexSize, 1);
    const itemCount = getByteStringFromNumber(1, 2);
    const constructionMethod = hasIndexAndConstructionMethod ? getByteStringFromNumber(0, 2) : '';
    const dataReferenceIndex = getByteStringFromNumber(0, 2);
    const extentBytes = extents.map((extent) =>
        (hasIndexAndConstructionMethod ? getSizedValueBytes(extent.extentIndex, indexSize) : '')
        + getSizedValueBytes(extent.extentOffset, offsetSize)
        + getSizedValueBytes(extent.extentLength, lengthSize)
    ).join('');

    return getFullBox(
        'iloc',
        version,
        sizesByte + baseOffsetSizeAndIndexByte + itemCount
        + getByteStringFromNumber(SIZED_ILOC_ITEM_ID, 2) + constructionMethod + dataReferenceIndex
        + getSizedValueBytes(baseOffset, baseOffsetSize)
        + getByteStringFromNumber(extents.length, 2) + extentBytes
    );
}

function buildSizedIlocExifIinfBox() {
    return buildIinfBox([{itemId: SIZED_ILOC_ITEM_ID, itemType: ITEM_INFO_TYPE_EXIF}]);
}

function getSizedValueBytes(value, size) {
    if (size === 8) {
        return getByteStringFromNumber(0, 4) + getByteStringFromNumber(value, 4);
    }
    if (size === 4) {
        return getByteStringFromNumber(value, 4);
    }
    return '';
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
