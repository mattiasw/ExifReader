# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The Exif thumbnail is now returned as `Thumbnail` for PNG files whose Exif
  is stored in a `Raw profile type exif` text chunk, as ImageMagick writes it.
  This works for tEXt and uncompressed iTXt chunks, and for zTXt and
  compressed iTXt chunks with `async: true`. When the PNG also has an eXIf
  chunk with a thumbnail, the eXIf thumbnail is returned.

### Changed

- `load()` now rejects for a file path, URL or `File` object when `length` is
  not a finite non-negative number or `'auto'`, such as the string `'1024'`,
  `NaN`, `Infinity` or a negative number. Such a value was ignored and the
  whole file was read.
- In browsers and wherever `Buffer` is not defined, a URL-encoded data URI
  that writes a byte above 0x7F as the character with that code, either
  literally or as its UTF-8 escapes such as `%C2%89` for 0x89 (what
  `encodeURIComponent` of a binary string gives), now decodes to the UTF-8
  bytes of that character, as it already did in Node.js. Write such a byte as
  a single escape (`%89`) or use base64.

### Fixed

- In the default flat output, an XMP or PNG text tag named `Thumbnail` no
  longer takes the `Thumbnail` key when the image has no Exif thumbnail, and
  one named `FileType` no longer takes the `FileType` key when `FileType` is
  filtered out. In expanded output, `xmp._raw` is always the raw XMP packet
  string, even when the XMP has an element or attribute named `_raw`.
- A custom build no longer rewrites the bundle in other projects that share it
  through a hardlink. When exifreader's postinstall is allowed to run (by
  default in pnpm 9, and in pnpm 10 when exifreader is listed in
  `onlyBuiltDependencies`), pnpm hardlinks the `dist/` files of the second and
  later projects to one copy in its store, and the build wrote through that
  link. The build now gives the project its own copy of the bundle first.
- Loading a URL now stops the download as soon as the server answers 416 or
  another error status, instead of reading the rest of the response body or
  leaving the connection open. With a numeric `length`, a 416 answer now gives
  an empty buffer with `fetch` too, as it already did over Node's `http`
  module, instead of the start of the error body.
- The README no longer lists `DataView` among the in-memory inputs that
  `length: 'auto'` accepts. For in-memory data, `load()` takes an
  `ArrayBuffer`, `SharedArrayBuffer` or Node.js `Buffer`, as its type
  definitions already said.
- `load()` no longer throws synchronously in async mode for a JPEG XL file with
  a `brob` box when the input is a Buffer that ExifReader does not detect as a
  Node.js Buffer, such as one from the `buffer` package or a Node.js Buffer
  from another vm context. Its `brob` Exif and XMP data is now read as for any
  other input.
- IPTC tags are no longer all lost when the last IPTC dataset in the image is
  truncated. The datasets before it are now returned.
- A PNG zTXt or compressed iTXt chunk whose text cannot be decompressed
  (unknown compression method, truncated data, a failing custom decompress
  function, or the decompressed-size limit reached) now gives the placeholder
  `<text using unknown compression>` as a string. It was an array of
  characters, and for iTXt the description was a run of NUL characters. A
  `Raw profile type exif` or `Raw profile type iptc` chunk that fails this way
  now also gives the placeholder instead of being left out.
- A fractional numeric `length`, such as a computed `size / 3`, is now rounded
  down. It was ignored, so the whole file or URL was read with no size limit.
- `load()` with a URL and `length: 0` no longer sends the malformed header
  `Range: bytes=0--1`. It now makes no request and rejects with
  `Invalid image format`, since zero bytes hold no metadata.
- A custom `decompress.brotli` function is no longer called for a PNG zTXt or
  iTXt chunk whose compression method is not 0, the only method PNG defines.
  Such a chunk now gives the `<text using unknown compression>` placeholder.
- A compressed PNG iTXt chunk that ends right after its compression flag no
  longer takes its compression method from the byte after the chunk. It now
  gives an empty text value, whatever follows it.
- `load()` now returns a rejected promise instead of throwing when a data URI
  cannot be decoded, such as one with invalid base64. A data URI is now
  treated as base64 only when `;base64` is in its header, not when it appears
  in a URL-encoded payload.
- A URL-encoded data URI, one without `;base64`, is now decoded byte for byte
  as browsers do, so `%FF` is the byte 0xFF. One that holds a JPEG or PNG now
  loads instead of failing with `URIError`, and the result is the same with
  and without `Buffer`.
- A Canon maker note or a Pentax K-3 III `LevelInfo` value of 4 bytes or
  fewer, which the IFD entry stores in place of an offset, is now parsed from
  where it is stored instead of from a position further into the file.
- A Pentax K-3 III `LevelInfo` value shorter than 7 bytes no longer reports
  `CameraOrientation`, `RollAngle` or `PitchAngle` from the bytes that follow
  it; only the fields stored inside the value are read.
- An Exif, GPS or Interoperability IFD pointer that is negative, has no value
  or points into the 8-byte TIFF header is now skipped, and the other Exif
  tags are kept. A negative pointer made ExifReader drop all Exif tags, or
  read that sub-IFD from bytes before the TIFF header. The other two made it
  read the TIFF header as that sub-IFD, which could give made-up tags.
- A 0th IFD, MPF IFD or thumbnail (next IFD) offset that points into the
  8-byte TIFF or MPF header is now ignored. ExifReader read the header as
  that IFD, which could give made-up tags.
- XMP elements and attributes without a namespace prefix, such as properties
  in a default namespace, are now read under their own name. They were all
  read under the name `undefined`, so only the last one was kept.
- Composite tags are no longer computed from non-numeric XMP or PNG text
  values, which gave `NaN` or the raw text. Numeric XMP strings and `n/d`
  rationals are now converted, so `FocalLength35efl.value` is always a number
  and an XMP `FocalLength` such as `850/10` no longer gives a wrong
  `ScaleFactorTo35mmEquivalent`. An input of zero, a zero denominator, or a
  result that overflows or underflows the number range no longer gives a
  `FocalLength35efl`, `ScaleFactorTo35mmEquivalent` or `FieldOfView` of 0,
  `Infinity` or a meaningless value: the tag is left out instead.
- `FocalLength35efl` computed from the focal plane resolution, for images
  without `FocalLengthIn35mmFilm`, is now correct when the resolution unit is
  inches or centimeters. It was 645 or 100 times too large, which also made
  `ScaleFactorTo35mmEquivalent` too large and `FieldOfView` too small.
- `FocalLength35efl` computed from the focal plane resolution now uses the
  original pixel dimensions (`PixelXDimension` and `PixelYDimension`) instead
  of the image's stored width and height. For an image downscaled after
  capture it was far too large, which also made `ScaleFactorTo35mmEquivalent`
  too large and `FieldOfView` too small. It is now also computed for TIFF,
  HEIC and WebP images with those tags, and for PNG in expanded output, where
  it was missing. Images without those tags are unchanged.
- An ImageMagick `Raw profile type exif` or `Raw profile type iptc` profile in
  an uncompressed PNG text chunk (tEXt, or iTXt without compression) is now
  parsed into Exif or IPTC tags in every mode, as one in a compressed chunk
  already was with `async: true`. It was returned as a PNG text tag holding
  the hex dump of the profile. As with a compressed chunk, a tag found both in
  the profile and in an `eXIf` chunk now gets its value from the profile.
- With `expanded: true`, Exif from a PNG text raw profile no longer gives an
  `exif.Thumbnail` holding the thumbnail IFD tags with no thumbnail image.
  Flat output already left them out.
- Exif in compressed PNG text chunks (`Raw profile type exif`) and JPEG XL
  `brob` boxes of small files could lose tag values, such as the exposure
  time, f-number and lens model, because it shared the limit on decoded tag
  values, which is sized from the file. Each such block now adds 4 times its
  decompressed size to the limit, up to 1 MiB per file in total.
- `Thumbnail` is no longer left out when IFD0 ends exactly at the end of the
  file. When the file ends partway through an IFD0 entry, the bytes of that
  entry are no longer read as the offset to the thumbnail IFD, which could
  give made-up `Thumbnail` tags.
- `MakerNote` in Exif read from a JPEG XL `brob` box or a PNG raw profile text
  chunk, and the Pentax `LevelInfo` maker note tag from cameras other than the
  K-3 III, no longer carry an internal `__offset` property.

### Security

- A PNG iCCP chunk with a long color profile name used memory far above the
  file size: an 8 MiB iCCP chunk with no terminator raised peak memory to
  about 277 MB with `async: true`. An iCCP chunk whose profile name is longer
  than 79 bytes, or whose profile name and compression method do not fit
  inside the chunk, is now skipped.
- A PNG made of many small iCCP chunks used memory far above the file size:
  8 MiB of minimal iCCP chunks raised peak memory to about 195 MB with
  `async: true`. Only the first valid iCCP chunk was ever used, as the PNG
  spec allows only one, and later ones are no longer kept. The same file now
  peaks at about 80 MB.
- A PNG text chunk with a long keyword, iTXt language tag or iTXt translated
  keyword used memory far above the file size: an 8 MiB tEXt chunk with no
  terminator raised peak memory to about 300 MB. A PNG text chunk whose
  keyword or iTXt language tag is longer than 79 bytes is now skipped, and the
  translated keyword, which is not part of the result, is no longer collected.
- The minimum version of `@xmldom/xmldom` is now 0.9.12. With 0.9.10 or
  0.9.11, reading an XMP packet whose elements carry many attributes took
  time quadratic in their number: a 509 KB packet blocked `load()` for about
  3 seconds. A packet with many undeclared namespace prefixes took quadratic
  time as well, because ExifReader declares them on the root element before
  it retries the parse. This affects Node.js with `@xmldom/xmldom` installed
  as the default `optionalDependency`. If your lockfile pins an older 0.9.x
  version, update it, for example with `npm update @xmldom/xmldom`. If you
  pass your own `@xmldom/xmldom` parser in the `domParser` option, update
  that dependency to 0.9.12 or later (0.8.15 or later on the 0.8 line) as
  well.
- An XMP packet that was not valid UTF-8, for example because of a single
  stray byte, took about 35 times its size in memory to read: a 16 MiB packet
  took about 630 MB and one second. The same packet now takes about 150 MB
  and a quarter of a second.
- Reading a standalone XMP file with `includeOffsets`, which `length: 'auto'`
  needs, took memory far above the file size: an 8 MiB file took about 310 MB
  and almost half a second, against about 96 MB without `includeOffsets`. The
  check for the closing XMP marker now scans the bytes directly, so the file
  takes about as much memory as without `includeOffsets`.
- XMP values nested deeper than 16 levels are now left out, where the limit
  was 32 levels. Each level repeats the description of everything below it,
  so this halves the description text a crafted packet with deeply nested
  values can produce. An 8 MiB value at the deepest allowed level could raise
  peak memory to about 600 MB, and now to about 340 MB.
- An Exif text value made of many short strings separated by NUL bytes took
  more memory per byte of the file than any other kind of tag value: a
  crafted 4 MiB file of such values raised peak memory to about 450 MB,
  against about 365 MB for one whose values are plain bytes. Each string
  after the first in an Exif text value now counts against the limit on
  decoded tag values, so such a file now peaks at about 320 MB, below the
  file of plain bytes. A text value that reaches the limit keeps the strings
  read before it. This affects every format that carries Exif.
