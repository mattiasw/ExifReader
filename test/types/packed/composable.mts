/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Tags, ExpandedTags, NumberArrayTag } from "exifreader";
import { createReader, errors, tagFilter } from "exifreader/core";
import type { Format, Group, TagDescriptor, TagFilter, Reader } from "exifreader/core";
import type { Tags as CoreTags, ExpandedTags as CoreExpandedTags, LoadInput, LoadOptions } from "exifreader/core";
// The brand symbols are private.
// @ts-expect-error
import type { formatBrand } from "exifreader/core";
import { jpeg, png, jxl, allFormats } from "exifreader/formats";
import { exif, iptc, xmp, mpf, canon, pentax, makerNotes, gps, thumbnail, allGroups } from "exifreader/groups";
import { DateTimeOriginal } from "exifreader/tags/exif";
import { ModelVersion, Keywords, Headline } from "exifreader/tags/iptc";
import type * as ExifTagModule from "exifreader/tags/exif";
import type * as IptcTagModule from "exifreader/tags/iptc";

// Plain assignment cannot tell Promise<Tags> from Promise<ExpandedTags>: Tags is assignable to ExpandedTags.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type DescriptorNames<M> = { [K in keyof M]: M[K] extends TagDescriptor<string, infer Name> ? Name : never }[keyof M];

const reader: Reader = createReader({ formats: [jpeg, png], groups: [exif, xmp], tags: [DateTimeOriginal] });
const filteredReader: Reader = createReader({ formats: allFormats, groups: allGroups, tagFilter });
const iptcReader: Reader = createReader({ formats: [jpeg], tags: [ModelVersion] });
const mixedReader: Reader = createReader({ formats: [jpeg], tags: [DateTimeOriginal, ModelVersion] });

const formatValue: Format = jpeg;
const groupValue: Group = exif;
const descriptors: TagDescriptor[] = [DateTimeOriginal, ModelVersion];
const filterValue: TagFilter = tagFilter;
const descriptorReader: Reader = createReader({ formats: [jpeg], tags: descriptors });

const minimalDomParser = {
    parseFromString(xml: string, mimeType: string) {
        return {};
    }
};
const domParserReader: Reader = createReader({ formats: [jpeg], groups: [xmp], domParser: minimalDomParser });
const noDomParserReader: Reader = createReader({ formats: [jpeg], groups: [xmp], domParser: undefined });

// The brotli parameters are typed by DecompressOptions alone, with no node:zlib import.
const decompressReader: Reader = createReader({
    formats: [jxl],
    groups: [exif],
    decompress: {
        brotli: (data, { maxOutputLength }) => data.subarray(0, maxOutputLength),
        maxDecompressedSize: 16 * 1024 * 1024
    }
});
const noDecompressReader: Reader = createReader({ formats: [jpeg], decompress: undefined });
const emptyDecompressReader: Reader = createReader({ formats: [jpeg], decompress: {} });

const coreTagsIsTags: Equal<CoreTags, Tags> = true;
// A composed reader returns a repeatable IPTC dataset as an array, also when the file holds it once.
const coreExpandedTagsKeywords: Equal<NonNullable<CoreExpandedTags["iptc"]>["Keywords"], NumberArrayTag[] | undefined> = true;
const coreExpandedTagsHeadline: Equal<NonNullable<CoreExpandedTags["iptc"]>["Headline"], NumberArrayTag | undefined> = true;
// Each group has only its own tag names, with the value types of the default entry.
const coreExpandedTagsIptcNames: Equal<
    keyof NonNullable<CoreExpandedTags["iptc"]>,
    DescriptorNames<typeof IptcTagModule> | "ObjectData Preview File Format" | "Record 2 destination" | "ObjectData Preview File Format Version"
> = true;
const coreExpandedTagsMake: Equal<NonNullable<CoreExpandedTags["exif"]>["Make"], NonNullable<ExpandedTags["exif"]>["Make"]> = true;
const coreExpandedTagsGpsLatitude: Equal<
    NonNullable<CoreExpandedTags["exif"]>["GPSLatitude"],
    NonNullable<ExpandedTags["exif"]>["GPSLatitude"]
