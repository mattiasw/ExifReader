/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type {Group} from './core.js';

export declare const exif: Group<'exif'>;
export declare const iptc: Group<'iptc'>;
export declare const xmp: Group<'xmp'>;
export declare const icc: Group<'icc'>;
export declare const photoshop: Group<'photoshop'>;
export declare const mpf: Group<'mpf'>;
export declare const canon: Group<'makerNotes', 'canon'>;
export declare const pentax: Group<'makerNotes', 'pentax'>;
export declare const makerNotes: Group<'makerNotes', 'canon' | 'pentax'>;
export declare const gps: Group<'gps'>;
export declare const composite: Group<'composite'>;
export declare const thumbnail: Group<'thumbnail'>;

export declare const allGroups: readonly Group[];
