/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const TIFF_BYTE_ORDER_OFFSET = 0;
export const TIFF_ID_OFFSET = 2;
export const TIFF_IFD_OFFSET_OFFSET = 4;
export const TIFF_HEADER_LENGTH = 8;

export const TIFF_ID = 0x2a;

export const IFD_ENTRY_COUNT_LENGTH = 2;
export const IFD_ENTRY_LENGTH = 12;
export const NEXT_IFD_POINTER_LENGTH = 4;

export default {
    TIFF_BYTE_ORDER_OFFSET,
    TIFF_ID_OFFSET,
    TIFF_IFD_OFFSET_OFFSET,
    TIFF_HEADER_LENGTH,
    TIFF_ID,
    IFD_ENTRY_COUNT_LENGTH,
    IFD_ENTRY_LENGTH,
    NEXT_IFD_POINTER_LENGTH,
};
