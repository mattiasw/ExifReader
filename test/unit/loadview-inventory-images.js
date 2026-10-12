/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Builders for the synthetic images of loadview-inventory-spec.js. Every
// function returns a fresh latin1 byte string for getDataView.

import {brotliCompressSync, crc32, deflateSync} from 'node:zlib';
import {getByteStringFromNumber} from './test-utils.js';

const IFD_TYPE_BYTE = 1;
const IFD_TYPE_ASCII = 2;
const IFD_TYPE_SHORT = 3;
const IFD_TYPE_LONG = 4;
const IFD_TYPE_RATIONAL = 5;
const IFD_TYPE_UNDEFINED = 7;
const IFD_ENTRY_LENGTH = 12;
const TIFF_HEADER_LENGTH = 8;

export const TAG_MAKE = 0x010f;
export const TAG_MODEL = 0x0110;
export const TAG_SOFTWARE = 0x0131;
export const TAG_APPLICATION_NOTES = 0x02bc;
export const TAG_IPTC_NAA = 0x83bb;
export const TAG_PHOTOSHOP_SETTINGS = 0x8649;
export const TAG_EXIF_IFD_POINTER = 0x8769;
export const TAG_ICC_PROFILE = 0x8773;
export const TAG_GPS_INFO_IFD_POINTER = 0x8825;
export const TAG_IMAGE_SOURCE_DATA = 0x935c;
export const TAG_MAKER_NOTE = 0x927c;
export const TAG_FOCAL_LENGTH = 0x920a;
export const TAG_FOCAL_LENGTH_IN_35MM_FILM = 0xa405;
export const TAG_FOCAL_PLANE_X_RESOLUTION = 0xa20e;
export const TAG_FOCAL_PLANE_Y_RESOLUTION = 0xa20f;
export const TAG_FOCAL_PLANE_RESOLUTION_UNIT = 0xa210;
export const TAG_LENS_MODEL = 0xa434;
export const TAG_GPS_LATITUDE_REF = 0x0001;
export const TAG_GPS_LATITUDE = 0x0002;
export const TAG_MPF_NUMBER_OF_IMAGES = 0xb001;
export const TAG_CANON_LENS_MODEL = 0x0095;

// IFD entry helpers. Each returns {tag, type, count, data} where data is the
// encoded value as a byte string.

export function ascii(tag, text) {
    return {tag, type: IFD_TYPE_ASCII, count: text.length + 1, data: text + '\x00'};
}

export function short(tag, value) {
    return {tag, type: IFD_TYPE_SHORT, count: 1, data: getByteStringFromNumber(value, 2)};
}

export function long(tag, value) {
    return {tag, type: IFD_TYPE_LONG, count: 1, data: getByteStringFromNumber(value, 4)};
}

export function rational(tag, numerator, denominator) {
    return {
        tag,
        type: IFD_TYPE_RATIONAL,
        count: 1,
        data: getByteStringFromNumber(numerator, 4) + getByteStringFromNumber(denominator, 4),
    };
}

export function rationals(tag, pairs) {
    return {
        tag,
        type: IFD_TYPE_RATIONAL,
        count: pairs.length,
        data: pairs.map(([numerator, denominator]) => getByteStringFromNumber(numerator, 4) + getByteStringFromNumber(denominator, 4)).join(''),
    };
}

export function bytes(tag, data) {
    return {tag, type: IFD_TYPE_BYTE, count: data.length, data};
}

export function undefinedBytes(tag, data) {
    return {tag, type: IFD_TYPE_UNDEFINED, count: data.length, data};
}

// A MakerNote whose Canon IFD needs to know its own offset from the TIFF
// header, since Canon maker note values are addressed from there. The data
// is computed when the TIFF is laid out.
export function canonMakerNote(entries) {
    return {
        tag: TAG_MAKER_NOTE,
        type: IFD_TYPE_UNDEFINED,
        count: getIfdBlockLength(entries),
        data: (offset) => getIfdBlock(entries, offset),
    };
}

