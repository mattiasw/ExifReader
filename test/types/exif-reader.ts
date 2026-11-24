/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { load, loadView, errors, type Tags, type ExpandedTags } from "../../exif-reader.js";
import type * as ExifTagModule from "../../src/composable/tags/exif.js";
import type * as IptcTagModule from "../../src/composable/tags/iptc.js";
import type { TagDescriptor } from "../../src/composable/core.js";

type DescriptorNames<M> = { [K in keyof M]: M[K] extends TagDescriptor<string, infer Name> ? Name : never }[keyof M];
type MustBeNever<T extends never> = T;
// Fails, naming the tag, when a generated tag module has a tag that exif-reader.d.ts does not declare.
type UndeclaredExifTags = MustBeNever<Exclude<DescriptorNames<typeof ExifTagModule>, keyof NonNullable<ExpandedTags["exif"]>>>;
type UndeclaredIptcTags = MustBeNever<Exclude<DescriptorNames<typeof IptcTagModule>, keyof NonNullable<ExpandedTags["iptc"]>>>;

load("", { includeUnknown: true });
load("", { computed: true });
load("", { length: 1024 });
load("", { expanded: false, includeUnknown: true, length: 1024 });
load("", { async: true });
load("", { async: true, computed: true });
load("", { excludeTags: { exif: ["DateTimeOriginal", 0x9003] } });
load("", { excludeTags: { png: ["Color Type"] } });
load("", { includeTags: { exif: true } });
load("", { includeTags: { png: true } });
load("", { includeTags: { thumbnail: true } });
load("", { includeTags: { exif: true }, excludeTags: { png: true } });
load("", { includeTags: { exif: true, gps: false } });
declare const includeXmp: boolean;
load("", { includeTags: { exif: true, xmp: includeXmp } });
load("", { excludeTags: { gps: false } });
// @ts-expect-error
load("", { includeTags: { gps: "all" } });
// @ts-expect-error
load("", { includeTags: { gps: 1 } });
// @ts-expect-error
load("", { excludeTags: ["DateTimeOriginal"] });
// @ts-expect-error
load("", { includeTags: { pngText: true } });
// @ts-expect-error
load("", { includeTags: { pngFile: true } });
// @ts-expect-error
load("", { excludeTags: { png: [0x9003] } });
// @ts-expect-error
load("", { excludeTags: { xmp: [0x9003] } });
const syncTags0: Tags = load(new ArrayBuffer(0));
const asyncTags0: Promise<Tags> = load(new ArrayBuffer(0), { async: true });
// @ts-expect-error
const syncTags1: Tags = load(new ArrayBuffer(0), { async: true });
const syncTypedArrayTags: Tags = load(new Uint8Array(0));
const asyncTypedArrayTags: Promise<Tags> = load(new Int16Array(0), { async: true });
const expandedTypedArrayTags: ExpandedTags = load(new Uint8Array(0), { expanded: true });
const syncDataViewTags: Tags = load(new DataView(new ArrayBuffer(0)));
// @ts-expect-error
load([1, 2, 3]);
const syncTags2: Tags = loadView(new DataView(new ArrayBuffer(0)), { includeUnknown: true });
const syncTags2Computed: Tags = loadView(new DataView(new ArrayBuffer(0)), {
    computed: true,
});
const syncTags3: ExpandedTags = loadView(new DataView(new ArrayBuffer(0)), { expanded: true });
const syncTags3Computed: ExpandedTags = loadView(new DataView(new ArrayBuffer(0)), {
    expanded: true,
    computed: true,
});
const asyncTags1: Promise<Tags> = loadView(new DataView(new ArrayBuffer(0)), { async: true });

const tags = await load("");
const expandedTags = await load("", { expanded: true });
const computedExpandedTags = await load("", { expanded: true, computed: true });

/////////
// File
expandedTags["file"]?.["FileType"]?.value === "tiff";
expandedTags["file"]?.["FileType"]?.value === "jpeg";
expandedTags["file"]?.["FileType"]?.value === "png";
expandedTags["file"]?.["FileType"]?.value === "heic";
expandedTags["file"]?.["FileType"]?.value === "avif";
expandedTags["file"]?.["FileType"]?.value === "jxl";
expandedTags["file"]?.["FileType"]?.value === "webp";
expandedTags["file"]?.["FileType"]?.value === "gif";
expandedTags["file"]?.["FileType"]?.value === "xml";

expandedTags["file"]?.["FileType"]?.description === "TIFF";
expandedTags["file"]?.["FileType"]?.description === "JPEG";
expandedTags["file"]?.["FileType"]?.description === "PNG";
expandedTags["file"]?.["FileType"]?.description === "HEIC";
expandedTags["file"]?.["FileType"]?.description === "AVIF";
expandedTags["file"]?.["FileType"]?.description === "JPEG XL";
expandedTags["file"]?.["FileType"]?.description === "WebP";
expandedTags["file"]?.["FileType"]?.description === "GIF";
expandedTags["file"]?.["FileType"]?.description === "XML";

tags["FileType"]?.value === "jpeg";
tags["FileType"]?.description === "JPEG";
// @ts-expect-error
expandedTags["file"]?.["FileType"]?.value === "pcx";
// @ts-expect-error
expandedTags["file"]?.["FileType"]?.description === "PCX";