> = true;
const defaultEntryKeywords: Equal<NonNullable<ExpandedTags["iptc"]>["Keywords"], NumberArrayTag | NumberArrayTag[] | undefined> = true;
const coreExpandedTagsAsDefault: ExpandedTags = {} as CoreExpandedTags;

const noArgument = reader.load(new ArrayBuffer(0));
const noArgumentIsExpandedTags: Equal<typeof noArgument, Promise<CoreExpandedTags>> = true;
const expanded = reader.load(new ArrayBuffer(0), { expanded: true });
const expandedIsExpandedTags: Equal<typeof expanded, Promise<CoreExpandedTags>> = true;
const explicitFlat = reader.load(new ArrayBuffer(0), { expanded: false });
const explicitFlatIsTags: Equal<typeof explicitFlat, Promise<Tags>> = true;
const noOptions = reader.load(new ArrayBuffer(0), {});
const noOptionsIsExpandedTags: Equal<typeof noOptions, Promise<CoreExpandedTags>> = true;
const undefinedExpanded = reader.load(new ArrayBuffer(0), { expanded: undefined });
const undefinedExpandedIsExpandedTags: Equal<typeof undefinedExpanded, Promise<CoreExpandedTags>> = true;
const offsets = reader.load(new ArrayBuffer(0), { includeOffsets: true });
const offsetsIsExpandedTags: Equal<typeof offsets, Promise<CoreExpandedTags>> = true;
declare const isExpanded: boolean;
const booleanExpanded = reader.load(new ArrayBuffer(0), { expanded: isExpanded });
const booleanExpandedIsEither: Equal<typeof booleanExpanded, Promise<Tags | CoreExpandedTags>> = true;
const prebuiltOptions = { expanded: true };
const prebuilt = reader.load(new ArrayBuffer(0), prebuiltOptions);
const prebuiltIsEither: Equal<typeof prebuilt, Promise<Tags | CoreExpandedTags>> = true;
const input: LoadInput = new Uint8Array(0);
const typedOptions: LoadOptions = { expanded: isExpanded };
const typed = reader.load(input, typedOptions);
const typedIsEither: Equal<typeof typed, Promise<Tags | CoreExpandedTags>> = true;

const fromBlob: Promise<ExpandedTags> = reader.load(new Blob([]));
const fromTypedArray: Promise<ExpandedTags> = reader.load(new Uint8Array(0));
const fromDataView: Promise<ExpandedTags> = reader.load(new DataView(new ArrayBuffer(0)));
const fromBuffer: Promise<ExpandedTags> = reader.load(Buffer.alloc(0));
const withOptions: Promise<ExpandedTags> = filteredReader.load(new ArrayBuffer(0), {
    expanded: true,
    includeOffsets: true,
    includeUnknown: true,
    computed: true,
    includeTags: { exif: ["DateTimeOriginal"] },
    excludeTags: { xmp: true }
});

declare const includeXmp: boolean;
const withGroupSwitch: Promise<ExpandedTags> = filteredReader.load(new ArrayBuffer(0), {
    includeTags: { exif: true, xmp: includeXmp }
});

const unsupported: Error = new errors.UnsupportedFormatError();

declare const anyGroupDescriptor: TagDescriptor<string>;

