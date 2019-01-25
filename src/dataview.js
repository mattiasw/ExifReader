export default class DataView {
    constructor(buffer) {
        if (bufferTypeIsUnsupported(buffer)) {
            throw new Error('DataView: Passed buffer type is unsupported.');
        }

        this.buffer = buffer;
        this.byteLength = this.buffer.length;
    }

    getUint8(offset) {
        return this.buffer.readUInt8(offset);
    }

    getUint16(offset, littleEndian) {
        if (littleEndian) {
            return this.buffer.readUInt16LE(offset);
        }
        return this.buffer.readUInt16BE(offset);
    }

    getUint32(offset, littleEndian) {
        if (littleEndian) {
            return this.buffer.readUInt32LE(offset);
        }
        return this.buffer.readUInt32BE(offset);
    }

    getInt32(offset, littleEndian) {
        if (littleEndian) {
            return this.buffer.readInt32LE(offset);
        }
        return this.buffer.readInt32BE(offset);
    }
}

function bufferTypeIsUnsupported(buffer) {
    return typeof buffer !== 'object'
        || buffer.length === undefined
        || buffer.readUInt8 === undefined
        || buffer.readUInt16LE === undefined
        || buffer.readUInt16BE === undefined
        || buffer.readUInt32LE === undefined
        || buffer.readUInt32BE === undefined
        || buffer.readInt32LE === undefined
        || buffer.readInt32BE === undefined;
}
