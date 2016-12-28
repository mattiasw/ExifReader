import DataView from 'jdataview';

export {
    getArrayBuffer,
    getDataView,
    getCharacterArray
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