// @ts-expect-error
reader.load("image.jpg");
// @ts-expect-error
reader.load(new ArrayBuffer(0), { length: 10 });
// @ts-expect-error
reader.load(new ArrayBuffer(0), { async: true });
// @ts-expect-error
reader.load(new ArrayBuffer(0), { madeUpOption: true });
// Offsets come only with the grouped output.
// @ts-expect-error
reader.load(new ArrayBuffer(0), { expanded: false, includeOffsets: true });
// @ts-expect-error
reader.load(new ArrayBuffer(0), { expanded: isExpanded, includeOffsets: true });
// The parser goes to createReader.
// @ts-expect-error
reader.load(new ArrayBuffer(0), { domParser: minimalDomParser });
// @ts-expect-error
reader.load(new ArrayBuffer(0), { expanded: true, domParser: minimalDomParser });
// @ts-expect-error
const withDomParser: LoadOptions = { domParser: minimalDomParser };
// Also in options built before the call, such as ones shared with ExifReader.load.
const sharedExpandedOptions = { expanded: true as const, domParser: minimalDomParser };
// @ts-expect-error
reader.load(new ArrayBuffer(0), sharedExpandedOptions);
const sharedFlatOptions = { includeUnknown: true, domParser: minimalDomParser };
// @ts-expect-error
reader.load(new ArrayBuffer(0), sharedFlatOptions);
// Decompression goes to createReader too.
// @ts-expect-error
reader.load(new ArrayBuffer(0), { decompress: {} });
// @ts-expect-error
reader.load(new ArrayBuffer(0), { expanded: true, decompress: {} });
// @ts-expect-error
const withDecompress: LoadOptions = { decompress: {} };
const sharedExpandedDecompressOptions = { expanded: true as const, decompress: {} };
// @ts-expect-error
reader.load(new ArrayBuffer(0), sharedExpandedDecompressOptions);
const sharedFlatDecompressOptions = { includeUnknown: true, decompress: {} };
// @ts-expect-error
reader.load(new ArrayBuffer(0), sharedFlatDecompressOptions);
// @ts-expect-error
createReader({ formats: [jpeg], groups: [jpeg] });
// @ts-expect-error
createReader({ formats: [exif] });
// @ts-expect-error
createReader({ formats: [{}] });
// @ts-expect-error
createReader({ formats: [jpeg], groups: [DateTimeOriginal] });
// @ts-expect-error
createReader({ formats: [jpeg], tags: [exif] });
// @ts-expect-error
const syncTags: Tags = reader.load(new ArrayBuffer(0));
// @ts-expect-error
errors.MetadataMissingError;
// @ts-expect-error
createReader({ groups: [exif] });
// @ts-expect-error
createReader({ formats: [jpeg], madeUpTable: [] });
// @ts-expect-error
createReader({ formats: [jpeg], filter: tagFilter });
// @ts-expect-error
createReader({ formats: [jpeg], domParser: 42 });
// @ts-expect-error
createReader({ formats: [jpeg], decompress: { brotli: 42 } });
// @ts-expect-error
createReader({ formats: [jpeg], decompress: { maxDecompressedSize: "16MB" } });
// @ts-expect-error
createReader({ formats: [jpeg], decompress: { maxDecompressSize: 1 } });
// TagDescriptor defaults to the groups createReader accepts, not to any string.
// @ts-expect-error
const narrowedDescriptor: TagDescriptor = anyGroupDescriptor;

// A reader's result has only the keys its formats, groups and tags can return.
const jpegExifReader = createReader({ formats: [jpeg], groups: [exif] });
const jpegExif = await jpegExifReader.load(new ArrayBuffer(0));
const jpegExifKeys: Equal<keyof typeof jpegExif, "file" | "jfif" | "exif"> = true;
const jpegExifHasFullExif: Equal<typeof jpegExif.exif, CoreExpandedTags["exif"]> = true;
// @ts-expect-error
jpegExif.gps;
// @ts-expect-error
jpegExif.xmp;
// @ts-expect-error
jpegExif.metadataRange;
const jpegExifNoOptions = await jpegExifReader.load(new ArrayBuffer(0), {});
const jpegExifNoOptionsKeys: Equal<keyof typeof jpegExifNoOptions, "file" | "jfif" | "exif"> = true;
const jpegExifNoOffsets = await jpegExifReader.load(new ArrayBuffer(0), { includeOffsets: false });
const jpegExifNoOffsetsKeys: Equal<keyof typeof jpegExifNoOffsets, "file" | "jfif" | "exif"> = true;
const jpegExifOffsets = await jpegExifReader.load(new ArrayBuffer(0), { includeOffsets: true });
const jpegExifOffsetsKeys: Equal<keyof typeof jpegExifOffsets, "file" | "jfif" | "exif" | "metadataRange"> = true;
declare const withOffsets: boolean;
const jpegExifMaybeOffsets = await jpegExifReader.load(new ArrayBuffer(0), { includeOffsets: withOffsets });
const jpegExifMaybeOffsetsKeys: Equal<keyof typeof jpegExifMaybeOffsets, "file" | "jfif" | "exif" | "metadataRange"> = true;
const jpegExifFlat = jpegExifReader.load(new ArrayBuffer(0), { expanded: false });
const jpegExifFlatIsTags: Equal<typeof jpegExifFlat, Promise<Tags>> = true;