// HEIC and AVIF rotation and mirroring
expandedTags["file"]?.["Rotation"]?.value === 270;
expandedTags["file"]?.["Rotation"]?.description === "Rotate 90 CW";
expandedTags["file"]?.["Mirror"]?.value === 1;
expandedTags["file"]?.["Mirror"]?.description === "Mirror horizontal";
tags["Rotation"]?.value === 90;
tags["Rotation"]?.description === "Rotate 270 CW";
tags["Mirror"]?.value === 0;
tags["Mirror"]?.description === "Mirror vertical";
// @ts-expect-error
expandedTags["file"]?.["Rotation"]?.value === 45;
// @ts-expect-error
expandedTags["file"]?.["Rotation"]?.description === "Rotate 90 CCW";
// @ts-expect-error
expandedTags["file"]?.["Mirror"]?.value === 2;
// @ts-expect-error
expandedTags["file"]?.["Mirror"]?.description === "Mirror diagonal";
// @ts-expect-error
tags["Rotation"]?.description === "Rotate 90 CCW";

/////////
// Exif
if (tags["DateTimeOriginal"]) {
    if ("id" in tags["DateTimeOriginal"]) {
        tags["DateTimeOriginal"].id === 0x9003;
    }
    if (Array.isArray(tags["DateTimeOriginal"].value)) {
        tags["DateTimeOriginal"].value[0] === "2014:09:21 16:00:56";
    }
    tags["DateTimeOriginal"].description === "2014:09:21 16:00:56";
    if ("attributes" in tags["DateTimeOriginal"]) {
        tags["DateTimeOriginal"].attributes["some-key"] === "some value";
    }
    tags["Thumbnail"]?.type === "image/jpeg";
    tags["Thumbnail"]?.Compression?.id === 4711;
    tags["Thumbnail"]?.Compression?.value === 32946;
    // @ts-expect-error
    tags["Thumbnail"]?.Compression?.description === 6;
    tags["Thumbnail"]?.Compression?.description === "Deflate";
    tags["thumbnail"]?.type === "image/jpeg";
    tags["thumbnail"]?.Compression?.id === 4711;
    tags["thumbnail"]?.Compression?.value === 32946;
    // @ts-expect-error
    tags["thumbnail"]?.Compression?.description === 6;
    tags["thumbnail"]?.Compression?.description === "Deflate";
    tags["Images"]?.[0];
    // @ts-expect-error
    tags["NotImages"]?.[0];
}
expandedTags["exif"]?.["DateTimeOriginal"]?.id === 0x9003;
expandedTags["exif"]?.["DateTimeOriginal"]?.value[0] === "2014:09:21 16:00:56";
expandedTags["exif"]?.["DateTimeOriginal"]?.description ===
    "2014:09:21 16:00:56";
// @ts-expect-error
expandedTags["exif"]?.["DateTimeOriginal"].attributes;

// Computed values (only exist at runtime if the computed option is enabled).
const exifDateTimeComputed = computedExpandedTags["exif"]?.["DateTimeOriginal"]?.computed;
if (exifDateTimeComputed) {
    if (Array.isArray(exifDateTimeComputed)) {
        exifDateTimeComputed[0] === "2014:09:21 16:00:56";
    } else {
        exifDateTimeComputed === "2014:09:21 16:00:56";
    }
}
// @ts-expect-error
computedExpandedTags["xmp"]?.["DateTimeOriginal"]?.computed;

// @ts-expect-error
expandedTags["exif"]?.["GPSLatitude"]?.value[0][0] === 1;
const gpsLatitudeValue = expandedTags["exif"]?.["GPSLatitude"]?.value;
if (gpsLatitudeValue && gpsLatitudeValue.length === 3) {
    gpsLatitudeValue[0][0] === 1;
    // @ts-expect-error
    gpsLatitudeValue[0][2] === 1;
}
// @ts-expect-error
expandedTags["exif"]?.["GPSLongitude"]?.value[0][0] === 1;
const gpsLongitudeValue = expandedTags["exif"]?.["GPSLongitude"]?.value;
if (gpsLongitudeValue && gpsLongitudeValue.length === 3) {
    gpsLongitudeValue[0][0] === 1;
    // @ts-expect-error
    gpsLongitudeValue[0][2] === 1;
}
const singlePairGpsLongitude: NonNullable<ExpandedTags["exif"]>["GPSLongitude"] = {id: 4, value: [31, 1], description: NaN};
expandedTags["exif"]?.["GPSAltitude"]?.value[0] === 1;
// @ts-expect-error
expandedTags["exif"]?.["GPSAltitude"]?.value[2] === 1;
expandedTags["gps"]?.["Latitude"] === 12.345
expandedTags["gps"]?.["Longitude"] === 12.345;
expandedTags["gps"]?.["Altitude"] === 12.345

const computedGpsLatitude =
    computedExpandedTags["exif"]?.["GPSLatitude"]?.computed;
if (Array.isArray(computedGpsLatitude)) {
    computedGpsLatitude[0] === 1;
    computedGpsLatitude[0] === null;
    // @ts-expect-error
    computedGpsLatitude[0] === "1";
}

expandedTags["exif"]?.["LensSpecification"]?.value[0][0] === 4;
// @ts-expect-error
expandedTags["exif"]?.["LensSpecification"]?.value[0] === "28";
const computedLensSpecification = computedExpandedTags["exif"]?.["LensSpecification"]?.computed;
computedLensSpecification?.[0] === 4.2;
computedLensSpecification?.[0] === null;
expandedTags["exif"]?.["HostComputer"]?.value[0] === "Mac";

const applicationNotes = tags["ApplicationNotes"];
if (applicationNotes && Array.isArray(applicationNotes.value)) {
    applicationNotes.value[0] === 60;
}
const expandedApplicationNotes = expandedTags["exif"]?.["ApplicationNotes"]?.value;
if (Array.isArray(expandedApplicationNotes)) {
    expandedApplicationNotes[0] === 60;
} else {
    expandedApplicationNotes === 60;
}

