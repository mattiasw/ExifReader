(function () {
	// Check that the browser supports the FileReader API.
	if (!window.FileReader) {
		document.write('<strong>Sorry, your web browser does not support the FileReader API.</strong>');
		return;
	}
	var handleFile = function (evt) {
		var files = evt.target.files;
		var reader = new FileReader();
		reader.onload = function (evt) {
			try {
				var exif = new ExifReader();

				// Parse the Exif tags.
				exif.load(evt.target.result);
				// Or, with jDataView you would use this:
				//exif.loadView(new jDataView(evt.target.result));

				// Output the tags on the page.
				var tags = exif.getAllTags();
				var tableBody = document.getElementById('exif-table-body');
				for (var name in tags) {
					var row = document.createElement('tr');
					row.innerHTML = '<td>' + name + '</td><td>' + tags[name].description + '</td>';
					tableBody.appendChild(row);
				}
			}
			catch (error) {
				alert(error);
			}
		};
		reader.readAsArrayBuffer(files[0]);
	};
	window.addEventListener("load", function () {
		document.getElementById("file").addEventListener("change", handleFile, false);
	}, false);
})();
