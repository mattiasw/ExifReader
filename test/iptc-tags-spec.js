import {expect} from 'chai';
import {getDataView} from './test-utils';
import {getCharacterArray} from '../src/tag-names-utils';
import IptcTags from '../src/iptc-tags';

describe('iptc-tags', () => {
    const getResourceBlock = IptcTags.__get__('getResourceBlock');
    const getNaaResourceBlock = IptcTags.__get__('getNaaResourceBlock');
    const readTag = IptcTags.__get__('readTag');

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
        IptcTags.__set__('IptcTagNames', {
            'iptc': {
                0x4711: 'MyIptcTag'
            }
        });
        const dataView = getDataView('\x1c\x47\x11\x00\x02BC');
        const {tag} = readTag(dataView, 0);
        expect(tag.name).to.equal('MyIptcTag');
        expect(tag.value).to.deep.equal([0x42, 0x43]);
        expect(tag.description).to.equal('BC');

        IptcTags.__set__('IptcTagNames', {'iptc': {}});
    });

    it('should read IPTC NAA resource tag with dynamic description', () => {
        IptcTags.__set__('IptcTagNames', {
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
        });
        const dataView = getDataView('\x1c\x47\x11\x00\x01\x42');
        const {tag} = readTag(dataView, 0);
        expect(tag.name).to.equal('MyIptcTag');
        expect(tag.value).to.deep.equal([0x42]);
        expect(tag.description).to.equal(1);

        IptcTags.__set__('IptcTagNames', {'iptc': {}});
    });

    it('should read undefined IPTC NAA resource tag', () => {
        const dataView = getDataView('\x1c\x47\x11\x00\x02\x42\x43');
        const {tag} = readTag(dataView, 0);
        expect(tag.name).to.equal('undefined-18193');
        expect(tag.value).to.deep.equal([0x42, 0x43]);
        expect(tag.description).to.deep.equal([0x42, 0x43]);
    });

    it('should read multiple IPTC NAA resource tags', () => {
        IptcTags.__set__('IptcTagNames', {
            'iptc': {
                0x4711: 'MyIptcTag1',
                0x4712: 'MyIptcTag2'
            }
        });
        const dataView = getDataView('\x1c\x47\x11\x00\x02BC' + '\x1c\x47\x12\x00\x02DE');
        const {tag: tag1, tagSize} = readTag(dataView, 0);
        const {tag: tag2} = readTag(dataView, 5 + tagSize);
        expect(tag1.name).to.equal('MyIptcTag1');
        expect(tag1.value).to.deep.equal([0x42, 0x43]);
        expect(tag1.description).to.equal('BC');
        expect(tag2.name).to.equal('MyIptcTag2');
        expect(tag2.value).to.deep.equal([0x44, 0x45]);
        expect(tag2.description).to.equal('DE');

        IptcTags.__set__('IptcTagNames', {'iptc': {}});
    });

    it('should read IPTC tags', () => {
        IptcTags.__set__('IptcTagNames', {
            'iptc': {
                0x4711: 'MyIptcTag1',
                0x4712: 'MyIptcTag2'
            }
        });
        const dataView = getDataView('8BIM\x04\x04\x00\x00\x00\x00\x00\x0e' + '\x1c\x47\x11\x00\x02BC' + '\x1c\x47\x12\x00\x02DE');
        const tags = IptcTags.read(dataView, 0);
        expect(tags['MyIptcTag1'].description).to.equal('BC');
        expect(tags['MyIptcTag2'].description).to.equal('DE');

        IptcTags.__set__('IptcTagNames', {'iptc': {}});
    });

    it('should read repeated IPTC tags', () => {
        IptcTags.__set__('IptcTagNames', {
            'iptc': {
                0x4711: {
                    name: 'MyIptcTag',
                    repeatable: true
                }
            }
        });
        const dataView = getDataView('8BIM\x04\x04\x00\x00\x00\x00\x00\x0e' + '\x1c\x47\x11\x00\x02BC' + '\x1c\x47\x11\x00\x02DE');
        const tags = IptcTags.read(dataView, 0);
        expect(tags['MyIptcTag'][0].value).to.deep.equal(getCharacterArray('BC'));
        expect(tags['MyIptcTag'][0].description).to.equal('BC');
        expect(tags['MyIptcTag'][1].value).to.deep.equal(getCharacterArray('DE'));
        expect(tags['MyIptcTag'][1].description).to.equal('DE');

        IptcTags.__set__('IptcTagNames', {'iptc': {}});
    });
});
