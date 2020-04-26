/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringValue} from './tag-names-utils.js';

export default {
    'iptc': {
        0x0100: {
            'name': 'Model Version',
            'description': (value) => {
                return ((value[0] << 8) + value[1]).toString();
            }
        },
        0x0105: {
            'name': 'Destination',
            'repeatable': true
        },
        0x0114: {
            'name': 'File Format',
            'description': (value) => {
                return ((value[0] << 8) + value[1]).toString();
            }
        },
        0x0116: {
            'name': 'File Format Version',
            'description': (value) => {
                return ((value[0] << 8) + value[1]).toString();
            }
        },
        0x011e: 'Service Identifier',
        0x0128: 'Envelope Number',
        0x0132: 'Product ID',
        0x013c: 'Envelope Priority',
        0x0146: {
            'name': 'Date Sent',
            'description': getCreationDate
        },
        0x0150: {
            'name': 'Time Sent',
            'description': getCreationTime
        },
        0x015a: {
            'name': 'Coded Character Set',
            'description': getEncodingName,
            'encoding_name': getEncodingName,
        },
        0x0164: 'UNO',
        0x0178: {
            'name': 'ARM Identifier',
            'description': (value) => {
                return ((value[0] << 8) + value[1]).toString();
            }
        },
        0x017a: {
            'name': 'ARM Version',
            'description': (value) => {
                return ((value[0] << 8) + value[1]).toString();
            }
        },
        0x0200: {
            'name': 'Record Version',
            'description': (value) => {
                return ((value[0] << 8) + value[1]).toString();
            }
        },
        0x0203: 'Object Type Reference',
        0x0204: 'Object Attribute Reference',
        0x0205: 'Object Name',
        0x0207: 'Edit Status',
        0x0208: {
            'name': 'Editorial Update',
            'description': (value) => {
                if (getStringValue(value) === '01') {
                    return 'Additional Language';
                }
                return 'Unknown';
            }
        },
        0x020a: 'Urgency',
        0x020c: {
            'name': 'Subject Reference',
            'repeatable': true,
            'description': (value) => {
                const parts = getStringValue(value).split(':');
                return parts[2] + (parts[3] ? '/' + parts[3] : '') + (parts[4] ? '/' + parts[4] : '');
            }
        },
        0x020f: 'Category',
        0x0214: {
            'name': 'Supplemental Category',
            'repeatable': true
        },
        0x0216: 'Fixture Identifier',
        0x0219: {
            'name': 'Keywords',
            'repeatable': true
        },
        0x021a: {
            'name': 'Content Location Code',
            'repeatable': true
        },
        0x021b: {
            'name': 'Content Location Name',
            'repeatable': true
        },
        0x021e: 'Release Date',
        0x0223: 'Release Time',
        0x0225: 'Expiration Date',
        0x0226: 'Expiration Time',
        0x0228: 'Special Instructions',
        0x022a: {
            'name': 'Action Advised',
            'description': (value) => {
                const string = getStringValue(value);
                if (string === '01') {
                    return 'Object Kill';
                } else if (string === '02') {
                    return 'Object Replace';
                } else if (string === '03') {
                    return 'Object Append';
                } else if (string === '04') {
                    return 'Object Reference';
                }
                return 'Unknown';
            }
        },
        0x022d: {
            'name': 'Reference Service',
            'repeatable': true
        },
        0x022f: {
            'name': 'Reference Date',
            'repeatable': true
        },
        0x0232: {
            'name': 'Reference Number',
            'repeatable': true
        },
        0x0237: {
            'name': 'Date Created',
            'description': getCreationDate
        },
        0x023c: {
            'name': 'Time Created',
            'description': getCreationTime
        },
        0x023e: {
            'name': 'Digital Creation Date',
            'description': getCreationDate
        },
        0x023f: {
            'name': 'Digital Creation Time',
            'description': getCreationTime
        },
        0x0241: 'Originating Program',
        0x0246: 'Program Version',
        0x024b: {
            'name': 'Object Cycle',
            'description': (value) => {
                const string = getStringValue(value);
                if (string === 'a') {
                    return 'morning';
                } else if (string === 'p') {
                    return 'evening';
                } else if (string === 'b') {
                    return 'both';
                }
                return 'Unknown';
            }
        },
        0x0250: {
            'name': 'By-line',
            'repeatable': true
        },
        0x0255: {
            'name': 'By-line Title',
            'repeatable': true
        },
        0x025a: 'City',
        0x025c: 'Sub-location',
        0x025f: 'Province/State',
        0x0264: 'Country/Primary Location Code',
        0x0265: 'Country/Primary Location Name',
        0x0267: 'Original Transmission Reference',
        0x0269: 'Headline',
        0x026e: 'Credit',
        0x0273: 'Source',
        0x0274: 'Copyright Notice',
        0x0276: {
            'name': 'Contact',
            'repeatable': true
        },
        0x0278: 'Caption/Abstract',
        0x027a: {
            'name': 'Writer/Editor',
            'repeatable': true
        },
        0x027d: {
            'name': 'Rasterized Caption',
            'description': (value) => value
        },
        0x0282: 'Image Type',
        0x0283: {
            'name': 'Image Orientation',
            'description': (value) => {
                const string = getStringValue(value);
                if (string === 'P') {
                    return 'Portrait';
                } else if (string === 'L') {
                    return 'Landscape';
                } else if (string === 'S') {
                    return 'Square';
                }
                return 'Unknown';
            }
        },
        0x0287: 'Language Identifier',
        0x0296: {
            'name': 'Audio Type',
            'description': (value) => {
                const stringValue = getStringValue(value);
                const character0 = stringValue.charAt(0);
                const character1 = stringValue.charAt(1);
                let description = '';

                if (character0 === '1') {
                    description += 'Mono';
                } else if (character0 === '2') {
                    description += 'Stereo';
                }

                if (character1 === 'A') {
                    description += ', actuality';
                } else if (character1 === 'C') {
                    description += ', question and answer session';
                } else if (character1 === 'M') {
                    description += ', music, transmitted by itself';
                } else if (character1 === 'Q') {
                    description += ', response to a question';
                } else if (character1 === 'R') {
                    description += ', raw sound';
                } else if (character1 === 'S') {
                    description += ', scener';
                } else if (character1 === 'V') {
                    description += ', voicer';
                } else if (character1 === 'W') {
                    description += ', wrap';
                }

                if (description !== '') {
                    return description;
                }
                return stringValue;
            }
        },
        0x0297: {
            'name': 'Audio Sampling Rate',
            'description': (value) => parseInt(getStringValue(value), 10) + ' Hz'
        },
        0x0298: {
            'name': 'Audio Sampling Resolution',
            'description': (value) => {
                const bits = parseInt(getStringValue(value), 10);
                return bits + (bits === 1 ? ' bit' : ' bits');
            }
        },
        0x0299: {
            'name': 'Audio Duration',
            'description': (value) => {
                const duration = getStringValue(value);
                if (duration.length >= 6) {
                    return duration.substr(0, 2) + ':' + duration.substr(2, 2) + ':' + duration.substr(4, 2);
                }
                return duration;
            }
        },
        0x029a: 'Audio Outcue',
        0x02ba: 'Short Document ID',
        0x02bb: 'Unique Document ID',
        0x02bc: 'Owner ID',
        0x02c8: {
            'name': (value) => {
                if (value.length === 2) {
                    return 'ObjectData Preview File Format';
                }
                return 'Record 2 destination';
            },
            'description': (value) => {
                if (value.length === 2) {
                    const intValue = (value[0] << 8) + value[1];
                    if (intValue === 0) {
                        return 'No ObjectData';
                    } else if (intValue === 1) {
                        return 'IPTC-NAA Digital Newsphoto Parameter Record';
                    } else if (intValue === 2) {
                        return 'IPTC7901 Recommended Message Format';
                    } else if (intValue === 3) {
                        return 'Tagged Image File Format (Adobe/Aldus Image data)';
                    } else if (intValue === 4) {
                        return 'Illustrator (Adobe Graphics data)';
                    } else if (intValue === 5) {
                        return 'AppleSingle (Apple Computer Inc)';
                    } else if (intValue === 6) {
                        return 'NAA 89-3 (ANPA 1312)';
                    } else if (intValue === 7) {
                        return 'MacBinary II';
                    } else if (intValue === 8) {
                        return 'IPTC Unstructured Character Oriented File Format (UCOFF)';
                    } else if (intValue === 9) {
                        return 'United Press International ANPA 1312 variant';
                    } else if (intValue === 10) {
                        return 'United Press International Down-Load Message';
                    } else if (intValue === 11) {
                        return 'JPEG File Interchange (JFIF)';
                    } else if (intValue === 12) {
                        return 'Photo-CD Image-Pac (Eastman Kodak)';
                    } else if (intValue === 13) {
                        return 'Microsoft Bit Mapped Graphics File [*.BMP]';
                    } else if (intValue === 14) {
                        return 'Digital Audio File [*.WAV] (Microsoft & Creative Labs)';
                    } else if (intValue === 15) {
                        return 'Audio plus Moving Video [*.AVI] (Microsoft)';
                    } else if (intValue === 16) {
                        return 'PC DOS/Windows Executable Files [*.COM][*.EXE]';
                    } else if (intValue === 17) {
                        return 'Compressed Binary File [*.ZIP] (PKWare Inc)';
                    } else if (intValue === 18) {
                        return 'Audio Interchange File Format AIFF (Apple Computer Inc)';
                    } else if (intValue === 19) {
                        return 'RIFF Wave (Microsoft Corporation)';
                    } else if (intValue === 20) {
                        return 'Freehand (Macromedia/Aldus)';
                    } else if (intValue === 21) {
                        return 'Hypertext Markup Language "HTML" (The Internet Society)';
                    } else if (intValue === 22) {
                        return 'MPEG 2 Audio Layer 2 (Musicom), ISO/IEC';
                    } else if (intValue === 23) {
                        return 'MPEG 2 Audio Layer 3, ISO/IEC';
                    } else if (intValue === 24) {
                        return 'Portable Document File (*.PDF) Adobe';
                    } else if (intValue === 25) {
                        return 'News Industry Text Format (NITF)';
                    } else if (intValue === 26) {
                        return 'Tape Archive (*.TAR)';
                    } else if (intValue === 27) {
                        return 'Tidningarnas Telegrambyrå NITF version (TTNITF DTD)';
                    } else if (intValue === 28) {
                        return 'Ritzaus Bureau NITF version (RBNITF DTD)';
                    } else if (intValue === 29) {
                        return 'Corel Draw [*.CDR]';
                    }
                    return `Unknown format ${intValue}`;
                }
                return getStringValue(value);
            }
        },
        0x02c9: {
            'name': 'ObjectData Preview File Format Version',
            'description': (value, tags) => {
                // Format ID, Version ID, Version Description
                const formatVersions = {
                    '00': {'00': '1'},
                    '01': {'01': '1', '02': '2', '03': '3', '04': '4'},
                    '02': {'04': '4'},
                    '03': {'01': '5.0', '02': '6.0'},
                    '04': {'01': '1.40'},
                    '05': {'01': '2'},
                    '06': {'01': '1'},
                    '11': {'01': '1.02'},
                    '20': {'01': '3.1', '02': '4.0', '03': '5.0', '04': '5.5'},
                    '21': {'02': '2.0'}
                };
                const stringValue = getStringValue(value);

                if (tags['ObjectData Preview File Format']) {
                    const objectDataPreviewFileFormat = getStringValue(tags['ObjectData Preview File Format'].value);
                    if (formatVersions[objectDataPreviewFileFormat]
                        && formatVersions[objectDataPreviewFileFormat][stringValue]) {
                        return formatVersions[objectDataPreviewFileFormat][stringValue];
                    }
                }

                return stringValue;
            }
        },
        0x02ca: 'ObjectData Preview Data',
        0x070a: {
            'name': 'Size Mode',
            'description': (value) => {
                return (value[0]).toString();
            }
        },
        0x0714: {
            'name': 'Max Subfile Size',
            'description': (value) => {
                let n = 0;
                for (let i = 0; i < value.length; i++) {
                    n = (n << 8) + value[i];
                }
                return n.toString();
            }
        },
        0x075a: {
            'name': 'ObjectData Size Announced',
            'description': (value) => {
                let n = 0;
                for (let i = 0; i < value.length; i++) {
                    n = (n << 8) + value[i];
                }
                return n.toString();
            }
        },
        0x075f: {
            'name': 'Maximum ObjectData Size',
            'description': (value) => {
                let n = 0;
                for (let i = 0; i < value.length; i++) {
                    n = (n << 8) + value[i];
                }
                return n.toString();
            }
        }
    }
};