/**
 * A big-endian TIFF block: header, IFD0 at 8, then the Exif IFD, the GPS IFD
 * and IFD1, each table followed by its own out-of-slot values, then the
 * thumbnail image. Pointer entries and the IFD1 link are added here.
 *
 * @param {{ifd0?: object[], exifIfd?: object[], gpsIfd?: object[], ifd1?: object[], thumbnail?: {image: string, declaredLength?: number, offset?: number}, byteOrderMarker?: string}} parts
 * @returns {string}
 */
export function getTiff({ifd0 = [], exifIfd, gpsIfd, ifd1, thumbnail, byteOrderMarker = 'MM'} = {}) {
    const ifd0Entries = ifd0.slice();
    let nextOffset = TIFF_HEADER_LENGTH + getIfdBlockLength(ifd0Entries)
        + (exifIfd ? IFD_ENTRY_LENGTH : 0)
        + (gpsIfd ? IFD_ENTRY_LENGTH : 0);
    let exifIfdOffset;
    let gpsIfdOffset;
    let ifd1Offset = 0;
    let thumbnailOffset;
    let ifd1Entries;

    if (exifIfd) {
        exifIfdOffset = nextOffset;
        nextOffset += getIfdBlockLength(exifIfd);
        ifd0Entries.push(long(TAG_EXIF_IFD_POINTER, exifIfdOffset));
    }
    if (gpsIfd) {
        gpsIfdOffset = nextOffset;
        nextOffset += getIfdBlockLength(gpsIfd);
        ifd0Entries.push(long(TAG_GPS_INFO_IFD_POINTER, gpsIfdOffset));
    }
    if (ifd1 || thumbnail) {
        ifd1Entries = (ifd1 || []).slice();
        ifd1Offset = nextOffset;
        if (thumbnail) {
            const ifd1Length = getIfdBlockLength(ifd1Entries) + 3 * IFD_ENTRY_LENGTH;
            thumbnailOffset = thumbnail.offset !== undefined ? thumbnail.offset : ifd1Offset + ifd1Length;
            ifd1Entries.push(
                short(0x0103, 6),
                long(0x0201, thumbnailOffset),
                long(0x0202, thumbnail.declaredLength !== undefined ? thumbnail.declaredLength : thumbnail.image.length)
            );
        }
    }

    let tiff = byteOrderMarker + '\x00\x2a' + getByteStringFromNumber(TIFF_HEADER_LENGTH, 4)
        + getIfdBlock(ifd0Entries, TIFF_HEADER_LENGTH, ifd1Offset);
    if (exifIfd) {
        tiff += getIfdBlock(exifIfd, exifIfdOffset);
    }
    if (gpsIfd) {
        tiff += getIfdBlock(gpsIfd, gpsIfdOffset);
    }
    if (ifd1Entries) {
        tiff += getIfdBlock(ifd1Entries, ifd1Offset);
    }
    if (thumbnail && thumbnail.offset === undefined) {
        tiff += thumbnail.image;
    }
    return tiff;
}

function getIfdBlockLength(entries) {
    return 2 + entries.length * IFD_ENTRY_LENGTH + 4
        + entries.reduce((sum, entry) => sum + (isInSlot(entry) ? 0 : getDataLength(entry)), 0);
}

// A value of 4 bytes or fewer sits in the entry's value slot.
function isInSlot(entry) {
    return getDataLength(entry) <= 4;
}

function getDataLength(entry) {
    if (typeof entry.data === 'function') {
        return entry.count;
    }
    return entry.data.length;
}

// Entries sorted by tag, as the TIFF spec requires and the readers assume.
function getIfdBlock(entries, blockOffset, nextIfdOffset = 0) {
    const sortedEntries = entries.slice().sort((a, b) => a.tag - b.tag);
    let dataOffset = blockOffset + 2 + sortedEntries.length * IFD_ENTRY_LENGTH + 4;
    let table = getByteStringFromNumber(sortedEntries.length, 2);
    let data = '';
    for (const entry of sortedEntries) {
        let slot;
        if (isInSlot(entry)) {
            slot = padRight(entry.data, 4);
        } else {
            const entryData = typeof entry.data === 'function' ? entry.data(dataOffset) : entry.data;
            slot = getByteStringFromNumber(dataOffset, 4);
            data += entryData;
            dataOffset += entryData.length;
        }
        table += getByteStringFromNumber(entry.tag, 2)
            + getByteStringFromNumber(entry.type, 2)
            + getByteStringFromNumber(entry.count, 4)
            + slot;
    }
    return table + getByteStringFromNumber(nextIfdOffset, 4) + data;
}

