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
        var errorContainer;
        var tableBody;
        var thumbnail;

        errorContainer = document.querySelector('.error');
        errorContainer.classList.add('hidden');
        errorContainer.innerHTML = '';

        tableBody = document.getElementById('exif-table-body');
        tableBody.innerHTML = '';

        thumbnail = document.getElementById('thumbnail');
        thumbnail.classList.add('hidden');
        thumbnail.innerHTML = '';
    };

    window.exifReaderListTags = function (tags) {
        var tableBody;
        var name;
        var description;
        var row;

        tableBody = document.getElementById('exif-table-body');
        for (name in tags) {
            description = getDescription(tags[name]);
            if (description !== undefined) {
                row = document.createElement('tr');
                row.innerHTML = '<td>' + name + '</td><td>' + description + '</td>';
                tableBody.appendChild(row);
            }
        }
    };

    function getDescription(tag) {
        if (Array.isArray(tag)) {
            return tag.map((item) => item.description).join(', ');
        }
        return tag.description;
    }
}(window));