expandedTags["exif"]?.["Thumbnail"]?.type === "image/jpeg";
expandedTags["exif"]?.["Thumbnail"]?.Compression?.id === 4711;
expandedTags["exif"]?.["Thumbnail"]?.Compression?.value === 32946;
// @ts-expect-error
expandedTags["exif"]?.["Thumbnail"]?.Compression?.description === 6;
expandedTags["exif"]?.["Thumbnail"]?.Compression?.description === "Deflate";
expandedTags["Thumbnail"]?.type === "image/jpeg";
expandedTags["thumbnail"]?.type === "image/jpeg";
expandedTags["thumbnail"]?.Compression?.value === 32946;
expandedTags["thumbnail"]?.Compression?.description === "Deflate";
// @ts-expect-error
expandedTags["thumbnail"]?.Compression?.description === 6;
expandedTags["exif"]?.["Images"]?.[0];

tags["SceneType"]?.value === 1;
tags["SceneType"]?.value === "1";
expandedTags["exif"]?.["SceneType"]?.value === 1;
// @ts-expect-error
expandedTags["exif"]?.["SceneType"]?.value === "1";
expandedTags["xmp"]?.["SceneType"]?.value === "1";

const computedXResolution = computedExpandedTags["exif"]?.["XResolution"];
if (computedXResolution && "id" in computedXResolution) {
    const xResolutionComputedNumber: number | null | undefined =
        computedXResolution.computed;
    xResolutionComputedNumber === 72;
    xResolutionComputedNumber === null;
    // @ts-expect-error
    const xResolutionComputedString: string = computedXResolution.computed;
}

const whitePointNumerator: number = expandedTags["exif"]?.["WhitePoint"]?.value[0][0] ?? 0;
const gpsSpeedNumerator: number = expandedTags["exif"]?.["GPSSpeed"]?.value[0] ?? 0;
// @ts-expect-error
const imageWidthDescription: number = expandedTags["exif"]?.["ImageWidth"]?.description ?? 0;
const imageWidthDescriptionString: string = expandedTags["exif"]?.["ImageWidth"]?.description ?? "";
const orientationDescription: string = expandedTags["exif"]?.["Orientation"]?.description ?? "";
// @ts-expect-error
expandedTags["exif"]?.["Rating"]?.description === 3;
expandedTags["exif"]?.["Rating"]?.description === "3";
// @ts-expect-error
expandedTags["exif"]?.["WhiteBalance"]?.description === 0;
expandedTags["exif"]?.["WhiteBalance"]?.description === "Auto";

const gpsLatitudeDescription: number = expandedTags["exif"]?.["GPSLatitude"]?.description ?? 0;
// @ts-expect-error
const gpsLatitudeDescriptionString: string = expandedTags["exif"]?.["GPSLatitude"]?.description ?? "";
const gpsLongitudeDescription: number = expandedTags["exif"]?.["GPSLongitude"]?.description ?? 0;
// @ts-expect-error
const gpsLongitudeDescriptionString: string = expandedTags["exif"]?.["GPSLongitude"]?.description ?? "";
const gpsDestLatitudeDescription: number = expandedTags["exif"]?.["GPSDestLatitude"]?.description ?? 0;
// @ts-expect-error
const gpsDestLatitudeDescriptionString: string = expandedTags["exif"]?.["GPSDestLatitude"]?.description ?? "";
const gpsDestLongitudeDescription: number = expandedTags["exif"]?.["GPSDestLongitude"]?.description ?? 0;
// @ts-expect-error
const gpsDestLongitudeDescriptionString: string = expandedTags["exif"]?.["GPSDestLongitude"]?.description ?? "";
const pixelXDimensionDescription: string = expandedTags["exif"]?.["PixelXDimension"]?.description ?? "";
// @ts-expect-error
const pixelXDimensionDescriptionNumber: number = expandedTags["exif"]?.["PixelXDimension"]?.description ?? 0;
const dngVersionValue: number[] = expandedTags["exif"]?.["DNGVersion"]?.value ?? [];
const dngVersionDescription: string = expandedTags["exif"]?.["DNGVersion"]?.description ?? "";
// @ts-expect-error
const dngVersionDescriptionNumber: number = expandedTags["exif"]?.["DNGVersion"]?.description ?? 0;

const flatGpsLatitude = tags["GPSLatitude"];
if (flatGpsLatitude && "id" in flatGpsLatitude) {
    const flatGpsLatitudeDescription: number = flatGpsLatitude.description;
    // @ts-expect-error
    const flatGpsLatitudeDescriptionString: string = flatGpsLatitude.description;
}
const flatGpsLongitude = tags["GPSLongitude"];
if (flatGpsLongitude && "id" in flatGpsLongitude) {
    const flatGpsLongitudeDescription: number = flatGpsLongitude.description;
    // @ts-expect-error
    const flatGpsLongitudeDescriptionString: string = flatGpsLongitude.description;
}
// @ts-expect-error
const flatGpsLatitudeUnnarrowed: number = tags["GPSLatitude"]?.description ?? 0;
const flatGpsDestLatitude = tags["GPSDestLatitude"];
if (flatGpsDestLatitude && "id" in flatGpsDestLatitude) {
    const flatGpsDestLatitudeDescription: number = flatGpsDestLatitude.description;
    // @ts-expect-error
    const flatGpsDestLatitudeDescriptionString: string = flatGpsDestLatitude.description;
}
const flatGpsDestLongitude = tags["GPSDestLongitude"];
if (flatGpsDestLongitude && "id" in flatGpsDestLongitude) {
    const flatGpsDestLongitudeDescription: number = flatGpsDestLongitude.description;
    // @ts-expect-error
    const flatGpsDestLongitudeDescriptionString: string = flatGpsDestLongitude.description;
}
const flatPixelXDimensionDescription: string = tags["PixelXDimension"]?.description ?? "";
// @ts-expect-error
const flatPixelXDimensionDescriptionNumber: number = tags["PixelXDimension"]?.description ?? 0;