function padRight(data, length) {
    return data + '\x00'.repeat(Math.max(0, length - data.length));
}

// IPTC.

// IIM datasets as the IPTC-NAA Exif tag carries them: no resource block.
export function getIptcDatasets(datasets) {
    return datasets.map(({record, dataset, value}) => '\x1c'
        + getByteStringFromNumber(record, 1)
        + getByteStringFromNumber(dataset, 1)
        + getByteStringFromNumber(value.length, 2)
        + value).join('');
}

// A Photoshop NAA resource block wrapping the datasets, as APP13 and the raw
// profile carry them.
export function getNaaBlock(datasets) {
    const iim = getIptcDatasets(datasets);
    return '8BIM\x04\x04\x00\x00' + getByteStringFromNumber(iim.length, 4) + iim;
}

export function headline(value) {
    return {record: 2, dataset: 0x69, value};
}

export function objectName(value) {
    return {record: 2, dataset: 0x05, value};
}

// A single Photoshop image resource of the given id with the given bytes.
export function getPhotoshopResource(id, data) {
    return '8BIM' + getByteStringFromNumber(id, 2) + '\x00\x00' + getByteStringFromNumber(data.length, 4) + data;
}

// ICC: a header-only profile (128 bytes), which parses to the header tags.
export function getIccProfile(deviceManufacturer) {
    const PROFILE_LENGTH = 128;
    let profile = getByteStringFromNumber(PROFILE_LENGTH, 4);
    profile = padRight(profile, 36) + 'acsp';
    profile = padRight(profile, 48) + deviceManufacturer;
    return padRight(profile, PROFILE_LENGTH);
}

// XMP.

export function getXmpPacket(attributes, {padding = ''} = {}) {
    const attributeText = Object.keys(attributes)
        .map((name) => ` t:${name}="${attributes[name]}"`)
        .join('');
    return '<x:xmpmeta xmlns:x="adobe:ns:meta/">'
        + '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        + `<rdf:Description rdf:about="" xmlns:t="http://ns.example.com/test/"${attributeText}/>`
        + '</rdf:RDF>'
        + padding
        + '</x:xmpmeta>';
}

// JPEG.

export function getJpeg(...segments) {
    return '\xff\xd8' + segments.join('') + '\xff\xd9';
}

export function getAppSegment(marker, content) {
    return marker + getByteStringFromNumber(content.length + 2, 2) + content;
}

export function getExifSegment(tiff) {
    return getAppSegment('\xff\xe1', 'Exif\x00\x00' + tiff);
}

export function getXmpSegment(packet) {
    return getAppSegment('\xff\xe1', 'http://ns.adobe.com/xap/1.0/\x00' + packet);
}

export function getExtendedXmpSegment(guid, totalLength, offset, data) {
    return getAppSegment(
        '\xff\xe1',
        'http://ns.adobe.com/xmp/extension/\x00' + guid
            + getByteStringFromNumber(totalLength, 4) + getByteStringFromNumber(offset, 4) + data
    );
}

export function getIptcSegment(naaBlock) {
    return getAppSegment('\xff\xed', 'Photoshop 3.0\x00' + naaBlock);
}

export function getIccSegment(profile, chunkNumber = 1, chunksTotal = 1) {
    return getAppSegment(
        '\xff\xe2',
        'ICC_PROFILE\x00' + getByteStringFromNumber(chunkNumber, 1) + getByteStringFromNumber(chunksTotal, 1) + profile
    );
}

export function getMpfSegment(tiff) {
    return getAppSegment('\xff\xe2', 'MPF\x00' + tiff);
}

export function getJfifSegment() {
    return getAppSegment('\xff\xe0', 'JFIF\x00' + '\x01\x02\x00' + '\x00\x01\x00\x01' + '\x00\x00');
}

export function getSof0Segment({width = 1, height = 1} = {}) {
    return getAppSegment('\xff\xc0', '\x08' + getByteStringFromNumber(height, 2) + getByteStringFromNumber(width, 2) + '\x03'
        + '\x01\x11\x00' + '\x02\x11\x01' + '\x03\x11\x01');
}

