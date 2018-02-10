/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getCharacterArray} from '../src/tag-names-utils';
import TagNames from '../src/iptc-tag-names';

const IptcTagNames = TagNames['iptc'];

describe('iptc-tag-names', () => {
    it('should report correct name and description for Coded Character Set', () => {
        expect(IptcTagNames[0x015a].name).to.equal('Coded Character Set');
        expect(IptcTagNames[0x015a].description(getCharacterArray('\x1b%G'))).to.equal('UTF-8');
        expect(IptcTagNames[0x015a].description(getCharacterArray('\x1b%/G'))).to.equal('UTF-8 Level 1');
        expect(IptcTagNames[0x015a].description(getCharacterArray('\x1b%/H'))).to.equal('UTF-8 Level 2');
        expect(IptcTagNames[0x015a].description(getCharacterArray('\x1b%/I'))).to.equal('UTF-8 Level 3');
    });

    it('should report correct name and description for Record Version', () => {
        expect(IptcTagNames[0x0200].name).to.equal('Record Version');
        expect(IptcTagNames[0x0200].description(getCharacterArray('\x00\x04'))).to.equal('4');
    });

    it('should have tag Object Type Reference', () => {
        expect(IptcTagNames[0x0203]).to.equal('Object Type Reference');
    });

    it('should have tag Object Attribute Reference', () => {
        expect(IptcTagNames[0x0204]).to.equal('Object Attribute Reference');
    });

    it('should have tag Object Name', () => {
        expect(IptcTagNames[0x0205]).to.equal('Object Name');
    });

    it('should have tag Edit Status', () => {
        expect(IptcTagNames[0x0207]).to.equal('Edit Status');
    });

    it('should report correct name and description for Editorial Update', () => {
        expect(IptcTagNames[0x0208].name).to.equal('Editorial Update');
        expect(IptcTagNames[0x0208].description(getCharacterArray('01'))).to.equal('Additional Language');
    });

    it('should report "Unknown" as description for unknown Editorial Update value', () => {
        expect(IptcTagNames[0x0208].description(getCharacterArray('02'))).to.equal('Unknown');
    });

    it('should have tag Urgency', () => {
        expect(IptcTagNames[0x020a]).to.equal('Urgency');
    });

    it('should report correct name, repeatability and description for Subject Reference', () => {
        expect(IptcTagNames[0x020c].name).to.equal('Subject Reference');
        expect(IptcTagNames[0x020c].repeatable).to.be.true;
        expect(IptcTagNames[0x020c].description(getCharacterArray('IPTC:04001001:Economy, Business & Finance:Agriculture:Arable Farming'))).to.equal('Economy, Business & Finance/Agriculture/Arable Farming');
    });

    it('should have tag Category', () => {
        expect(IptcTagNames[0x020f]).to.equal('Category');
    });

    it('should report correct name and repeatability for repeated Supplemental Category', () => {
        expect(IptcTagNames[0x0214].name).to.equal('Supplemental Category');
        expect(IptcTagNames[0x0214].repeatable).to.be.true;
    });

    it('should have tag Fixture Identifier', () => {
        expect(IptcTagNames[0x0216]).to.equal('Fixture Identifier');
    });

    it('should report correct name and repeatability for repeated Keywords', () => {
        expect(IptcTagNames[0x0219].name).to.equal('Keywords');
        expect(IptcTagNames[0x0219].repeatable).to.be.true;
    });

    it('should report correct name and repeatability for repeated Content Location Code', () => {
        expect(IptcTagNames[0x021a].name).to.equal('Content Location Code');
        expect(IptcTagNames[0x021a].repeatable).to.be.true;
    });

    it('should report correct name and repeatability for repeated Content Location Name', () => {
        expect(IptcTagNames[0x021b].name).to.equal('Content Location Name');
        expect(IptcTagNames[0x021b].repeatable).to.be.true;
    });

    it('should have tag Release Date', () => {
        expect(IptcTagNames[0x021e]).to.equal('Release Date');
    });

    it('should have tag Release Time', () => {
        expect(IptcTagNames[0x0223]).to.equal('Release Time');
    });

    it('should have tag Expiration Date', () => {
        expect(IptcTagNames[0x0225]).to.equal('Expiration Date');
    });

    it('should have tag Expiration Time', () => {
        expect(IptcTagNames[0x0226]).to.equal('Expiration Time');
    });

    it('should have tag Special Instructions', () => {
        expect(IptcTagNames[0x0228]).to.equal('Special Instructions');
    });

    it('should report correct name and description for Action Advised', () => {
        expect(IptcTagNames[0x022a].name).to.equal('Action Advised');
        expect(IptcTagNames[0x022a].description(getCharacterArray('01'))).to.equal('Object Kill');
        expect(IptcTagNames[0x022a].description(getCharacterArray('02'))).to.equal('Object Replace');
        expect(IptcTagNames[0x022a].description(getCharacterArray('03'))).to.equal('Object Append');
        expect(IptcTagNames[0x022a].description(getCharacterArray('04'))).to.equal('Object Reference');
        expect(IptcTagNames[0x022a].description(getCharacterArray('99'))).to.equal('Unknown');
    });

    it('should report correct name and repeatability for repeated Reference Service', () => {
        expect(IptcTagNames[0x022d].name).to.equal('Reference Service');
        expect(IptcTagNames[0x022d].repeatable).to.be.true;
    });

    it('should report correct name and repeatability for repeated Reference Date', () => {
        expect(IptcTagNames[0x022f].name).to.equal('Reference Date');
        expect(IptcTagNames[0x022f].repeatable).to.be.true;
    });

    it('should report correct name and repeatability for repeated Reference Number', () => {
        expect(IptcTagNames[0x0232].name).to.equal('Reference Number');
        expect(IptcTagNames[0x0232].repeatable).to.be.true;
    });

    it('should report correct name and description for Date Created', () => {
        expect(IptcTagNames[0x0237].name).to.equal('Date Created');
        expect(IptcTagNames[0x0237].description(getCharacterArray('19900127'))).to.equal('1990-01-27');
    });

    it('should report correct name and description for Time Created', () => {
        expect(IptcTagNames[0x023c].name).to.equal('Time Created');
        expect(IptcTagNames[0x023c].description(getCharacterArray('133015'))).to.equal('13:30:15');
        expect(IptcTagNames[0x023c].description(getCharacterArray('133015+0100'))).to.equal('13:30:15+01:00');
    });

    it('should report correct name and description for Digital Creation Date', () => {
        expect(IptcTagNames[0x023e].name).to.equal('Digital Creation Date');
        expect(IptcTagNames[0x023e].description(getCharacterArray('19900127'))).to.equal('1990-01-27');
    });

    it('should report correct name and description for Digital Creation Time', () => {
        expect(IptcTagNames[0x023f].name).to.equal('Digital Creation Time');
        expect(IptcTagNames[0x023f].description(getCharacterArray('133015'))).to.equal('13:30:15');
        expect(IptcTagNames[0x023f].description(getCharacterArray('133015+0100'))).to.equal('13:30:15+01:00');
    });

    it('should have tag Originating Program', () => {
        expect(IptcTagNames[0x0241]).to.equal('Originating Program');
    });

    it('should have tag Program Version', () => {
        expect(IptcTagNames[0x0246]).to.equal('Program Version');
    });

    it('should report correct name and description for Object Cycle', () => {
        expect(IptcTagNames[0x024b].name).to.equal('Object Cycle');
        expect(IptcTagNames[0x024b].description(getCharacterArray('a'))).to.equal('morning');
        expect(IptcTagNames[0x024b].description(getCharacterArray('p'))).to.equal('evening');
        expect(IptcTagNames[0x024b].description(getCharacterArray('b'))).to.equal('both');
        expect(IptcTagNames[0x024b].description(getCharacterArray('99'))).to.equal('Unknown');
    });

    it('should report correct name and repeatability for By-line', () => {
        expect(IptcTagNames[0x0250].name).to.equal('By-line');
        expect(IptcTagNames[0x0250].repeatable).to.be.true;
    });

    it('should report correct name and repeatability for By-line Title', () => {
        expect(IptcTagNames[0x0255].name).to.equal('By-line Title');
        expect(IptcTagNames[0x0255].repeatable).to.be.true;
    });

    it('should have tag City', () => {
        expect(IptcTagNames[0x025a]).to.equal('City');
    });

    it('should have tag Sub-location', () => {
        expect(IptcTagNames[0x025c]).to.equal('Sub-location');
    });

    it('should have tag Province/State', () => {
        expect(IptcTagNames[0x025f]).to.equal('Province/State');
    });

    it('should have tag Country/Primary Location Code', () => {
        expect(IptcTagNames[0x0264]).to.equal('Country/Primary Location Code');
    });

    it('should have tag Country/Primary Location Name', () => {
        expect(IptcTagNames[0x0265]).to.equal('Country/Primary Location Name');
    });

    it('should have tag Original Transmission Reference', () => {
        expect(IptcTagNames[0x0267]).to.equal('Original Transmission Reference');
    });

    it('should have tag Headline', () => {
        expect(IptcTagNames[0x0269]).to.equal('Headline');
    });

    it('should have tag Credit', () => {
        expect(IptcTagNames[0x026e]).to.equal('Credit');
    });

    it('should have tag Source', () => {
        expect(IptcTagNames[0x0273]).to.equal('Source');
    });

    it('should have tag Copyright Notice', () => {
        expect(IptcTagNames[0x0274]).to.equal('Copyright Notice');
    });

    it('should report correct name and repeatability for Contact', () => {
        expect(IptcTagNames[0x0276].name).to.equal('Contact');
        expect(IptcTagNames[0x0276].repeatable).to.be.true;
    });

    it('should have tag Caption/Abstract', () => {
        expect(IptcTagNames[0x0278]).to.equal('Caption/Abstract');
    });

    it('should report correct name and repeatability for Writer/Editor', () => {
        expect(IptcTagNames[0x027a].name).to.equal('Writer/Editor');
        expect(IptcTagNames[0x027a].repeatable).to.be.true;
    });

    it('should report correct name and description for Rasterized Caption', () => {
        expect(IptcTagNames[0x027d].name).to.equal('Rasterized Caption');
        expect(IptcTagNames[0x027d].description(0x4711)).to.equal(0x4711);
    });

    it('should have tag Image Type', () => {
        expect(IptcTagNames[0x0282]).to.equal('Image Type');
    });

    it('should report correct name and description for Image Orientation', () => {
        expect(IptcTagNames[0x0283].name).to.equal('Image Orientation');
        expect(IptcTagNames[0x0283].description(getCharacterArray('P'))).to.equal('Portrait');
        expect(IptcTagNames[0x0283].description(getCharacterArray('L'))).to.equal('Landscape');
        expect(IptcTagNames[0x0283].description(getCharacterArray('S'))).to.equal('Square');
        expect(IptcTagNames[0x0283].description(getCharacterArray('Z'))).to.equal('Unknown');
    });

    it('should have tag Language Identifier', () => {
        expect(IptcTagNames[0x0287]).to.equal('Language Identifier');
    });

    it('should report correct name and description for Audio Type', () => {
        expect(IptcTagNames[0x0296].name).to.equal('Audio Type');
        expect(IptcTagNames[0x0296].description(getCharacterArray('0T'))).to.equal('0T');
        expect(IptcTagNames[0x0296].description(getCharacterArray('1A'))).to.equal('Mono, actuality');
        expect(IptcTagNames[0x0296].description(getCharacterArray('2A'))).to.equal('Stereo, actuality');
        expect(IptcTagNames[0x0296].description(getCharacterArray('1C'))).to.equal('Mono, question and answer session');
        expect(IptcTagNames[0x0296].description(getCharacterArray('1M'))).to.equal('Mono, music, transmitted by itself');
        expect(IptcTagNames[0x0296].description(getCharacterArray('1Q'))).to.equal('Mono, response to a question');
        expect(IptcTagNames[0x0296].description(getCharacterArray('1R'))).to.equal('Mono, raw sound');
        expect(IptcTagNames[0x0296].description(getCharacterArray('1S'))).to.equal('Mono, scener');
        expect(IptcTagNames[0x0296].description(getCharacterArray('1V'))).to.equal('Mono, voicer');
        expect(IptcTagNames[0x0296].description(getCharacterArray('1W'))).to.equal('Mono, wrap');
    });

    it('should report correct name and description for Audio Sampling Rate', () => {
        expect(IptcTagNames[0x0297].name).to.equal('Audio Sampling Rate');
        expect(IptcTagNames[0x0297].description(getCharacterArray('000000'))).to.equal('0 Hz');
        expect(IptcTagNames[0x0297].description(getCharacterArray('000001'))).to.equal('1 Hz');
        expect(IptcTagNames[0x0297].description(getCharacterArray('044100'))).to.equal('44100 Hz');
        expect(IptcTagNames[0x0297].description(getCharacterArray('176400'))).to.equal('176400 Hz');
    });

    it('should report correct name and description for Audio Sampling Resolution', () => {
        expect(IptcTagNames[0x0298].name).to.equal('Audio Sampling Resolution');
        expect(IptcTagNames[0x0298].description(getCharacterArray('00'))).to.equal('0 bits');
        expect(IptcTagNames[0x0298].description(getCharacterArray('01'))).to.equal('1 bit');
        expect(IptcTagNames[0x0298].description(getCharacterArray('02'))).to.equal('2 bits');
        expect(IptcTagNames[0x0298].description(getCharacterArray('16'))).to.equal('16 bits');
    });

    it('should report correct name and description for Audio Duration', () => {
        expect(IptcTagNames[0x0299].name).to.equal('Audio Duration');
        expect(IptcTagNames[0x0299].description(getCharacterArray('120105'))).to.equal('12:01:05');
    });

    it('should have tag Audio Outcue', () => {
        expect(IptcTagNames[0x029a]).to.equal('Audio Outcue');
    });

    it('should report correct name and description for ObjectData Preview File Format', () => {
        expect(IptcTagNames[0x02c8].name).to.equal('ObjectData Preview File Format');
        const fileFormats = {
            '00': 'No ObjectData',
            '01': 'IPTC-NAA Digital Newsphoto Parameter Record',
            '02': 'IPTC7901 Recommended Message Format',
            '03': 'Tagged Image File Format (Adobe/Aldus Image data)',
            '04': 'Illustrator (Adobe Graphics data)',
            '05': 'AppleSingle (Apple Computer Inc)',
            '06': 'NAA 89-3 (ANPA 1312)',
            '07': 'MacBinary II',
            '08': 'IPTC Unstructured Character Oriented File Format (UCOFF)',
            '09': 'United Press International ANPA 1312 variant',
            '10': 'United Press International Down-Load Message',
            '11': 'JPEG File Interchange (JFIF)',
            '12': 'Photo-CD Image-Pac (Eastman Kodak)',
            '13': 'Microsoft Bit Mapped Graphics File [*.BMP]',
            '14': 'Digital Audio File [*.WAV] (Microsoft & Creative Labs)',
            '15': 'Audio plus Moving Video [*.AVI] (Microsoft)',
            '16': 'PC DOS/Windows Executable Files [*.COM][*.EXE]',
            '17': 'Compressed Binary File [*.ZIP] (PKWare Inc)',
            '18': 'Audio Interchange File Format AIFF (Apple Computer Inc)',
            '19': 'RIFF Wave (Microsoft Corporation)',
            '20': 'Freehand (Macromedia/Aldus)',
            '21': 'Hypertext Markup Language "HTML" (The Internet Society)',
            '22': 'MPEG 2 Audio Layer 2 (Musicom), ISO/IEC',
            '23': 'MPEG 2 Audio Layer 3, ISO/IEC',
            '24': 'Portable Document File (*.PDF) Adobe',
            '25': 'News Industry Text Format (NITF)',
            '26': 'Tape Archive (*.TAR)',
            '27': 'Tidningarnas Telegrambyrå NITF version (TTNITF DTD)',
            '28': 'Ritzaus Bureau NITF version (RBNITF DTD)',
            '29': 'Corel Draw [*.CDR]',
            '99': 'Unknown format 99'
        };
        for (const id in fileFormats) {
            expect(IptcTagNames[0x02c8].description(getCharacterArray(id))).to.equal(fileFormats[id]);
        }
    });

    it('should report correct name and description for ObjectData Preview File Format Version', () => {
        expect(IptcTagNames[0x02c9].name).to.equal('ObjectData Preview File Format Version');
        const formatVersions = [
            ['00', '00', '1'],
            ['01', '01', '1'],
            ['01', '02', '2'],
            ['01', '03', '3'],
            ['01', '04', '4'],
            ['02', '04', '4'],
            ['03', '01', '5.0'],
            ['03', '02', '6.0'],
            ['04', '01', '1.40'],
            ['05', '01', '2'],
            ['06', '01', '1'],
            ['11', '01', '1.02'],
            ['20', '01', '3.1'],
            ['20', '02', '4.0'],
            ['20', '03', '5.0'],
            ['20', '04', '5.5'],
            ['21', '02', '2.0']
        ];
        for (const version of formatVersions) {
            const tags = {
                'ObjectData Preview File Format': {
                    value: getCharacterArray(version[0])
                }
            };
            expect(IptcTagNames[0x02c9].description(getCharacterArray(version[1]), tags)).to.equal(version[2]);
        }
    });

    it('should report correct description for unknown ObjectData Preview File Format Version', () => {
        expect(IptcTagNames[0x02c9].description(getCharacterArray('47'), {})).to.equal('47');
    });

    it('should have tag ObjectData Preview Data', () => {
        expect(IptcTagNames[0x02ca]).to.equal('ObjectData Preview Data');
    });
});