// @ts-expect-error
expandedTags["exif"]?.["WhitePoint"]?.value[0] === 3127;
expandedTags["exif"]?.["PrimaryChromaticities"]?.value[0][0] === 64;
// @ts-expect-error
expandedTags["exif"]?.["PrimaryChromaticities"]?.value[0] === 64;
expandedTags["exif"]?.["YCbCrCoefficients"]?.value[0][0] === 299;
// @ts-expect-error
expandedTags["exif"]?.["YCbCrCoefficients"]?.value[0] === 299;
expandedTags["exif"]?.["ReferenceBlackWhite"]?.value[0][0] === 0;
// @ts-expect-error
expandedTags["exif"]?.["ReferenceBlackWhite"]?.value[0] === 0;
expandedTags["exif"]?.["GPSTimeStamp"]?.value[0][0] === 12;
// @ts-expect-error
expandedTags["exif"]?.["GPSTimeStamp"]?.value[0] === 12;
const computedGpsTimeStamp = computedExpandedTags["exif"]?.["GPSTimeStamp"]?.computed;
computedGpsTimeStamp?.[0] === 12;
computedGpsTimeStamp?.[0] === null;
// @ts-expect-error
const computedGpsTimeStampNumbers: number[] | undefined = computedExpandedTags["exif"]?.["GPSTimeStamp"]?.computed;

// @ts-expect-error
expandedTags["exif"]?.["GPSDestLatitude"]?.value[0][0] === 1;
const gpsDestLatitudeValue = expandedTags["exif"]?.["GPSDestLatitude"]?.value;
if (gpsDestLatitudeValue && gpsDestLatitudeValue.length === 3) {
    gpsDestLatitudeValue[0][0] === 1;
    // @ts-expect-error
    gpsDestLatitudeValue[0][2] === 1;
}
// @ts-expect-error
expandedTags["exif"]?.["GPSDestLongitude"]?.value[0][0] === 1;
const gpsDestLongitudeValue = expandedTags["exif"]?.["GPSDestLongitude"]?.value;
if (gpsDestLongitudeValue && gpsDestLongitudeValue.length === 3) {
    gpsDestLongitudeValue[0][0] === 1;
    // @ts-expect-error
    gpsDestLongitudeValue[0][2] === 1;
}

expandedTags["exif"]?.["FlashEnergy"]?.value[0] === 1;
// @ts-expect-error
expandedTags["exif"]?.["FlashEnergy"]?.value === 1;
expandedTags["exif"]?.["GPSDOP"]?.value[0] === 1;
// @ts-expect-error
expandedTags["exif"]?.["GPSDOP"]?.value === 1;
// @ts-expect-error
expandedTags["exif"]?.["GPSSpeed"]?.value === 1;
expandedTags["exif"]?.["GPSTrack"]?.value[0] === 1;
// @ts-expect-error
expandedTags["exif"]?.["GPSTrack"]?.value === 1;
expandedTags["exif"]?.["GPSDestBearing"]?.value[0] === 1;
// @ts-expect-error
expandedTags["exif"]?.["GPSDestBearing"]?.value === 1;
expandedTags["exif"]?.["GPSDestDistance"]?.value[0] === 1;
// @ts-expect-error
expandedTags["exif"]?.["GPSDestDistance"]?.value === 1;
const gpsHPositioningError: [number, number] | undefined = expandedTags["exif"]?.["GPSHPositioningError"]?.value;
// @ts-expect-error
expandedTags["exif"]?.["GPSHPositioningError"]?.value[2] === 1;

expandedTags["exif"]?.["GPSVersionID"]?.value[0] === 2;
// @ts-expect-error
expandedTags["exif"]?.["GPSVersionID"]?.value === 2;

expandedTags["exif"]?.["BitsPerSample"]?.value === 8;
// @ts-expect-error
expandedTags["exif"]?.["BitsPerSample"]?.value.length;
expandedTags["exif"]?.["StripOffsets"]?.value === 8;
// @ts-expect-error
expandedTags["exif"]?.["StripOffsets"]?.value.length;
const stripOffsets = expandedTags["exif"]?.["StripOffsets"]?.value;
if (Array.isArray(stripOffsets)) {
    stripOffsets.length === 2;
}
expandedTags["exif"]?.["StripByteCounts"]?.value === 8;
// @ts-expect-error
expandedTags["exif"]?.["StripByteCounts"]?.value.length;

expandedTags["exif"]?.["ComponentsConfiguration"]?.value === 1;
// @ts-expect-error
expandedTags["exif"]?.["ComponentsConfiguration"]?.value.length;
expandedTags["exif"]?.["ExifVersion"]?.value[0] === "0220";
// @ts-expect-error
const exifVersionNumbers: number[] | undefined = expandedTags["exif"]?.["ExifVersion"]?.value;
expandedTags["exif"]?.["FlashpixVersion"]?.value === 256;
const flashpixVersion = expandedTags["exif"]?.["FlashpixVersion"]?.value;
if (Array.isArray(flashpixVersion)) {
    flashpixVersion[0] === "0100";
}
// @ts-expect-error
expandedTags["exif"]?.["FlashpixVersion"]?.value.length;
const sceneType = expandedTags["exif"]?.["SceneType"]?.value;
if (Array.isArray(sceneType)) {
    sceneType[0] === "1";
}
// @ts-expect-error
const sceneTypeNumber: number | undefined = expandedTags["exif"]?.["SceneType"]?.value;

