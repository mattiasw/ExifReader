import { load, loadView, type Tags, type ExpandedTags } from "../../exif-reader.js";

load("", { includeUnknown: true });
load("", { length: 1024 });
load("", { expanded: false, includeUnknown: true, length: 1024 });
load("", { async: true });
const syncTags0: Tags = load(new ArrayBuffer(0));
const asyncTags0: Promise<Tags> = load(new ArrayBuffer(0), { async: true });
// @ts-expect-error
const syncTags1: Tags = load(new ArrayBuffer(0), { async: true });
const syncTags2: Tags = loadView(new DataView(new ArrayBuffer(0)), { includeUnknown: true });
const syncTags3: ExpandedTags = loadView(new DataView(new ArrayBuffer(0)), { expanded: true });
const asyncTags1: Promise<Tags> = loadView(new DataView(new ArrayBuffer(0)), { async: true });

const tags = await load("");
const expandedTags = await load("", { expanded: true });

/////////
// File
expandedTags["file"]?.["FileType"] === "TIFF";
expandedTags["file"]?.["FileType"] === "JPEG";
expandedTags["file"]?.["FileType"] === "PNG";
expandedTags["file"]?.["FileType"] === "HEIC";
expandedTags["file"]?.["FileType"] === "AVIF";
expandedTags["file"]?.["FileType"] === "WebP";
expandedTags["file"]?.["FileType"] === "GIF";
// @ts-expect-error
expandedTags["file"]?.["FileType"] === "PCX";

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
    tags["Thumbnail"]?.Compression?.description === "Deflate";
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

expandedTags["exif"]?.["GPSLatitude"]?.value[0][0] === 1;
// @ts-expect-error
expandedTags["exif"]?.["GPSLatitude"]?.value[0][2] === 1;
// @ts-expect-error
expandedTags["exif"]?.["GPSLatitude"]?.value[3][0] === 1;
expandedTags["exif"]?.["GPSLongitude"]?.value[0][0] === 1;
// @ts-expect-error
expandedTags["exif"]?.["GPSLongitude"]?.value[0][2] === 1;
// @ts-expect-error
expandedTags["exif"]?.["GPSLongitude"]?.value[3][0] === 1;
expandedTags["exif"]?.["GPSAltitude"]?.value[0] === 1;
// @ts-expect-error
expandedTags["exif"]?.["GPSAltitude"]?.value[2] === 1;
expandedTags["gps"]?.["Latitude"] === 12.345
expandedTags["gps"]?.["Longitude"] === 12.345;
expandedTags["gps"]?.["Altitude"] === 12.345

expandedTags["exif"]?.["Thumbnail"]?.type === "image/jpeg";
expandedTags["exif"]?.["Thumbnail"]?.Compression?.id === 4711;
expandedTags["exif"]?.["Thumbnail"]?.Compression?.value === 32946;
expandedTags["exif"]?.["Thumbnail"]?.Compression?.description === "Deflate";
expandedTags["exif"]?.["Images"]?.[0];

tags["SceneType"]?.value === 1;
tags["SceneType"]?.value === "1";
expandedTags["exif"]?.["SceneType"]?.value === 1;
// @ts-expect-error
expandedTags["exif"]?.["SceneType"]?.value === "1";
expandedTags["xmp"]?.["SceneType"]?.value === "1";

// @ts-expect-error
expandedTags["exif"]?.["NonExistent"];

/////////
// IPTC
expandedTags["iptc"]?.["Destination"]?.id === 0x0105;
expandedTags["iptc"]?.["Destination"]?.value[0] === 42;
expandedTags["iptc"]?.["Destination"]?.description === "Description.";
// @ts-expect-error
expandedTags["iptc"]?.["Destination"]?.attributes;

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

//////////////
// Composite
expandedTags.composite?.["FieldOfView"]?.value === 42;
expandedTags.composite?.["FieldOfView"]?.description === '42 deg';
tags["FieldOfView"]?.value === 42;
tags["FieldOfView"]?.description === '42 deg';