const pngOnly = await createReader({ formats: [png] }).load(new ArrayBuffer(0));
const pngOnlyKeys: Equal<keyof typeof pngOnly, "file" | "png"> = true;
// The mpf key is not in ExpandedTags.
const jpegMpf = await createReader({ formats: [jpeg], groups: [mpf] }).load(new ArrayBuffer(0));
const jpegMpfKeys: Equal<keyof typeof jpegMpf, "file" | "jfif"> = true;
const jpegThumbnail = await createReader({ formats: [jpeg], groups: [thumbnail] }).load(new ArrayBuffer(0));
const jpegThumbnailKeys: Equal<keyof typeof jpegThumbnail, "file" | "jfif" | "Thumbnail"> = true;

// Tag descriptors narrow their group to their output names.
const dateTimeOriginal = await createReader({ formats: [jpeg], tags: [DateTimeOriginal] }).load(new ArrayBuffer(0));
const dateTimeOriginalKeys: Equal<keyof typeof dateTimeOriginal, "file" | "jfif" | "exif"> = true;
const dateTimeOriginalType: Equal<
    NonNullable<typeof dateTimeOriginal.exif>["DateTimeOriginal"],
    NonNullable<ExpandedTags["exif"]>["DateTimeOriginal"]
> = true;
// @ts-expect-error
dateTimeOriginal.exif?.Make;
const modelVersion = await createReader({ formats: [jpeg], tags: [ModelVersion] }).load(new ArrayBuffer(0));
const modelVersionNames: Equal<keyof NonNullable<typeof modelVersion.iptc>, "Model Version"> = true;
// The whole group wins over its descriptors.
const exifAndDescriptor = await createReader({ formats: [jpeg], groups: [exif], tags: [DateTimeOriginal] }).load(new ArrayBuffer(0));
const exifAndDescriptorHasFullExif: Equal<typeof exifAndDescriptor.exif, CoreExpandedTags["exif"]> = true;
const iptcAndDescriptors = await createReader({ formats: [jpeg], groups: [iptc], tags: [DateTimeOriginal, ModelVersion] })
    .load(new ArrayBuffer(0));
const iptcAndDescriptorsHasFullIptc: Equal<typeof iptcAndDescriptors.iptc, CoreExpandedTags["iptc"]> = true;
// Every IPTC composition returns a repeatable dataset as an array.
const iptcGroupKeywords: Equal<NonNullable<typeof iptcAndDescriptors.iptc>["Keywords"], NumberArrayTag[] | undefined> = true;
const iptcGroupHeadline: Equal<NonNullable<typeof iptcAndDescriptors.iptc>["Headline"], NumberArrayTag | undefined> = true;
const iptcDescriptors = await createReader({ formats: [jpeg], tags: [Keywords, Headline] }).load(new ArrayBuffer(0));
const iptcDescriptorsNames: Equal<keyof NonNullable<typeof iptcDescriptors.iptc>, "Keywords" | "Headline"> = true;
const iptcDescriptorsKeywords: Equal<NonNullable<typeof iptcDescriptors.iptc>["Keywords"], NumberArrayTag[] | undefined> = true;
const iptcDescriptorsHeadline: Equal<NonNullable<typeof iptcDescriptors.iptc>["Headline"], NumberArrayTag | undefined> = true;
const modelVersionType: Equal<NonNullable<typeof modelVersion.iptc>["Model Version"], NumberArrayTag | undefined> = true;
const iptcAndDescriptorsExifNames: Equal<keyof NonNullable<typeof iptcAndDescriptors.exif>, "DateTimeOriginal"> = true;

