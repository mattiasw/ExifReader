ExifReader
==========

ExifReader is a JavaScript library that parses image files and extracts the
metadata. It can be used either in a browser or from Node. Supports JPEG and
TIFF files with tags encoded using Exif, IPTC, and XMP.

ExifReader supports module formats AMD, CommonJS and globals and can therefore
easily be used from Webpack, RequireJS, Browserify, Node etc. Since it is
written using ES2015+, you can also import the ES module directly from your own
ES2015+ project.

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
-   I've been maintaining this package for close to eight years now and I have
    no plans to stop doing that anytime soon.

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
-   Some XMP tags have processed values as descriptions. That means that e.g. an
    `Orientation` value of `3` will have `Rotate 180` in the `description`
    property. If you would like more XMP tags to have a processed description,
    please file an issue or create a pull request.
-   Some text tags use TextDecoder to decode their content. If your specific
    environment does not support it at all or a specific encoding, you will not
    be able to see the decoded value. One example is when [Node.js wasn't
    compiled with support for the specific encoding](https://nodejs.org/api/util.html#util_whatwg_supported_encodings).

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

-   **November 2019**:
    -   Add support for ICC color profile tags.
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
    -   Remove need to instatiate the ExifReader object before use.
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
