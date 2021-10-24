/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from './test-utils';
import {getCharacterArray} from '../../src/utils';
import IptcTags from '../../src/iptc-tags';

describe('iptc-tags', function () {
    const getResourceBlock = IptcTags.__get__('getResourceBlock');
    const getNaaResourceBlock = IptcTags.__get__('getNaaResourceBlock');
    const readTag = IptcTags.__get__('readTag');

    afterEach(() => {
        IptcTags.__ResetDependency__('IptcTagNames');
    });

    it('should read an IPTC resource block', () => {
        const dataView = getDataView('8BIM\x04\x04\x00\x00\x00\x00\x00\x42');
        const {type, size} = getResourceBlock(dataView, 0);
        expect(type).to.equal(0x0404);
        expect(size).to.equal(0x42);
    });

    it('should fail for IPTC with faulty resource block', () => {
        const dataView = getDataView('XXXX');
        expect(() => getResourceBlock(dataView, 0)).to.throw(/Not an IPTC resource block./);
    });

    it('should find a single IPTC NAA resource block', () => {
        const dataView = getDataView('8BIM\x04\x04\x00\x00\x00\x00\x00\x42');
        const {naaBlock} = getNaaResourceBlock(dataView, 0);
        expect(naaBlock['type']).to.equal(0x0404);
        expect(naaBlock['size']).to.equal(0x42);
    });

    it('should find the IPTC NAA resource block without previous padding', () => {
        const dataView = getDataView('8BIM\x04\x05\x00\x00\x00\x00\x00\x02\x00\x008BIM\x04\x04\x00\x00\x00\x00\x00\x42');
        const {naaBlock} = getNaaResourceBlock(dataView, 0);
        expect(naaBlock['type']).to.equal(0x0404);
        expect(naaBlock['size']).to.equal(0x42);
    });

    it('should find the IPTC NAA resource block with previous padding', () => {
        const dataView = getDataView('8BIM\x04\x05\x00\x00\x00\x00\x00\x01\x00\x008BIM\x04\x04\x00\x00\x00\x00\x00\x42');
        const {naaBlock} = getNaaResourceBlock(dataView, 0);
        expect(naaBlock['type']).to.equal(0x0404);
        expect(naaBlock['size']).to.equal(0x42);
    });

    it('should fail for IPTC header with no NAA resource block', () => {
        const dataView = getDataView('8BIM\x04\x05\x00\x00\x00\x00\x00\x42');
        expect(() => getNaaResourceBlock(dataView, 0)).to.throw(/No IPTC NAA resource block./);
    });

    it('should read IPTC NAA resource tag', () => {
        IptcTags.__with__({
            'IptcTagNames': {
                'iptc': {
                    0x4711: 'MyIptcTag'
                }
            }
        })(() => {
            const dataView = getDataView('\x1c\x47\x11\x00\x02BC');
            const {tag} = readTag(dataView, 0);
            expect(tag.id).to.equal(0x4711);
            expect(tag.name).to.equal('MyIptcTag');
            expect(tag.value).to.deep.equal([0x42, 0x43]);
            expect(tag.description).to.equal('BC');
        });
    });

    it('should read encoded ASCII IPTC NAA resource tag', () => {
        IptcTags.__with__({
            'IptcTagNames': {
                'iptc': {
                    0x4711: 'MyIptcTag'
                }
            }
        })(() => {
            const dataView = getDataView('\x1c\x47\x11\x00\x04\x41\xc3\xba\x43');
            const {tag} = readTag(dataView, 0);
            expect(tag.description).to.equal('AúC');
        });
    });

    it('should read IPTC NAA resource tag with dynamic name', () => {
        IptcTags.__with__({
            'IptcTagNames': {
                'iptc': {
                    0x4711: {
                        'name': (value) => {
                            if (value[0] === 0x42) {
                                return 'MyIptcTag';
                            }
                        },
                        'description': (value) => value
                    }
                }
            }
        })(() => {
            const dataView = getDataView('\x1c\x47\x11\x00\x01\x42');

            const {tag} = readTag(dataView, 0);

            expect(tag.id).to.equal(0x4711);
            expect(tag.name).to.equal('MyIptcTag');
            expect(tag.description).to.deep.equal([0x42]);
        });
    });

    it('should read IPTC NAA resource tag with dynamic description', () => {
        IptcTags.__with__({
            'IptcTagNames': {
                'iptc': {
                    0x4711: {
                        'name': 'MyIptcTag',
                        'description': (value) => {
                            if (value[0] === 0x42) {
                                return 1;
                            }
                        }
                    }
                }
            }
        })(() => {
            const dataView = getDataView('\x1c\x47\x11\x00\x01\x42');
            const {tag} = readTag(dataView, 0);
            expect(tag.id).to.equal(0x4711);
            expect(tag.name).to.equal('MyIptcTag');
            expect(tag.value).to.deep.equal([0x42]);
            expect(tag.description).to.equal(1);
        });
    });

    it('should handle IPTC NAA resource tag with dynamic description that throws', () => {
        IptcTags.__with__({
            'IptcTagNames': {
                'iptc': {
                    0x4711: {
                        'name': 'MyIptcTag',
                        'description': () => {
                            throw new Error();
                        }
                    }
                }
            }
        })(() => {
            const dataView = getDataView('\x1c\x47\x11\x00\x01\x42');
            const {tag} = readTag(dataView, 0);
            expect(tag.id).to.equal(0x4711);
            expect(tag.name).to.equal('MyIptcTag');
            expect(tag.value).to.deep.equal([0x42]);
            expect(tag.description).to.equal('B');
        });
    });

    it('should read included undefined IPTC NAA resource tag', () => {
        const dataView = getDataView('\x1c\x47\x11\x00\x02\x42\x43');
        const {tag} = readTag(dataView, 0, {}, undefined, true);
        expect(tag.id).to.equal(0x4711);
        expect(tag.name).to.equal('undefined-18193');
        expect(tag.value).to.deep.equal([0x42, 0x43]);
        expect(tag.description).to.deep.equal([0x42, 0x43]);
    });

    it('should ignore excluded undefined IPTC NAA resource tag', () => {
        const dataView = getDataView('\x1c\x47\x11\x00\x02\x42\x43');
        const {tag} = readTag(dataView, 0, {}, undefined, false);
        expect(tag).to.be.undefined;
    });

    it('should read multiple IPTC NAA resource tags', () => {
        IptcTags.__with__({
            'IptcTagNames': {
                'iptc': {
                    0x4711: 'MyIptcTag1',
                    0x4712: 'MyIptcTag2'
                }
            }
        })(() => {
            const dataView = getDataView('\x1c\x47\x11\x00\x02BC' + '\x1c\x47\x12\x00\x02DE');
            const {tag: tag1, tagSize} = readTag(dataView, 0);
            const {tag: tag2} = readTag(dataView, 5 + tagSize);
            expect(tag1.id).to.equal(0x4711);
            expect(tag1.name).to.equal('MyIptcTag1');
            expect(tag1.value).to.deep.equal([0x42, 0x43]);
            expect(tag1.description).to.equal('BC');
            expect(tag2.id).to.equal(0x4712);
            expect(tag2.name).to.equal('MyIptcTag2');
            expect(tag2.value).to.deep.equal([0x44, 0x45]);
            expect(tag2.description).to.equal('DE');
        });
    });

    it('should abort reading a tag when the tag is faulty', () => {
        const dataView = getDataView('\x00');
        const {tag} = readTag(dataView, 0);
        expect(tag).to.be.null;
    });

    it('should stop parsing tags when a tag is faulty', () => {
        const dataView = getDataView('8BIM\x04\x04\x00\x00\x00\x00\x00\x0e' + '\x1c\x47\x11\x00\x02BC' + '\x00\x47\x12\x00\x02DE' + '\x1c\x47\x11\x00\x02FG');
        const tags = IptcTags.read(dataView, 0, {}, undefined, true);
        expect(Object.keys(tags).length).to.equal(1);
    });

    it('should read IPTC tags', () => {
        IptcTags.__with__({
            'IptcTagNames': {
                'iptc': {
                    0x4711: 'MyIptcTag1',
                    0x4712: 'MyIptcTag2'
                }
            }
        })(() => {
            const dataView = getDataView('8BIM\x04\x04\x00\x00\x00\x00\x00\x0e' + '\x1c\x47\x11\x00\x02BC' + '\x1c\x47\x12\x00\x02DE');
            const tags = IptcTags.read(dataView, 0);
            expect(tags['MyIptcTag1'].id).to.equal(0x4711);
            expect(tags['MyIptcTag1'].description).to.equal('BC');
            expect(tags['MyIptcTag2'].id).to.equal(0x4712);
            expect(tags['MyIptcTag2'].description).to.equal('DE');
        });
    });

    it('should read IPTC tags from naked IPTC block (TIFF uses this)', () => {
        IptcTags.__with__({
            'IptcTagNames': {
                'iptc': {
                    0x4711: 'MyIptcTag1',
                    0x4712: 'MyIptcTag2'
                }
            }
        })(() => {
            const dataView = getCharacterArray('\x1c\x47\x11\x00\x02BC' + '\x1c\x47\x12\x00\x02DE');
            const tags = IptcTags.read(dataView, 0);
            expect(tags['MyIptcTag1'].id).to.equal(0x4711);
            expect(tags['MyIptcTag1'].description).to.equal('BC');
            expect(tags['MyIptcTag2'].id).to.equal(0x4712);
            expect(tags['MyIptcTag2'].description).to.equal('DE');
        });
    });

    it('should read and decode IPTC tag with encoding', () => {
        let encodingSpy;
        let tagValueSpy;

        IptcTags.__with__({
            'TagDecoder': {
                decode(encoding, tagValue) {
                    encodingSpy = encoding;
                    tagValueSpy = tagValue;
                }
            },
            'IptcTagNames': {
                'iptc': {
                    0x4711: {
                        name: 'MyIptcEncodingTag',
                        encoding_name() {
                            return 'UTF-8';
                        }
                    },
                    0x4712: {
                        name: 'MyIptcTag'
                    }
                }
            }
        })(() => {
            const dataView = getDataView('8BIM\x04\x04\x00\x00\x00\x00\x00\x0e' + '\x1c\x47\x11\x00\x00' + '\x1c\x47\x12\x00\x02BC');
            IptcTags.read(dataView, 0);

            expect(encodingSpy).to.equal('UTF-8');
            expect(tagValueSpy).to.deep.equal(getCharacterArray('BC'));
        });
    });

    describe('using non-ASCII encoding', function () {
        beforeEach(() => {
            this.originalTextDecoder = global.TextDecoder;
            global.TextDecoder = require('util').TextDecoder;
        });

        afterEach(() => {
            global.TextDecoder = this.originalTextDecoder;
        });

        it('should read and decode IPTC tag with ISO-8859-1 encoding', () => {
            const tagsData = '\x1c\x01\x5a\x00\x03\x1b\x2f\x41'
                + '\x1c\x01\x05\x00\x03\x58\x46\x52'
                + '\x1c\x02\x87\x00\x02\x66\x72'
                + '\x1c\x02\x69\x00\x39\x48\x45\x41\x44\x4c\x49\x4e\x45\x3a\x20\x4a\x65\x20\x70\x65\x75\x78\x20\x6d\x61\x6e\x67\x65\x72\x20\x64\x75\x20\x76\x65\x72\x72\x65\x2c\x20\xe7\x61\x20\x6e\x65\x20\x6d\x65\x20\x66\x61\x69\x74\x20\x70\x61\x73\x20\x6d\x61\x6c\x2e'
                + '\x1c\x02\x78\x00\x38\x43\x41\x50\x54\x49\x4f\x4e\x3a\x20\x4a\x65\x20\x70\x65\x75\x78\x20\x6d\x61\x6e\x67\x65\x72\x20\x64\x75\x20\x76\x65\x72\x72\x65\x2c\x20\xe7\x61\x20\x6e\x65\x20\x6d\x65\x20\x66\x61\x69\x74\x20\x70\x61\x73\x20\x6d\x61\x6c\x2e'
                + '\x1c\x02\x37\x00\x08\x32\x30\x31\x39\x30\x31\x31\x34'
                + '\x1c\x02\x3c\x00\x0b\x31\x34\x34\x36\x31\x37\x2b\x30\x30\x30\x30';
            testReadingAndDecodingEncodedTag(
                tagsData,
                'ISO-8859-1',
                'XFR',
                'fr',
                'HEADLINE: Je peux manger du verre, ça ne me fait pas mal.',
                'CAPTION: Je peux manger du verre, ça ne me fait pas mal.'
            );
        });

        it('should read and decode IPTC tag with ISO-8859-2 encoding', () => {
            const tagsData = '\x1c\x01\x5a\x00\x03\x1b\x2f\x42'
                + '\x1c\x01\x05\x00\x03\x58\x50\x4c'
                + '\x1c\x02\x87\x00\x02\x70\x6c'
                + '\x1c\x02\x69\x00\x2b\x48\x45\x41\x44\x4c\x49\x4e\x45\x3a\x20\x4d\x6f\x67\xea\x20\x6a\x65\xb6\xe6\x20\x73\x7a\x6b\xb3\x6f\x20\x69\x20\x6d\x69\x20\x6e\x69\x65\x20\x73\x7a\x6b\x6f\x64\x7a\x69\x2e' + '\x1c\x02\x78\x00\x2a\x43\x41\x50\x54\x49\x4f\x4e\x3a\x20\x4d\x6f\x67\xea\x20\x6a\x65\xb6\xe6\x20\x73\x7a\x6b\xb3\x6f\x20\x69\x20\x6d\x69\x20\x6e\x69\x65\x20\x73\x7a\x6b\x6f\x64\x7a\x69\x2e'
                + '\x1c\x02\x37\x00\x08\x32\x30\x31\x39\x30\x31\x31\x34'
                + '\x1c\x02\x3c\x00\x0b\x31\x34\x34\x36\x31\x37\x2b\x30\x30\x30\x30';
            testReadingAndDecodingEncodedTag(
                tagsData,
                'ISO-8859-2',
                'XPL',
                'pl',
                'HEADLINE: Mogę jeść szkło i mi nie szkodzi.',
                'CAPTION: Mogę jeść szkło i mi nie szkodzi.'
            );
        });

        it('should read and decode IPTC tag with ISO-8859-3 encoding', () => {
            const tagsData = '\x1c\x01\x5a\x00\x03\x1b\x2f\x43'
                + '\x1c\x01\x05\x00\x03\x58\x4d\x54'
                + '\x1c\x02\x87\x00\x02\x6d\x74'
                + '\x1c\x02\x69\x00\x35\x48\x45\x41\x44\x4c\x49\x4e\x45\x3a\x20\x4e\x69\x73\x74\x61\x27\x20\x6e\x69\x65\x6b\x6f\x6c\x20\x69\x6c\x2d\xb1\xf5\x69\x65\xf5\x20\x75\x20\x6d\x61\x20\x6a\x61\x67\xb1\x6d\x69\x6c\x6c\x69\x20\x78\x65\x6a\x6e\x2e'
                + '\x1c\x02\x78\x00\x34\x43\x41\x50\x54\x49\x4f\x4e\x3a\x20\x4e\x69\x73\x74\x61\x27\x20\x6e\x69\x65\x6b\x6f\x6c\x20\x69\x6c\x2d\xb1\xf5\x69\x65\xf5\x20\x75\x20\x6d\x61\x20\x6a\x61\x67\xb1\x6d\x69\x6c\x6c\x69\x20\x78\x65\x6a\x6e\x2e'
                + '\x1c\x02\x37\x00\x08\x32\x30\x31\x39\x30\x31\x31\x34'
                + '\x1c\x02\x3c\x00\x0b\x31\x34\x34\x36\x31\x37\x2b\x30\x30\x30\x30';
            testReadingAndDecodingEncodedTag(
                tagsData,
                'ISO-8859-3',
                'XMT',
                'mt',
                'HEADLINE: Nista\' niekol il-ħġieġ u ma jagħmilli xejn.',
                'CAPTION: Nista\' niekol il-ħġieġ u ma jagħmilli xejn.'
            );
        });

        it('should read and decode IPTC tag with ISO-8859-4 encoding', () => {
            const tagsData = '\x1c\x01\x5a\x00\x03\x1b\x2f\x44'
                + '\x1c\x01\x05\x00\x03\x58\x45\x54'
                + '\x1c\x02\x87\x00\x02\x65\x74'
                + '\x1c\x02\x69\x00\x37\x48\x45\x41\x44\x4c\x49\x4e\x45\x3a\x20\x4d\x61\x20\x76\xf5\x69\x6e\x20\x6b\x6c\x61\x61\x73\x69\x20\x73\xfc\xfc\x61\x2c\x20\x73\x65\x65\x20\x65\x69\x20\x74\x65\x65\x20\x6d\x75\x6c\x6c\x65\x20\x6d\x69\x64\x61\x67\x69\x2e'
                + '\x1c\x02\x78\x00\x36\x43\x41\x50\x54\x49\x4f\x4e\x3a\x20\x4d\x61\x20\x76\xf5\x69\x6e\x20\x6b\x6c\x61\x61\x73\x69\x20\x73\xfc\xfc\x61\x2c\x20\x73\x65\x65\x20\x65\x69\x20\x74\x65\x65\x20\x6d\x75\x6c\x6c\x65\x20\x6d\x69\x64\x61\x67\x69\x2e'
                + '\x1c\x02\x37\x00\x08\x32\x30\x31\x39\x30\x31\x31\x34'
                + '\x1c\x02\x3c\x00\x0b\x31\x34\x34\x36\x31\x37\x2b\x30\x30\x30\x30';
            testReadingAndDecodingEncodedTag(
                tagsData,
                'ISO-8859-4',
                'XET',
                'et',
                'HEADLINE: Ma võin klaasi süüa, see ei tee mulle midagi.',
                'CAPTION: Ma võin klaasi süüa, see ei tee mulle midagi.'
            );
        });

        it('should read and decode IPTC tag with ISO-8859-5 encoding', () => {
            const tagsData = '\x1c\x01\x5a\x00\x03\x1b\x2f\x40'
                + '\x1c\x01\x05\x00\x03\x58\x52\x55'
                + '\x1c\x02\x87\x00\x02\x72\x75'
                + '\x1c\x02\x69\x00\x30\x48\x45\x41\x44\x4c\x49\x4e\x45\x3a\x20\xcf\x20\xdc\xde\xd3\xe3\x20\xd5\xe1\xe2\xec\x20\xe1\xe2\xd5\xda\xdb\xde\x2c\x20\xde\xdd\xde\x20\xdc\xdd\xd5\x20\xdd\xd5\x20\xd2\xe0\xd5\xd4\xd8\xe2\x2e'
                + '\x1c\x02\x78\x00\x2f\x43\x41\x50\x54\x49\x4f\x4e\x3a\x20\xcf\x20\xdc\xde\xd3\xe3\x20\xd5\xe1\xe2\xec\x20\xe1\xe2\xd5\xda\xdb\xde\x2c\x20\xde\xdd\xde\x20\xdc\xdd\xd5\x20\xdd\xd5\x20\xd2\xe0\xd5\xd4\xd8\xe2\x2e'
                + '\x1c\x02\x37\x00\x08\x32\x30\x31\x39\x30\x31\x31\x34'
                + '\x1c\x02\x3c\x00\x0b\x31\x34\x34\x36\x31\x37\x2b\x30\x30\x30\x30';
            testReadingAndDecodingEncodedTag(
                tagsData,
                'ISO-8859-5',
                'XRU',
                'ru',
                'HEADLINE: Я могу есть стекло, оно мне не вредит.',
                'CAPTION: Я могу есть стекло, оно мне не вредит.'
            );
        });

        it('should read and decode IPTC tag with ISO-8859-6 encoding', () => {
            const tagsData = '\x1c\x01\x5a\x00\x03\x1b\x2f\x47'
                + '\x1c\x01\x05\x00\x03\x58\x41\x52'
                + '\x1c\x02\x87\x00\x02\x61\x72'
                + '\x1c\x02\x69\x00\x33\x48\x45\x41\x44\x4c\x49\x4e\x45\x3a\x20\xc3\xe6\xc7\x20\xe2\xc7\xcf\xd1\x20\xd9\xe4\xe9\x20\xc3\xe3\xe4\x20\xc7\xe4\xd2\xcc\xc7\xcc\x20\xe8\x20\xe7\xd0\xc7\x20\xe4\xc7\x20\xea\xc4\xe4\xe5\xe6\xea\x2e\x20'
                + '\x1c\x02\x78\x00\x32\x43\x41\x50\x54\x49\x4f\x4e\x3a\x20\xc3\xe6\xc7\x20\xe2\xc7\xcf\xd1\x20\xd9\xe4\xe9\x20\xc3\xe3\xe4\x20\xc7\xe4\xd2\xcc\xc7\xcc\x20\xe8\x20\xe7\xd0\xc7\x20\xe4\xc7\x20\xea\xc4\xe4\xe5\xe6\xea\x2e\x20'
                + '\x1c\x02\x37\x00\x08\x32\x30\x31\x39\x30\x31\x31\x34'
                + '\x1c\x02\x3c\x00\x0b\x31\x34\x34\x36\x31\x37\x2b\x30\x30\x30\x30';
            testReadingAndDecodingEncodedTag(
                tagsData,
                'ISO-8859-6',
                'XAR',
                'ar',
                'HEADLINE: أنا قادر على أكل الزجاج و هذا لا يؤلمني. ',
                'CAPTION: أنا قادر على أكل الزجاج و هذا لا يؤلمني. '
            );
        });

        it('should read and decode IPTC tag with ISO-8859-7 encoding', () => {
            const tagsData = '\x1c\x01\x5a\x00\x03\x1b\x2f\x46'
                + '\x1c\x01\x05\x00\x03\x58\x45\x4c'
                + '\x1c\x02\x87\x00\x02\x65\x6c'
                + '\x1c\x02\x69\x00\x3c\x48\x45\x41\x44\x4c\x49\x4e\x45\x3a\x20\xcc\xf0\xef\xf1\xfe\x20\xed\xe1\x20\xf6\xdc\xf9\x20\xf3\xf0\xe1\xf3\xec\xdd\xed\xe1\x20\xe3\xf5\xe1\xeb\xe9\xdc\x20\xf7\xf9\xf1\xdf\xf2\x20\xed\xe1\x20\xf0\xdc\xe8\xf9\x20\xf4\xdf\xf0\xef\xf4\xe1\x2e'
                + '\x1c\x02\x78\x00\x3b\x43\x41\x50\x54\x49\x4f\x4e\x3a\x20\xcc\xf0\xef\xf1\xfe\x20\xed\xe1\x20\xf6\xdc\xf9\x20\xf3\xf0\xe1\xf3\xec\xdd\xed\xe1\x20\xe3\xf5\xe1\xeb\xe9\xdc\x20\xf7\xf9\xf1\xdf\xf2\x20\xed\xe1\x20\xf0\xdc\xe8\xf9\x20\xf4\xdf\xf0\xef\xf4\xe1\x2e'
                + '\x1c\x02\x37\x00\x08\x32\x30\x31\x39\x30\x31\x31\x34'
                + '\x1c\x02\x3c\x00\x0b\x31\x34\x34\x36\x31\x37\x2b\x30\x30\x30\x30';
            testReadingAndDecodingEncodedTag(
                tagsData,
                'ISO-8859-7',
                'XEL',
                'el',
                'HEADLINE: Μπορώ να φάω σπασμένα γυαλιά χωρίς να πάθω τίποτα.',
                'CAPTION: Μπορώ να φάω σπασμένα γυαλιά χωρίς να πάθω τίποτα.'
            );
        });

        it('should read and decode IPTC tag with ISO-8859-8 encoding', () => {
            const tagsData = '\x1c\x01\x5a\x00\x03\x1b\x2f\x48'
                + '\x1c\x01\x05\x00\x03\x58\x48\x45'
                + '\x1c\x02\x87\x00\x02\x68\x65'
                + '\x1c\x02\x69\x00\x2f\x48\x45\x41\x44\x4c\x49\x4e\x45\x3a\x20\xe0\xf0\xe9\x20\xe9\xeb\xe5\xec\x20\xec\xe0\xeb\xe5\xec\x20\xe6\xeb\xe5\xeb\xe9\xfa\x20\xe5\xe6\xe4\x20\xec\xe0\x20\xee\xe6\xe9\xf7\x20\xec\xe9\x2e'
                + '\x1c\x02\x78\x00\x2e\x43\x41\x50\x54\x49\x4f\x4e\x3a\x20\xe0\xf0\xe9\x20\xe9\xeb\xe5\xec\x20\xec\xe0\xeb\xe5\xec\x20\xe6\xeb\xe5\xeb\xe9\xfa\x20\xe5\xe6\xe4\x20\xec\xe0\x20\xee\xe6\xe9\xf7\x20\xec\xe9\x2e'
                + '\x1c\x02\x37\x00\x08\x32\x30\x31\x39\x30\x31\x31\x34'
                + '\x1c\x02\x3c\x00\x0b\x31\x34\x34\x36\x31\x37\x2b\x30\x30\x30\x30';
            testReadingAndDecodingEncodedTag(
                tagsData,
                'ISO-8859-8',
                'XHE',
                'he',
                'HEADLINE: אני יכול לאכול זכוכית וזה לא מזיק לי.',
                'CAPTION: אני יכול לאכול זכוכית וזה לא מזיק לי.'
            );
        });

        it('should read and decode IPTC tag with UTF-8 encoding', () => {
            const tagsData = '\x1c\x01\x5a\x00\x03\x1b\x25\x47'
                + '\x1c\x01\x05\x00\x03\x58\x4a\x50'
                + '\x1c\x02\x87\x00\x02\x6a\x70'
                + '\x1c\x02\x69\x00\x55\x48\x45\x41\x44\x4c\x49\x4e\x45\x3a\x20\xe7\xa7\x81\xe3\x81\xaf\xe3\x82\xac\xe3\x83\xa9\xe3\x82\xb9\xe3\x82\x92\xe9\xa3\x9f\xe3\x81\xb9\xe3\x82\x89\xe3\x82\x8c\xe3\x81\xbe\xe3\x81\x99\xe3\x80\x82\xe3\x81\x9d\xe3\x82\x8c\xe3\x81\xaf\xe7\xa7\x81\xe3\x82\x92\xe5\x82\xb7\xe3\x81\xa4\xe3\x81\x91\xe3\x81\xbe\xe3\x81\x9b\xe3\x82\x93\xe3\x80\x82'
                + '\x1c\x02\x78\x00\x54\x43\x41\x50\x54\x49\x4f\x4e\x3a\x20\xe7\xa7\x81\xe3\x81\xaf\xe3\x82\xac\xe3\x83\xa9\xe3\x82\xb9\xe3\x82\x92\xe9\xa3\x9f\xe3\x81\xb9\xe3\x82\x89\xe3\x82\x8c\xe3\x81\xbe\xe3\x81\x99\xe3\x80\x82\xe3\x81\x9d\xe3\x82\x8c\xe3\x81\xaf\xe7\xa7\x81\xe3\x82\x92\xe5\x82\xb7\xe3\x81\xa4\xe3\x81\x91\xe3\x81\xbe\xe3\x81\x9b\xe3\x82\x93\xe3\x80\x82'
                + '\x1c\x02\x37\x00\x08\x32\x30\x31\x39\x30\x31\x31\x34'
                + '\x1c\x02\x3c\x00\x0b\x31\x34\x34\x36\x31\x37\x2b\x30\x30\x30\x30';
            testReadingAndDecodingEncodedTag(
                tagsData,
                'UTF-8',
                'XJP',
                'jp',
                'HEADLINE: 私はガラスを食べられます。それは私を傷つけません。',
                'CAPTION: 私はガラスを食べられます。それは私を傷つけません。'
            );
        });

        function testReadingAndDecodingEncodedTag(tagsData, expectedEncoding, expectedDestination, expectedLangId, expectedHeadline, expectedCaption) {
            const dataView = getDataView('8BIM\x04\x04\x00\x00\x00\x00' + getTagsSize(tagsData) + tagsData);

            const tags = IptcTags.read(dataView, 0);

            expect(tags['Coded Character Set'].description).to.equal(expectedEncoding);
            expect(tags['Destination'].description).to.equal(expectedDestination);
            expect(tags['Language Identifier'].description).to.equal(expectedLangId);

            if (encodingIsSupported(expectedEncoding)) {
                expect(tags['Headline'].description).to.equal(expectedHeadline);
                expect(tags['Caption/Abstract'].description).to.equal(expectedCaption);
            } else {
                // Not all Node.js environments support all encodings. If the
                // Node.js running this test is not compiled with this encoding
                // there is nothing we can do so we just ignore it.
                // More info: https://nodejs.org/api/util.html#util_whatwg_supported_encodings
            }
        }

        function getTagsSize(tagsData) {
            const size = [tagsData.length >> 8, tagsData.length % 256];
            return String.fromCharCode(size[0]) + String.fromCharCode(size[1]);
        }

        function encodingIsSupported(encoding) {
            try {
                new global.TextDecoder(encoding);
                return true;
            } catch (error) {
                return false;
            }
        }
    });

    it('should read repeated IPTC tags', () => {
        IptcTags.__with__({
            'IptcTagNames': {
                'iptc': {
                    0x4711: {
                        name: 'MyIptcTag',
                        repeatable: true
                    }
                }
            }
        })(() => {
            const dataView = getDataView('8BIM\x04\x04\x00\x00\x00\x00\x00\x0e' + '\x1c\x47\x11\x00\x02BC' + '\x1c\x47\x11\x00\x02DE');

            const tags = IptcTags.read(dataView, 0);

            expect(tags).to.deep.equal({
                'MyIptcTag': [
                    {
                        id: 0x4711,
                        value: getCharacterArray('BC'),
                        description: 'BC'
                    },
                    {
                        id: 0x4711,
                        value: getCharacterArray('DE'),
                        description: 'DE'
                    }
                ]
            });
        });
    });
});
