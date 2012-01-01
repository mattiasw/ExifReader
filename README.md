ExifReader
==========

ExifReader is a JavaScript library (written in CoffeeScript) that parses image files and extracts the Exif data.

Usage
-----

```javascript
var exif = new ExifReader();
exif.load(fileBuffer);
var imageDate = exif.getTagDescription('DateTimeOriginal');
var allTags = exif.getAllTags();
```

Support
-------

The library makes use of the DataView API which currently only seems to be supported in Chrome 9+. Therefore, if you want to support other browsers or Node.js, you should probably use a wrapper like [jDataView by Christopher Chedeau](https://github.com/vjeux/jDataView/).

Examples
--------

A full HTML example page is located in the examples/html/ directory. Out of the box it only works in Chrome 9+ but with jDataView it should also work in Chrome 6+, Firefox 3.6+, Internet Explorer 10+ and Opera 11.1+. The example uses the FileReader API which as of this writing is not supported in Safari (current version is 5.1).

Also, there is a Node.js example in the example/node/ directory that uses a simple wrapper for the DataView API.

Testing
-------

Testing is done with [jasmine-node](https://github.com/mhevery/jasmine-node/). Use either the Cakefile or jasmine-node directly:

    jasmine-node --coffee spec/

Issues
------

- Only records the raw values for the tags. The parsing of those values into a more readable format is still to be implemented.

Changelog
---------

* **January ?, 2012**:
  * First release.
