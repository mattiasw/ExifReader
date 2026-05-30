export function get64BitValue(dataView, offset) {
    // It's a bit tricky to handle 64 bit numbers in JavaScript. Let's
    // wait until there are real-world examples where it is necessary.
    return dataView.getUint32(offset + 4);
}

/**
 * @param {DataView} dataView
 * @param {number} offset
 * @param {number} length
 * @returns {boolean} Whether [offset, offset + length) is within the DataView,
 *     i.e. those bytes can be read without a RangeError.
 */
export function hasBytes(dataView, offset, length) {
    return offset + length <= dataView.byteLength;
}