- Exif in compressed PNG text chunks (`Raw profile type exif`) and JPEG XL
  `brob` boxes could make ExifReader read IFD entries in proportion to the
  decompressed size rather than the file size: a crafted 315 KB PNG blocked
  `load()` for about 6 seconds and raised peak memory to about 330 MB. The
  number of IFD entries read from one file is now limited in proportion to its
  size, and the tags past the limit are left out, so the same file now takes
  about 2.4 seconds and 155 MB.
- In HEIC and AVIF files, a string in an item information entry (`infe` box)
  with no terminating NUL byte was read past the end of its box, up to the
  next NUL byte or the end of the file, and used memory far above the file
  size: an 8 MiB file whose item name has no terminator raised peak memory to
  about 276 MB. Each such string (item name, content type, content encoding
  and item URI) now stops at the end of its box and after at most 64 KiB, so
  the same file peaks at about 76 MB, against about 73 MB for one whose item
  name is terminated.
- An XMP packet whose elements were nested one inside the next, each
  declaring a namespace prefix, took time quadratic in the nesting depth with
  `@xmldom/xmldom` 0.9.12: a 1 MB packet blocked `load()` for about 8
  seconds. XMP packets with elements nested deeper than 256 levels are now
  left out without being parsed. Any packet nested about 2,000 levels deep
  already lost all its XMP tags to a stack overflow in ExifReader's own code.
- A base64 data URI passed to `load()` used memory far above its size: an
  8 MiB data URI holding a 6 MiB XMP packet raised peak memory to about
  445 MB and took about 0.65 seconds. The same data URI now peaks at about
  116 MB and takes about 0.09 seconds.
- A JPEG whose MPF `MPEntry` table held many entries made ExifReader build
  one MPF `Images` entry per 16 bytes of the table: an 8 MiB file whose table
  fills it raised peak memory to about 1,000 MB and blocked `load()` for about
  1.9 seconds. The MPF `Images` array now holds at most the first 256 entries
  of the table, so the same file peaks at about 280 to 340 MB and takes about
  0.4 seconds. Real MPF files carry a handful of images.
- A Photoshop `PathInformation` resource in the Exif `PhotoshopSettings` tag
  had every one of its path records decoded: a crafted 4 MiB TIFF whose
  resource held about 160,000 records raised peak memory to about 400 MB and
  blocked `load()` for about 1.7 seconds, against about 167 MB for one plain
  4 MiB tag value. At most 32,768 path records are now decoded per image,
  shared by all its `PathInformation` resources, and the records past that are
  left out of the description. The same file now peaks at about 330 MB and
  takes about 0.65 seconds, also when its records are split across two
  resources.
- Nothing limited how many elements, attributes and other markup nodes an XMP
  packet handed to the XML parser, and each one takes about 2 KB of memory in
  `@xmldom/xmldom`: a 16 MiB packet of empty elements ran a default Node.js
  heap out of memory, and so did a 308-byte JPEG XL file whose `brob` box held
  32 MiB of them compressed. XMP packets with more than 250,000 markup nodes
  (elements, attributes, comments, processing instructions, CDATA sections
  and DOCTYPE declarations), counted the way `@xmldom/xmldom` 0.9 reads the
  markup, are now left out without being parsed, so the 16 MiB packet peaks
  at about 160 MB. XMP in a JPEG XL `brob` box that decompresses to more than
  4 times the file size plus 64 KiB is left out as well, so the 308-byte file
  peaks at about 150 MB.
- A JPEG made of many small APP1 XMP segments used memory far above the file
  size: an 8 MiB file of empty XMP segments raised peak memory to about
  290 MB. Only the first 1024 XMP segments of a JPEG file, standard and
  extended counted together, are now read, far more than real files use, and
  the same file now peaks at about 85 MB.
- IPTC in compressed PNG text chunks (`Raw profile type iptc`) could make
  ExifReader read IPTC datasets in proportion to the decompressed size rather
  than the file size: a crafted 446 KB PNG blocked `load()` for about 4
  seconds and raised peak memory to about 1.3 GB. An 8 MB JPEG of empty IPTC
  datasets raised it to about 380 MB. The number of IPTC datasets read from
  one file is now limited in proportion to its size, and the datasets past the
  limit are left out, so the same PNG now takes about 2.4 seconds and 580 MB,
  and the JPEG about 120 MB.
- Decoding a PNG `Raw profile type exif` or `Raw profile type iptc` profile
  copied its hex text and parsed it one byte at a time: a 348 KB PNG holding
  48 MiB of IPTC in a zTXt chunk took about 2.3 seconds and peaked at about
  580 MB. The hex text is now decoded in place, and the same PNG takes about
  1.4 seconds and 450 MB. Characters other than hex digits in the profile
  data, such as spaces or carriage returns, are now skipped.

## [4.47.0] - 2026-10-08

### Added

