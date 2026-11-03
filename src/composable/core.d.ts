/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type {Tags, ExpandedTags, ExifTags, NumberArrayTag, CanonTags, PentaxTags, CommonOptions, XmlDomParser, DecompressOptions} from '../../exif-reader.js';
import type * as ExifDescriptors from './tags/exif.js';
import type * as IptcDescriptors from './tags/iptc.js';

declare const formatBrand: unique symbol;
declare const formatKeys: unique symbol;
declare const groupBrand: unique symbol;
declare const groupKeys: unique symbol;
declare const groupMakerNotes: unique symbol;
declare const tagDescriptorBrand: unique symbol;
declare const tagDescriptorName: unique symbol;
declare const tagFilterBrand: unique symbol;

type ReaderTagGroup = 'exif';
type RepeatableIptcName = 'Destination' | 'Subject Reference' | 'Supplemental Category' | 'Keywords' | 'Content Location Code'
    | 'Content Location Name' | 'Reference Service' | 'Reference Date' | 'Reference Number' | 'By-line' | 'By-line Title'
    | 'Contact' | 'Writer/Editor';
type ExifDescriptorName = DescriptorNames<(typeof ExifDescriptors)[keyof typeof ExifDescriptors], 'exif'>;
type IptcDescriptorName = DescriptorNames<(typeof IptcDescriptors)[keyof typeof IptcDescriptors], 'iptc'>;
type ComposedExifTags = Pick<ExifTags, Extract<ExifDescriptorName, keyof ExifTags>>;
// A composed reader returns a repeatable IPTC dataset as an array, also when the file holds it once.
type ComposedIptcTags = Pick<ExifTags, Exclude<IptcDescriptorName, RepeatableIptcName>> & {[Name in RepeatableIptcName]?: NumberArrayTag[]};
type ComposedExpandedTags = Omit<ExpandedTags, 'exif' | 'iptc'> & {exif?: ComposedExifTags, iptc?: ComposedIptcTags};
type MakerNoteTagsByMake = {canon: CanonTags, pentax: PentaxTags};
type MakerNoteMake = keyof MakerNoteTagsByMake;

// Keys are the top-level keys of the grouped result a value can add; a type argument left at string means not known.
export interface Format<Keys extends string = string> {
    readonly [formatBrand]: true;
    readonly [formatKeys]?: Keys;
}

export interface Group<Keys extends string = string, MakerNotes extends MakerNoteMake = MakerNoteMake> {
    readonly [groupBrand]: true;
    readonly [groupKeys]?: Keys;
    readonly [groupMakerNotes]?: MakerNotes;
}

export interface TagDescriptor<TagGroup extends string = ReaderTagGroup, Name extends string = string> {
    readonly [tagDescriptorBrand]: TagGroup;
    readonly [tagDescriptorName]?: Name;
}

export interface TagFilter {
    readonly [tagFilterBrand]: true;
}

export type LoadInput = ArrayBuffer | SharedArrayBuffer | ArrayBufferView | Blob;

// `never` also rejects a domParser or decompress in options built before the call.
type ReaderCommonOptions = Omit<CommonOptions, 'domParser' | 'decompress'> & {domParser?: never, decompress?: never};

type FilterOptions<HasFilter extends boolean> = true extends HasFilter ? {} : {includeTags?: never, excludeTags?: never};

type ReaderOptions<HasFilter extends boolean> = ReaderCommonOptions & FilterOptions<HasFilter>;

export type LoadOptions<HasFilter extends boolean = boolean> = ReaderOptions<HasFilter>
    & ({expanded?: true, includeOffsets?: boolean} | {expanded?: boolean, includeOffsets?: false});

export interface Reader<Grouped = ComposedExpandedTags, Flat = Tags, HasFilter extends boolean = boolean, GroupedWithOffsets = Grouped> {
    load(data: LoadInput): Promise<Grouped>;
    load(data: LoadInput, options: ReaderOptions<HasFilter> & {expanded?: true, includeOffsets?: false}): Promise<Grouped>;
    load(data: LoadInput, options: ReaderOptions<HasFilter> & {expanded?: true, includeOffsets?: boolean}): Promise<GroupedWithOffsets>;
    load(data: LoadInput, options: ReaderOptions<HasFilter> & {expanded: false, includeOffsets?: false}): Promise<Flat>;
    load(data: LoadInput, options: LoadOptions<HasFilter>): Promise<Flat | GroupedWithOffsets>;
}

