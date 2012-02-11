var ExifReader = require('../../js/ExifReader.js').ExifReader;
var path = require('path');
var fs = require('fs');

// If you don't want to use a wrapper like jDataView, you can wrap Node.js'
// Buffer with the mandatory parts from the DataView interface.
var DataView = (function() {
	function DataView(_data) {
		this._data = _data;
		this.byteLength = this._data.length;
	}
	DataView.prototype.getUint8 = function(offset) {
		return this._data.readUInt8(offset);
	};
	DataView.prototype.getUint16 = function(offset, littleEndian) {
		if ((littleEndian != null) && littleEndian) {
			return this._data.readUInt16LE(offset);
		} else {
			return this._data.readUInt16BE(offset);
		}
	};
	DataView.prototype.getUint32 = function(offset, littleEndian) {
		if ((littleEndian != null) && littleEndian) {
			return this._data.readUInt32LE(offset);
		} else {
			return this._data.readUInt32BE(offset);
		}
	};
	DataView.prototype.getInt32 = function(offset, littleEndian) {
		if ((littleEndian != null) && littleEndian) {
			return this._data.readInt32LE(offset);
		} else {
			return this._data.readInt32BE(offset);
		}
	};
	return DataView;
})();

if (process.argv.length < 3) {
	console.log('Usage: node ' + path.basename(__filename) + ' <filename>');
	return;
}
var path = process.argv[2];

fs.readFile(path, function (err, data) {
	if (err) {
		console.log('Error reading file.');
		return;
	}

	try {
		var exif = new ExifReader();

		// Parse the Exif tags.
		exif.load(data);
		// Or, with jDataView you would use this:
		//exif.loadView(new jDataView(data));

		// Output the tags.
		var tags = exif.getAllTags();
		for (name in tags)
			console.log(name + ': ' + tags[name].description);
	}
	catch (error) {
		console.log(error);
	}
});
