var ExifReader = require('../../js/ExifReader.js').ExifReader;
var path = require('path');
var fs = require('fs');

// If you don't want to use a wrapper like jDataView, you can wrap Node.js'
// Buffer with the mandatory parts from the DataView interface.
var DataView = (function () {
  function DataView(_data) {
    this._data = _data;
    this.byteLength = this._data.length;
  }
  DataView.prototype.getUint8 = function (offset) {
    return this._data.readUInt8(offset);
  };
  DataView.prototype.getUint16 = function (offset, littleEndian) {
    if ((littleEndian !== null) && littleEndian) {
      return this._data.readUInt16LE(offset);
    }
    return this._data.readUInt16BE(offset);
  };
  DataView.prototype.getUint32 = function (offset, littleEndian) {
    if ((littleEndian !== null) && littleEndian) {
      return this._data.readUInt32LE(offset);
    }
    return this._data.readUInt32BE(offset);
  };
  DataView.prototype.getInt32 = function (offset, littleEndian) {
    if ((littleEndian !== null) && littleEndian) {
      return this._data.readInt32LE(offset);
    }
    return this._data.readInt32BE(offset);
  };
  return DataView;
}());

if (process.argv.length < 3) {
  console.log('Usage: node ' + path.basename(__filename) + ' <filename>');
  process.exit();
}
var path = process.argv[2];

fs.open(path, 'r', function (status, fd) {
  var buffer;

  if (status) {
    console.log(status.message);
    return;
  }

  // We only need the start of the file for the Exif info.
  buffer = new Buffer(128 * 1024);
  fs.read(fd, buffer, 0, 128 * 1024, 0, function (error) {
    var exif, tags, name;

    if (error) {
      console.log('Error reading file.');
      return;
    }

    try {
      exif = new ExifReader();

      // Parse the Exif tags using our simple DataView polyfill.
      exif.loadView(new DataView(buffer));

      // The MakerNote tag can be really large. Remove it to lower memory usage.
      exif.deleteTag('MakerNote');

      // Output the tags.
      tags = exif.getAllTags();
      for (name in tags) {
        if (tags.hasOwnProperty(name)) {
          console.log(name + ': ' + tags[name].description);
        }
      }
    } catch (exception) {
      console.log(exception);
    }

    fs.close(fd);
  });
});
