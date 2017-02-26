import DataView from 'jdataview';

export {
    getArrayBuffer,
    getDataView,
    getCharacterArray,
    getConsoleWarnSpy
};

function getArrayBuffer(data) {
    const buffer = new Buffer(data.length);
    for (let i = 0; i < data.length; i++) {
        buffer[i] = data.charCodeAt(i);
    }
    return buffer;
}

function getDataView(data) {
    return new DataView(getArrayBuffer(data));
}

function getCharacterArray(string) {
    return string.split('').map((character) => character.charCodeAt(0));
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
