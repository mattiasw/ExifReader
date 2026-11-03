/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type {Format} from './core.js';

export declare const tiff: Format<'file'>;
export declare const jpeg: Format<'file' | 'jfif'>;
export declare const png: Format<'file' | 'png'>;
export declare const heic: Format<'file'>;
export declare const avif: Format<'file'>;
export declare const jxl: Format<'file'>;
export declare const webp: Format<'file' | 'riff'>;
export declare const gif: Format<'file' | 'gif'>;
export declare const xml: Format<'file'>;

export declare const allFormats: readonly Format[];