function getCreationDate(value) {
    const date = getStringValue(value);

    if (date.length >= 8) {
        return date.substr(0, 4) + '-' + date.substr(4, 2) + '-' + date.substr(6, 2);
    }

    return date;
}

function getCreationTime(value) {
    const time = getStringValue(value);
    let parsedTime = time;

    if (time.length >= 6) {
        parsedTime = time.substr(0, 2) + ':' + time.substr(2, 2) + ':' + time.substr(4, 2);
        if (time.length === 11) {
            parsedTime += time.substr(6, 1) + time.substr(7, 2) + ':' + time.substr(9, 2);
        }
    }

    return parsedTime;
}

function getEncodingName(value) {
    const string = getStringValue(value);
    if (string === '\x1b%G') {
        return 'UTF-8';
    } else if (string === '\x1b%5') {
        return 'Windows-1252';
    } else if (string === '\x1b%/G') {
        return 'UTF-8 Level 1';
    } else if (string === '\x1b%/H') {
        return 'UTF-8 Level 2';
    } else if (string === '\x1b%/I') {
        return 'UTF-8 Level 3';
    } else if (string === '\x1B/A') {
        return 'ISO-8859-1';
    } else if (string === '\x1B/B') {
        return 'ISO-8859-2';
    } else if (string === '\x1B/C') {
        return 'ISO-8859-3';
    } else if (string === '\x1B/D') {
        return 'ISO-8859-4';
    } else if (string === '\x1B/@') {
        return 'ISO-8859-5';
    } else if (string === '\x1B/G') {
        return 'ISO-8859-6';
    } else if (string === '\x1B/F') {
        return 'ISO-8859-7';
    } else if (string === '\x1B/H') {
        return 'ISO-8859-8';
    }
    return 'Unknown';
}
