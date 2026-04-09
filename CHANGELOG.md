# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Fixed

- Present `ExposureTime` and `ShutterSpeedValue` correctly when value is more
  than 1 second.

### Added

- XMP raw string type to `ExpandedTags["xmp"]` TypeScript type.

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

### Fixed

- Handle faulty tag count values that exceed the file size.
- Handle empty `rdf:Description` element in XMP.
- Decode strings in IPTC tags that have non-ASCII, non-UTF-8 chars.

### Added

- Default export.

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

[Unreleased]: https://github.com/mattiasw/ExifReader/compare/v4.38.1...HEAD
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
