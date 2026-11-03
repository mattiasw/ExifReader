/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getStringValue} from './tag-names-utils.js';

export function getModelVersionDescription(value) {
    return ((value[0] << 8) + value[1]).toString();
}

export function getFileFormatDescription(value) {
    return ((value[0] << 8) + value[1]).toString();
}

export function getFileFormatVersionDescription(value) {
    return ((value[0] << 8) + value[1]).toString();
}

export function getARMIdentifierDescription(value) {
    return ((value[0] << 8) + value[1]).toString();
}

export function getARMVersionDescription(value) {
    return ((value[0] << 8) + value[1]).toString();
}

export function getRecordVersionDescription(value) {
    return ((value[0] << 8) + value[1]).toString();
}

export function getEditorialUpdateDescription(value) {
    if (getStringValue(value) === '01') {
        return 'Additional Language';
    }
    return 'Unknown';
}

export function getSubjectReferenceDescription(value) {
    const parts = getStringValue(value).split(':');
    return parts[2] + (parts[3] ? '/' + parts[3] : '') + (parts[4] ? '/' + parts[4] : '');
}

export function getActionAdvisedDescription(value) {
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

export function getObjectCycleDescription(value) {
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

export function getRasterizedCaptionDescription(value) {
    return value;
}

export function getImageOrientationDescription(value) {
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

export function getAudioTypeDescription(value) {
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

export function getAudioSamplingRateDescription(value) {
    return parseInt(getStringValue(value), 10) + ' Hz';
}

export function getAudioSamplingResolutionDescription(value) {
    const bits = parseInt(getStringValue(value), 10);
    return bits + (bits === 1 ? ' bit' : ' bits');
}

export function getAudioDurationDescription(value) {
    const duration = getStringValue(value);
    if (duration.length >= 6) {
        return duration.substr(0, 2) + ':' + duration.substr(2, 2) + ':' + duration.substr(4, 2);
    }
    return duration;
}

export function getRecord2DestinationDescription(value) {
    if (value.length === 2) {
        const intValue = getPreviewNumber(value);
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

export function getObjectDataPreviewFileFormatVersionDescription(value, tags) {
    // Format ID, Version ID, Version Description
    const formatVersions = {
        0: {0: '1'},
        1: {1: '1', 2: '2', 3: '3', 4: '4'},
        2: {4: '4'},
        3: {1: '5.0', 2: '6.0'},
        4: {1: '1.40'},
        5: {1: '2'},
        6: {1: '1'},
        11: {1: '1.02'},
        20: {1: '3.1', 2: '4.0', 3: '5.0', 4: '5.5'},
        21: {2: '2.0'}
    };
    const version = getPreviewNumber(value);

    if (tags['ObjectData Preview File Format']) {
        const format = getPreviewNumber(tags['ObjectData Preview File Format'].value);
        if (Object.prototype.hasOwnProperty.call(formatVersions, format)
            && Object.prototype.hasOwnProperty.call(formatVersions[format], version)) {
            return formatVersions[format][version];
        }
    }

    const versionNumber = getBinaryNumber(value);
    return versionNumber === null ? getStringValue(value) : String(versionNumber);
}

export function getSizeModeDescription(value) {
    return (value[0]).toString();
}

export function getMaxSubfileSizeDescription(value) {
    let n = 0;
    for (let i = 0; i < value.length; i++) {
        n = (n << 8) + value[i];
    }
    return n.toString();
}

export function getObjectDataSizeAnnouncedDescription(value) {
    let n = 0;
    for (let i = 0; i < value.length; i++) {
        n = (n << 8) + value[i];
    }
    return n.toString();
}

export function getMaximumObjectDataSizeDescription(value) {
    let n = 0;
    for (let i = 0; i < value.length; i++) {
        n = (n << 8) + value[i];
    }
    return n.toString();
}

export function getCreationDate(value) {
    const date = getStringValue(value);

    if (date.length >= 8) {
        return date.substr(0, 4) + '-' + date.substr(4, 2) + '-' + date.substr(6, 2);
    }

    return date;
}

export function getCreationTime(value) {
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

export function getEncodingName(value) {
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

// IIM stores 2:200 and 2:201 as 2-octet binary; two ASCII digits are the text form.
function getPreviewNumber(value) {
    const number = getBinaryNumber(value);
    return number === null ? parseInt(getStringValue(value), 10) : number;
}

function getBinaryNumber(value) {
    if (value.length !== 2 || (isAsciiDigit(value[0]) && isAsciiDigit(value[1]))) {
        return null;
    }
    return (value[0] << 8) + value[1];
}

function isAsciiDigit(octet) {
    return octet >= 0x30 && octet <= 0x39;
}