const thumbnailImageWidth: string = expandedTags["exif"]?.["Thumbnail"]?.ImageWidth?.description ?? "";
// @ts-expect-error
const thumbnailImageWidthNumber: number = expandedTags["exif"]?.["Thumbnail"]?.ImageWidth?.description ?? 0;
expandedTags["exif"]?.["Thumbnail"]?.StripOffsets?.value === 8;

// @ts-expect-error
expandedTags["exif"]?.["NonExistent"];

/////////
// IPTC
const iptcDestination = expandedTags["iptc"]?.["Destination"];
if (iptcDestination) {
    if (Array.isArray(iptcDestination)) {
        iptcDestination[0].id === 0x0105;
        iptcDestination[0].value[0] === 42;
        iptcDestination[0].description === "Description.";
        // @ts-expect-error
        iptcDestination[0].attributes;
    } else {
        iptcDestination.id === 0x0105;
        iptcDestination.value[0] === 42;
        iptcDestination.description === "Description.";
        // @ts-expect-error
        iptcDestination.attributes;
    }
}

////////
// MPF
expandedTags["mpf"]?.["MPFVersion"]?.value[0] === 48;
expandedTags["mpf"]?.["NumberOfImages"]?.value === 2;
expandedTags["mpf"]?.["Images"]?.[0]?.["ImageSize"].value;
computedExpandedTags["mpf"]?.["NumberOfImages"]?.value === 2;
expandedTypedArrayTags["mpf"]?.["MPFVersion"];
// @ts-expect-error
expandedTags["mpf"]?.["DateTimeOriginal"];
expandedTags["exif"]?.["MPFVersion"]?.value[0] === 48;
expandedTags["mpf"]?.["MPFVersion"]?.value[0] === "0100";
// @ts-expect-error
const mpfVersionNumbers: number[] | undefined = expandedTags["mpf"]?.["MPFVersion"]?.value;

////////
// XMP
if (tags["DateTimeOriginal"]) {
    if ("attributes" in tags["DateTimeOriginal"]) {
        tags["DateTimeOriginal"].attributes["some-key"] === "some value";
    }
}
tags["DateTimeOriginal"]?.value === "2014:09:21 16:00:56";
if ("SomeNonExifTag" in tags) {
    tags["SomeNonExifTag"].value === "value";
}
expandedTags["xmp"]?.["DateTimeOriginal"].attributes["some-key"] ===
    "some value";
expandedTags["xmp"]?.["DateTimeOriginal"].attributes["some-key"] ===
    "some value";
// @ts-expect-error
expandedTags["xmp"]?.["DateTimeOriginal"].attributes === "some value";
expandedTags["xmp"]?.["DateTimeOriginal"].value === "2014:09:21 16:00:56";

// A tag parsed from an rdf:value element with child elements has an object
// value whose entries are regular tags, keyed by local name.
const xmpStructureValue = expandedTags["xmp"]?.["MyStructureTag"].value;
if (typeof xmpStructureValue === "object" && !Array.isArray(xmpStructureValue)) {
    const nestedDescription: string =
        xmpStructureValue["MyInnerTag"].description;
    const nestedAttribute: string =
        xmpStructureValue["MyInnerTag"].attributes["some-key"];
    xmpStructureValue["MyInnerTag"].value === "4711";
    nestedDescription === nestedAttribute;
    // @ts-expect-error
    const nestedNumber: number = xmpStructureValue["MyInnerTag"].description;
    nestedNumber === 0;
    // @ts-expect-error
    xmpStructureValue["MyInnerTag"].descriptions === "4711";
    // @ts-expect-error
    xmpStructureValue["MyInnerTag"].attributes === "some value";
}

////////
// PNG
if (tags["Color Type"]) {
    tags["Color Type"].description === "Grayscale";
}

expandedTags.png?.["Color Type"]?.description === "Grayscale";
tags["Pixel Units"]?.value === 1;
expandedTags.png?.["Pixel Units"]?.value === 1;
// @ts-expect-error
expandedTags.png?.["Pixel Units"]?.value === "a string";
expandedTags.png?.["Pixel Units"]?.description === "meters";
// @ts-expect-error
expandedTags.png?.["Color Type"]?.description === "A non-color type value";
expandedTags.png?.["Custom Tag Name"]?.description === "Should work";

/////////
// RIFF
tags["Alpha"]?.value === 0;
tags["Alpha"]?.description === "Yes";
tags["Alpha"]?.description === "No";
// @ts-expect-error
tags["Alpha"]?.description === "Maybe";
expandedTags["riff"]?.["Alpha"]?.value === 0;
expandedTags["riff"]?.["Alpha"]?.description === "Yes";
expandedTags["riff"]?.["Alpha"]?.description === "No";
// @ts-expect-error
expandedTags["riff"]?.["Alpha"]?.description === "Maybe";

tags["Animation"]?.value === 0;
tags["Animation"]?.description === "Yes";
tags["Animation"]?.description === "No";
// @ts-expect-error
tags["Animation"]?.description === "Maybe";
expandedTags["riff"]?.["Animation"]?.value === 0;
expandedTags["riff"]?.["Animation"]?.description === "Yes";
expandedTags["riff"]?.["Animation"]?.description === "No";
// @ts-expect-error
expandedTags["riff"]?.["Animation"]?.description === "Maybe";

