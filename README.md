ExifReader
==========

ExifReader is a JavaScript library that parses image files and extracts the
metadata. It can also extract an embedded thumbnail. It can be used either in a
browser or from Node. Supports JPEG, TIFF, PNG, HEIC, WebP, and GIF files with
Exif, IPTC, XMP, ICC, and MPF metadata (depending on file type).

ExifReader is highly and easily configurable and the resulting bundle can be as
small as **~4 KiB** (gzipped) if you're only interested in a few tags (e.g. date
and/or GPS values).

ExifReader supports module formats ESM, AMD, CommonJS, and globals and can
therefore easily be used from Webpack, RequireJS, Browserify, Node etc.

You can try it out on the
[examples site](https://mattiasw.github.io/ExifReader/).

**Support table**

| File type | Exif    | IPTC    | XMP     | ICC     | MPF     | Photoshop     | MakerNote          | Thumbnail | Image details |
| ----------|---------|---------|---------|---------|---------|---------------|--------------------|-----------|---------------|
| JPEG      | **yes** | **yes** | **yes** | **yes** | **yes** | **some**&ast; | **some**&ast;&ast; | **yes**   | **yes**       |
| TIFF      | **yes** | **yes** | **yes** | **yes** | ???     | **some**&ast; | **some**&ast;&ast; | N/A       | N/A           |
| PNG       | **yes** | **yes** | **yes** | **yes** | ???     | ???           | **some**&ast;&ast; | no        | **yes**       |
| HEIC/HEIF | **yes** | no      | **yes** | **yes** | ???     | ???           | **some**&ast;&ast; | **yes**   | no            |
| AVIF      | **yes** | no      | **yes** | **yes** | ???     | ???           | **some**&ast;&ast; | **yes**   | no            |
| WebP      | **yes** | no      | **yes** | **yes** | ???     | ???           | **some**&ast;&ast; | **yes**   | **yes**       |
| GIF       | N/A     | N/A     | N/A     | N/A     | N/A     | N/A           | N/A                | N/A       | **yes**       |

- `MakerNote` = Manufacturers' proprietary MakerNote tags.
- `Image details` = image width, height, etc. read from image header.
- `N/A` = The feature is not applicable to this file type.
- `???` = may be supported in any file type using Exif but it has only been tested
    on JPEGs.
- `*` = A draft implementation of Photoshop tags have been added with
    `ClippingPathName` and `PathInformation` currently supported. Photoshop tags
    are very different from other tags and need a lot of extra code so they have
    deliberately not been fully implemented. File an issue if there is something
    you think should really be supported.
- `**` = Some of the Canon-specific and Pentax-specific tags have been added.
    File an issue if you think something more should be supported.

If you're missing something that you think should be supported, file an issue
with an attached example image and I'll see what I can do.

**Notes for exif-js users**

If you come here from the popular but now dead exif-js package, please let me
know if you're missing anything from it and I will try to help you. Some notes:

-   ExifReader has a different API, hopefully better. :-)
-   XMP support in exif-js does not seem perfect. ExifReader should be a bit
    better on that part.
-   ExifReader works with strict mode.
-   I've been maintaining this package since 2012 and I have no plans to stop
    doing that anytime soon.

Table of Contents
-----------------

