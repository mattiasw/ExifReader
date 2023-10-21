/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export {
    getArrayBuffer,
    getDataView,
    concatDataViews,
    getByteStringFromNumber,
    getConsoleWarnSpy
};

function getArrayBuffer(data) {
    return Buffer.from(Array.from(data).map((character) => character.charCodeAt(0)));
}

function getDataView(data) {
    // Bytes in data are not always ASCII characters so TextEncoder sometimes encodes them as two bytes which we don't want.
    const dataView = new DataView(new ArrayBuffer(data.length));
    for (let i = 0; i < data.length; i++) {
        dataView.setUint8(i, data.charCodeAt(i));
    }
    return dataView;
}

function concatDataViews(dataView0, dataView1) {
    const data = new Uint8Array(dataView0.byteLength + dataView1.byteLength);
    data.set(new Uint8Array(dataView0.buffer), 0);
    data.set(new Uint8Array(dataView1.buffer), dataView0.byteLength);
    return new DataView(data.buffer);
}

function getByteStringFromNumber(number, numBytes) {
    const bytes = [];
    for (let i = 0; i < numBytes; i++) {
        const rest = number % 256;
        bytes.push(String.fromCharCode(rest));
        number = (number - rest) / 256;
    }
    return bytes.reverse().join('');
}

function getConsoleWarnSpy() {
    /* eslint-disable no-console */
    const originalConsoleWarn = console.warn;

    const warnSpy = function () {
        warnSpy.hasWarned = true;
    };
    warnSpy.hasWarned = false;
    warnSpy.reset = function () {
        console.warn = originalConsoleWarn;
    };

    console.warn = warnSpy;

    return warnSpy;
    /* eslint-enable no-console */
}