tags["ImageWidth"]?.value === 100;
tags["ImageWidth"]?.description === "100px";
// @ts-expect-error
const flatImageWidthNumber: number = tags["ImageWidth"]?.value ?? 0;
// @ts-expect-error
(tags["ImageWidth"]?.value ?? 0) * 2;
const flatImageWidthValue = tags["ImageWidth"]?.value;
if (typeof flatImageWidthValue === "number") {
    const flatImageWidthNarrowed: number = flatImageWidthValue;
}
const flatRiffImageWidth: Tags["ImageWidth"] = {value: 100, description: "100px"};
// @ts-expect-error
const flatCompressionNumber: number = tags["Compression"]?.value ?? 0;
// @ts-expect-error
const flatCompressionPngDescription: "Deflate/Inflate" | "Unknown" | undefined = tags["Compression"]?.description;
tags["Compression"]?.description === "6";
tags["Compression"]?.description === "Deflate/Inflate";
const flatCompressionValue = tags["Compression"]?.value;
if (typeof flatCompressionValue === "number") {
    const flatCompressionNarrowed: number = flatCompressionValue;
}
const flatPngCompression: Tags["Compression"] = {value: 0, description: "Deflate/Inflate"};
expandedTags["riff"]?.["ImageWidth"]?.value === 100;
expandedTags["riff"]?.["ImageWidth"]?.description === "100px";

tags["ImageHeight"]?.value === 100;
tags["ImageHeight"]?.description === "100px";
expandedTags["riff"]?.["ImageHeight"]?.value === 100;
expandedTags["riff"]?.["ImageHeight"]?.description === "100px";

////////
// GIF
tags["GIF Version"]?.value === "87a";
tags["GIF Version"]?.description === "87a";
tags["GIF Version"]?.description === "89a";
// @ts-expect-error
tags["GIF Version"]?.description === "70a";
expandedTags["gif"]?.["GIF Version"]?.value === "87a";
expandedTags["gif"]?.["GIF Version"]?.description === "87a";
expandedTags["gif"]?.["GIF Version"]?.description === "89a";
// @ts-expect-error
expandedTags["gif"]?.["GIF Version"]?.description === "70a";

tags["Image Width"]?.value === 100;
tags["Image Width"]?.description === "100px";
expandedTags["gif"]?.["Image Width"]?.value === 100;
expandedTags["gif"]?.["Image Width"]?.description === "100px";

tags["Image Height"]?.value === 100;
tags["Image Height"]?.description === "100px";
expandedTags["gif"]?.["Image Height"]?.value === 100;
expandedTags["gif"]?.["Image Height"]?.description === "100px";

tags["Global Color Map"]?.value === 1;
tags["Global Color Map"]?.description === "Yes";
expandedTags["gif"]?.["Global Color Map"]?.value === 1;
expandedTags["gif"]?.["Global Color Map"]?.value === 0;
// @ts-expect-error
expandedTags["gif"]?.["Global Color Map"]?.value === 2;
expandedTags["gif"]?.["Global Color Map"]?.description === "Yes";
expandedTags["gif"]?.["Global Color Map"]?.description === "No";
// @ts-expect-error
expandedTags["gif"]?.["Global Color Map"]?.description === "Maybe";

tags["Bits Per Pixel"]?.value === 8;
tags["Bits Per Pixel"]?.description === "8 bits";
expandedTags["gif"]?.["Bits Per Pixel"]?.value === 4;
// @ts-expect-error
expandedTags["gif"]?.["Bits Per Pixel"]?.value === 0;
// @ts-expect-error
expandedTags["gif"]?.["Bits Per Pixel"]?.value === 9;
expandedTags["gif"]?.["Bits Per Pixel"]?.description === "8 bits";

tags["Color Resolution Depth"]?.value === 8;
tags["Color Resolution Depth"]?.description === "8 bits";
expandedTags["gif"]?.["Color Resolution Depth"]?.value === 4;
// @ts-expect-error
expandedTags["gif"]?.["Color Resolution Depth"]?.value === 0;
// @ts-expect-error
expandedTags["gif"]?.["Color Resolution Depth"]?.value === 9;
expandedTags["gif"]?.["Color Resolution Depth"]?.description === "8 bits";

////////
// ICC
type IccValue<K extends string> = NonNullable<NonNullable<ExpandedTags["icc"]>[K]>["value"];

const renderingIntent: number = expandedTags["icc"]?.["Rendering Intent"]?.value ?? 0;
// @ts-expect-error
const renderingIntentString: string = expandedTags["icc"]?.["Rendering Intent"]?.value ?? "";
const renderingIntentDescription: string = expandedTags["icc"]?.["Rendering Intent"]?.description ?? "";
const profileVersion: string = expandedTags["icc"]?.["Profile Version"]?.value ?? "";

const iccDescriptionValue = expandedTags["icc"]?.["ICC Description"]?.value;
if (typeof iccDescriptionValue === "string") {
    const iccDescriptionText: string = iccDescriptionValue;
} else if (iccDescriptionValue) {
    const iccDescriptionEnUs: string = iccDescriptionValue["en-US"];
}
// @ts-expect-error
const iccDescription: string = expandedTags["icc"]?.["ICC Description"]?.value ?? "";
const iccDescriptionTexts: IccValue<"ICC Description"> = { "en-US": "Apple", "sv-SE": "Apple" };
// @ts-expect-error
const iccDescriptionNumber: IccValue<"ICC Description"> = 0;

// @ts-expect-error
const dscm: string = expandedTags["icc"]?.["dscm"]?.value ?? "";
const dscmText: IccValue<"dscm"> = "Apple";
const dscmTexts: IccValue<"dscm"> = { "en-US": "Apple", "sv-SE": "Apple" };
const dscmDescription: string = expandedTags["icc"]?.["dscm"]?.description ?? "";

const iccLiteral: NonNullable<ExpandedTags["icc"]> = {
    "Rendering Intent": { value: 0, description: "Perceptual" },
    "Profile Version": { value: "4.3.0", description: "4.3.0" },
    "ICC Description": { value: { "en-US": "Apple", "sv-SE": "Apple" }, description: "Apple" },
    "dscm": { value: "Apple", description: "Apple" },
};
const iccLiteralWrongIntent: NonNullable<ExpandedTags["icc"]> = {
    // @ts-expect-error
    "Rendering Intent": { value: "0", description: "Perceptual" },
};