// PNG.

const PNG_SIGNATURE = '\x89PNG\r\n\x1a\n';

export function getPng(...chunks) {
    return PNG_SIGNATURE
        + getPngChunk('IHDR', getByteStringFromNumber(1, 4) + getByteStringFromNumber(1, 4) + '\x08\x02\x00\x00\x00')
        + chunks.join('')
        + getPngChunk('IEND', '');
}

export function getPngChunk(type, data) {
    const crc = crc32(Buffer.from(type + data, 'latin1'));
    return getByteStringFromNumber(data.length, 4) + type + data + getByteStringFromNumber(crc, 4);
}

export function getTextChunk(keyword, text) {
    return getPngChunk('tEXt', keyword + '\x00' + text);
}

export function getZtxtChunk(keyword, text) {
    return getPngChunk('zTXt', keyword + '\x00' + '\x00' + deflate(text));
}

export function getRawProfile(type, data) {
    return `\n${type}\n${String(data.length).padStart(8, ' ')}\n${toHex(data)}`;
}

export function getExifRawProfile(tiff) {
    return getRawProfile('exif', 'Exif\x00\x00' + tiff);
}

export function getIptcRawProfile(naaBlock) {
    return getRawProfile('iptc', naaBlock);
}

export function getExifChunk(tiff) {
    return getPngChunk('eXIf', tiff);
}

export function getIccpChunk(profileName, compressionMethod, compressedProfile) {
    return getPngChunk('iCCP', profileName + '\x00' + getByteStringFromNumber(compressionMethod, 1) + compressedProfile);
}

export function getXmpChunk(packet) {
    return getPngChunk('iTXt', 'XML:com.adobe.xmp\x00' + '\x00\x00' + '\x00' + '\x00' + packet);
}

export function getPhysChunk() {
    return getPngChunk('pHYs', getByteStringFromNumber(2835, 4) + getByteStringFromNumber(2835, 4) + '\x01');
}

// An IDAT chunk of ignored bytes, to grow the file for the size-bound tests.
export function getPaddingChunk(length) {
    return getPngChunk('IDAT', '\x00'.repeat(length));
}

export function deflate(text) {
    return deflateSync(Buffer.from(text, 'latin1')).toString('latin1');
}

export function toHex(data) {
    return Buffer.from(data, 'latin1').toString('hex');
}

// JXL.

export function getJxl(...boxes) {
    const JXL_SIGNATURE = '\x00\x00\x00\x0cJXL \x0d\x0a\x87\x0a';
    const FTYP_BOX = '\x00\x00\x00\x14ftypjxl \x00\x00\x00\x00jxl ';
    return JXL_SIGNATURE + FTYP_BOX + boxes.join('');
}

export function getBox(type, content) {
    return getByteStringFromNumber(8 + content.length, 4) + type + content;
}

export function getExifBox(tiff) {
    return getBox('Exif', getByteStringFromNumber(0, 4) + tiff);
}

export function getXmlBox(packet) {
    return getBox('xml ', packet);
}

export function getBrobBox(originalType, data) {
    return getBox('brob', originalType + brotli(data));
}

export function getJxlcBox() {
    return getBox('jxlc', '\xff\x0a' + '\x00'.repeat(16));
}

// A free-space box of ignored bytes, to grow the file for the size-bound tests.
export function getPaddingBox(length) {
    return getBox('free', '\x00'.repeat(length));
}

export function brotli(data) {
    return brotliCompressSync(Buffer.from(data, 'latin1')).toString('latin1');
}

// WebP and GIF, for the file-only orderings.

export function getWebp() {
    const vp8x = '\x00' + '\x00\x00\x00' + getLittleEndian(0, 3) + getLittleEndian(0, 3);
    const chunks = 'VP8X' + getLittleEndian(vp8x.length, 4) + vp8x;
    return 'RIFF' + getLittleEndian(4 + chunks.length, 4) + 'WEBP' + chunks;
}

export function getGif() {
    return 'GIF89a' + getLittleEndian(1, 2) + getLittleEndian(1, 2) + '\x00\x00\x00' + '\x3b';
}

function getLittleEndian(number, numBytes) {
    return getByteStringFromNumber(number, numBytes).split('').reverse().join('');
}
