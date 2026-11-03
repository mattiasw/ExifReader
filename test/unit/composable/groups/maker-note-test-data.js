/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export function getMakerNoteBlock({make, bytes = [0, 1, 2, 3, 4, 5, 6, 7, 8]}) {
    return {
        kind: 'makerNote',
        tiffView: {},
        tiffHeaderOffset: 6,
        makerNoteOffset: 100,
        byteOrder: 'byte order',
        make,
        bytes,
    };
}

export function getPentaxType1Bytes() {
    return Array.from('PENTAX \x00\x01').map((character) => character.charCodeAt(0));
}
