/*

	Modified version to try to recover Independence images from Picasa
		Currently gneerates sql batch file; more work is needed
*/

var ExifReader = require('../../js/ExifReader.js').ExifReader;
var jDataView = require('../../js/jdataview.js');
var path = require('path');
var fs = require('fs');

// Quick and dirty--maybe replace later?
// array = [{key:value},{key:value}]
function objectFindByKey(array, key, value) {
    for (var i = 0; i < array.length; i++) {
        if (array[i][key] === value) {
            return array[i];
        }
    }
    return null;
}

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
var directory = process.argv[2];
var lookup = {},
	match = {},
  aid, coord;

// This is the file that will allow us to "assign" images to asset records

// Read in file contents as an array of strings
var syncro = fs.readFileSync('aid-cart.txt').toString().split("\n");

// Split each line into an element of the object array lookup
for(i in syncro) {
    var pieces = syncro[i].split('|')

		// Grrrr.  Hours to find this null line thing!!
		if (typeof(pieces[1]) != 'string')
		  break;

		aid = pieces[0].trim()
	  coord = pieces[1].trim()
		match[coord] = aid
		// console.log(JSON.stringify(match))
		lookup[coord] = aid
		match = {}
	}
// console.log(JSON.stringify(lookup))
var files = fs.readdirSync(directory);

// Generate a line of SQL for each file
//   The "big trick" is that there can be multiple images for a marker
files.forEach(function (path) {
	var justPath = path;
	path = directory + path;
	// console.log('Processing: ' + path);
	fs.readFile(path, function (err, data) {
		if (err) {
			console.log('Error reading file.');
			return;
		}

		try {
			var exif = new ExifReader();

			// Parse the Exif tags.
			// exif.load(data);
			// Or, with jDataView you would use this:
			exif.loadView(new jDataView(data));

			// Output the tags.
			var tags = exif.getAllTags();
			// console.log(justPath);
			var index, subLocation;

			for (name in tags) {
			  // console.log(name + '*');tags[name].description
			  var pattern = /Sub-location/;
				if (pattern.test(name)) {
				  // We're only interested in one IPTC tag, subLocation
					subLocation = tags[name].description;
					// console.log('Finding for ' + subLocation)
					// index = objectFindByKey(lookup, 'coord', subLocation)
					// console.log('Got index of ' + index)
					// if (index > -1) {
						// "Allocate" this aid and remove it from lookup table
						// console.log("About to look up " + subLocation)
						aid = lookup[subLocation]
						// console.log('Got ' + aid)
						delete(lookup[subLocation])
						// lookup.splice(index, 1);
					// }
					console.log("update asset set imagename = '" + justPath +
					  "' where aid = '" + aid + "');'");
					// console.log('Value of sublocation = ' + subLocation);
			console.log('\r')
		}
	}
}
		catch (error) {
			console.log(error);
		}
	});
});