type FormatKeys<F> = F extends Format<infer Keys> ? Keys : never;
type GroupKeys<G> = G extends Group<infer Keys, MakerNoteMake> ? Keys : never;
type DescriptorGroups<T> = T extends TagDescriptor<infer TagGroup, string> ? TagGroup : never;
type DescriptorNames<T, TagGroup extends string> = T extends TagDescriptor<infer DescriptorGroup, infer Name>
    ? (TagGroup extends DescriptorGroup ? Name : never)
    : never;
type MakerNotesOf<G> = G extends Group<infer Keys, infer MakerNotes> ? ('makerNotes' extends Keys ? MakerNotes : never) : never;
type HasUnknown<F, G, T> = (F extends Format<infer Keys> ? (string extends Keys ? true : never) : never)
    | (G extends Group<infer Keys, MakerNoteMake> ? (string extends Keys ? true : never) : never)
    | (T extends TagDescriptor<string, infer Name> ? (string extends Name ? true : never) : never);
type UnionToIntersection<U> = (U extends unknown ? (u: U) => void : never) extends (i: infer I) => void ? I : never;
// mpf is a runtime key that ExpandedTags does not type.
type ComposedKeys<F, G, T> = Extract<FormatKeys<F> | GroupKeys<G> | DescriptorGroups<T>, keyof ExpandedTags>;
// TypeScript 5.4.5 without skipLibCheck rejects ComposedExpandedTags[K] in the group branch (TS2536); the intersection avoids it.
type GroupedTags<Keys extends keyof ExpandedTags, F, G, T> = {
    [K in Keys]?: K extends 'makerNotes' ? UnionToIntersection<MakerNoteTagsByMake[MakerNotesOf<G>]>
        : K extends FormatKeys<F> | GroupKeys<G> ? ComposedExpandedTags[K & keyof ComposedExpandedTags]
        : K extends 'iptc' ? Pick<ComposedIptcTags, Extract<DescriptorNames<T, K>, keyof ComposedIptcTags>>
        : K extends ReaderTagGroup ? Pick<ExifTags, Extract<DescriptorNames<T, K>, keyof ExifTags>>
        : ComposedExpandedTags[K];
};
type HasTagFilter<Filter> = [Filter] extends [undefined] ? false : true;
type ComposedReader<F, G, T, Filter> = Reader<
    GroupedTags<ComposedKeys<F, G, T>, F, G, T>,
    Tags,
    HasTagFilter<Filter>,
    GroupedTags<ComposedKeys<F, G, T> | 'metadataRange', F, G, T>
>;

/**
 * Builds a reader of the given formats, groups and tags only.
 *
 * @param tables Values from 'exifreader/formats', 'exifreader/groups' and
 *     'exifreader/tags/exif', `tagFilter` to let `load` take includeTags and
 *     excludeTags, `domParser` for xmp where there is no global DOMParser, and
 *     `decompress` for custom Brotli and deflate functions and
 *     maxDecompressedSize, for every load.
 * @returns A reader whose `load` always returns a Promise, of the grouped
 *     tags unless `expanded` is false. The grouped result has only the groups
 *     and tags the tables compose; a table whose contents are not known
 *     statically (allFormats, allGroups, a `Format[]`, `Group[]` or
 *     `TagDescriptor[]`) gives every group, typed as this module's
 *     `ExpandedTags`, and `Tags`.
 * @throws When a table holds a value that was not imported from its module,
 *     domParser is given and has no parseFromString method, decompress is
 *     invalid, or the composition is invalid.
 */
export declare function createReader<
    F extends readonly Format[],
    G extends readonly Group[] = [],
    T extends readonly TagDescriptor[] = [],
    Filter extends TagFilter | undefined = undefined
>(tables: {
    formats: F,
    groups?: G,
    tags?: T,
    tagFilter?: Filter,
    domParser?: XmlDomParser,
    decompress?: DecompressOptions
}): [HasUnknown<F[number], G[number], T[number]>] extends [never]
    ? ComposedReader<F[number], G[number], T[number], Filter>
    : Reader<ComposedExpandedTags, Tags, HasTagFilter<Filter>>;

export namespace errors {
    export class UnsupportedFormatError extends Error {}
}

export declare const tagFilter: TagFilter;

export type {Tags, ComposedExpandedTags as ExpandedTags};

// Only the declarations marked export are exported; the brand symbols stay private.
export {};