// Each maker-note group types makerNotes by its makes.
const canonNotes = await createReader({ formats: [jpeg], groups: [canon] }).load(new ArrayBuffer(0));
canonNotes.makerNotes?.LensModel;
// @ts-expect-error
canonNotes.makerNotes?.PentaxVersion;
const pentaxNotes = await createReader({ formats: [jpeg], groups: [pentax] }).load(new ArrayBuffer(0));
pentaxNotes.makerNotes?.PentaxVersion;
// @ts-expect-error
pentaxNotes.makerNotes?.LensModel;
const allMakerNotes = await createReader({ formats: [jpeg], groups: [makerNotes] }).load(new ArrayBuffer(0));
const allMakerNotesType: Equal<NonNullable<typeof allMakerNotes.makerNotes>, NonNullable<ExpandedTags["makerNotes"]>> = true;
const canonAndPentax = await createReader({ formats: [jpeg], groups: [canon, pentax] }).load(new ArrayBuffer(0));
canonAndPentax.makerNotes?.LensModel;
canonAndPentax.makerNotes?.PentaxVersion;
// A plain array keeps the group that returns more makes.
const makerNoteGroups = [canon, makerNotes];
const makerNoteGroupsNotes = await createReader({ formats: [jpeg], groups: makerNoteGroups }).load(new ArrayBuffer(0));
makerNoteGroupsNotes.makerNotes?.LensModel;
makerNoteGroupsNotes.makerNotes?.PentaxVersion;

// includeTags and excludeTags need the tag filter.
// @ts-expect-error
jpegExifReader.load(new ArrayBuffer(0), { includeTags: { exif: ["Make"] } });
// @ts-expect-error
jpegExifReader.load(new ArrayBuffer(0), { excludeTags: { exif: true } });
const undefinedFilterReader = createReader({ formats: [jpeg], groups: [exif], tagFilter: undefined });
// @ts-expect-error
undefinedFilterReader.load(new ArrayBuffer(0), { includeTags: { exif: true } });
// @ts-expect-error
undefinedFilterReader.load(new ArrayBuffer(0), { excludeTags: { exif: true } });
const jpegExifFilterReader = createReader({ formats: [jpeg], groups: [exif], tagFilter });
const jpegExifFiltered = await jpegExifFilterReader.load(new ArrayBuffer(0), { includeTags: { exif: ["Make"] }, excludeTags: { exif: ["Model"] } });
const jpegExifFilteredKeys: Equal<keyof typeof jpegExifFiltered, "file" | "jfif" | "exif"> = true;
declare const maybeFilter: TagFilter | undefined;
const maybeFilterReader = createReader({ formats: [jpeg], groups: [exif], tagFilter: maybeFilter });
const maybeFiltered = await maybeFilterReader.load(new ArrayBuffer(0), { includeTags: { exif: true }, excludeTags: { exif: ["Model"] } });
const maybeFilteredKeys: Equal<keyof typeof maybeFiltered, "file" | "jfif" | "exif"> = true;

