/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-var */

(function (window) {
    'use strict';

    window.exifReaderError = function (message) {
        var errorContainer = document.querySelector('.error');
        errorContainer.innerHTML = message;
        errorContainer.classList.remove('hidden');
    };

    window.exifReaderClear = function () {
        var errorContainer = document.querySelector('.error');
        errorContainer.classList.add('hidden');
        errorContainer.innerHTML = '';

        var tableBody = document.getElementById('exif-table-body');
        tableBody.innerHTML = '';

        var thumbnail = document.getElementById('thumbnail');
        thumbnail.classList.add('hidden');
        thumbnail.innerHTML = '';
    };

    window.exifReaderListTags = function (tags) {
        var tableBody;
        var name;
        var row;

        tableBody = document.getElementById('exif-table-body');
        for (name in tags) {
            if (tags[name].description !== undefined) {
                row = document.createElement('tr');
                row.innerHTML = '<td>' + name + '</td><td>' + tags[name].description + '</td>';
                tableBody.appendChild(row);
            }
        }
    };
}(window));
