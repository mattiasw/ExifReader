import { load } from "../../exif-reader.js";

load("", { includeUnknown: true });
load("", { length: 1024 });
load("", { expanded: false, includeUnknown: true, length: 1024 });

const tags = await load("");
const expandedTags = await load("", { expanded: true });

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
expandedTags["exif"]?.["Thumbnail"]?.type === "image/jpeg";
expandedTags["exif"]?.["Thumbnail"]?.Compression?.id === 4711;
expandedTags["exif"]?.["Thumbnail"]?.Compression?.value === 32946;
expandedTags["exif"]?.["Thumbnail"]?.Compression?.description === "Deflate";
expandedTags["exif"]?.["Images"]?.[0];
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
