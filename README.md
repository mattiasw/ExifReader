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

The library makes use of the DataView API which is supported in Chrome 9+, Firefox 15+ and Internet Explorer 10+. If you want to support a browser or Node.js that doesn't have DataView support, you should probably use a wrapper like [jDataView by Christopher Chedeau](https://github.com/vjeux/jDataView/).

Examples
--------

A full HTML example page is located in the examples/html/ directory. The example uses the FileReader API which is supported by the latest versions of all the major browsers.

Also, there is a Node.js example in the example/node/ directory that uses a simple wrapper for the DataView API.

Testing
-------

Testing is done with [jasmine-node](https://github.com/mhevery/jasmine-node/). Use either the Cakefile or jasmine-node directly:

    jasmine-node --coffee spec/

Issues
------

* The descriptions for UserComment, GPSProcessingMethod and GPSAreaInformation are missing for other encodings than ASCII.

Changelog
---------

* **April 22, 2013**:
  * Registered with [Bower](http://bower.io/).
* **January 8, 2013**:
  * Updated text about browser support.
* **January 19, 2012**:
  * Added text descriptions for the tags.
* **January 1, 2012**:
  * First release.
