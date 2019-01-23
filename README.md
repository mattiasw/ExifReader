ExifReader
==========

ExifReader is a JavaScript library that parses image files and extracts the
metadata. It can be used either in a browser or from Node. Supports JPEG files
with tags encoded using Exif, IPTC, and XMP.

ExifReader supports module formats AMD, CommonJS and globals and can therefore
easily be used from Webpack, RequireJS, Browserify, Node etc. Since it is
written using ES2015, you can also import the ES2015 module directly from your
own ES2015 project.

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

Usage
-----

### Importing

ES modules:

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

Notes
-----

Some XMP tags have processed values as descriptions. That means that e.g. an
`Orientation` value of `3` will have `Rotate 180` in the `description` property.
If you would like more XMP tags to have a processed description, please file an
issue or do a pull request.

Some text tags use TextDecoder to decode their content. If your specific
environment does not support it at all or a specific encoding, you will not be
able to see the decoded value. One example is when [Node.js wasn't compiled
with support for the specific encoding](https://nodejs.org/api/util.html#util_whatwg_supported_encodings).

Client/Browser Support
----------------------

The library makes use of the DataView API which is supported in Chrome 9+,
Firefox 15+, Internet Explorer 10+, Edge, Safari 5.1+, Opera 12.1+. If you want
to support a browser or Node.js that doesn't have DataView support, you should
probably use a polyfill like
[jDataView](https://github.com/jDataView/jDataView).

Examples
--------

A full HTML example page is located in the [examples/html/](examples/html/)
directory. The example uses the FileReader API which is supported by the latest
versions of all the major browsers.

Also, there is a Node.js example in the [examples/nodejs/](examples/nodejs/)
directory that uses jDataView to polyfill the DataView API.

Tips
----

-   Only load part of the image file since the Exif info segment has a max size. I suggest 128 kB. See the examples folder for a way to do this.
-   After parsing the tags, consider deleting the MakerNote tag if you know you will load a lot of files and storing the tags. It can be really large for some manufacturers. See the examples folder to see how you can do that.

Testing
-------

Testing is done with [Mocha](https://mochajs.org/) and
[Chai](http://chaijs.com/). Run with:

```bash
npm test
```

Issues
------

-   The descriptions for UserComment, GPSProcessingMethod and GPSAreaInformation are missing for other encodings than ASCII.


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

-   **February, 2018**:
    -   Change license to Mozilla Public License 2.0 (MPL-2.0).
-   **December, 2017**:
    -   Add option to separate different tag groups (Exif, IPTC and XMP).
-   **February, 2017**:
    -   Add support for XMP tags.
-   **December, 2016**:
    -   Merge IPTC branch.
    -   Convert project to JavaScript (ECMAScript 2015) from CoffeeScript, transpiling to ES5 using Babel.
    -   Remove need to instatiate the ExifReader object before use.
    -   Add UMD support (CommonJS, AMD and global).
    -   Publish as npm package.
-   **September 17, 2014**:
    -   Lower memory usage by unsetting the file data object after parsing.
    -   Add deleteTag method to be able to delete tags that use a lot of memory, e.g. MakerNote.
-   **September 9, 2013**:
    -   Make parsing of APP markers more robust. Fixes problems with some pictures.
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
