const MIN_DATA_BUFFER_LENGTH = 2;
const JPEG_ID = 0xffd8;
const JPEG_ID_SIZE = 2;
const APP_ID_OFFSET = 4;
const APP_MARKER_SIZE = 2;
const TIFF_HEADER_OFFSET = 10;  // From start of APP1 marker.
const IPTC_DATA_OFFSET = 18;  // From start of APP13 marker.
const APP0_MARKER = 0xffe0;
const APP1_MARKER = 0xffe1;
const APP13_MARKER = 0xffed;
const APP15_MARKER = 0xffef;
const COMMENT_MARKER = 0xfffe;
const BYTES_Exif = 0x45786966;

export default {
    check,
    parseAppMarkers
};

function check(dataView) {
    if ((dataView.byteLength < MIN_DATA_BUFFER_LENGTH) || (dataView.getUint16(0, false) !== JPEG_ID)) {
        throw new Error('Invalid image format');
    }
}

function parseAppMarkers(dataView) {
    let appMarkerPosition = JPEG_ID_SIZE;
    let fieldLength;
    let tiffHeaderOffset;
    let iptcDataOffset;

    while (appMarkerPosition + APP_ID_OFFSET + 5 <= dataView.byteLength) {
        if (isApp1ExifMarker(dataView, appMarkerPosition)) {
            fieldLength = dataView.getUint16(appMarkerPosition + APP_MARKER_SIZE, false);
            tiffHeaderOffset = appMarkerPosition + TIFF_HEADER_OFFSET;
        } else if (isApp13PhotoshopMarker(dataView, appMarkerPosition)) {
            fieldLength = dataView.getUint16(appMarkerPosition + APP_MARKER_SIZE, false);
            iptcDataOffset = appMarkerPosition + IPTC_DATA_OFFSET;
        } else if (isAppMarker(dataView, appMarkerPosition)) {
            fieldLength = dataView.getUint16(appMarkerPosition + APP_MARKER_SIZE, false);
        } else {
            break;
        }
        appMarkerPosition += APP_MARKER_SIZE + fieldLength;
    }

    return {
        hasAppMarkers: appMarkerPosition > JPEG_ID_SIZE,
        tiffHeaderOffset,
        iptcDataOffset
    };
}

function isApp1ExifMarker(dataView, appMarkerPosition) {
    return (dataView.getUint16(appMarkerPosition, false) === APP1_MARKER)
        && (dataView.getUint32(appMarkerPosition + APP_ID_OFFSET, false) === BYTES_Exif)
        && (dataView.getUint8(appMarkerPosition + APP_ID_OFFSET + 4, false) === 0x00);
}

function isApp13PhotoshopMarker(dataView, appMarkerPosition) {
    return (dataView.getUint16(appMarkerPosition, false) === APP13_MARKER)
        && (getString(dataView, appMarkerPosition + APP_ID_OFFSET, 13) === 'Photoshop 3.0')
        && (dataView.getUint8(appMarkerPosition + APP_ID_OFFSET + 13, false) === 0x00);
}

function getString(dataView, offset, length) {
    const chars = [];
    for (let i = 0; i < length; i++) {
        chars.push(dataView.getUint8(offset + i, false));
    }
    return getAsciiValue(chars).join('');
}

function getAsciiValue(charArray) {
    return charArray.map((charCode) => String.fromCharCode(charCode));
}

function isAppMarker(dataView, appMarkerPosition) {
    const appMarker = dataView.getUint16(appMarkerPosition, false);
    return ((appMarker >= APP0_MARKER) && (appMarker <= APP15_MARKER))
        || (appMarker === COMMENT_MARKER);
}
