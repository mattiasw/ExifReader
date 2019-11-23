/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getConsoleWarnSpy, getDataView} from './test-utils';
import {__RewireAPI__ as XmpTagsRewireAPI} from '../src/xmp-tags';
import XmpTags from '../src/xmp-tags';

const PACKET_WRAPPER_START = '<?xpacket begin="ï»¿" id="W5M0MpCehiHzreSzNTczkc9d"?>';
const PACKET_WRAPPER_END = '<?xpacket end="w"?>';
const META_ELEMENT_START = '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.5-c002 1.000000, 0000/00/00-00:00:00        ">';
const META_ELEMENT_END = '</x:xmpmeta>';

describe('xmp-tags', () => {
    describe('without a DOM parser', () => {
        beforeEach(() => {
            XmpTagsRewireAPI.__Rewire__('DOMParser', {
                get() {
                    return undefined;
                }
            });
        });

        afterEach(() => {
            XmpTagsRewireAPI.__ResetDependency__('DOMParser');
        });

        it('should give a warning if a DOM parser is not available', () => {
            const warnSpy = getConsoleWarnSpy();
            const xmlString = getXmlString('');
            const dataView = getDataView(xmlString);

            const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);

            expect(warnSpy.hasWarned).to.be.true;
            expect(tags).to.deep.equal({});

            warnSpy.reset();
        });
    });

    it('should be able to handle zero rdf:Description elements', () => {
        const xmlString = getXmlString('');
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags).to.deep.equal({});
    });

    it('should be able to handle an empty rdf:Description element', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="4711">
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags).to.deep.equal({
            MyXMPTag0: {
                value: '4711',
                attributes: {},
                description: '4711'
            }
        });
    });

    it('should be able to read a normal simple value and ignore namespace definitions', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="4711">
                <xmp:MyXMPTag1 xml:lang="en">4812</xmp:MyXMPTag1>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags).to.deep.equal({
            MyXMPTag0: {
                value: '4711',
                attributes: {},
                description: '4711'
            },
            MyXMPTag1: {
                value: '4812',
                attributes: {
                    lang: 'en'
                },
                description: '4812'
            }
        });
    });

    it('should be able to read a UTF-8 value', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                <xmp:MyXMPTag0>abcÅÄÖáéí</xmp:MyXMPTag0>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags).to.deep.equal({
            MyXMPTag0: {
                value: 'abcÅÄÖáéí',
                attributes: {},
                description: 'abcÅÄÖáéí'
            }
        });
    });

    it('should be able to read a non-ASCII, non-UTF-8 value', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                <xmp:MyXMPTag0>AÃºC</xmp:MyXMPTag0>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags).to.deep.equal({
            MyXMPTag0: {
                value: 'AÃºC',
                attributes: {},
                description: 'AúC'
            }
        });
    });

    it('should translate value for presentation in description property', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:tiff="http://ns.adobe.com/tiff/1.0/">
                <tiff:Orientation>3</tiff:Orientation>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags).to.deep.equal({
            Orientation: {
                value: '3',
                attributes: {},
                description: 'Rotate 180'
            }
        });
    });

    it('should be able to read a nested rdf:Description with qualifier inside a normal simple value', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">
                <xmp:MyXMPTag>
                    <rdf:Description Iptc4xmpCore:MyQualifier0="My qualifier 0">
                        <rdf:value>4711</rdf:value>
                        <Iptc4xmpCore:MyQualifier1>My qualifier 1</Iptc4xmpCore:MyQualifier1>
                    </rdf:Description>
                </xmp:MyXMPTag>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags).to.deep.equal({
            MyXMPTag: {
                value: '4711',
                attributes: {
                    MyQualifier0: 'My qualifier 0',
                    MyQualifier1: 'My qualifier 1'
                },
                description: '4711'
            }
        });
    });

    it('should be able to replace a nested rdf:Description with an rdf:parseType="Resource" attribute', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">
                <xmp:MyXMPTag rdf:parseType="Resource">
                    <rdf:value>4711</rdf:value>
                    <Iptc4xmpCore:MyQualifier>My qualifier</Iptc4xmpCore:MyQualifier>
                </xmp:MyXMPTag>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags).to.deep.equal({
            MyXMPTag: {
                value: '4711',
                attributes: {
                    MyQualifier: 'My qualifier'
                },
                description: '4711'
            }
        });
    });

    it('should be able to read a URI simple value', () => {
        const uri = 'http://example.com/';
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                <xmp:MyXMPURITag rdf:resource="${uri}" xml:lang="en"></xmp:MyXMPURITag>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags).to.deep.equal({
            MyXMPURITag: {
                value: uri,
                attributes: {
                    lang: 'en'
                },
                description: uri
            }
        });
    });

    it('should be able to read a nested rdf:Description inside a URI simple value', () => {
        const uri = 'http://example.com/';
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">
                <xmp:MyXMPURITag xml:lang="en">
                    <rdf:Description Iptc4xmpCore:MyQualifier0="My qualifier 0">
                        <rdf:value rdf:resource="${uri}"/>
                        <Iptc4xmpCore:MyQualifier1>My qualifier 1</Iptc4xmpCore:MyQualifier1>
                    </rdf:Description>
                </xmp:MyXMPURITag>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags).to.deep.equal({
            MyXMPURITag: {
                value: uri,
                attributes: {
                    lang: 'en',
                    MyQualifier0: 'My qualifier 0',
                    MyQualifier1: 'My qualifier 1'
                },
                description: uri
            }
        });
    });

    it('should be able to read a structure value', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                <xmp:MyXMPStructure xml:lang="en">
                    <rdf:Description xmp:MyXMPTag0="47">
                        <xmp:MyXMPTag1 xml:lang="sv">11</xmp:MyXMPTag1>
                    </rdf:Description>
                </xmp:MyXMPStructure>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPStructure']).to.deep.equal({
            value: {
                MyXMPTag0: {
                    value: '47',
                    attributes: {},
                    description: '47'
                },
                MyXMPTag1: {
                    value: '11',
                    attributes: {
                        lang: 'sv'
                    },
                    description: '11'
                }
            },
            attributes: {
                lang: 'en'
            },
            description: 'MyXMPTag0: 47; MyXMPTag1: 11'
        });
    });

    it('should be able to read a structure value as attributes', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                <xmp:MyXMPStructure xmp:MyXMPTag0="47" xmp:MyXMPTag1="11"/>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPStructure']).to.deep.equal({
            value: {
                MyXMPTag0: {
                    value: '47',
                    attributes: {},
                    description: '47'
                },
                MyXMPTag1: {
                    value: '11',
                    attributes: {},
                    description: '11'
                }
            },
            attributes: {},
            description: 'MyXMPTag0: 47; MyXMPTag1: 11'
        });
    });

    it('should be able to read a concise structure value', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                <xmp:MyXMPStructure rdf:parseType="Resource">
                    <xmp:MyXMPTag0>47</xmp:MyXMPTag0>
                    <xmp:MyXMPTag1 xml:lang="en">11</xmp:MyXMPTag1>
                </xmp:MyXMPStructure>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPStructure']).to.deep.equal({
            value: {
                MyXMPTag0: {
                    value: '47',
                    attributes: {},
                    description: '47'
                },
                MyXMPTag1: {
                    value: '11',
                    attributes: {
                        lang: 'en'
                    },
                    description: '11'
                }
            },
            attributes: {},
            description: 'MyXMPTag0: 47; MyXMPTag1: 11'
        });
    });

    it('should be able to read an unordered array value', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                <xmp:MyXMPArray xml:lang="en">
                    <rdf:Bag>
                        <rdf:li>47</rdf:li>
                        <rdf:li xml:lang="sv">11</rdf:li>
                    </rdf:Bag>
                </xmp:MyXMPArray>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPArray']).to.deep.equal({
            value: [
                {
                    value: '47',
                    attributes: {},
                    description: '47'
                },
                {
                    value: '11',
                    attributes: {
                        lang: 'sv'
                    },
                    description: '11'
                }
            ],
            attributes: {
                lang: 'en'
            },
            description: '47, 11'
        });
    });

    it('should be able to read a nested rdf:Description inside an unordered array value', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">
                <xmp:MyXMPArray xml:lang="en">
                    <rdf:Bag>
                        <rdf:li>
                            <rdf:Description xmp:MyXMPTag="AÃºC">
                                <rdf:value>47</rdf:value>
                                <Iptc4xmpCore:MyQualifier>My qualifier</Iptc4xmpCore:MyQualifier>
                            </rdf:Description>
                        </rdf:li>
                        <rdf:li xml:lang="sv">11</rdf:li>
                    </rdf:Bag>
                </xmp:MyXMPArray>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPArray']).to.deep.equal({
            value: [
                {
                    value: '47',
                    attributes: {
                        MyQualifier: 'My qualifier',
                        MyXMPTag: 'AúC'
                    },
                    description: '47'
                },
                {
                    value: '11',
                    attributes: {
                        lang: 'sv'
                    },
                    description: '11'
                }
            ],
            attributes: {
                lang: 'en'
            },
            description: '47, 11'
        });
    });

    it('should be able to read an ordered array value', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                <xmp:MyXMPArray xml:lang="en">
                    <rdf:Seq>
                        <rdf:li>47</rdf:li>
                        <rdf:li xml:lang="sv">11</rdf:li>
                    </rdf:Seq>
                </xmp:MyXMPArray>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPArray']).to.deep.equal({
            value: [
                {
                    value: '47',
                    attributes: {},
                    description: '47'
                },
                {
                    value: '11',
                    attributes: {
                        lang: 'sv'
                    },
                    description: '11'
                }
            ],
            attributes: {
                lang: 'en'
            },
            description: '47, 11'
        });
    });

    it('should be able to read an alternative array value', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                <xmp:MyXMPArray xml:lang="en">
                    <rdf:Alt>
                        <rdf:li>47</rdf:li>
                        <rdf:li xml:lang="sv">11</rdf:li>
                    </rdf:Alt>
                </xmp:MyXMPArray>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPArray']).to.deep.equal({
            value: [
                {
                    value: '47',
                    attributes: {},
                    description: '47'
                },
                {
                    value: '11',
                    attributes: {
                        lang: 'sv'
                    },
                    description: '11'
                }
            ],
            attributes: {
                lang: 'en'
            },
            description: '47, 11'
        });
    });

    it('should be able to read a nested array value', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                <xmp:MyXMPArray xml:lang="en">
                    <rdf:Bag>
                        <rdf:li rdf:parseType="Resource">
                            <xmp:MyXMPTag0>47</xmp:MyXMPTag0>
                            <xmp:MyXMPTag1>11</xmp:MyXMPTag1>
                        </rdf:li>
                        <rdf:li rdf:parseType="Resource">
                            <xmp:MyXMPTag0 xml:lang="sv">48</xmp:MyXMPTag0>
                            <xmp:MyXMPTag1>12</xmp:MyXMPTag1>
                        </rdf:li>
                    </rdf:Bag>
                </xmp:MyXMPArray>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPArray']).to.deep.equal({
            value: [
                {
                    MyXMPTag0: {
                        value: '47',
                        attributes: {},
                        description: '47'
                    },
                    MyXMPTag1: {
                        value: '11',
                        attributes: {},
                        description: '11'
                    }
                },
                {
                    MyXMPTag0: {
                        value: '48',
                        attributes: {
                            lang: 'sv'
                        },
                        description: '48'
                    },
                    MyXMPTag1: {
                        value: '12',
                        attributes: {},
                        description: '12'
                    }
                }
            ],
            attributes: {
                lang: 'en'
            },
            description: 'MyXMPTag0: 47; MyXMPTag1: 11, MyXMPTag0: 48; MyXMPTag1: 12'
        });
    });

    it('should be able to read a nested array value with a single item', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                <xmp:MyXMPArray xml:lang="en">
                    <rdf:Bag>
                        <rdf:li rdf:parseType="Resource">
                            <xmp:MyXMPTag>42</xmp:MyXMPTag>
                        </rdf:li>
                    </rdf:Bag>
                </xmp:MyXMPArray>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPArray']).to.deep.equal({
            value: [
                {
                    MyXMPTag: {
                        value: '42',
                        attributes: {},
                        description: '42'
                    }
                }
            ],
            attributes: {
                lang: 'en'
            },
            description: 'MyXMPTag: 42'
        });
    });

    it('should be able to read an empty array value', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                <xmp:MyXMPArray xml:lang="en">
                    <rdf:Bag />
                </xmp:MyXMPArray>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPArray']).to.deep.equal({
            value: [],
            attributes: {
                lang: 'en'
            },
            description: ''
        });
    });

    it('should use clear key names in description for IPTC Core Creator Contact Info fields', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">
                <Iptc4xmpCore:CreatorContactInfo
                    Iptc4xmpCore:CiAdrCity="My city"
                    Iptc4xmpCore:CiAdrCtry="My country"
                    Iptc4xmpCore:CiAdrExtadr="My address"
                    Iptc4xmpCore:CiAdrPcode="My postal code"
                    Iptc4xmpCore:CiAdrRegion="My region"
                    Iptc4xmpCore:CiEmailWork="creator.name@example.com"
                    Iptc4xmpCore:CiTelWork="+34 123 45 67"
                    Iptc4xmpCore:CiUrlWork="www.creator-name.com"/>
            </rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['CreatorContactInfo']).to.deep.equal({
            value: {
                CiAdrCity: {
                    value: 'My city',
                    attributes: {},
                    description: 'My city'
                },
                CiAdrCtry: {
                    value: 'My country',
                    attributes: {},
                    description: 'My country'
                },
                CiAdrExtadr: {
                    value: 'My address',
                    attributes: {},
                    description: 'My address'
                },
                CiAdrPcode: {
                    value: 'My postal code',
                    attributes: {},
                    description: 'My postal code'
                },
                CiAdrRegion: {
                    value: 'My region',
                    attributes: {},
                    description: 'My region'
                },
                CiEmailWork: {
                    value: 'creator.name@example.com',
                    attributes: {},
                    description: 'creator.name@example.com'
                },
                CiTelWork: {
                    value: '+34 123 45 67',
                    attributes: {},
                    description: '+34 123 45 67'
                },
                CiUrlWork: {
                    value: 'www.creator-name.com',
                    attributes: {},
                    description: 'www.creator-name.com'
                }
            },
            attributes: {},
            description: 'CreatorCity: My city; CreatorCountry: My country; CreatorAddress: My address; CreatorPostalCode: My postal code; CreatorRegion: My region; CreatorWorkEmail: creator.name@example.com; CreatorWorkPhone: +34 123 45 67; CreatorWorkUrl: www.creator-name.com'
        });
    });

    it('should be able to handle multiple rdf:Description elements', () => {
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp"><xmp:MyXMPTag0>47</xmp:MyXMPTag0></rdf:Description>
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp"><xmp:MyXMPTag1>11</xmp:MyXMPTag1></rdf:Description>
        `);
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPTag0'].value).to.equal('47');
        expect(tags['MyXMPTag1'].value).to.equal('11');
    });

    it('should be able to handle XML with a packet wrapper', () => {
        const xmlString = getXmlStringWithPacketWrapper('<rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag="4711"></rdf:Description>');
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPTag'].value).to.equal('4711');
    });

    it('should be able to handle XML with a meta element', () => {
        const xmlString = getXmlStringWithMetaElement('<rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag="4711"></rdf:Description>');
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPTag'].value).to.equal('4711');
    });

    it('should be able to handle XML with a meta element inside a packet wrapper', () => {
        const xmlString = getXmlStringWithMetaElementInsidePacketWrapper('<rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag="4711"></rdf:Description>');
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPTag'].value).to.equal('4711');
    });

    it('should be able to handle XML with a packet wrapper inside a meta element', () => {
        const xmlString = getXmlStringWithPacketWrapperInsideMetaElement('<rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag="4711"></rdf:Description>');
        const dataView = getDataView(xmlString);
        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}]);
        expect(tags['MyXMPTag'].value).to.equal('4711');
    });

    it('should be able to handle multiple chunks where all after the first are parts of a single one', function () {
        const xmlString0 = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="4711">
            </rdf:Description>
        `);
        const extendedXmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag1="42">
            </rdf:Description>
        `);
        const xmlString1 = extendedXmlString.substr(0, 40);
        const xmlString2 = extendedXmlString.substr(40);
        const dataView = getDataView(xmlString0 + xmlString1 + xmlString2);

        const tags = XmpTags.read(dataView, [
            {dataOffset: 0, length: xmlString0.length},
            {dataOffset: xmlString0.length, length: xmlString1.length},
            {dataOffset: xmlString0.length + xmlString1.length, length: xmlString2.length}
        ]);

        expect(tags).to.deep.equal({
            MyXMPTag0: {
                value: '4711',
                attributes: {},
                description: '4711'
            },
            MyXMPTag1: {
                value: '42',
                attributes: {},
                description: '42'
            }
        });
    });
});

function getXmlStringWithPacketWrapper(content) {
    return `${PACKET_WRAPPER_START}
      ${getXmlString(content)}
    ${PACKET_WRAPPER_END}`;
}

function getXmlStringWithMetaElement(content) {
    return `${META_ELEMENT_START}
      ${getXmlString(content)}
    ${META_ELEMENT_END}`;
}

function getXmlStringWithMetaElementInsidePacketWrapper(content) {
    return `${PACKET_WRAPPER_START}
      ${META_ELEMENT_START}
        ${getXmlString(content)}
      ${META_ELEMENT_END}
    ${PACKET_WRAPPER_END}`;
}

function getXmlStringWithPacketWrapperInsideMetaElement(content) {
    return `${META_ELEMENT_START}
      ${PACKET_WRAPPER_START}
        ${getXmlString(content)}
      ${PACKET_WRAPPER_END}
    ${META_ELEMENT_END}`;
}

function getXmlString(content) {
    return `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      ${content}
    </rdf:RDF>`;
}
