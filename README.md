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

Installation
------------

The easiest way is to use [Bower](https://bower.io/):

    bower install exifreader

Support
-------

The library makes use of the DataView API which is supported in Chrome 9+, Firefox 15+ and Internet Explorer 10+. If you want to support a browser or Node.js that doesn't have DataView support, you should probably use a wrapper like [jDataView by Christopher Chedeau](https://github.com/jDataView/jDataView).

Examples
--------

A full HTML example page is located in the examples/html/ directory. The example uses the FileReader API which is supported by the latest versions of all the major browsers.

Also, there is a Node.js example in the example/node/ directory that uses a simple wrapper for the DataView API.

Tips
----

* Only load part of the image file since the Exif info segment has a max size. I suggest 128 kB. See the examples folder for a way to do this.
* After parsing the tags, consider deleting the MakerNote tag if you know you will have a lot of ExifReader instances. It can be really large for some manufacturers. See the examples folder to see how you can do that.

Testing
-------

Testing is done with [jasmine-node](https://github.com/mhevery/jasmine-node/). Use either the Cakefile or jasmine-node directly:

    jasmine-node --coffee spec/

Issues
------

* The descriptions for UserComment, GPSProcessingMethod and GPSAreaInformation are missing for other encodings than ASCII.

Changelog
---------

* **September 17, 2014**:
  * Lower memory usage by unsetting the file data object after parsing.
  * Add deleteTag method to be able to delete tags that use a lot of memory, e.g. MakerNote.
* **September 9, 2013**:
  * Make parsing of APP markers more robust. Fixes problems with some pictures.
* **July 13, 2013**:
  * Throw Error instead of just strings.
* **April 23, 2013**:
  * Support hybrid JFIF-EXIF image files.
* **April 22, 2013**:
  * Registered with [Bower](http://bower.io/).
* **January 8, 2013**:
  * Updated text about browser support.
* **January 19, 2012**:
  * Added text descriptions for the tags.
* **January 1, 2012**:
  * First release.
