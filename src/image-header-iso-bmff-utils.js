export function get64BitValue(dataView, offset) {
    // It's a bit tricky to handle 64 bit numbers in JavaScript. Let's
    // wait until there are real-world examples where it is necessary.
    return dataView.getUint32(offset + 4);
}
