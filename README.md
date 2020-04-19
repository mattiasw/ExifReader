ExifReader
==========

ExifReader is a JavaScript library that parses image files and extracts the
metadata. It can also extract an embedded thumbnail. It can be used either in a
browser or from Node. Supports JPEG, TIFF, PNG, and HEIC files with Exif, IPTC,
XMP, and ICC meta data (depending on file type).

ExifReader is highly and easliy configurable and the resulting bundle can be as
small as **3 KiB** (gzipped) if you're only interested in a few tags (e.g. date
and/or GPS values). See section below on
[making a custom build](#configure-a-custom-build).

ExifReader supports module formats ESM, AMD, CommonJS, and globals and can
therefore easily be used from Webpack, RequireJS, Browserify, Node etc.

**Notes for exif-js users**

If you come here from the popular but now dead exif-js package, please let me
know if you're missing anything from it and I will try to help you. Some notes:

-   Questions, bug reports, suggestions, and pull requests are very much
    welcome. If you've been using another Exif package you probably have some
    good insights on what's missing in this one.
-   ExifReader has a different API, hopefully better. :-)
-   XMP support in exif-js does not seem perfect. ExifReader should be a bit
    better on that part.
-   ExifReader works with strict mode.
-   exif-js accepts IMG HTML elements as input. This falls outside of the
    functionality of ExifReader. If you need this I suggest looking at exif-js
    source code to see how it's done for your specific case and then pass in the
    resulting data into ExifReader. If many people need this I could add a more
    explicit example for how to do it together with ExifReader.
-   I've been maintaining this package since 2012 and I have no plans to stop
    doing that anytime soon.

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

Type definitions for TypeScript are included in the package. If you're missing
any definitions for tags or something else, a pull-request would be very much
welcome since I'm not using TypeScript myself.

Usage
-----

### Importing

ES modules using a bundler (Webpack, Parcel, etc.):

```javascript
import ExifReader from 'exifreader';
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

```javascript
const tags = ExifReader.load(fileBuffer);
const imageDate = tags['DateTimeOriginal'].description;
const unprocessedTagValue = tags['DateTimeOriginal'].value;
```

By default, Exif, IPTC and XMP tags are grouped together. This means that if
e.g. `Orientation` exists in both Exif and XMP, the first value (Exif) will be
overwritten by the second (XMP). If you need to separate between these values,
pass in an options object with the property `expanded` set to `true`:

```javascript
const tags = ExifReader.load(fileBuffer, {expanded: true});
```

`fileBuffer` must be an `ArrayBuffer` or a `SharedArrayBuffer` for
browsers, or a `Buffer` for Node. See [examples folder](examples/) for more
directions on how to get the file contents in different environments.

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

See [examples/](examples/) directory for more details.

### Configure a custom build

Configuring a custom build can reduce the bundle size significantly.

**NOTE:** This functionality is in beta but should work fine. Please file an
issue if you're having problems or ideas on how to make it better.

This is for npm users that use the built file. To specify what functionality you
want you can either use include pattern (start with an empty set and include) or
exclude pattern (start with full functionality and exclude). If an include
pattern is set, excludes will not be used.

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
tags (resulting bundle will be ~16 % of a full build):

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

Then, if you didn't install ExifReader yet, just run `npm install exifreader`.
Otherwise you have to re-build the library:

```bash
npm rebuild exifreader
```

After that the new bundle is here: `node_modules/exifreader/dist/exif-reader.js`

If you're using the include pattern config, remember to include everything you
want to use. If you want `xmp` and don't specify any file types, you will get
"Invalid image format", and if you specify `jpeg` but don't mention any tag
types no tags will be found.

Possible modules to include or exclude:

| Module      | Description                                                    |
| ----------- | -------------------------------------------------------------- |
| `jpeg`      | JPEG images.                                                   |
| `tiff`      | TIFF images.                                                   |
| `png`       | PNG images.                                                    |
| `heic`      | HEIC/HEIF images.                                              |
| `file`      | JPEG file details: image width, height etc.                    |
| `png_file`  | PNG file details: image width, height etc.                     |
| `exif`      | Regular Exif tags. If excluded, will also exclude `thumbnail`. For TIFF files, excluding this will also exclude IPTC and XMP. |
| `iptc`      | IPTC tags.                                                     |
| `xmp`       | XMP tags.                                                      |
| `icc`       | ICC color profile tags.                                        |
| `thumbnail` | JPEG thumbnail. Needs `exif`.                                  |

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
    (negative).
-   For PNG files, only XMP tags are currently supported. If you are missing
    tags in a PNG file, please open a new issue and supply an example image.
    (Tags in PNGs can be compressed though which will probably be hard to
    support in browsers without the size of the library getting too big.)
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

Client/Browser Support
----------------------

The library makes use of the DataView API which is supported in Chrome 9+,
Firefox 15+, Internet Explorer 10+, Edge, Safari 5.1+, Opera 12.1+. If you want
to support a browser that doesn't have DataView support, you should
probably use a polyfill like
[jDataView](https://github.com/jDataView/jDataView).

Node.js has had support for DataView since version 0.12 but ExifReader will also
try to polyfill it for versions before that (this is not well tested though).

Examples
--------

Full HTML example pages and a Node.js example are located in the
[examples/](examples/) directory.

Tips
----

-   After parsing the tags, consider deleting the MakerNote tag if you know you
    will load a lot of files and storing the tags. It can be really large for
    some manufacturers. See the examples folder to see how you can do that.
-   In some cases it can make sense to only load the beginning of the image
    file. It's unfortunately not possible to know how big the meta data will be
    in an image, but if you limit yourself to regular Exif tags you can most
    probably get by with only reading the first 128 kB. This may exclude IPTC
    and XMP metadata though (and possibly Exif too if they come in an irregular
    order) so please check if this optimization fits your use case.

Testing
-------

Testing is done with [Mocha](https://mochajs.org/) and
[Chai](http://chaijs.com/). Run with:

```bash
npm test
```

Test coverage can be generated like this:

```bash
npm run coverage
```

Known Limitations
-----------------

-   For PNG files, only uncompressed XMP tags are currently supported.
-   For HEIC files, only Exif tags are currently supported.
-   The descriptions for UserComment, GPSProcessingMethod and GPSAreaInformation
    are missing for other encodings than ASCII.

Contributing
------------

See [CONTRIBUTING.md](CONTRIBUTING.md).

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