- `npx exifreader build --check` exits with an error when the installed bundle
  is the stock full build or was built from a different configuration or
  exifreader version, for use in CI. `npx exifreader build --if-needed` skips
  the rebuild when the bundle is already up to date, which makes it a good fit
  for a `prebuild` script. `npx exifreader build --config <path>` reads the
  custom build configuration from a JSON file and takes priority over
  `EXIFREADER_CUSTOM_BUILD` and `package.json`. The CLI also warns when a
  workspace package builds into an exifreader copy shared with other workspace
  packages (a hoisted `node_modules/exifreader` or pnpm's workspace root store),
  since the last build wins there. Each custom build now records its
  configuration and version in `dist/.exifreader-custom-build.json`.
- `npx exifreader analyze <paths...>` reads sample images and directories with
  the full library and prints the smallest `include` configuration that reads
  everything found in them. `--write` puts it in `package.json`.
  `npx exifreader build --auto <paths...>` analyzes and builds in one step, and
  `npx exifreader build --verify <paths...>` compares the installed bundle with
  the full library on those images and exits with an error on any difference.

### Fixed

- Custom builds with an `exif` tag list no longer lose the value descriptions
  of included tags that use a lookup table. Tags such as FillOrder or
  SensitivityType described every value as 'Unknown'.
- XMP element text is no longer lost when it spans several DOM nodes. With
  `linkedom`, text containing an entity or character reference such as
  `&amp;` came out as an empty object. A CDATA section, an XML comment or a
  processing instruction inside `rdf:RDF` dropped the whole XMP group except
  `_raw`. CDATA text is now read, and comments and processing instructions
  are ignored.
- With `linkedom`, reading XMP took time quadratic in the number of child
  nodes or attributes of an element, so a small packet (for example an
  element with thousands of `&amp;` references, about 60 KB) could take tens
  of seconds.
- `includeTags: {composite: true}`, or a list of composite tag names,
  returned no composite tags (`FocalLength35efl`, `ScaleFactorTo35mmEquivalent`
  and `FieldOfView`) for any image since the include filters were added in
  4.36.0, because the Exif sub-IFD holding the tags they are computed from was
  not read.
- An XMP list whose items are structures with a member named `value`, such as
  `xmpDM:cuePointParams`, was described as
  `value: undefined; attributes: undefined; description: undefined` per item
  instead of by the members of each item.

### Security

- Decoding the XPTitle, XPComment, XPAuthor, XPKeywords and XPSubject tags
  took time quadratic in the length of a run of NUL characters in the value,
  so a small file (for example an 80 KB TIFF) could block `load()` for
  seconds. An XP tag stored as a single number was also decoded as that many
  zero bytes, so a TIFF of a few hundred bytes could block `load()` for
  seconds and use over a gigabyte of memory. Such a tag now gets an empty
  description.
- A PNG with thousands of compressed text chunks (zTXt or compressed iTXt)
  read with `async: true` took time quadratic in the number of chunks and
  memory far above the file size: a 223 KB file took about 8 seconds and
  500 MB. Decompressions now run a few at a time, their results are merged in
  linear time, and at most 255 compressed text chunks are decompressed per
  file.
- Fixed a denial-of-service vulnerability where a crafted XMP packet in any
  image format, or a standalone XMP file, could block `load()` for minutes to
  hours. Two steps took super-linear time: trimming the end of the packet
  before parsing (cubic), and, when the packet failed to parse, checking
  whether the error was a missing namespace (quadratic in the length of the
  error message, which can repeat part of the packet). Both are now linear.
  This affects environments where a DOM parser is available: web browsers, and
  Node.js when the `domParser` option is used or when `@xmldom/xmldom` is
  installed (which it is by default, as an `optionalDependency`).
- A long text value in an XMP packet took time and memory far above its size
  to read: an 8 MB value took about 3 seconds and 800 MB. Text directly inside
  an element with `rdf:parseType="Resource"`, or inside an `rdf:Description`
  nested in a property, took about 7 seconds per MB. Values like these fit in
  formats that allow large XMP packets, such as PNG, WebP and JPEG with
  extended XMP.
- The `maxDecompressedSize` limit applied to each compressed metadata block
  separately, so a PNG with many small compressed text chunks, or a file with
  several compressed blocks in other formats, could make `load()` with
  `async: true` keep many times the limit: a 131 KB PNG kept 128 Mi
  characters with a 17 MiB limit. The limit now applies to the total
  decompressed size of all compressed blocks in the file, and once a block
  would go over it, that block and the remaining compressed blocks are
  skipped.
- With a numeric `length`, loading a URL now stops reading after `length`
  bytes when the server ignores the Range request and sends the whole file,
  so a large or endless response no longer uses up all memory. This applies
  wherever `fetch` supports streaming response bodies, as in current browsers
  and Node.js, and in Node.js when no global `fetch` is defined.
- With `async: true` and a custom `decompress.deflate` or `decompress.brotli`
  function, a PNG zTXt or compressed iTXt chunk with no compressed text after
  its header, or a custom decompression function that throws (for PNG text, a
  compressed PNG ICC profile, or JPEG XL `brob` Exif and XMP boxes), made
  `load()` and `loadView()` throw synchronously instead of returning a
  promise, so a caller handling errors with `.catch()` got an uncaught
  exception. Such a text chunk now gets the usual placeholder value, such an
  ICC profile or `brob` box is skipped, and the other tags are returned.
- XMP values nested many levels deep took time and memory far above their
  size to read, because every level built the descriptions of all levels below
  it again: a 248 KB WebP with a value nested 1000 levels deep took about 43
  seconds and 1.1 GB. Each description is now built once, and a tag whose
  value would nest deeper than 32 levels is left out.
- A HEIC or AVIF file whose iloc box used 8-byte offset, length or index
  fields logged one console warning per such field, so a crafted 8 MB file
  logged over a million warnings (about 125 MB) and blocked `load()` for
  seconds. The warning is now logged once instead of once per field.
- A tag name taken from the file that was `__proto__` (a Photoshop image
  resource name, an uncompressed PNG text chunk keyword, or any XMP tag when
  `includeTags` or `excludeTags` is used) replaced the prototype of the object
  holding the tags instead of becoming a tag, so the tag was lost and its
  fields (such as `value` and `description`) showed up as keys of the group.
  It is now kept under its own name. A PNG text chunk with the keyword
  `__exif` or `__iptc` is now read as a PNG text tag instead of being merged
  into the Exif or IPTC group.
- Reading an Exif ASCII tag value built several intermediate values per
  character, so a crafted file with long ASCII tags pointing into its own data
  made `load()` use memory far above the file size: a 2 MB JPEG took about
  600 MB and one second. ASCII values are now decoded without per-character
  intermediate data. This affects every format that carries Exif.
- The decoded tag values of the Canon and Pentax maker notes and of the MPF
  block in a JPEG each had their own size limit, separate from the one for the
  Exif data, so one crafted file could decode about 12 times its size in tag
  values. They now share one limit with the Exif data.
- An Exif text value made of many short strings that are not valid UTF-8 took
  about 2.5 microseconds per string to read, so a crafted 2 MB file in any
  format that carries Exif could block `load()` for about 11 seconds, most of
  it spent throwing and catching an error for each string. Such strings are
  now recognized without trying to decode them. The same applies to IPTC
  values and to XMP values read from a packet that is not valid UTF-8.
- The Exif data in a compressed PNG text chunk ("Raw profile type exif") and
  in a JPEG XL `brob` box had a decoded tag value limit sized from the
  decompressed data instead of the file, so a crafted 2 KB PNG could decode
  about 4 MB of tag values. They now share the file's limit with the rest of
  the Exif data.

## [4.46.0] - 2026-09-26

### Fixed

- XMP packets are now decoded as UTF-8 before they are parsed, so non-ASCII
  text comes out correctly in tag values, attributes and `xmp._raw`. A packet
  that is not valid UTF-8 is parsed with one character per byte and each value
  is then decoded on its own where it is valid UTF-8, as before. Previously
  the whole packet was parsed as one character per byte and each value was
  decoded afterwards, which left `value` (but not `description`) as mojibake
  for element text. With the `@xmldom/xmldom` parser (the default in Node.js)
  it also broke any character whose UTF-8 encoding contains the byte 0x85,
  such as `Å`, some Cyrillic and Arabic letters, and many CJK characters: the
  parser turned that byte into a line break before parsing, so element text
  was corrupted in both `value` and `description`, and in attribute values
  the decoding then threw and the whole XMP group was dropped except for
  `_raw`. A numeric character reference above U+00FF, or single-byte encoded
  text, in an attribute value dropped the group in the same way under every
  parser. If you worked around this by decoding `value` yourself, remove that
  step, since `decodeURIComponent(escape(...))` throws `URIError` on decoded
  non-ASCII text.

## [4.45.2] - 2026-09-21

### Changed

- A custom build that excludes the `exif` module is now a little smaller. It
  no longer carries the code that computes the `gps` group of the expanded
  result (`Latitude`, `Longitude` and `Altitude`), which is derived from Exif
  GPS tags and so could never be produced in such a build. A build with only
  PNG support (`{"include": {"png": true}}`) goes from 35459 to 34666 bytes,
  around 0.2 KiB gzipped. A custom build that includes `exif` produces a
  byte-identical bundle.

### Fixed

- ICC text tags, such as the copyright notice in older profiles, no longer
  have up to six characters cut off at the end.
- An ICC profile with a large text or description tag, over 64 KB in some
  JavaScript engines, no longer loses all of its ICC tags.
- Reading the text metadata (tEXt, zTXt or iTXt chunks) of a PNG image no
  longer throws an error when the image is passed in as a `Buffer` from the
  `buffer` package, the Buffer polyfill used in browser bundles.
- Reading the ICC profile (iCCP chunk) of a PNG image with `async: true` no
  longer throws an error when the image is passed in as a `Buffer` from the
  `buffer` package, the Buffer polyfill used in browser bundles.
- A malformed ICC profile whose description or localized-text tag starts in its
  last few bytes no longer loses every ICC tag.

### Security

- Fixed an information disclosure vulnerability where `length: 'auto'` could
  put bytes from outside the data being parsed into `metadataRange.buffer`.
  This happened when the data was a `Buffer` from the `buffer` package, the
  Buffer polyfill used in browser bundles, that is a view into a larger
  buffer, and the metadata of the image extended past the end of the data, as
  in a truncated or crafted file. The buffer now stops at the end of the data.

## [4.45.1] - 2026-09-18

### Security

- Fixed a denial-of-service vulnerability where a crafted image could make ICC
  profile parsing use excessive memory and time. The number of tags read from
  a profile and the total amount of data decoded from them now have limits
  well above what real profiles use
  ([GHSA-wr98-5fqg-jwf3](https://github.com/mattiasw/ExifReader/security/advisories/GHSA-wr98-5fqg-jwf3)).
  Reported by @manus-pi.

## [4.45.0] - 2026-09-10

### Changed

- A custom build that includes neither the `exif` nor the `xmp` module is now
  smaller. It no longer carries the code that computes the composite tags
  (`FocalLength35efl`, `ScaleFactorTo35mmEquivalent` and `FieldOfView`), which
  are derived from tags in those two groups and so could never be produced in
  such a build. A build with only PNG support (`{"include": {"png": true}}`)
  goes from 36002 to 34694 bytes, around 0.5 KiB gzipped. A custom build that
  includes either module produces a byte-identical bundle and returns the same
  tags.
- A custom build that excludes the `exif` module no longer carries the 0th,
  Exif, GPS and interoperability tag name tables. They came in whenever
  anything imported the shared tag name module, so a build that kept `mpf`
  carried them even though it could never read an Exif tag. Leaving them out
  takes a build configured with `{"exclude": {"exif": true}}` from 117324 down
  to 96920 bytes, around 5 KiB gzipped, and one configured with
  `{"include": {"jpeg": true, "mpf": true}}` from 54329 down to 32383 bytes,
  around 6 KiB gzipped. A custom build that includes `exif` produces a
  byte-identical bundle and returns the same tags.

### Fixed

- A custom build whose include pattern names the `thumbnail` module but not
  `exif` now gets the `exif` module too, so it returns the `Thumbnail` tag.
  The build already meant to do this, but the condition could never be true,
  so such a build read no Exif data at all, with no warning and no error.
- The custom build module table no longer claims that `mpf` needs `exif`. MPF
  tags are read from their own JPEG segment, so an include pattern naming
  `mpf` without `exif` has always worked, and such a build stays smaller
  without the `exif` module.
- A custom build that excludes the `exif` module now keeps the `mpf` module
  instead of dropping it. Such a build gets bigger, since the MPF parser brings
  back the shared IFD reading code. It also copies out the sub-images that
  phone JPEGs embed, which costs time and memory, and with `length: 'auto'` it
  reads more of the file. A build that wants none of that can exclude `mpf`,
  and a build that already excludes `mpf` was never affected.
- The custom build module table now says that the `photoshop` module needs
  `exif`. Photoshop tags are read from Exif tags, so an include pattern naming
  `photoshop` without `exif` returns nothing.
- A custom build that includes the `thumbnail` module but neither `jpeg` nor
  `webp`, for example one paired with `heic` or `avif`, now returns the
  `Thumbnail` tag. The thumbnail was found in the Exif data and parsed and then
  dropped, so it was missing with no warning and no error. A build that also
  includes `jpeg` or `webp` was never affected.
- A custom build that includes the `iptc`, `xmp`, or `icc` module together with
  `exif` but without `tiff` now returns those tags when they are stored inside
  an Exif tag. Any format can carry them that way, not only TIFF, but they were
  only parsed when the `tiff` module was included, so such a build was missing
  them with no warning and no error. For IPTC in a HEIC, AVIF, WebP, or JPEG XL
  file it is the only route there is, so such a build returned no IPTC tags at
  all. A build that asks for `iptc` without `jpeg` or `png` gets bigger, since
  the IPTC parser it asks for is now included. A build that includes `tiff` was
  never affected.
- A custom build whose include pattern names the `maker_notes` module but not
  `exif` now gets the `exif` module too, so it returns the maker note tags.
  Maker notes are read from an Exif tag, and such a build read no Exif data at
  all, so it returned none of them, with no warning and no error. A custom
  build that excludes `exif` now also excludes `maker_notes`. The Canon and
  Pentax tag name tables it kept could never be reached without the `exif`
  module, so dropping them takes 231 bytes off a build configured with
  `{"exclude": {"exif": true}}`.
- A custom build whose include pattern names the `photoshop` module but not
  `exif` now gets the `exif` module too, so it returns the Photoshop tags
  instead of nothing. A custom build that excludes `exif` now also excludes
  `photoshop`, but this does not change the size of a build configured with
  `{"exclude": {"exif": true}}`: the Photoshop parser and its tag name table
  had no other way into the bundle, so they were already left out.
- A PNG file read with `async: true` no longer gets a top-level `Thumbnail` tag
  holding the bare tags of the thumbnail IFD with no thumbnail image in it. It
  came from Exif data embedded in a PNG text chunk, where the thumbnail image
  is never read, so there was nothing the tag could be used for, and whether it
  turned up depended on the tag filter rather than on the file: a filter that
  left the thumbnail group out removed it already. Reading with
  `expanded: true` is unaffected, since those tags were never at the top level
  there.
- The support table in the README marked thumbnails as not applicable to TIFF
  files. A TIFF whose 1st IFD describes a JPEG-compressed thumbnail does return
  it, image included, so the table now lists them as supported.

### Security

- Fixed an information disclosure vulnerability where several readers could
  return bytes from outside the data being parsed: the JFIF thumbnail, a PNG
  text value (`tEXt`, `iTXt`, `zTXt`), the Exif thumbnail, MPF sub-images, ICC
  profile chunks, and XMP chunks. They sliced the underlying buffer with
  offsets meant for the `DataView`, so when the data was a view that starts
  partway into a larger buffer, the bytes came from the wrong region of that
  buffer, which for a `DataView` over a Node.js `Buffer` is whatever else
  happens to share the pool. No crafted file was needed for this, an ordinary
  one was enough, and `ArrayBuffer.prototype.slice` clamps instead of throwing,
  so nothing failed along the way. Such a view reaches the parsers from the
  public `loadView()`, and for XMP also through the regular `load()` path, from
  a custom `decompress` function that returns bytes starting partway into a
  larger buffer, which is what Node's `zlib` returns for a small result. That
  last case also dropped the XMP tags of a JPEG XL file whose metadata box is
  Brotli compressed. The readers now slice relative to the view's own position,
  and a `DataView` that is a window into a larger buffer is copied before it
  is parsed
  ([GHSA-67g5-g9ch-x4fj](https://github.com/mattiasw/ExifReader/security/advisories/GHSA-67g5-g9ch-x4fj)).
- Fixed an information disclosure vulnerability where a crafted image could put
  bytes from outside the data being parsed into the Exif thumbnail. The offset
  and the length of the thumbnail are declared by the file and were used
  unchecked, and a thumbnail IFD can declare the offset with a signed type and
  make it negative, which is then read relative to the end of the underlying
  buffer. When the data handed to `loadView()` is a view into a larger buffer,
  which is what a `DataView` over a Node.js `Buffer` is, since small buffers
  share a pool, the thumbnail could hold bytes from elsewhere in that buffer,
  including data another part of the program had put there. Passing a `Buffer`
  or an `ArrayBuffer` to `load()` was not affected, because the thumbnail is
  then bounded by the data itself. A declared range that does not lie inside
  the data now leaves the thumbnail out, with no `image`, `base64`, or `type`.
  That also covers a thumbnail cut off by the end of the data, for example when
  the `length` option reads only the first part of a file, which is how a JFIF
  thumbnail has been handled since 4.44.1.
- Fixed a denial-of-service vulnerability where a crafted JPEG could make the
  scan for its metadata segments retain far more memory, and make reading the
  ICC profile take far longer, than the size of the file warrants. One ICC
  chunk descriptor was retained per APP2 `ICC_PROFILE` segment with nothing
  bounding how many, and such a segment can be as small as 16 bytes, so a file
  packed with them produced around 65000 descriptors per MiB, all before any
  ICC parsing began. A 10 MiB file retained more than 40 MiB of them. The step
  that assembles the profile searches the whole list once per chunk, so a file
  that puts the chunk numbers it needs at the end of the list also made that
  search linear in the descriptor count, more than a third of a second for a
  file of 4 MiB. The count is now bounded to 255, which is the widest the
  format can express, since both the chunk number and the chunk total are
  single bytes. Segments past that are left out and everything else in the
  file is parsed as before, so a file that pads out ICC segments in front of
  its other metadata still returns that metadata. A file with more than 255
  ICC segments whose first 255 hold a complete profile now returns that
  profile, where the whole ICC group used to be discarded.

## [4.44.1] - 2026-09-05

### Changed

- A JFIF thumbnail that is cut off by the end of the data, for example when
  the `length` option reads only the first part of a file, is now left out
  instead of being returned with fewer bytes than its declared size.

### Fixed

- A custom build that includes the `icc` module together with `heic`, `avif`,
  or `png`, but without `jpeg` or `webp`, now returns the ICC tags. The ICC
  data was found while reading the image header and then never parsed, so the
  tags were missing with no warning and no error. For `png` this applies to an
  asynchronous parse, since that is the only kind that reads the `iCCP` chunk.
  Such a build gets bigger, since the ICC parser it asks for is now included.
  A build that also includes `jpeg` or `webp` was never affected, and neither
  was `tiff`, which reads its ICC data from an Exif tag instead.

### Security

- Fixed a denial-of-service vulnerability where a truncated or crafted image
  file could make `load()` throw an uncaught exception instead of returning
  the metadata the file holds
  ([GHSA-cw75-mh4g-4h2j](https://github.com/mattiasw/ExifReader/security/advisories/GHSA-cw75-mh4g-4h2j)).
  Reported by @zikk090.

## [4.44.0] - 2026-08-21

### Changed

- The value of an XMP tag that comes from an `rdf:value` element with child
  elements is now an object of regular tags instead of the parser's internal
  nodes. Each child is keyed by its local name (`Inner` instead of `my:Inner`)
  and has `value`, `attributes`, and `description` like any other tag, which is
  what the TypeScript definitions have described all along. The description of
  the tag itself follows the new names, for example `Inner: 42` where it used
  to be `my:Inner: 42`.
- The content of an `rdf:value` element is now parsed much as the content of
  the tag element itself would have been. A list written directly inside
  `rdf:value` is therefore a list tag now, so a qualified value written as an
  `rdf:Alt` with `xml:lang` keeps both its text and its language where it used
  to come back as raw parser nodes. Such a list also takes the place of any
  sibling elements inside the same `rdf:value`.
- Two further consequences of that parsing, if you read these values: a child
  without a namespace prefix lands under the name `undefined`, as an element
  without a prefix does everywhere else in the output, so two such children
  collapse into one; and a child that holds elements of its own, without being
  marked `rdf:parseType="Resource"` itself, is kept without them.
- The value object of such a tag still has no prototype, as it has since 4.43.0.
  A child of it named `__proto__` is kept under that name, and so is one nested
  further down, which is new (see the entry below).

### Fixed

- An XMP element or attribute named `__proto__` is now kept as a tag under that
  name. Such a name was used in a plain property assignment, which JavaScript
  takes as a request to replace the prototype of the object holding the tag, so
  the tag was lost and the fields of the tag object (`value`, `attributes`, and
  `description`) showed up as properties of the object it should have been
  stored in, including among the top level XMP tags, where the image had no such
  tags. The value of an `rdf:value` element with child elements was the only
  place already protected, since 4.43.0.
- The description of an XMP tag written as a list is now always a string. When
  ExifReader has a description function for the tag that neither handles a list
  nor throws on one, for example `tiff:Orientation` or `tiff:XResolution`, the
  function handed the list back unchanged and the list itself became the
  description, where the TypeScript definitions promise a string. The
  descriptions of the list items joined together are used instead, which is
  what a list without a description function gets. Together with the entry
  below about a description function that throws, a list description is now a
  string whatever the function does with it.
- An XMP tag with more than one `rdf:value` child element is no longer lost or
  returned without a value. The repeated elements were collected into a list
  that the value parser did not recognize, which left the tag with a `value` of
  `undefined` and the description `"undefined"`, and which threw for an item of
  an `rdf:Bag`, `rdf:Seq`, or `rdf:Alt`, dropping the whole list tag. The last
  `rdf:value` now wins, which is how a repeated tag is handled.
- An XMP tag with more than one `rdf:Bag`, `rdf:Seq`, or `rdf:Alt` element is
  no longer dropped from the output. Reading the list items threw because the
  repeated elements were collected into a list of their own. The last one now
  wins, as it does for any other repeated element.
- An XMP packet in need of a namespace repair no longer loses all of its tags
  when a comment, processing instruction, or CDATA section before the root
  element contains something that looks like a tag. The synthesized
  declarations were inserted at the first tag-like text instead of into the
  root element, so the retried parse failed too. The repair now also places
  the declarations correctly in a self-closing root element and no longer
  cuts the root tag short at a `>` inside a quoted attribute value.
- An XMP packet in need of a namespace repair no longer loses all of its tags
  when its root element declares one of its prefixes with an empty namespace
  URI, as in `xmlns:p=""`, and that prefix also appears somewhere other than
  as an element or attribute name. The scan that finds the declared prefixes
  required a URI of at least one character, so the repair added a second
  declaration for a prefix the packet already declares, and the parse retry
  then failed on the duplicate attribute, which discarded every tag in the
  packet. A packet where such a prefix names an element or an attribute is
  still rejected by `@xmldom/xmldom`. A browser's XML parser rejects the empty
  declaration itself, with an error the repair does not act on, so in a
  browser such a packet is lost either way.
- An XMP packet in need of a namespace repair no longer loses all of its tags
  when an attribute value on its root element contains text that looks like a
  namespace declaration, as in `note='xmlns:p="urn:z"'`, and the prefix it
  names is used in the packet without a real declaration. The scan that finds
  the declared prefixes could not tell a declaration from the same characters
  inside another attribute's quoted value, so the prefix counted as declared,
  no declaration was added for it, and the retried parse failed on the same
  unbound prefix. Such text could also hide the genuine declaration that
  followed it from the scan, and that prefix was then declared a second time,
  which failed the retry on the duplicate attribute.
- An XMP tag written as a list (`rdf:Bag`, `rdf:Seq`, or `rdf:Alt`) is no
  longer dropped from the output when ExifReader has a description function for
  the tag that throws on a list, for example `exif:GPSLatitude`,
  `exif:GPSLongitude`, or `exif:ColorSpace`. Such a tag is now returned with
  its list value, and its description is the descriptions of the list items
  joined together, which is what a list without a description function gets.

## [4.43.0] - 2026-08-16

### Changed

- An XMP tag value that comes from an `rdf:value` element with child elements
  is now an object without a prototype, so that a child element named
  `__proto__` can be kept under its own name. Such an object has no inherited
  methods, so e.g. `hasOwnProperty` cannot be called on it.

### Fixed

- A PNG `tIME` chunk with a date field too wide for its zero-padded width,
  e.g. a month byte of 200, no longer makes `load()` throw a `RangeError`
  that also discards all other metadata in the file. The field is now
  rendered at its natural width in the `Modify Date` description, and the
  date formatting no longer uses an ES2015 string method that the oldest
  supported runtimes lack.
- A Photoshop 8BIM resource whose declared size runs past the end of the
  available data no longer makes `load()` throw. The resource value is
  truncated to the bytes that are present, and the walk now also stops
  cleanly when the data ends in the middle of a resource header, so the
  resources that precede a malformed or truncated one are still returned.
- A namespace prefix named after a JavaScript object property, for example
  `__proto__` or `constructor`, is now handled like any other prefix when a
  missing namespace declaration is repaired. Such a prefix previously got a
  declaration with a nonsensical namespace URI. An XMP element or attribute
  without a namespace prefix and named after such a property, for example
  `<constructor>`, is now handled like any other one too. Such an element was
  previously mistaken for a repeat of an element that was never there, which
  gave its tag a wrong value, e.g. a list collapsed into its last item, and an
  element named `__proto__` was lost altogether while its content replaced the
  prototype of the object holding it. The description of such an element or
  attribute was also made by calling an inherited object property, which put a
  JavaScript value where the description text should be, e.g. `false` for a
  name of `hasOwnProperty`.
- An XMP packet no longer loses all of its tags when three things coincide: its
  root element declares a namespace prefix containing a dot, such as
  `xmlns:xmp.iid="..."`; that name also appears before a colon somewhere in the
  packet (a value like `xmp.iid:F77F1174` is enough); and some other prefix is
  used where it is not declared. A dot is legal anywhere but first in an XML
  namespace prefix, so the declaration is valid, but the repair that runs for
  the undeclared prefix did not recognize it. The repair therefore added a
  second declaration for a prefix that was already declared, and the parse
  retry then failed on the duplicate attribute, which discarded every tag in
  the packet. A prefix of any shape was lost the same way when its declaration
  put whitespace around the equals sign, as in `xmlns:xmp = "..."`, which XML
  permits just as it permits the dot.

### Security

- Fixed a denial-of-service vulnerability where a crafted HEIC or AVIF file could
  make metadata parsing allocate far more memory, and take far longer, than the
  size of the file warrants. The item list of an `iloc` box was bounded by the
  size of the whole file rather than by the length the box itself declares, so a
  tiny `iloc` box could walk everything that followed it, and a file packed with
  such boxes made each of them walk it again. Items and their extents are now
  bounded by the length their own box declares, or by the end of the available
  data when that comes first, so a truncated file still returns what it holds.
- Fixed a second denial-of-service vulnerability of the same class as the `iloc`
  bound above, one level up in the generic box walk. A HEIC or AVIF box was only
  checked for where it started inside its container, never for how far it read,
  so a small well-formed container holding a box that over-declared its length
  still let that box run to the end of the file. That made the `iloc` bound
  bypassable by wrapping each `iloc` in a container, and packing a file with such
  containers was again quadratic in the file size. A box is now bounded by the
  container that declares it, and one that over-declares is read only as far as
  its container reaches instead of being discarded, so truncated files keep
  degrading gracefully.
- Fixed a denial-of-service vulnerability where a crafted image or XMP file
  could make ExifReader spend quadratic time repairing an undeclared XML
  namespace prefix before parsing. The repair step was quadratic in two
  independent ways: de-duplicating the found prefixes, which a packet using a
  large number of distinct prefixes could exploit, and scanning the packet for
  prefix usages, where a long colon-free run of prefix-like characters made
  the scan re-read the rest of the run from each position in it that could
  start a prefix. Both are now linear. This affects environments where a DOM
  parser is available: web browsers, and Node.js when the `domParser` option is
  used or when `@xmldom/xmldom` is installed (which it is by default, as an
  `optionalDependency`).
- Fixed a denial-of-service vulnerability where a crafted image could make Exif
  parsing decode far more tag data than the file actually contains. Each tag
  value was bounded against the available data on its own, but nothing bounded
  their sum, so an IFD declaring many tags whose values all point at the same
  bytes could multiply memory use and parsing time by several thousand. The
  decoded values of an IFD and the sub-IFDs it points to are now bounded
  together by a small multiple of the size of the data being parsed, which
  real files stay well below.
- Fixed a denial-of-service vulnerability where a crafted JPEG could make MPF
  (Multi-Picture Format) parsing allocate far more memory than the size of the
  file warrants. Each declared sub-image is copied out of the file, and while a
  single copy was already clamped to the file size, nothing bounded the number
  of copies or their sum, so an MPF index declaring many entries that each claim
  the whole file made the parser retain a copy per entry. A file of around
  128 KiB could retain more than a gigabyte. The total size of the extracted
  sub-images is now bounded to a small multiple of the input size, which real
  multi-image files stay well below. A declared offset or size of 2 GiB or
  more, which the parser reads as a negative number that would otherwise be
  interpreted relative to the end of the buffer, is also handled: such an
  offset is now clamped to the start of the file, and such a size yields an
  empty image.

## [4.42.0] - 2026-08-05

### Changed

- An ICC profile whose declared size is larger than all the data available for
  the file no longer produces ICC tags. This affects files truncated to fewer
  bytes than the ICC profile declares, and partial reads using the `length`
  option, which could previously still return tags for such a profile.

### Security

- Fixed a denial-of-service vulnerability where a crafted WebP, HEIC, or AVIF
  file could trigger excessive memory allocation during ICC metadata parsing
  ([GHSA-wx94-r5p4-hx2f](https://github.com/mattiasw/ExifReader/security/advisories/GHSA-wx94-r5p4-hx2f)).
  Reported by @arpitjain099.

## [4.41.4] - 2026-08-05

### Security

- Documented that passing a string to `load()` makes ExifReader treat it as a
  URL or a local file path and perform a network request or a file read, so an
  untrusted string must never be passed to it. Passing the image bytes instead
  avoids server-side request forgery and local file access
  ([GHSA-mjwm-rcx3-79hc](https://github.com/mattiasw/ExifReader/security/advisories/GHSA-mjwm-rcx3-79hc)).
- Documented that all returned metadata is untrusted input. Tag values and the
  raw XMP packet come from the image unchanged and can contain HTML-like markup,
  so they must be escaped or sanitized before being inserted into a page as HTML
  to avoid cross-site scripting
  ([GHSA-hhgj-2jxm-r7x6](https://github.com/mattiasw/ExifReader/security/advisories/GHSA-hhgj-2jxm-r7x6)).
- Fixed a denial-of-service vulnerability where a crafted image could declare an
  XMP metadata block far larger than the file itself and make the synchronous
  parser allocate memory proportional to that declared size instead of to the
  actual data. The XMP block size is now bounded to the bytes that are really
  present
  ([GHSA-q53f-v5gx-7j78](https://github.com/mattiasw/ExifReader/security/advisories/GHSA-q53f-v5gx-7j78)).

## [4.41.3] - 2026-07-18

### Fixed

- Custom builds no longer include the modules that were excluded from them,
  and consumer bundlers can again tree-shake the source modules. A regression
  in 4.41.1 made the new `src/package.json` hide the root `sideEffects`
  declaration from bundlers, which roughly doubled the size of custom builds.

## [4.41.2] - 2026-07-18

### Fixed

- A HEIC or AVIF file whose `iloc` box is cut off in the middle of an item
  header now returns the metadata items that are fully present, instead of
  discarding the whole box. This matters for truncated files and for partial
  reads with the `length` option.

## [4.41.1] - 2026-07-18

### Fixed

- The `src` directory is now correctly declared as ES modules through a nested
  `package.json` type marker that ships with the npm package. Node-native ESM
  deep imports such as `import 'exifreader/src/exif-reader.js'` work now
  instead of crashing, and `require()` of the same files works on Node 22.12
  and later. The default entry points are unchanged.

### Security

- Fixed a denial-of-service vulnerability where a crafted HEIC or AVIF file
  could trigger excessive memory allocation and crash the process during
  metadata parsing
  ([GHSA-pj96-35fp-cfcc](https://github.com/mattiasw/ExifReader/security/advisories/GHSA-pj96-35fp-cfcc)).
  Reported by @alienkeric.

## [4.41.0] - 2026-06-08

### Added

- `npx exifreader build` command to (re)build a custom bundle from the
  `exifreader` configuration in your `package.json`. This is the supported
  replacement for the automatic postinstall rebuild and works the same way with
  npm, yarn, and pnpm.

### Changed

- Custom builds that exclude image formats or metadata groups are now smaller.
  The metadata merge pipeline no longer carries the merge handlers for excluded
  PNG, JPEG XL, ICC, and XMP data, so for example a JPEG plus Exif build drops
  by around 0.8 KiB gzipped.

### Deprecated

- The automatic custom build via the npm `postinstall` script is deprecated and
  will be removed in v5. Use `npx exifreader build` instead.

### Fixed

- Custom builds now transpile to ES5 even when run with `NODE_ENV=production`.
  `@babel/preset-env` is applied unconditionally in `babel.config.json` instead
  of only under Babel's default env.
- Custom builds now install their build toolchain in a unique OS temporary
  directory instead of temporarily moving `exifreader`'s own `node_modules` aside,
  so an interrupted or concurrent build can no longer strand or corrupt the install.

## [4.40.5] - 2026-06-03

### Security

- Cap `mluc` record count to prevent DoS from crafted ICC profiles with huge
  numRecords.

## [4.40.4] - 2026-06-03

### Fixed

- Malformed ICC profiles whose declared length is too small to hold the tag
  table, or that contain a tag offset pointing past the end of the profile,
  now return the header tags parsed so far instead of nothing. Three internal
  bounds checks compared against `ArrayBuffer.length` (which is always
  `undefined`) rather than the data's byte length, so they never fired; such
  a profile ran past its end, threw an out-of-bounds `DataView` read, and the
  surrounding try/catch discarded all the tags.

### Security

- Prevent a denial-of-service (excessive memory use) from crafted ICC `mluc`
  tags by bounding the decoded text to each tag's bounds and the total profile
  size.

## [4.40.3] - 2026-05-31

### Fixed

- The browser `fetch` loader now rejects with `Could not fetch file: <status>`
  on 4xx/5xx HTTP responses (except `416`, which the `length: 'auto'` loop
  still consumes as a fall-back signal) instead of feeding the error body to
  the parser and surfacing a misleading `Invalid image format` error. This
  brings the browser path in line with the Node path. Both the browser and
  Node loaders now reject with an `Error` object (the Node path previously
  rejected with a plain string).

## [4.40.2] - 2026-05-30

### Changed

- Upgrade @xmldom/xmldom to version 0.9.10.

## [4.40.1] - 2026-05-30

### Fixed

- Truncated or malformed metadata no longer throws an uncaught error out of
  `load`/`loadView`. Fixed several crashes on crafted input: a short WebP
  `VP8X` chunk, a truncated PNG `iCCP` chunk (async mode), a HEIC/AVIF Exif
  item whose TIFF header offset points outside the file, a truncated JPEG
  MPF segment, and a unicode string whose region ends on an odd byte
  (reachable via ICC `multiLocalizedUnicode`).
- HEIC/AVIF files that store Exif or XMP via iloc `construction_method 1`
  (the `idat` box) are now read at the correct offset. The `idat` box was
  parsed as a full box, shifting its content offset by 4 bytes.
- Capped the buffer assembled for multi-extent HEIC/AVIF items to the source
  file size, preventing a memory-amplification path from overlapping extents.
- `length: 'auto'` over a URL no longer corrupts the buffer when a
  Range-ignoring server returns a full `200` response during the fallback
  read, and the Node (non-`fetch`) path now falls back correctly on a `416`
  response instead of rejecting.

### Security

- Fix denial-of-service from an uncaught exception when parsing crafted
  HEIC/AVIF files with malformed ISO-BMFF boxes
  ([GHSA-g77h-45rf-hcx4](https://github.com/mattiasw/ExifReader/security/advisories/GHSA-g77h-45rf-hcx4)).
  Reported by @YHalo-wyh.

## [4.40.0] - 2026-05-29

### Added

- `includeOffsets` option which, together with `expanded: true`, returns a
  `metadataRange` object describing where metadata sits in the file:
  `{start, end, complete, blocks: [{type, start, end}, ...]}`. Useful for
  persisting only the metadata-bearing prefix of an image instead of the
  whole file. Supports JPEG, PNG, WebP, HEIC, AVIF, JPEG XL (container),
  GIF, and standalone XMP/XML; plain TIFF and bare JPEG XL codestreams are
  not supported in this version because they lack a leading metadata
  container.
  [#121](https://github.com/mattiasw/ExifReader/issues/121)
- `bin/profile.js`: profiler script that parses images in a folder and
  reports per-format timing stats. Supports `--iterations`, `--warmup`,
  `--type`, `--dir`, `--include-io`, and `--probe-bytes` (bisects the
  minimum prefix length needed to extract metadata equivalent to the full
  file, useful for I/O-optimization work).
- `length: 'auto'` option to `load()` adaptively fetches only the bytes
  that contain metadata, using HTTP `Range` requests (or filesystem
  reads / `File.slice` for local inputs). The minimal byte slice is
  returned as `metadataRange.buffer`, the number of bytes read as
  `metadataRange.fetched`, and the IO-call count as
  `metadataRange.requests`. Requires `expanded: true` and `includeOffsets:
  true`. Not supported for plain TIFF or bare JPEG XL codestreams.
- `bin/profile.js --length-auto` and `bin/profile-diff.js` to measure the
  bandwidth/time savings of `length: 'auto'` against a baseline run.

### Fixed

- HEIC/AVIF: correctly read Exif and XMP from `iloc` items that use
  `constructionMethod` 1 (idat). Previously these were read from the wrong
  file offset, producing garbage tags or none at all. Items using
  `constructionMethod` 2 (item_offset) are still not supported but are
  now skipped cleanly with a `console.warn` instead of returning garbage.
- HEIC/AVIF: multi-extent Exif and XMP items are now parsed end-to-end.
  Previously only the first extent was read, so any tags whose bytes
  spilled into a second extent were lost.

## [4.39.1] - 2026-05-19

### Fixed

- IPTC text tags without a `Coded Character Set` declaration now fall back to
  Windows-1252 when the bytes are not valid UTF-8. Captions written by
  Photoshop/exiftool that include en dashes, em dashes, ellipsis or smart
  quotes (bytes 0x80–0x9F) no longer come back as C1 control characters.
  [#635](https://github.com/mattiasw/ExifReader/issues/635)

## [4.39.0] - 2026-05-15

### Added

- `decompress.maxDecompressedSize` option to bound the size of any single
  decompressed metadata block (default 128 MiB). Blocks that would exceed the
  limit are skipped with a `console.warn`; remaining tags are returned as usual.

### Fixed

- Parse UserComment value when encoding is undefined but contains printable text.

### Security

- Fix denial-of-service when parsing crafted ICC `mluc` tags
  ([CVE-2026-8813](https://www.cve.org/CVERecord?id=CVE-2026-8813),
  [GHSA-h64w-w9pr-82m4](https://github.com/mattiasw/ExifReader/security/advisories/GHSA-h64w-w9pr-82m4)).
  Reported by Yuki Matsuhashi (@yuki-matsuhashi).
- Fix denial-of-service via unbounded decompression of compressed image metadata
  ([CVE-2026-8814](https://www.cve.org/CVERecord?id=CVE-2026-8814),
  [GHSA-rr89-w3h9-m66j](https://github.com/mattiasw/ExifReader/security/advisories/GHSA-rr89-w3h9-m66j)).
  Reported by Yuki Matsuhashi (@yuki-matsuhashi).

## [4.38.1] - 2026-04-09

### Changed

- Bump @xmldom/xmldom range to ^0.9.9.

## [4.38.0] - 2026-04-07

### Added

- Support for JPEG XL images (Exif, XMP, MakerNote, image details).
- `decompress` option for providing custom Brotli/deflate decompression
  functions (needed for JPEG XL in environments without native support).

## [4.37.1] - 2026-04-05

### Fixed

- Handle truncated EXIF segment without crashing.

## [4.37.0] - 2026-03-11

### Added

- Canon proprietary tags `LensModel` and `LensType`.

## [4.36.2] - 2026-02-19

### Fixed

- Handle broken additional APP13 segment.

## [4.36.1] - 2026-01-25

### Fixed

- Decode UTF-8 iTXt components properly when no compression is set.

## [4.36.0] - 2026-01-11

### Added

- `includeTags` and `excludeTags` options for filtering returned tags by group
  and tag name/ID.

### Fixed

- Correct the `FileType` type in TypeScript definitions.

## [4.35.0] - 2026-01-09

### Added

- Handle when an image has multiple Exif segments.

## [4.34.0] - 2026-01-05

### Added

- `computed` tag value: an opt-in, type-aware value per Exif tag. Enable with
  `computed: true` in options.

## [4.33.1] - 2025-12-05

### Fixed

- Add missing built files from 4.33.0.

## [4.33.0] - 2025-12-05

### Added

- Support for the `length` option with browser `File` objects (e.g., from form
  file fields).

## [4.32.0] - 2025-09-20

### Changed

- Correct repeatable IPTC tag types.

## [4.31.2] - 2025-08-29

### Added

- `domParser` option in TypeScript type definitions.

## [4.31.1] - 2025-06-17

### Fixed

- Allow for IPTC Keywords to be scalar or array.
- Fix ICC profile length check.

## [4.31.0] - 2025-05-27

### Added

- Better `FieldOfView` calculation with alternative method when
  `FocalPlaneResolution` is available.
- New composite tag `FocalLength35efl` (FocalLengthIn35mmFilm equivalent).

## [4.30.1] - 2025-05-08

### Fixed

- Fix type error for Photoshop tags when `PhotoshopSettings` is unset.

## [4.30.0] - 2025-05-01

### Added

- Support for some Pentax MakerNote tags.

## [4.29.0] - 2025-04-21

### Changed

- Round aperture values to 1 decimal point.

## [4.28.1] - 2025-04-09

### Added

- TypeScript type definitions for composite tags.

## [4.28.0] - 2025-04-07

### Added

- New composite tags `ScaleFactorTo35mmEquivalent` and `FieldOfView`.

## [4.27.0] - 2025-03-24

### Added

- Allow passing in a custom DOM parser via the `domParser` option for
  environments without a native `DOMParser` (e.g. Node.js, web workers).

### Fixed

- Auto-correct when XMP is using a prefix with an undefined namespace.

## [4.26.2] - 2025-03-05

### Fixed

- Support using `File` objects in non-DOM environments (e.g. web workers).

## [4.26.1] - 2025-01-26

### Fixed

- Handle non-empty resource names in IPTC resource block.

## [4.26.0] - 2024-12-25

### Added

- Decoded content for XP tags (XPTitle, XPComment, XPAuthor, XPKeywords,
  XPSubject).

## [4.25.0] - 2024-10-28

### Added

- Basic support for Canon maker notes.

### Fixed

- Fix missing handling of some modules in custom builds.
- Handle photoshop module in custom builds.

## [4.24.0] - 2024-10-25

### Changed

- Auto-add required tags when enabling thumbnails in custom builds.
- Respect the `includeUnknown` config param for thumbnail tags too.
- Upgrade to xmldom 0.9.

## [4.23.7] - 2024-10-07

### Fixed

- Fix custom builds on Windows by also using `\` in file matchers.

## [4.23.6] - 2024-10-04

### Fixed

- Fix faulty TypeScript types.
- For custom builds, use package versions from `package.json`.

## [4.23.5] - 2024-09-05

### Fixed

- Use correct types for GPS tags.

## [4.23.4] - 2024-09-05

### Fixed

- Make custom build script more robust by requiring `webpack-cli` in the npx
  command.

## [4.23.3] - 2024-06-12

### Fixed

- Avoid extra decimals in `LensSpecification`.

## [4.23.2] - 2024-05-29

### Fixed

- Decode compressed zTXt and tEXt tags using latin1 encoding.

## [4.23.1] - 2024-05-04

### Fixed

- Add missing built files from 4.23.0.

## [4.23.0] - 2024-05-04

### Added

- Add XML-containing XMP data to supported file types.

## [4.22.1] - 2024-04-08

### Fixed

- Use base offset in ISO-BMFF files to get real offset, fixing some AVIF files.

## [4.22.0] - 2024-04-06

### Added

- Support for AVIF files (Exif, XMP, ICC).
- `FileType` tag in TypeScript type definitions.

## [4.21.1] - 2024-03-10

### Fixed

- Ensure accurate JPEG offset retrieval by accounting for the length of SOF
  marker segments.

## [4.21.0] - 2024-02-04

### Changed

- Don't use fraction for exposure times > 0.25s; round to one decimal.

## [4.20.0] - 2023-12-28

### Added

- Support for compressed tags in PNG files (in zTXt, iTXt, and iCCP chunks),
  including Exif, IPTC, and ICC. Pass in `async: true` in the options parameter
  to enable.
- Support for ICC in PNG files.

## [4.19.1] - 2023-12-18

### Added

- TypeScript type definitions for GIF tags.

## [4.19.0] - 2023-12-17

### Added

- Basic support for GIF images (image dimensions, bit depths).

## [4.18.0] - 2023-12-16

### Added

- Support for extracting Photoshop paths (`ClippingPathName`,
  `PathInformation`).

## [4.17.0] - 2023-11-19

### Fixed

- Make sure no extra packages are installed when making a custom build.
- Fix custom build with yarn 2+.

## [4.16.0] - 2023-10-31

### Added

- Allow all protocols (not just http/https) in remote file loading.

## [4.15.0] - 2023-10-26

### Changed

- Extract MPF code to lower custom bundle size.

### Fixed

- Handle duplicate or empty XMP tags.

## [4.14.1] - 2023-10-21

### Added

- TypeScript type definitions for extended WebP tags.

## [4.14.0] - 2023-10-21

### Added

- Support for extended WebP metadata (Exif, XMP, ICC via RIFF VP8X).
- New `FileType` tag indicating the detected image format.

## [4.13.2] - 2023-10-07

### Fixed

- Handle faulty next IFD pointers.

## [4.13.1] - 2023-10-03

### Fixed

- Add missing file for replacing custom build constants (fixes excluding
  thumbnail in custom builds).

## [4.13.0] - 2023-07-06

### Fixed

- Retry failed XMP parse with combined standard+extended chunks.
- Stop XMP parsing on non-well-formed XML instead of crashing.

## [4.12.1] - 2023-06-08

### Changed

- Upgrade xmldom dependency.

## [4.12.0] - 2023-03-28

### Fixed

- Fix TypeScript types of combined tags.

## [4.11.1] - 2023-03-17

### Fixed

- Fix faulty TypeScript typings.

## [4.11.0] - 2023-03-13

### Added

- Support for PNG Exif tags.
- Support for PNG iTXt (uncompressed), tIME, and pHYs chunks.
- Support for passing in data URIs.
- Decode PNG iTXt strings as UTF-8.

## [4.10.0] - 2023-03-10

### Added

- Support for PNG tEXt textual data tags.

## [4.9.2] - 2023-02-26

### Fixed

- Fix wrong type on `GPSImgDirection`.
- Fix `XmpTag` type.

## [4.9.1] - 2022-12-19

### Added

- TypeScript type definitions for the `length` and `includeUnknown` options.

## [4.9.0] - 2022-12-12

### Added

- `length` option to only load the first N bytes of a file.

## [4.8.1] - 2022-11-08

### Fixed

- Handle Exif fill bytes.

## [4.8.0] - 2022-11-07

### Added

- TypeScript types for `GPSHPositioningError`, `OffsetTime`,
  `OffsetTimeDigitized`, and `OffsetTimeOriginal` tags.

## [4.7.0] - 2022-11-04

### Fixed

- Add support for Node 17+ (fix for `Blob` constructor changes).

## [4.6.0] - 2022-10-01

### Added

- Translated descriptions for more XMP tag values.

## [4.5.1] - 2022-08-02

### Added

- XMP raw string type to `ExpandedTags["xmp"]` TypeScript type.

### Fixed

- Present `ExposureTime` and `ShutterSpeedValue` correctly when value is more
  than 1 second.

## [4.5.0] - 2022-04-12

### Added

- `Thumbnail` property to the un-expanded return TypeScript type definition.

## [4.4.0] - 2022-03-12

### Changed

- Updated TypeScript type definitions for `load()` function.

## [4.3.1] - 2022-03-11

### Changed

- Add React Native import instructions to the README.

## [4.3.0] - 2022-03-04

### Added

- XMP raw string in output.

## [4.2.0] - 2022-01-23

### Added

- Description in README on how to use with React Native.

### Fixed

- Adjust check for `fetch` function availability.

## [4.1.1] - 2021-12-30

### Fixed

- Handle `undefined` input value in `loadView` function.

## [4.1.0] - 2021-11-21

### Added

- JFIF tag support.

## [4.0.0] - 2021-10-31

### Changed

- Correctly parse complex XMP array items (e.g. `Regions`). This may be a
  breaking change if you relied on the previous (incorrect) parsing.
- Upgrade to @xmldom/xmldom (from xmldom). Requires Node.js 10+ for XMP tags.
- Upgrade to Webpack 5.
- Unknown tags are no longer included by default. Use `includeUnknown: true` to
  get the previous behavior.

## [3.16.0] - 2021-06-06

### Added

- Directly pass in file path, URL, or `File` object to `ExifReader.load()`.

## [3.15.0] - 2021-04-25

### Fixed

- Handle non-standard `MicrosoftPhoto:Rating` XMP tag clashing with standard
  tags.

## [3.14.1] - 2021-03-13

### Added

- TypeScript typings for lens make and model.

## [3.14.0] - 2021-01-31

### Changed

- Mark properties as optional in TypeScript type definitions.

## [3.13.0] - 2020-12-30

### Added

- Multi-Picture Format (MPF) support.

## [3.12.6] - 2020-11-23

### Fixed

- Fix crash on faulty GPS values.

## [3.12.5] - 2020-11-21

### Fixed

- Make sure dev deps are always installed during custom build.

## [3.12.4] - 2020-11-21

### Fixed

- Make the Windows custom build fail the run when a command fails.

## [3.12.3] - 2020-10-10

### Fixed

- Handle when custom build property key is identifier instead of string, fixing
  missing tags in custom builds.

## [3.12.2] - 2020-08-19

### Added

- `DocumentName` added to TypeScript type definitions.

## [3.12.1] - 2020-08-17

### Added

- More TypeScript type info for thumbnails.

### Changed

- TypeScript fixes and documentation updates.

## [3.12.0] - 2020-06-01

### Added

- New JPEG compression codes.

## [3.11.2] - 2020-05-09

### Fixed

- TypeScript fix for `Keywords` tag (now typed as array).

## [3.11.1] - 2020-05-08

### Fixed

- Better parsing of faulty WebP images with incorrect Exif chunk prefix.

## [3.11.0] - 2020-05-02

### Added

- Refined GPS values (pre-calculated `Latitude`, `Longitude`, `Altitude` in
  `gps` group when using `expanded: true`).
- ICC support for HEIC/HEIF files.
- ICC support for TIFF images.
- WebP support in custom builds.

## [3.10.0] - 2020-05-01

### Added

- Support for WebP files (Exif, XMP, ICC).

## [3.9.0] - 2020-04-19

### Changed

- Reduced bundle size.

## [3.8.0] - 2020-04-14

### Added

- Customizable tags to reduce bundle size (specify individual Exif/IPTC tags in
  the custom build config).

## [3.7.0] - 2020-04-11

### Added

- IPTC support in TIFF images.
- XMP support in TIFF images.

## [3.6.1] - 2020-04-10

### Fixed

- Fix for some PNG images when parsed in a browser (trimming garbage chars
  before/after XMP XML, adjusting PNG XMP data start offset).

## [3.6.0] - 2020-04-06

### Added

- Custom build functionality to include/exclude specific formats and tag groups,
  reducing bundle size.

## [3.5.0] - 2020-04-01

### Removed

- Revert custom build functionality added in 3.4.0 (re-added properly in
  3.6.0).

## [3.4.0] - 2020-03-31

### Added

- Custom build functionality (initial implementation, reverted in 3.5.0 and
  re-added in 3.6.0).

## [3.3.0] - 2020-03-28

### Changed

- Faster HEIC/HEIF parsing by extracting HEIC parsing code.

## [3.2.0] - 2020-03-22

### Added

- Support for extracting JPEG thumbnails.

## [3.1.0] - 2020-03-14

### Added

- Support for PNG files.

## [3.0.0] - 2020-03-13

### Changed

- Rational tag values (e.g. `XResolution`, `ExposureTime`) now keep their
  original numerator/denominator pair instead of being calculated into a float.
  Descriptions have also been improved, e.g. ExposureTime now looks like `1/200`
  instead of `0.005`. **Breaking change** if you use `.value` on rational tags.
- Move xmldom to `optionalDependencies`.
- Move @types/node to `devDependencies`.

## [2.13.1] - 2020-01-24

### Fixed

- Replace IE11-incompatible functionality.

## [2.13.0] - 2019-12-15

### Added

- HEIC/HEIF image support for Exif metadata.

## [2.12.0] - 2019-11-23

### Added

- Extended XMP support.

## [2.11.0] - 2019-11-17

### Added

- More tag definitions for Exif, 0th, and GPS IFDs.
- Support for non-standard field type IFD offset (13).

## [2.10.0] - 2019-11-04

### Added

- JPEG APP2 ICC color profile parsing.

## [2.9.0] - 2019-11-01

### Added

- TIFF image support.

## [2.8.5] - 2019-11-01

### Fixed

- Handle when dynamic tag description throws because of faulty tag value.

## [2.8.4] - 2019-09-14

### Security

- Fix npm audit vulnerability.

## [2.8.3] - 2019-08-05

### Fixed

- Make sure empty XMP array values are taken care of.

### Security

- npm security updates.

## [2.8.2] - 2019-04-07

### Fixed

- Make sure `exif-reader.d.ts` is included in npm package.

## [2.8.1] - 2019-03-18

### Added

- Non-Exif image metadata tags (file data tags).

### Fixed

- Fix running test suite on Windows.

### Security

- Fix npm audit warning.

## [2.7.0] - 2019-02-01

### Added

- TypeScript type definitions.

### Removed

- Explicit dependency on jDataView (for Node.js).
- Explicit dependency on XMLDOM (for Node.js).

## [2.6.0] - 2019-01-23

### Added

- Extended IPTC support (records 1 and 7, character set decoding from 1:90).
- Decode XMP attribute values.
- Export errors on the ExifReader object.

## [2.5.0] - 2018-06-13

### Added

- `MetadataMissingError` custom error type.

## [2.4.0] - 2018-04-10

### Added

- Default export.

### Fixed

- Handle faulty tag count values that exceed the file size.
- Handle empty `rdf:Description` element in XMP.
- Decode strings in IPTC tags that have non-ASCII, non-UTF-8 chars.

## [2.3.0] - 2018-02-10

### Changed

- Change license to Mozilla Public License 2.0 (MPL-2.0).

## [2.2.0] - 2018-01-04

### Added

- Option to expand Exif, IPTC and XMP tags into separate parts
  (`expanded: true`).
- Translated description for XMP GPS values.
- Translated description for XMP `tiff:Orientation` tag.

## [2.1.2] - 2017-10-31

### Fixed

- Decode strings that have non-ASCII, non-UTF-8 chars.
- Handle Electron environment.

## [2.1.1] - 2017-05-09

### Fixed

- Handle ASCII tag values of length 1 (zero-length ASCII fields bug).

## [2.1.0] - 2017-02-26

### Added

- Support for XMP tags.

## [2.0.2] - 2016-12-28

### Fixed

- Fix support for Bower.

## [2.0.1] - 2016-12-28

### Fixed

- Fix `.npmignore` to include necessary files.

## [2.0.0] - 2016-12-28

### Added

- Support for IPTC tags.
- UMD support (CommonJS, AMD, and global).
- Published as npm package.

### Changed

- Convert project from CoffeeScript to JavaScript (ECMAScript 2015),
  transpiling to ES5 using Babel.
- Remove need to instantiate the ExifReader object before use.

### Removed

- Component package manager support (`component.json`).

## [1.1.1] - 2014-10-20

### Fixed

- Make parsing of types and GPS tags more robust.

## [1.1.0] - 2014-09-17

### Added

- `deleteTag` method to be able to delete tags that use a lot of memory (e.g.
  MakerNote).

### Changed

- Lower memory usage by unsetting the file data object after parsing.

## [1.0.1] - 2014-08-06

### Added

- Bower package (`bower.json`).

## [0.1.2] - 2013-09-09

### Added

- Accept unknown high-number APP markers.

## [0.1.1] - 2013-09-08

### Changed

- Make parsing of APP markers more robust.
- Throw `Error` instead of just strings.

### Fixed

- Support hybrid JFIF-EXIF image files.

## [0.1.0] - 2013-04-22

### Added

- Registered with Bower and Component.

## 0.0.0 - 2012-01-01

First release. CoffeeScript library for parsing Exif metadata from JPEG files
in the browser.

### Added

- Parse Exif tags from JPEG files using the FileReader API.
- Text descriptions for the 0th IFD, Exif IFD, and GPS IFD tags.

[Unreleased]: https://github.com/mattiasw/ExifReader/compare/v4.47.0...HEAD
[4.47.0]: https://github.com/mattiasw/ExifReader/compare/v4.46.0...v4.47.0
[4.46.0]: https://github.com/mattiasw/ExifReader/compare/v4.45.2...v4.46.0
[4.45.2]: https://github.com/mattiasw/ExifReader/compare/v4.45.1...v4.45.2
[4.45.1]: https://github.com/mattiasw/ExifReader/compare/v4.45.0...v4.45.1
[4.45.0]: https://github.com/mattiasw/ExifReader/compare/v4.44.1...v4.45.0
[4.44.1]: https://github.com/mattiasw/ExifReader/compare/v4.44.0...v4.44.1
[4.44.0]: https://github.com/mattiasw/ExifReader/compare/v4.43.0...v4.44.0
[4.43.0]: https://github.com/mattiasw/ExifReader/compare/v4.42.0...v4.43.0
[4.42.0]: https://github.com/mattiasw/ExifReader/compare/v4.41.4...v4.42.0
[4.41.4]: https://github.com/mattiasw/ExifReader/compare/v4.41.3...v4.41.4
[4.41.3]: https://github.com/mattiasw/ExifReader/compare/v4.41.2...v4.41.3
[4.41.2]: https://github.com/mattiasw/ExifReader/compare/v4.41.1...v4.41.2
[4.41.1]: https://github.com/mattiasw/ExifReader/compare/v4.41.0...v4.41.1
[4.41.0]: https://github.com/mattiasw/ExifReader/compare/v4.40.5...v4.41.0
[4.40.5]: https://github.com/mattiasw/ExifReader/compare/v4.40.4...v4.40.5
[4.40.4]: https://github.com/mattiasw/ExifReader/compare/v4.40.3...v4.40.4
[4.40.3]: https://github.com/mattiasw/ExifReader/compare/v4.40.2...v4.40.3
[4.40.2]: https://github.com/mattiasw/ExifReader/compare/v4.40.1...v4.40.2
[4.40.1]: https://github.com/mattiasw/ExifReader/compare/v4.40.0...v4.40.1
[4.40.0]: https://github.com/mattiasw/ExifReader/compare/v4.39.1...v4.40.0
[4.39.1]: https://github.com/mattiasw/ExifReader/compare/v4.39.0...v4.39.1
[4.39.0]: https://github.com/mattiasw/ExifReader/compare/v4.38.1...v4.39.0
[4.38.1]: https://github.com/mattiasw/ExifReader/compare/v4.38.0...v4.38.1
[4.38.0]: https://github.com/mattiasw/ExifReader/compare/v4.37.1...v4.38.0
[4.37.1]: https://github.com/mattiasw/ExifReader/compare/v4.37.0...v4.37.1
[4.37.0]: https://github.com/mattiasw/ExifReader/compare/v4.36.2...v4.37.0
[4.36.2]: https://github.com/mattiasw/ExifReader/compare/v4.36.1...v4.36.2
[4.36.1]: https://github.com/mattiasw/ExifReader/compare/v4.36.0...v4.36.1
[4.36.0]: https://github.com/mattiasw/ExifReader/compare/v4.35.0...v4.36.0
[4.35.0]: https://github.com/mattiasw/ExifReader/compare/v4.34.0...v4.35.0
[4.34.0]: https://github.com/mattiasw/ExifReader/compare/v4.33.1...v4.34.0
[4.33.1]: https://github.com/mattiasw/ExifReader/compare/v4.33.0...v4.33.1
[4.33.0]: https://github.com/mattiasw/ExifReader/compare/v4.32.0...v4.33.0
[4.32.0]: https://github.com/mattiasw/ExifReader/compare/v4.31.2...v4.32.0
[4.31.2]: https://github.com/mattiasw/ExifReader/compare/v4.31.1...v4.31.2
[4.31.1]: https://github.com/mattiasw/ExifReader/compare/v4.31.0...v4.31.1
[4.31.0]: https://github.com/mattiasw/ExifReader/compare/v4.30.1...v4.31.0
[4.30.1]: https://github.com/mattiasw/ExifReader/compare/v4.30.0...v4.30.1
[4.30.0]: https://github.com/mattiasw/ExifReader/compare/v4.29.0...v4.30.0
[4.29.0]: https://github.com/mattiasw/ExifReader/compare/v4.28.1...v4.29.0
[4.28.1]: https://github.com/mattiasw/ExifReader/compare/v4.28.0...v4.28.1
[4.28.0]: https://github.com/mattiasw/ExifReader/compare/v4.27.0...v4.28.0
[4.27.0]: https://github.com/mattiasw/ExifReader/compare/v4.26.2...v4.27.0
[4.26.2]: https://github.com/mattiasw/ExifReader/compare/v4.26.1...v4.26.2
[4.26.1]: https://github.com/mattiasw/ExifReader/compare/v4.26.0...v4.26.1
[4.26.0]: https://github.com/mattiasw/ExifReader/compare/v4.25.0...v4.26.0
[4.25.0]: https://github.com/mattiasw/ExifReader/compare/v4.24.0...v4.25.0
[4.24.0]: https://github.com/mattiasw/ExifReader/compare/v4.23.7...v4.24.0
[4.23.7]: https://github.com/mattiasw/ExifReader/compare/v4.23.6...v4.23.7
[4.23.6]: https://github.com/mattiasw/ExifReader/compare/v4.23.5...v4.23.6
[4.23.5]: https://github.com/mattiasw/ExifReader/compare/v4.23.4...v4.23.5
[4.23.4]: https://github.com/mattiasw/ExifReader/compare/v4.23.3...v4.23.4
[4.23.3]: https://github.com/mattiasw/ExifReader/compare/v4.23.2...v4.23.3
[4.23.2]: https://github.com/mattiasw/ExifReader/compare/v4.23.1...v4.23.2
[4.23.1]: https://github.com/mattiasw/ExifReader/compare/v4.23.0...v4.23.1
[4.23.0]: https://github.com/mattiasw/ExifReader/compare/v4.22.1...v4.23.0
[4.22.1]: https://github.com/mattiasw/ExifReader/compare/v4.22.0...v4.22.1
[4.22.0]: https://github.com/mattiasw/ExifReader/compare/v4.21.1...v4.22.0
[4.21.1]: https://github.com/mattiasw/ExifReader/compare/v4.21.0...v4.21.1
[4.21.0]: https://github.com/mattiasw/ExifReader/compare/v4.20.0...v4.21.0
[4.20.0]: https://github.com/mattiasw/ExifReader/compare/v4.19.1...v4.20.0
[4.19.1]: https://github.com/mattiasw/ExifReader/compare/v4.19.0...v4.19.1
[4.19.0]: https://github.com/mattiasw/ExifReader/compare/v4.18.0...v4.19.0
[4.18.0]: https://github.com/mattiasw/ExifReader/compare/v4.17.0...v4.18.0
[4.17.0]: https://github.com/mattiasw/ExifReader/compare/v4.16.0...v4.17.0
[4.16.0]: https://github.com/mattiasw/ExifReader/compare/v4.15.0...v4.16.0
[4.15.0]: https://github.com/mattiasw/ExifReader/compare/v4.14.1...v4.15.0
[4.14.1]: https://github.com/mattiasw/ExifReader/compare/v4.14.0...v4.14.1
[4.14.0]: https://github.com/mattiasw/ExifReader/compare/4.13.2...v4.14.0
[4.13.2]: https://github.com/mattiasw/ExifReader/compare/4.13.1...4.13.2
[4.13.1]: https://github.com/mattiasw/ExifReader/compare/v4.13.0...4.13.1
[4.13.0]: https://github.com/mattiasw/ExifReader/compare/4.12.1...v4.13.0
[4.12.1]: https://github.com/mattiasw/ExifReader/compare/v4.12.0...4.12.1
[4.12.0]: https://github.com/mattiasw/ExifReader/compare/v4.11.1...v4.12.0
[4.11.1]: https://github.com/mattiasw/ExifReader/compare/v4.11.0...v4.11.1
[4.11.0]: https://github.com/mattiasw/ExifReader/compare/v4.10.0...v4.11.0
[4.10.0]: https://github.com/mattiasw/ExifReader/compare/v4.9.2...v4.10.0
[4.9.2]: https://github.com/mattiasw/ExifReader/compare/v4.9.1...v4.9.2
[4.9.1]: https://github.com/mattiasw/ExifReader/compare/v4.9.0...v4.9.1
[4.9.0]: https://github.com/mattiasw/ExifReader/compare/v4.8.1...v4.9.0
[4.8.1]: https://github.com/mattiasw/ExifReader/compare/v4.8.0...v4.8.1
[4.8.0]: https://github.com/mattiasw/ExifReader/compare/v4.7.0...v4.8.0
[4.7.0]: https://github.com/mattiasw/ExifReader/compare/v4.6.0...v4.7.0
[4.6.0]: https://github.com/mattiasw/ExifReader/compare/v4.5.1...v4.6.0
[4.5.1]: https://github.com/mattiasw/ExifReader/compare/v4.5.0...v4.5.1
[4.5.0]: https://github.com/mattiasw/ExifReader/compare/v4.4.0...v4.5.0
[4.4.0]: https://github.com/mattiasw/ExifReader/compare/v4.3.1...v4.4.0
[4.3.1]: https://github.com/mattiasw/ExifReader/compare/v4.3.0...v4.3.1
[4.3.0]: https://github.com/mattiasw/ExifReader/compare/v4.2.0...v4.3.0
[4.2.0]: https://github.com/mattiasw/ExifReader/compare/v4.1.1...v4.2.0
[4.1.1]: https://github.com/mattiasw/ExifReader/compare/v4.1.0...v4.1.1
[4.1.0]: https://github.com/mattiasw/ExifReader/compare/v4.0.0...v4.1.0
[4.0.0]: https://github.com/mattiasw/ExifReader/compare/v3.16.0...v4.0.0
[3.16.0]: https://github.com/mattiasw/ExifReader/compare/v3.15.0...v3.16.0
[3.15.0]: https://github.com/mattiasw/ExifReader/compare/v3.14.1...v3.15.0
[3.14.1]: https://github.com/mattiasw/ExifReader/compare/v3.14.0...v3.14.1
[3.14.0]: https://github.com/mattiasw/ExifReader/compare/v3.13.0...v3.14.0
[3.13.0]: https://github.com/mattiasw/ExifReader/compare/v3.12.6...v3.13.0
[3.12.6]: https://github.com/mattiasw/ExifReader/compare/v3.12.5...v3.12.6
[3.12.5]: https://github.com/mattiasw/ExifReader/compare/v3.12.4...v3.12.5
[3.12.4]: https://github.com/mattiasw/ExifReader/compare/v3.12.3...v3.12.4
[3.12.3]: https://github.com/mattiasw/ExifReader/compare/v3.12.2...v3.12.3
[3.12.2]: https://github.com/mattiasw/ExifReader/compare/3.12.1...v3.12.2
[3.12.1]: https://github.com/mattiasw/ExifReader/compare/v3.12.0...3.12.1
[3.12.0]: https://github.com/mattiasw/ExifReader/compare/v3.11.2...v3.12.0
[3.11.2]: https://github.com/mattiasw/ExifReader/compare/v3.11.1...v3.11.2
[3.11.1]: https://github.com/mattiasw/ExifReader/compare/v3.11.0...v3.11.1
[3.11.0]: https://github.com/mattiasw/ExifReader/compare/v3.10.0...v3.11.0
[3.10.0]: https://github.com/mattiasw/ExifReader/compare/v3.9.0...v3.10.0
[3.9.0]: https://github.com/mattiasw/ExifReader/compare/v3.8.0...v3.9.0
[3.8.0]: https://github.com/mattiasw/ExifReader/compare/v3.7.0...v3.8.0
[3.7.0]: https://github.com/mattiasw/ExifReader/compare/v3.6.1...v3.7.0
[3.6.1]: https://github.com/mattiasw/ExifReader/compare/3.6.0...v3.6.1
[3.6.0]: https://github.com/mattiasw/ExifReader/compare/454ec8c...3.6.0
[3.5.0]: https://github.com/mattiasw/ExifReader/compare/3.4.0...454ec8c
[3.4.0]: https://github.com/mattiasw/ExifReader/compare/3.3.0...3.4.0
[3.3.0]: https://github.com/mattiasw/ExifReader/compare/3.2.0...3.3.0
[3.2.0]: https://github.com/mattiasw/ExifReader/compare/3.1.0...3.2.0
[3.1.0]: https://github.com/mattiasw/ExifReader/compare/3.0.0...3.1.0
[3.0.0]: https://github.com/mattiasw/ExifReader/compare/2.13.1...3.0.0
[2.13.1]: https://github.com/mattiasw/ExifReader/compare/2.13.0...2.13.1
[2.13.0]: https://github.com/mattiasw/ExifReader/compare/2.12.0...2.13.0
[2.12.0]: https://github.com/mattiasw/ExifReader/compare/2.11.0...2.12.0
[2.11.0]: https://github.com/mattiasw/ExifReader/compare/2.10.0...2.11.0
[2.10.0]: https://github.com/mattiasw/ExifReader/compare/2.9.0...2.10.0
[2.9.0]: https://github.com/mattiasw/ExifReader/compare/2.8.5...2.9.0
[2.8.5]: https://github.com/mattiasw/ExifReader/compare/2.8.4...2.8.5
[2.8.4]: https://github.com/mattiasw/ExifReader/compare/2.8.3...2.8.4
[2.8.3]: https://github.com/mattiasw/ExifReader/compare/2.8.2...2.8.3
[2.8.2]: https://github.com/mattiasw/ExifReader/compare/2.8.1...2.8.2
[2.8.1]: https://github.com/mattiasw/ExifReader/compare/2.7.0...2.8.1
[2.7.0]: https://github.com/mattiasw/ExifReader/compare/2.6.0...2.7.0
[2.6.0]: https://github.com/mattiasw/ExifReader/compare/2.5.0...2.6.0
[2.5.0]: https://github.com/mattiasw/ExifReader/compare/2.4.0...2.5.0
[2.4.0]: https://github.com/mattiasw/ExifReader/compare/2.3.0...2.4.0
[2.3.0]: https://github.com/mattiasw/ExifReader/compare/2.2.0...2.3.0
[2.2.0]: https://github.com/mattiasw/ExifReader/compare/2.1.2...2.2.0
[2.1.2]: https://github.com/mattiasw/ExifReader/compare/2.1.1...2.1.2
[2.1.1]: https://github.com/mattiasw/ExifReader/compare/2.1.0...2.1.1
[2.1.0]: https://github.com/mattiasw/ExifReader/compare/2.0.2...2.1.0
[2.0.2]: https://github.com/mattiasw/ExifReader/compare/2.0.1...2.0.2
[2.0.1]: https://github.com/mattiasw/ExifReader/compare/2.0.0...2.0.1
[2.0.0]: https://github.com/mattiasw/ExifReader/compare/v1.1.1...2.0.0
[1.1.1]: https://github.com/mattiasw/ExifReader/compare/41789ef...v1.1.1
[1.1.0]: https://github.com/mattiasw/ExifReader/compare/122fdc7...41789ef
[1.0.1]: https://github.com/mattiasw/ExifReader/compare/e2c43cb...122fdc7
[0.1.2]: https://github.com/mattiasw/ExifReader/compare/aff21fa...e2c43cb
[0.1.1]: https://github.com/mattiasw/ExifReader/compare/66199b4...aff21fa
[0.1.0]: https://github.com/mattiasw/ExifReader/commit/66199b4