// A table whose contents are not known gives the broad tags; includeTags and excludeTags still need the tag filter.
type BroadReader = Reader<CoreExpandedTags, Tags, false>;
const allFormatsReader = createReader({ formats: allFormats, groups: [exif] });
const allFormatsIsBroad: Equal<typeof allFormatsReader, BroadReader> = true;
const allFormatsGrouped = allFormatsReader.load(new ArrayBuffer(0));
const allFormatsGroupedIsExpandedTags: Equal<typeof allFormatsGrouped, Promise<CoreExpandedTags>> = true;
const allFormatsOffsets = allFormatsReader.load(new ArrayBuffer(0), { includeOffsets: withOffsets });
const allFormatsOffsetsIsExpandedTags: Equal<typeof allFormatsOffsets, Promise<CoreExpandedTags>> = true;
const allFormatsFlat = allFormatsReader.load(new ArrayBuffer(0), { expanded: false });
const allFormatsFlatIsTags: Equal<typeof allFormatsFlat, Promise<Tags>> = true;
const allFormatsAny = allFormatsReader.load(new ArrayBuffer(0), { expanded: isExpanded });
const allFormatsAnyIsBroad: Equal<typeof allFormatsAny, Promise<Tags | CoreExpandedTags>> = true;
// @ts-expect-error
allFormatsReader.load(new ArrayBuffer(0), { includeTags: { exif: true } });
const allFormatsFilterReader = createReader({ formats: allFormats, groups: allGroups, tagFilter });
const allFormatsFilterIsBroad: Equal<typeof allFormatsFilterReader, Reader<CoreExpandedTags, Tags, true>> = true;
allFormatsFilterReader.load(new ArrayBuffer(0), { includeTags: { exif: true }, excludeTags: { exif: ["Model"] } });
const allGroupsReader = createReader({ formats: [jpeg], groups: allGroups });
// @ts-expect-error
allGroupsReader.load(new ArrayBuffer(0), { excludeTags: { exif: true } });
const allGroupsReaderIsBroad: Equal<typeof allGroupsReader, BroadReader> = true;
const allGroupsTags = await allGroupsReader.load(new ArrayBuffer(0));
const allGroupsKeywords: Equal<NonNullable<typeof allGroupsTags.iptc>["Keywords"], NumberArrayTag[] | undefined> = true;
const formatArray: Format[] = [jpeg];
const formatArrayReader = createReader({ formats: formatArray });
const formatArrayReaderIsBroad: Equal<typeof formatArrayReader, BroadReader> = true;
const groupArray: Group[] = [exif];
const groupArrayReader = createReader({ formats: [jpeg], groups: groupArray });
const groupArrayReaderIsBroad: Equal<typeof groupArrayReader, BroadReader> = true;
const descriptorArrayReader = createReader({ formats: [jpeg], tags: descriptors });
const descriptorArrayReaderIsBroad: Equal<typeof descriptorArrayReader, BroadReader> = true;
const spreadReader = createReader({ formats: [jpeg], groups: [exif, ...allGroups] });
const spreadReaderIsBroad: Equal<typeof spreadReader, BroadReader> = true;
const conditionalReader = createReader({ formats: [jpeg], groups: isExpanded ? [exif] : allGroups });
const conditionalReaderIsBroad: Equal<typeof conditionalReader, BroadReader> = true;

// Each group has only its own tag names, on a reader of known groups and on the broad one.
const exifIptcMpf = await createReader({ formats: [jpeg], groups: [exif, iptc, mpf] }).load(new ArrayBuffer(0));
// @ts-expect-error
exifIptcMpf.exif?.MPFVersion;
// @ts-expect-error
exifIptcMpf.exif?.Images;
// @ts-expect-error
exifIptcMpf.exif?.Headline;
// @ts-expect-error
exifIptcMpf.iptc?.Make;
// @ts-expect-error
exifIptcMpf.iptc?.MPFVersion;
exifIptcMpf.exif?.Make;
exifIptcMpf.exif?.GPSLatitude;
exifIptcMpf.exif?.InteroperabilityIndex;
exifIptcMpf.iptc?.Headline;
exifIptcMpf.iptc?.["ObjectData Preview File Format"];
exifIptcMpf.iptc?.["Record 2 destination"];
exifIptcMpf.iptc?.["ObjectData Preview File Format Version"];
const exifIptcMpfByLine: Equal<NonNullable<typeof exifIptcMpf.iptc>["By-line"], NumberArrayTag[] | undefined> = true;
// @ts-expect-error
allGroupsTags.exif?.MPFVersion;
// @ts-expect-error
allGroupsTags.exif?.Images;
// @ts-expect-error
allGroupsTags.exif?.Headline;
// @ts-expect-error
allGroupsTags.iptc?.Make;
// @ts-expect-error
allGroupsTags.iptc?.MPFVersion;
allGroupsTags.exif?.Make;
allGroupsTags.exif?.GPSLatitude;
allGroupsTags.exif?.InteroperabilityIndex;
allGroupsTags.iptc?.Headline;
allGroupsTags.iptc?.["ObjectData Preview File Format"];
allGroupsTags.iptc?.["Record 2 destination"];
allGroupsTags.iptc?.["ObjectData Preview File Format Version"];
const allGroupsByLine: Equal<NonNullable<typeof allGroupsTags.iptc>["By-line"], NumberArrayTag[] | undefined> = true;

