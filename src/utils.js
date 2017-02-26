export function getStringFromDataView(dataView, offset, length) {
    const chars = [];
    for (let i = 0; i < length && offset + i < dataView.byteLength; i++) {
        chars.push(dataView.getUint8(offset + i, false));
    }
    return getAsciiValue(chars).join('');
}

function getAsciiValue(charArray) {
    return charArray.map((charCode) => String.fromCharCode(charCode));
}