tags["Rendering Intent"]?.value === 0;
// @ts-expect-error
tags["Rendering Intent"]?.value === "Perceptual";
const flatRenderingIntent: number = tags["Rendering Intent"]?.value ?? 0;
const flatIccDescriptionTexts: NonNullable<Tags["ICC Description"]>["value"] = { "en-US": "Apple", "sv-SE": "Apple" };
// @ts-expect-error
const flatIccDescriptionString: string = tags["ICC Description"]?.value ?? "";
// The ICC index type must not widen the value of a flat tag that no group names.
const flatUnnamedValue: string = tags["CreatorTool"].value;
tags["CreatorTool"].value.toLowerCase();

//////////////
// Photoshop
// expandedTags.photoshop?.["CaptionDigest"]?.id === 4711;
// expandedTags.photoshop?.["CaptionDigest"]?.value === "string";
// expandedTags.photoshop?.["CaptionDigest"]?.description === "abcd1234";
// expandedTags.photoshop?.["PrintInformation"]?.description === '{"a": 1}';
// expandedTags.photoshop?.["PrintStyle"]?.description === '{"a": 1}';
expandedTags.photoshop?.["PathInformation"]?.description === '{"a": 1}';
expandedTags.photoshop?.["ClippingPathName"]?.description === '{"a": 1}';
// tags["CaptionDigest"]?.id === 4711;
// tags["CaptionDigest"]?.value === "string";
// tags["CaptionDigest"]?.description === "abcd1234";
tags["PathInformation"]?.description === '{"a": 1}';
tags["ClippingPathName"]?.description === '{"a": 1}';

////////////////
// Maker Notes
expandedTags.makerNotes?.["AutoRotate"]?.value === 1;
expandedTags.makerNotes?.["AutoRotate"]?.description === 'Rotate 90 CW';
tags["AutoRotate"]?.value === 1;
tags["AutoRotate"]?.description === 'Rotate 90 CW';
expandedTags.makerNotes?.["LensType"]?.value === 48;
expandedTags.makerNotes?.["LensType"]?.description === '48';
tags["LensType"]?.value === 48;
tags["LensType"]?.description === '48';
expandedTags.makerNotes?.["LensModel"]?.value[0] === 'EF-S18-55mm f/3.5-5.6 IS';
expandedTags.makerNotes?.["LensModel"]?.description === 'EF-S18-55mm f/3.5-5.6 IS';
tags["LensModel"]?.description === 'EF-S18-55mm f/3.5-5.6 IS';
// @ts-expect-error
tags["LensModel"]?.value.join(", ");
const flatLensModel = tags["LensModel"];
if (flatLensModel && "id" in flatLensModel) {
    flatLensModel.value.join(", ");
    flatLensModel.value[0] === 'EF-S18-55mm f/3.5-5.6 IS';
}
expandedTags["exif"]?.["LensModel"]?.value.join(", ");
const flatCanonLensModel: Tags["LensModel"] = {value: ["EF-S18-55mm f/3.5-5.6 IS"], description: "EF-S18-55mm f/3.5-5.6 IS"};
expandedTags.makerNotes?.["RollAngle"]?.value === 42;
expandedTags.makerNotes?.["RollAngle"]?.description === '-21';
tags["RollAngle"]?.value === 42;
tags["RollAngle"]?.description === '-21';
expandedTags.makerNotes?.["PitchAngle"]?.value === 42;
expandedTags.makerNotes?.["PitchAngle"]?.description === '-21';
tags["PitchAngle"]?.value === 42;
tags["PitchAngle"]?.description === '-21';
expandedTags.makerNotes?.["PentaxVersion"]?.value[0] === 8;
expandedTags.makerNotes?.["PentaxVersion"]?.description === '8.0.0.0';
tags["PentaxVersion"]?.value[0] === 8;
expandedTags.makerNotes?.["PentaxModelID"]?.value === 0x13254;
tags["PentaxModelID"]?.value === 0x13254;
expandedTags.makerNotes?.["CameraOrientation"]?.value === 1;
expandedTags.makerNotes?.["CameraOrientation"]?.description === 'Rotate 270 CW';
tags["CameraOrientation"]?.value === 1;
tags["CameraOrientation"]?.description === 'Rotate 270 CW';
// @ts-expect-error
expandedTags.makerNotes?.["CameraOrientation"]?.description === 'Sideways';
// @ts-expect-error
tags["CameraOrientation"]?.description === 'Sideways';
// @ts-expect-error
expandedTags.makerNotes?.["Orientation"];
tags["Orientation"]?.value === 1;
// @ts-expect-error
tags["Orientation"].value;
// @ts-expect-error
expandedTags.makerNotes?.["PentaxVersion"].value;
// @ts-expect-error
expandedTags.makerNotes?.["PentaxModelID"].value;
// @ts-expect-error
expandedTags.makerNotes?.["CameraOrientation"].value;
// @ts-expect-error
expandedTags.makerNotes?.["RollAngle"].value;
// @ts-expect-error
expandedTags.makerNotes?.["PitchAngle"].value;
// @ts-expect-error
expandedTags.makerNotes?.["AutoRotate"].value;
// @ts-expect-error
tags["AutoRotate"].value;

//////////////
// Composite
expandedTags.composite?.["FieldOfView"]?.value === 42;
expandedTags.composite?.["FieldOfView"]?.description === '42 deg';
tags["FieldOfView"]?.value === 42;
tags["FieldOfView"]?.description === '42 deg';

