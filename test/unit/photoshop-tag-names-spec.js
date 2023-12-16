/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import PhotoshopTagNames, {
    // OsTypeKeys,
    PathRecordTypes,
} from '../../src/photoshop-tag-names';
import {getDataView} from './test-utils';

describe('photoshop-tag-names', () => {
    // it('should have tag CaptionDigest', () => {
    //     expect(PhotoshopTagNames[0x0425].name).to.equal('CaptionDigest');
    //     expect(PhotoshopTagNames[0x0425]
    //         .description(getDataView('\xab\xcd\x01\x23\xab\xcd\x01\x23\xab\xcd\x01\x23\xab\xcd\x01\x23')))
    //         .to.equal('abcd0123abcd0123abcd0123abcd0123');
    // });

    // it('should have tag PrintInformation', () => {
    //     const CLASS_ID_LENGTH = '\x00\x00\x00\x0b';
    //     const CLASS_ID = 'printOutput';
    //     const ITEMS = [
    //         {
    //             length: '\x00\x00\x00\x0f',
    //             key: 'printProofSetup',
    //             osTypeKey: OsTypeKeys.OBJC,
    //             value: '\x00\x00\x00\x0c\x00P\x00r\x00o\x00o\x00f\x00 \x00S\x00e\x00t\x00u\x00p\x00\x00'
    //                 + '\x00\x00\x00\x0aproofSetup\x00\x00\x00\x01'
    //         },
    //         {
    //             length: '\x00\x00\x00\x0b',
    //             key: 'printerName',
    //             osTypeKey: OsTypeKeys.TEXT,
    //             value: '\x00\x00\x00\x02\x00\x4e\x00\x00'
    //         },
    //         {
    //             length: '\x00\x00\x00\x04',
    //             key: 'PstS',
    //             osTypeKey: OsTypeKeys.BOOL,
    //             value: '\x01'
    //         },
    //         {
    //             length: '\x00\x00\x00\x00',
    //             key: 'Inte',
    //             osTypeKey: OsTypeKeys.ENUM,
    //             value: '\x00\x00\x00\x00Inte\x00\x00\x00\x00Clrm'
    //         },
    //     ];

    //     expect(PhotoshopTagNames[0x043a].name).to.equal('PrintInformation');
    //     expect(JSON.parse(PhotoshopTagNames[0x043a].description(getPrintInformationDataView(CLASS_ID_LENGTH, CLASS_ID, ITEMS))))
    //         .to.deep.equal({
    //             printOutput: {
    //                 printProofSetup: {'Proof Setup': {proofSetup: 1}},
    //                 printerName: 'N',
    //                 PostScriptColor: true,
    //                 Intent: {Inte: 'Clrm'},
    //             }
    //         });
    // });

    // it('should handle tag PrintInformation with class ID length of zero', () => {
    //     const CLASS_ID_LENGTH = '\x00\x00\x00\x00';
    //     const CLASS_ID = 'prnt';
    //     const ITEMS = [
    //         {
    //             length: '\x00\x00\x00\x04',
    //             key: 'PstS',
    //             osTypeKey: OsTypeKeys.BOOL,
    //             value: '\x01'
    //         },
    //     ];

    //     expect(JSON.parse(PhotoshopTagNames[0x043a].description(getPrintInformationDataView(CLASS_ID_LENGTH, CLASS_ID, ITEMS))))
    //         .to.deep.equal({
    //             prnt: {
    //                 PostScriptColor: true,
    //             }
    //         });
    // });

    // it('should have tag PrintStyle', () => {
    //     const CLASS_ID_LENGTH = '\x00\x00\x00\x12';
    //     const CLASS_ID = 'printOutputOptions';
    //     const ITEMS = [
    //         {
    //             length: '\x00\x00\x00\x00',
    //             key: 'Cptn',
    //             osTypeKey: OsTypeKeys.BOOL,
    //             value: '\x00'
    //         },
    //         {
    //             length: '\x00\x00\x00\x00',
    //             key: 'Rd  ',
    //             osTypeKey: OsTypeKeys.DOUB,
    //             value: '\x40\x6f\xe0\x00\x00\x00\x00\x00'
    //         },
    //         {
    //             length: '\x00\x00\x00\x00',
    //             key: 'BrdT',
    //             osTypeKey: OsTypeKeys.UNTF,
    //             value: '#Rlt\x00\x00\x00\x00\x00\x00\x00\x00'
    //         },
    //         {
    //             length: '\x00\x00\x00\x0e',
    //             key: 'cropRectBottom',
    //             osTypeKey: OsTypeKeys.LONG,
    //             value: '\x00\x00\x00\x42'
    //         },
    //     ];

    //     expect(PhotoshopTagNames[0x043b].name).to.equal('PrintStyle');
    //     expect(JSON.parse(PhotoshopTagNames[0x043b].description(getPrintInformationDataView(CLASS_ID_LENGTH, CLASS_ID, ITEMS))))
    //         .to.deep.equal({
    //             printOutputOptions: {
    //                 Caption: false,
    //                 Red: 255,
    //                 BorderThickness: {
    //                     unit: '#Rlt',
    //                     value: 1.1125369292536007e-308
    //                 },
    //                 cropRectBottom: 0x42
    //             }
    //         });
    // });

    it('should handle tag PathInformation', () => {
        const BEZIER_KNOT = '\xbc\x00\x00\x00\x01\x00\x00\x00'
            + '\x02\x80\x00\x00\x00\x80\x00\x00'
            + '\x02\x00\x00\x00\x03\x00\x00\x00';
        const BEZIER_KNOT_PATH = [[1.0, -60.0], [0.5, 2.5], [3.0, 2.0]];
        const PATH_RECORDS = [
            '\x00\x06' + '\x00'.repeat(24),
            '\x00\x08' + '\x00\x01' + '\x00'.repeat(22),
            '\x00\x05' + BEZIER_KNOT,
            '\x00\x02' + '\x00\x19\xce\x48\x00\x7a\xa5\xc3' + '\x00\x19\x99\x99\x00\x7a\xe1\x47' + '\x00\x19\x99\x99\x00\x7d\x24\x1f',
            '\x00\x00' + '\x00\x04' + '\x00'.repeat(22),
            '\x00\x01' + BEZIER_KNOT,
            '\x00\x03' + '\x01\x03' + '\x00'.repeat(22),
            '\x00\x04' + BEZIER_KNOT,
            '\x00\x07' + '\x0a\x00\x00\x00' + '\x0b\x00\x00\x00' + '\x0c\x00\x00\x00' + '\x0d\x00\x00\x00' + '\x42\x00\x00\x00' + '\x00\x00\x00\x00'
        ];
        const dataView = getDataView(PATH_RECORDS.join(''));

        expect(JSON.parse(PhotoshopTagNames[0x07d0].description(dataView)))
            .to.deep.equal({
                types: {
                    [PathRecordTypes.FILL_RULE]: 'Path fill rule',
                    [PathRecordTypes.INITIAL_FILL_RULE]: 'Initial fill rule',
                    [PathRecordTypes.OPEN_SUBPATH_BEZIER_UNLINKED]: 'Open subpath Bezier knot, unlinked',
                    [PathRecordTypes.CLOSED_SUBPATH_BEZIER_UNLINKED]: 'Closed subpath Bezier knot, unlinked',
                    [PathRecordTypes.CLOSED_SUBPATH_LENGTH]: 'Closed subpath length',
                    [PathRecordTypes.CLOSED_SUBPATH_BEZIER_LINKED]: 'Closed subpath Bezier knot, linked',
                    [PathRecordTypes.OPEN_SUBPATH_LENGTH]: 'Open subpath length',
                    [PathRecordTypes.OPEN_SUBPATH_BEZIER_LINKED]: 'Open subpath Bezier knot, linked',
                    [PathRecordTypes.CLIPBOARD]: 'Clipboard',

                },
                paths: [
                    {type: PathRecordTypes.FILL_RULE, path: []},
                    {type: PathRecordTypes.INITIAL_FILL_RULE, path: [1]},
                    {
                        type: PathRecordTypes.OPEN_SUBPATH_BEZIER_UNLINKED,
                        path: BEZIER_KNOT_PATH
                    },
                    {
                        type: PathRecordTypes.CLOSED_SUBPATH_BEZIER_UNLINKED,
                        path: [
                            [0.4790918231010437, 0.10080385208129883],
                            [0.47999995946884155, 0.09999996423721313],
                            [0.48883241415023804, 0.09999996423721313]
                        ]
                    },
                    {type: PathRecordTypes.CLOSED_SUBPATH_LENGTH, path: [4]},
                    {
                        type: PathRecordTypes.CLOSED_SUBPATH_BEZIER_LINKED,
                        path: BEZIER_KNOT_PATH
                    },
                    {type: PathRecordTypes.OPEN_SUBPATH_LENGTH, path: [0x103]},
                    {
                        type: PathRecordTypes.OPEN_SUBPATH_BEZIER_LINKED,
                        path: BEZIER_KNOT_PATH
                    },
                    {
                        type: PathRecordTypes.CLIPBOARD,
                        path: [[0x0a, 0x0b, 0x0c, 0x0d], 0x42]
                    }
                ]
            });
    });

    it('should handle tag ClippingPathName', () => {
        const dataView = getDataView('\x09Path name');

        expect(PhotoshopTagNames[0x0bb7].description(dataView))
            .to.deep.equal('Path name');
    });

    // function getPrintInformationDataView(classIdLength, classId, items) {
    //     const DESCRIPTOR_VERSION = '\x00\x00\x00\x10';
    //     const UNCLEAR_CLASS_ID_NAME_PART = '\x00\x00\x00\x01\x00\x00';

    //     return getDataView(
    //         DESCRIPTOR_VERSION + UNCLEAR_CLASS_ID_NAME_PART + classIdLength + classId
    //         + getByteStringFromNumber(items.length, 4)
    //         + items.map((item) => item.length + item.key + item.osTypeKey + item.value).join('')
    //     );
    // }
});
