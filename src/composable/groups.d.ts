/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type {Group, Decoder, MakerNoteTag, MakerNoteMatchInput, MakerNoteReadInput} from './core.js';

export declare const exif: Group<'exif'>;
export declare const iptc: Group<'iptc'>;
export declare const xmp: Group<'xmp'>;
export declare const icc: Group<'icc'>;
export declare const photoshop: Group<'photoshop'>;
export declare const mpf: Group<'mpf'>;
export declare const canon: Group<'makerNotes', 'canon', never>;
export declare const pentax: Group<'makerNotes', 'pentax', never>;
export declare const makerNotes: Group<'makerNotes', 'canon' | 'pentax', never>;
export declare const gps: Group<'gps'>;
export declare const composite: Group<'composite'>;
export declare const thumbnail: Group<'thumbnail'>;

export declare const allGroups: readonly Group[];

/**
 * Makes a maker note decoder to pass in `groups`. Decoders made here are tried
 * before canon and pentax, in the order of `groups`, and the first whose
 * `matches` returns true reads the maker note into `makerNotes`.
 *
 * @param decoder `matches` must be synchronous and cheap; one that throws
 *     counts as no match. `read` returns the tags or a Promise of them. Both
 *     are called without a `this`.
 * @throws TypeError when `decoder` is not an object holding the two functions
 *     and nothing else.
 */
export declare function createMakerNoteDecoder<DecoderTags extends object & {[Name in keyof DecoderTags]?: MakerNoteTag}>(decoder: {
    matches(input: MakerNoteMatchInput): boolean,
    read(input: MakerNoteReadInput): DecoderTags | PromiseLike<DecoderTags>,
}): Decoder<DecoderTags>;