1. [Support](#support)
2. [Installation](#installation)
3. [Usage](#usage)
4. [Configure a Custom Build](#configure-a-custom-build)
5. [Notes](#notes)
6. [Client/Browser Support](#clientbrowser-support)
7. [Examples](#examples)
8. [Tips](#tips)
9. [Known Limitations](#known-limitations)
10. [Contributing](#contributing)
11. [Code of Conduct](#code-of-conduct)
12. [License](#license)
13. [Changelog](#changelog)

Support
-------

Monetary support is not necessary for me to continue working on this, but in
case you like this library and want to support its development you are very
welcome to click the button below. You can also use GitHub's sponsor feature on
the right-hand side on the repository's main page.

<a href="https://www.buymeacoffee.com/mattiasw" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-violet.png" alt="Buy me a coffee" width="181" height="50">
</a>

Installation
------------

Easiest is through npm or Bower:

```bash
npm install exifreader --save
```

```bash
bower install exifreader --save
```

If you want to clone the git repository instead:

```bash
git clone git@github.com:mattiasw/ExifReader.git
cd ExifReader
npm install
```

After that, the transpiled, concatenated and minified ES5 file will be in the
`dist` folder together with a sourcemap file.

### Type definitions

Type definitions for TypeScript are included in the package.

Usage
-----

### Importing

*NOTE: See React Native instructions below.*

ES module syntax:

```javascript
import ExifReader from 'exifreader';
```

**NOTE:** TypeScript/Angular seems to sometimes have problems when using the
default export. If you're seeing issues, use this syntax instead:

```javascript
import * as ExifReader from 'exifreader';
```

CommonJS/Node modules:

```javascript
const ExifReader = require('exifreader');
```

AMD modules:

```javascript
requirejs(['/path/to/exif-reader.js'], function (ExifReader) {
    ...
});
```

`script` tag:

```html
<script src="/path/to/exif-reader.js"></script>
```

### Loading tags

There are two ways to load the tags. Either have ExifReader do the loading of
the image file, or load the file yourself first and pass in the file buffer. The
main difference is that the first one is asynchronous and the second one is
synchronous unless specified.

#### Let ExifReader load the file (asynchronous API)

```javascript
const tags = await ExifReader.load(file);
const imageDate = tags['DateTimeOriginal'].description;
const unprocessedTagValue = tags['DateTimeOriginal'].value;
```

Where `file` is one of

*  File object, the result of a form file upload (browser)
*  File path on a local file system (Node.js)
*  URL (browser or Node.js; remember that in a browser context the remote server
   has to set CORS headers that allow for remote loading of the file)

#### Load the file yourself (synchronous API)

```javascript
const tags = ExifReader.load(fileBuffer);
```

Where `fileBuffer` is one of

*  `ArrayBuffer` or `SharedArrayBuffer` (browser, Node.js)
*  `Buffer` (Node.js)

See the [examples site](https://mattiasw.github.io/ExifReader/) for more
directions on how to use the library.

#### Asynchronous tags

Some tags need to be parsed asynchronously. Currently this is the case for some
PNG tags, more specifically compressed tags in zTXt, iTXt, and iCCP chunks. To
enable this, either use the asynchronous API mentioned above or pass in `async:
true` in the options parameter:

```javascript
const tags = await ExifReader.load(file);
// or
const tags = await ExifReader.load(fileBuffer, {async: true});
```

For the compressed tags to work, the environment needs to support the
[Compression Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API#browser_compatibility).

The reason for having an option to enable this is to not break backwards
compatibility. This will probably be the default in the next major version.

#### Grouping

By default, Exif, IPTC and XMP tags are grouped together. This means that if
e.g. `Orientation` exists in both Exif and XMP, the first value (Exif) will be
overwritten by the second (XMP). If you need to separate between these values,
pass in an options object with the property `expanded` set to `true`:

```javascript
const tags = ExifReader.load(fileBuffer, {expanded: true});
```

#### Parsing XMP tags when not in a DOM environment

When using for example Node.js or a web worker, there is no native
[`DOMParser`](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser)
available for parsing the XML used in XMP. In this case – and if XMP support is
important to you – you can pass in a third-party parser to ExifReader. The
parser needs to have a `parseFromString` method with the same API as the
[`parseFromString` from the DOMParser Web
API](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString).

Two libraries have been tested,
[`xmldom`](https://www.npmjs.com/package/@xmldom/xmldom) and
[`linkedom`](https://www.npmjs.com/package/linkedom), but more might work if
they follow the spec.

Here is an example using `xmldom`:

```javascript
import {DOMParser, onErrorStopParsing} from '@xmldom/xmldom';
// ...
const tags = ExifReader.load(fileBuffer, {domParser: new DOMParser({onError: onErrorStopParsing})});
```

The `onError` option is needed to avoid a [seemingly infinite loop for some
XMLs](https://github.com/xmldom/xmldom/issues/501). Unfortunately `linkedom` has
the same problem but does not have this option and will therefore get stuck on
these XMLs. If this happens to you, switch to `xmldom` and pass in the `onError`
option. (NOTE: The native `DOMParser` that a web browser uses does not seem to
have this issue.)

#### Using React Native

Import ExifReader like this:

```javascript
import ExifReader from './node_modules/exifreader/src/exif-reader.js';
```

Make sure to update the path to point to where your `node_modules` is located.

For local files on the device you need to load the file yourself first, then
pass in the buffer to ExifReader. Here is a template from user @hungdev:

```javascript
import RNFS from 'react-native-fs';
import {decode} from 'base64-arraybuffer';
import ExifReader from 'exifreader';

const b64Buffer = await RNFS.readFile('YOUR IMAGE URI', 'base64') // Where the URI looks like this: "file:///path/to/image/IMG_0123.HEIC"
const fileBuffer = decode(b64Buffer)
const tags = ExifReader.load(fileBuffer, {expanded: true});
```

If you're having trouble getting the GPS location, see [this comment and
thread](https://github.com/mattiasw/ExifReader/issues/177#issuecomment-1172228225)
and the [GPS section below](#gps) for more details.

#### Read only part of file

If you only want to read part of the image file you can use the `length` option:

```javascript
const tags = await ExifReader.load(filename, {length: 128 * 1024});
```

This will load only the first 128 KiB of the file. This could be useful if you
know the metadata is located at the beginning of the file. Just be aware that
it's common for the metadata to be spread out over a larger area so please try
it out on your set of files to know if it's suitable for your situation.

Note that this option only works when ExifReader handles the loading of the
file. If e.g. a JavaScript File object from a form file field is passed into
ExifReader the whole file will already have been loaded into memory and it's too
late. More specifically the length option will work for 1. local files when
running through Node.js, and 2. remote files when passing a URL. For the latter,
if doing this through a web browser, make sure the remote server is either on
the same origin (domain) as your script or that the server is passing correct
CORS headers, specifically allowing the `Range` header.

#### Unknown tags

Tags that are unknown, either because they have been excluded by making a custom
build or they are yet to be added into ExifReader, are by default not included
in the output. If you need to see them there is an option that can be passed in:

```javascript
const tags = ExifReader.load(fileBuffer, {includeUnknown: true});
```

If you discover an unknown tag that should be handled by ExifReader, please
reach out by filing an issue.

### GPS

If `expanded: true` is specified in the options, there will be a `gps` group.
This group currently contains `Latitude`, `Longitude`, and `Altitude` which will
be negative for values that are south of the equator, west of the IRM, or below
sealevel. These are often more convenient values for regular use. For some
elaboration or if you need the original values, see [Notes](#notes) below.

If you're having trouble getting the GPS values on Android (and possibly also
IOS) and are using a `type="file"` input to upload the image, make sure you are
**not** setting `accept="image/*"` on the input element. Apparently
setting the `accept` attribute to this value [will strip the GPS
values](https://github.com/mattiasw/ExifReader/issues/378#issuecomment-2302705983).

### Using the thumbnail

The thumbnail and its details will be accessible through `tags['Thumbnail']`.
There is information about e.g. width and height, and the thumbnail image data
is stored in `tags['Thumbnail'].image`.

How you use it is going to depend on your environment. For a web browser you can
either use the raw byte data in `tags['Thumbnail'].image` and use it the way you
want, or you can use the helper property `tags['Thumbnail'].base64` that is a
base64 representation of the image. It can be used for a data URI like this:

```javascript
const tags = ExifReader.load(fileBuffer);
imageElement.src = 'data:image/jpg;base64,' + tags['Thumbnail'].base64;
```

If you're using node, you can store it as a new file like this:

```javascript
const fs = require('fs');
const tags = ExifReader.load(fileBuffer);
fs.writeFileSync('/path/to/new/thumbnail.jpg', Buffer.from(tags['Thumbnail'].image));
```

See the [examples site](https://mattiasw.github.io/ExifReader/) for more
details.

### Optimizing build size

The most important step will be to [use a custom
build](#configure-a-custom-build) so please do that.

If you are using Webpack 4 or lower and are only targeting web browsers, make
sure to add this to your Webpack config (probably the `webpack.config.js` file):

```javascript
    node: {
        Buffer: false
    }
```

`Buffer` is only used in Node.js but if Webpack sees a reference to it it will
include a `Buffer` shim for browsers. This configuration will stop Webpack from
doing that. Webpack 5 does this automatically.

Configure a Custom Build
------------------------

Configuring a custom build can reduce the bundle size significantly.

**NOTE 1:** This functionality is in beta but should work fine. Please file an
issue if you're having problems or ideas on how to make it better.

**NOTE 2:** This only changes the built file (`exifreader/dist/exif-reader.js`),
not the source code. That means it's not possible to use the ES module (from the
`src` folder) or any tree shaking to get the benefit of a custom build. Tree
shaking will actually have close to no effect at all here so don't rely on it.

This is for npm and yarn users that use the built file. To specify what
functionality you want you can either use include pattern (start with an empty
set and include) or exclude pattern (start with full functionality and exclude).
If an include pattern is set, excludes will not be used.

For Exif and IPTC it's also possible to specify which tags you're interested in.
Those tag groups have huge dictionaries of tags and you may not be interested in
all of them. (Note that it's not possible to specify tags to exclude.)

The configuration is added to your project's `package.json` file.

**Example 1:** Only include JPEG files and Exif tags (this makes the bundle
almost half the size of the full one (non-gzipped)):

```javascript
"exifreader": {
    "include": {
        "jpeg": true,
        "exif": true
    }
}
```

**Example 2:** Only include TIFF files, and the Exif `DateTime` tag and the GPS
tags (resulting bundle will be ~19 % of a gzipped full build):

```javascript
"exifreader": {
    "include": {
        "tiff": true,
        "exif": [
            "DateTime",
            "GPSLatitude",
            "GPSLatitudeRef",
            "GPSLongitude",
            "GPSLongitudeRef",
            "GPSAltitude",
            "GPSAltitudeRef"
        ]
    }
}
```

**Example 3:** Exclude XMP tags:

```javascript
"exifreader": {
    "exclude": {
        "xmp": true
    }
}
```

Then, if you didn't install ExifReader yet, run `npm install exifreader`.
Otherwise you have to rebuild the library:

```bash
npm rebuild exifreader
```

With yarn 2+:

From my experience, you need a `node_modules` folder for the rebuild command to
work with yarn 2+. If you don't have it, run `yarn config set nodeLinker
node-modules` and then run `yarn`. Then you can try to rebuild:

```bash
yarn rebuild exifreader
```

With yarn 1:
```bash
yarn add exifreader
```

After that the new bundle is here: `node_modules/exifreader/dist/exif-reader.js`

If you are using `vite`, you will need to [clear the dependency cache](https://vitejs.dev/guide/dep-pre-bundling.html#file-system-cache)
after a rebuild.

If you're using the include pattern config, remember to include everything you
want to use. If you want `xmp` and don't specify any file types, you will get
"Invalid image format", and if you specify `jpeg` but don't mention any tag
types no tags will be found.

Possible modules to include or exclude:

| Module        | Description                                            |
| ------------- | -------------------------------------------------------|
| `jpeg`        | JPEG images.                                           |
| `tiff`        | TIFF images.                                           |
| `png`         | PNG images.                                            |
| `heic`        | HEIC/HEIF images.                                      |
| `webp`        | WebP images.                                           |
| `gif`         | GIF images.                                            |
| `file`        | JPEG file details: image width, height etc.            |
| `jfif`        | JFIF details in JPEG files: resolution, thumbnail etc. |
| `png_file`    | PNG file details: image width, height etc.             |
| `exif`        | Regular Exif tags. If excluded, will also exclude `mpf`, `photoshop` and `thumbnail`. For TIFF files, excluding this will also exclude IPTC, XMP, and ICC. |
| `iptc`        | IPTC tags.                                             |
| `xmp`         | XMP tags.                                              |
| `icc`         | ICC color profile tags.                                |
| `mpf`         | Multi-picture Format tags.                             |
| `photoshop`   | Photoshop tags.                                        |
| `maker_notes` | Proprietary camera maker tags. Needs `exif`.           |
| `thumbnail`   | Thumbnail image. Needs `exif`.                         |

Notes
-----

-   In Exif data, the full GPS information is split into two different tags for
    each direction: the coordinate value (`GPSLatitude`, `GPSLongitude`) and the
    reference value (`GPSLatitudeRef`, `GPSLongitudeRef`). Use the references to
    know whether the coordinate is north/south and east/west. Often you will see
    north and east represented as positive values, and south and west
    represented as negative values (e.g. in Google Maps). This setup is also
    used for the altitude using `GPSAltitude` and `GPSAltitudeRef` where the
    latter specifies if it's above sea level (positive) or below sea level
    (negative). If you don't want to calculate the final values yourself, see
    [the section on GPS](#gps) for pre-calculated ones.
-   Some XMP tags have processed values as descriptions. That means that e.g. an
    `Orientation` value of `3` will have `Rotate 180` in the `description`
    property. If you would like more XMP tags to have a processed description,
    please file an issue or create a pull request.
-   Some text tags use TextDecoder to decode their content. If your specific
    environment does not support it at all or a specific encoding, you will not
    be able to see the decoded value. One example is when [Node.js wasn't
    compiled with support for the specific encoding](https://nodejs.org/api/util.html#util_whatwg_supported_encodings).
-   The `description` property of tags can change in a minor update. If you
    want to process a tag's value somehow, use the `value` property to be sure
    nothing breaks between updates.
-   Some of the composite tags may have values that are very off if e.g. the
    image has been resized.

Client/Browser Support
----------------------

The library makes use of the DataView API which is supported in Chrome 9+,
Firefox 15+, Internet Explorer 10+, Edge, Safari 5.1+, Opera 12.1+. For Node.js
at least version 10 is required if you want to parse XMP tags, otherwise earlier
versions will also work.

Examples
--------

Full HTML example pages and a Node.js example are located on the
[examples site](https://mattiasw.github.io/ExifReader/).

Tips
----

-   After parsing the tags, consider deleting the MakerNote tag if you know you
    will load a lot of files and storing the tags. It can be really large for
    some manufacturers. See the
    [examples site](https://mattiasw.github.io/ExifReader/) to see how you can
    do that.
-   In some cases it can make sense to only load the beginning of the image
    file since that is where the metadata is located. It's unfortunately not
    possible to know how big the metadata will be in an image, but if you limit
    yourself to regular Exif tags you can most probably get by with only reading
    the first 128 kB. This may exclude IPTC and XMP metadata though (and
    possibly Exif too if they come in an irregular order) so please check if
    this optimization fits your use case. Use the `length` option to only read
    the beginning of the file. See above for more details on that.

Known Limitations
-----------------

-   The descriptions for UserComment, GPSProcessingMethod and GPSAreaInformation
    are missing for other encodings than ASCII.

Contributing
------------

Questions, bug reports, suggestions, and pull requests are very much welcome. If
you've been using another Exif package, you probably have some good insights on
what's missing in this one. See [CONTRIBUTING.md](CONTRIBUTING.md) for more
info.

Code of Conduct
---------------

This project is released with a
[Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this
project you agree to abide by its terms.

License
-------

ExifReader uses the Mozilla Public License 2.0 (MPL-2.0). In short that means
you can use this library in your project (open- or closed-source) as long as you
mention the use of ExifReader and make any changes to ExifReader code available
if you would to distribute your project. But please read the
[full license text](https://mozilla.org/MPL/2.0/) to make sure your specific
case is covered.


Changelog
---------

A selection of notable changes.

-   **October 2024**:
    -   Add support for some proprietary tags from Canon cameras.
-   **December 2023**:
    -   Add support for extracting Photoshop paths.
    -   Add basic support for GIF images (image dimensions, bit depths).
    -   Add support for compressed tags in PNG files (in zTXt, iTXt, and iCCP
        chunks), including IPTC and ICC. Pass in `async: true` in `options`
        parameter to enable. Works in environments that support the
        [Compression Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API#browser_compatibility).
-   **December 2022**:
    -   Add option `length` to only read the first `length` bytes of the file.
-   **October 2021**:
    -   Major version update 4.0.0. A couple of small breaking changes that
        shouldn't affect too many users:
        - Node.js 10+ is needed to read XMP tags (requirement from
          [xmldom](https://www.npmjs.com/package/@xmldom/xmldom) dependency)
        - XMP arrays with complex items are now parsed correctly, e.g. `Regions`
          (see [issue #129](https://github.com/mattiasw/ExifReader/issues/129)
          for more details)
        - [Unknown tags](#unknown-tags) are no longer included by default
-   **June 2021**:
    -   Make it possible to directly pass in file path, URL, or File object.
-   **December 2020**:
    -   Add support for Multi-picture Format (MPF).
-   **May 2020**:
    -   Add support for WebP images.
    -   Add support for ICC tags in TIFF images.
-   **April 2020**:
    -   Add support for IPTC and XMP tags in TIFF images.
    -   Add functionality to create a custom build to reduce bundle size.
-   **March 2020**:
    -   Add support for PNG images.
    -   Add support for thumbnails in JPEGs.
    -   Major update to version 3.0. However, the actual change is quite small,
        albeit a breaking one if you use that functionality (`.value` on
        rational tags). Rational values are now kept in their original
        numerator/denominator pair instead of being calculated into a float.
        In addition to `.value` on rational tags some descriptions have also
        changed into better ones, e.g. ExposureTime now looks like `1/200`
        instead of `0.005`.
-   **December 2019**:
    -   Add support for HEIC images.
-   **November 2019**:
    -   Add support for ICC color profile tags in JPEG images.
    -   Add support for TIFF images.
    -   Add support for extended XMP.
    -   Add a lot of new tags.
-   **January 2019**:
    -   For Node.js, remove dependency of jDataView and explicit dependency of
        XMLDOM.
    -   Add type definitions for TypeScript.
-   **February, 2018**:
    -   Change license to Mozilla Public License 2.0 (MPL-2.0).
-   **December, 2017**:
    -   Add option to separate different tag groups (Exif, IPTC and XMP).
-   **February, 2017**:
    -   Add support for XMP tags.
-   **December, 2016**:
    -   Merge IPTC branch.
    -   Convert project to JavaScript (ECMAScript 2015) from CoffeeScript,
        transpiling to ES5 using Babel.
    -   Remove need to instantiate the ExifReader object before use.
    -   Add UMD support (CommonJS, AMD and global).
    -   Publish as npm package.
-   **September 17, 2014**:
    -   Lower memory usage by unsetting the file data object after parsing.
    -   Add deleteTag method to be able to delete tags that use a lot of memory,
        e.g. MakerNote.
-   **September 9, 2013**:
    -   Make parsing of APP markers more robust. Fixes problems with some
        pictures.
-   **July 13, 2013**:
    -   Throw Error instead of just strings.
-   **April 23, 2013**:
    -   Support hybrid JFIF-EXIF image files.
-   **April 22, 2013**:
    -   Registered with [Bower](https://bower.io/).
-   **January 8, 2013**:
    -   Updated text about browser support.
-   **January 19, 2012**:
    -   Added text descriptions for the tags.
-   **January 1, 2012**:
    -   First release.