// Known elements in a conditional, a spread or an array variable narrow to all their keys.
const knownConditional = await createReader({ formats: [jpeg], groups: isExpanded ? [exif] : [gps] }).load(new ArrayBuffer(0));
const knownConditionalKeys: Equal<keyof typeof knownConditional, "file" | "jfif" | "exif" | "gps"> = true;
const inferredFormats = [jpeg, png];
const inferredFormatsTags = await createReader({ formats: inferredFormats }).load(new ArrayBuffer(0));
const inferredFormatsKeys: Equal<keyof typeof inferredFormatsTags, "file" | "jfif" | "png"> = true;
const someGroups = [exif, gps] as const;
const knownSpread = await createReader({ formats: [jpeg], groups: [...someGroups, xmp] }).load(new ArrayBuffer(0));
const knownSpreadKeys: Equal<keyof typeof knownSpread, "file" | "jfif" | "exif" | "gps" | "xmp"> = true;
const inlineSpread = await createReader({ formats: [jpeg], groups: [...[exif, gps], canon] }).load(new ArrayBuffer(0));
const inlineSpreadKeys: Equal<keyof typeof inlineSpread, "file" | "jfif" | "exif" | "gps" | "makerNotes"> = true;

// A narrowed reader is still a Reader, and its values still Formats and Groups.
const narrowedAsReader: Reader = jpegExifReader;
const filteredAsReader: Reader = jpegExifFilterReader;
const canonAsGroup: Group = canon;

// The type parameters of a Reader can be read from another module.
type GroupedOf<R> = R extends Reader<infer Grouped, any, any, any> ? Grouped : never;
const groupedOfNarrowed: Equal<GroupedOf<typeof jpegExifReader>, typeof jpegExif> = true;
const groupedOfReader: Equal<GroupedOf<Reader>, CoreExpandedTags> = true;

// LoadOptions<false> builds options for a reader without the tag filter.
const unfilteredOptions: LoadOptions<false> = { expanded: isExpanded };
jpegExifReader.load(new ArrayBuffer(0), unfilteredOptions);
// @ts-expect-error
const unfilteredWithIncludeTags: LoadOptions<false> = { includeTags: { exif: true } };
// @ts-expect-error
jpegExifReader.load(new ArrayBuffer(0), typedOptions);
const filteredOptions: LoadOptions = { includeTags: { exif: true } };

// The rejections of the broad reader hold on a narrowed one.
// @ts-expect-error
jpegExifReader.load(new ArrayBuffer(0), { async: true });
// @ts-expect-error
jpegExifReader.load(new ArrayBuffer(0), { length: 10 });
// @ts-expect-error
jpegExifReader.load(new ArrayBuffer(0), { domParser: minimalDomParser });
// @ts-expect-error
jpegExifReader.load(new ArrayBuffer(0), { decompress: {} });
// @ts-expect-error
jpegExifReader.load(new ArrayBuffer(0), { expanded: false, includeOffsets: true });
// @ts-expect-error
jpegExifReader.load(new ArrayBuffer(0), { madeUpOption: true });

export {
    reader,
    filteredReader,
    iptcReader,
    mixedReader,
    formatValue,
    groupValue,
    descriptors,
    filterValue,
    descriptorReader,
    domParserReader,
    noDomParserReader,
    decompressReader,
    noDecompressReader,
    emptyDecompressReader,
    coreTagsIsTags,
    coreExpandedTagsKeywords,
    coreExpandedTagsHeadline,
    defaultEntryKeywords,
    coreExpandedTagsAsDefault,
    noArgumentIsExpandedTags,
    expandedIsExpandedTags,
    explicitFlatIsTags,
    noOptionsIsExpandedTags,
    undefinedExpandedIsExpandedTags,
    offsetsIsExpandedTags,
    booleanExpanded,
    booleanExpandedIsEither,
    prebuiltOptions,
    prebuilt,
    prebuiltIsEither,
    input,
    typedOptions,
    typed,
    typedIsEither,
    fromBlob,
    fromTypedArray,
    fromDataView,
    fromBuffer,
    withOptions,
    withGroupSwitch,
    unsupported,
    syncTags,
    withDomParser,
    withDecompress,
    narrowedDescriptor
};