/////////////////////
// domParser option
const minimalDomParser = {
    parseFromString(xml: string, mimeType: string) {
        return {};
    }
};

load(new ArrayBuffer(0), { domParser: minimalDomParser });
loadView(new DataView(new ArrayBuffer(0)), { domParser: minimalDomParser });

// xmldom usage
import { DOMParser, onErrorStopParsing } from '@xmldom/xmldom';
const xmldomParser = new DOMParser({ onError: onErrorStopParsing });
load(new ArrayBuffer(0), { domParser: xmldomParser });
loadView(new DataView(new ArrayBuffer(0)), { domParser: xmldomParser });

// @ts-expect-error
load(new ArrayBuffer(0), { domParser: 42 });
// @ts-expect-error
loadView(new DataView(new ArrayBuffer(0)), { domParser: 42 });

//////////////////////
// decompress option
load(new ArrayBuffer(0), {
    async: true,
    decompress: {
        brotli: async (data: Uint8Array) => new Uint8Array(data),
    }
});
load(new ArrayBuffer(0), {
    async: true,
    decompress: {
        deflate: async (data: Uint8Array) => new ArrayBuffer(data.length),
    }
});
load(new ArrayBuffer(0), {
    async: true,
    decompress: {
        brotli: (data: Uint8Array) => data,
        deflate: (data: Uint8Array) => new ArrayBuffer(data.length),
    }
});
loadView(new DataView(new ArrayBuffer(0)), {
    async: true,
    decompress: {
        brotli: async (data: Uint8Array) => new Uint8Array(data),
    }
});
load(new ArrayBuffer(0), {
    async: true,
    decompress: {
        deflate: (data: Uint8Array, options: { maxOutputLength: number }) => data.slice(0, options.maxOutputLength),
        brotli: async (data: Uint8Array, { maxOutputLength }: { maxOutputLength: number }) => new Uint8Array(Math.min(data.length, maxOutputLength)),
    }
});
// @ts-expect-error
load(new ArrayBuffer(0), { async: true, decompress: { deflate: (data: Uint8Array, options: { maxOutputLength: string }) => data } });
// @ts-expect-error
load(new ArrayBuffer(0), { async: true, decompress: { deflate: (data: Uint8Array, options: { maxOutputLength: number }, extra: number) => data } });
// @ts-expect-error
load(new ArrayBuffer(0), { decompress: { brotli: 42 } });
// @ts-expect-error
load(new ArrayBuffer(0), { decompress: { deflate: "not a function" } });
load(new ArrayBuffer(0), {
    async: true,
    decompress: {
        maxDecompressedSize: 16 * 1024 * 1024,
    }
});
// @ts-expect-error
load(new ArrayBuffer(0), { decompress: { maxDecompressedSize: "16MB" } });

///////////////////////////////////
// metadataRange / includeOffsets
load(new ArrayBuffer(0), { expanded: true, includeOffsets: true });
loadView(new DataView(new ArrayBuffer(0)), { expanded: true, includeOffsets: true });
load(new ArrayBuffer(0), { expanded: true, includeOffsets: false });
load(new ArrayBuffer(0), { expanded: true });

// includeOffsets requires expanded: true. Without it, the option is rejected.
// @ts-expect-error
load(new ArrayBuffer(0), { includeOffsets: true });
// @ts-expect-error
load(new ArrayBuffer(0), { expanded: false, includeOffsets: true });
// @ts-expect-error
loadView(new DataView(new ArrayBuffer(0)), { includeOffsets: true });
// @ts-expect-error
load(new ArrayBuffer(0), { expanded: true, includeOffsets: "yes" });

const expandedWithOffsets = await load("", { expanded: true, includeOffsets: true });
if (expandedWithOffsets.metadataRange) {
    expandedWithOffsets.metadataRange.start === 0;
    expandedWithOffsets.metadataRange.end === 100;
    expandedWithOffsets.metadataRange.complete === true;
    expandedWithOffsets.metadataRange.blocks[0].type === "exif";
    expandedWithOffsets.metadataRange.blocks[0].start === 2;
    expandedWithOffsets.metadataRange.blocks[0].end === 100;
    // @ts-expect-error  pcx is not a valid block type
    expandedWithOffsets.metadataRange.blocks[0].type === "pcx";
}

// length: 'auto' — narrows to Promise<ExpandedTags>, regardless of input shape.
const autoFromUrl: Promise<ExpandedTags> = load("", {
    length: "auto",
    expanded: true,
    includeOffsets: true,
});
const autoFromBuf: Promise<ExpandedTags> = load(new ArrayBuffer(0), {
    length: "auto",
    expanded: true,
    includeOffsets: true,
});

const autoTags = await load("", { length: "auto", expanded: true, includeOffsets: true });
if (autoTags.metadataRange) {
    autoTags.metadataRange.buffer instanceof ArrayBuffer;
    autoTags.metadataRange.fetched === 1024;
    autoTags.metadataRange.requests === 1;
}

// @ts-expect-error  length: 'auto' requires expanded: true
load(new ArrayBuffer(0), { length: "auto", includeOffsets: true });
// @ts-expect-error  length: 'auto' requires includeOffsets: true
load(new ArrayBuffer(0), { length: "auto", expanded: true });
// @ts-expect-error  length: 'auto' requires both expanded and includeOffsets
load(new ArrayBuffer(0), { length: "auto" });
// @ts-expect-error  length: 'auto' on a URL still requires both
load("", { length: "auto" });

const unsupportedFormatError: Error = new errors.UnsupportedFormatError("x");
unsupportedFormatError instanceof errors.UnsupportedFormatError;
const metadataMissingError: Error = new errors.MetadataMissingError("x");
// @ts-expect-error  there is no such error class
new errors.UnsupportedFormatErorr("x");
