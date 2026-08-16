/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {DOMParser as XmldomDomParser, onErrorStopParsing} from '@xmldom/xmldom';
import {DOMParser as LinkedomDomParser} from 'linkedom';
import {getConsoleWarnSpy, getDataView, swapProperties} from './test-utils.js';
import {createRequire} from 'node:module';
import DomParserModule from '../../src/dom-parser.js';
import XmpTags from '../../src/xmp-tags.js';
import XmpTagNames from '../../src/xmp-tag-names.js';

const PACKET_WRAPPER_START = '<?xpacket begin="ï»¿" id="W5M0MpCehiHzreSzNTczkc9d"?>';
const PACKET_WRAPPER_END = '<?xpacket end="w"?>';
const META_ELEMENT_START = '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.5-c002 1.000000, 0000/00/00-00:00:00        ">';
const META_ELEMENT_END = '</x:xmpmeta>';

describe('xmp-tags', function () {
    beforeEach(() => {
        this.originalNonWebpackRequire = global.__non_webpack_require__;
        global.__non_webpack_require__ = createRequire(import.meta.url);
    });

    afterEach(() => {
        global.__non_webpack_require__ = this.originalNonWebpackRequire;
    });

    describe('without a DOM parser', () => {
        let restoreDomParser;

        beforeEach(() => {
            restoreDomParser = swapProperties(DomParserModule, {
                get() {
                    return undefined;
                }
            });
        });

        afterEach(() => {
            restoreDomParser();
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

    const domParsers = {
        'auto-imported xmldom': undefined,
        'xmldom': new XmldomDomParser({onError: onErrorStopParsing}),
        'linkedom': new LinkedomDomParser()
    };

    for (const domParserName in domParsers) {
        const domParser = domParsers[domParserName];

        describe(`with ${domParserName}`, () => {
            it('should be able to handle zero rdf:Description elements', () => {
                const xmlString = getXmlString('');
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
                });
            });

            it('should be able to handle an empty rdf:Description element', () => {
                const xmlString = getXmlString(`
                    <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="4711">
                    </rdf:Description>
                `);
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
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

            it('should be able to handle duplicate tags', () => {
                const xmlString = getXmlString(`
                    <rdf:Description xmlns:exif='http://ns.adobe.com/exif/1.0/'>
                        <exif:MyXMPTag>4812</exif:MyXMPTag>
                        <exif:MyXMPTag>4813</exif:MyXMPTag>
                    </rdf:Description>
                `);
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
                    MyXMPTag: {
                        value: '4813',
                        attributes: {},
                        description: '4813'
                    }
                });
            });

            it('should be able to handle resource tags with non-zero length, white space-only content', () => {
                const xmlString = getXmlString(`
                    <rdf:Description xmlns:exif='http://ns.adobe.com/exif/1.0/'>
                        <exif:MyXMPTag rdf:parseType="Resource">
                        </exif:MyXMPTag>
                    </rdf:Description>
                `);
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
                    MyXMPTag: {
                        value: '',
                        attributes: {},
                        description: ''
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
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

            it('should be able to read an unordered array with a concise structure value', () => {
                const xmlString = getXmlString(`
                    <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                        <xmp:MyXMPArray xml:lang="en">
                            <rdf:Bag>
                                <rdf:li>
                                    <rdf:Description xmp:MyXMPStructure0="47">
                                        <xmp:MyXMPStructure1 xml:lang="sv">11</xmp:MyXMPStructure1>
                                    </rdf:Description>
                                </rdf:li>
                            </rdf:Bag>
                        </xmp:MyXMPArray>
                    </rdf:Description>
                `);
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags['MyXMPArray']).to.deep.equal({
                    value: [
                        {
                            MyXMPStructure0: {
                                value: '47',
                                attributes: {},
                                description: '47'
                            },
                            MyXMPStructure1: {
                                value: '11',
                                attributes: {
                                    lang: 'sv'
                                },
                                description: '11'
                            }
                        }
                    ],
                    attributes: {
                        lang: 'en'
                    },
                    description: 'MyXMPStructure0: 47; MyXMPStructure1: 11'
                });
            });

            it('should be able to read an unordered array with structure value as attribute', () => {
                const xmlString = getXmlString(`
                    <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                        <xmp:MyXMPArray xml:lang="en">
                            <rdf:Bag>
                                <rdf:li>
                                    <rdf:Description xmp:MyXMPStructure0="47">
                                        <xmp:MyXMPStructure1 xmp:MyXMPTag0="11"/>
                                    </rdf:Description>
                                </rdf:li>
                            </rdf:Bag>
                        </xmp:MyXMPArray>
                    </rdf:Description>
                `);
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags['MyXMPArray']).to.deep.equal({
                    value: [
                        {
                            MyXMPStructure0: {
                                value: '47',
                                attributes: {},
                                description: '47'
                            },
                            MyXMPStructure1: {
                                value: {
                                    MyXMPTag0: {
                                        value: '11',
                                        attributes: {},
                                        description: '11'
                                    }
                                },
                                attributes: {},
                                description: 'MyXMPTag0: 11'
                            }
                        }
                    ],
                    attributes: {
                        lang: 'en'
                    },
                    description: 'MyXMPStructure0: 47; MyXMPStructure1: MyXMPTag0: 11'
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
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

            it('should be able to read an array structure value as attributes', () => {
                const xmlString = getXmlString(`
                    <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                        <xmp:MyXMPArray xml:lang="en">
                            <rdf:Bag>
                                <rdf:li xmp:MyXMPTag0="47" xmp:MyXMPTag1="11" />
                            </rdf:Bag>
                        </xmp:MyXMPArray>
                    </rdf:Description>
                `);
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
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
                        }
                    ],
                    attributes: {
                        lang: 'en'
                    },
                    description: 'MyXMPTag0: 47; MyXMPTag1: 11'
                });
            });

            it('should be able to read an xml:lang qualifier on an empty array item', () => {
                const xmlString = getXmlString(`
                    <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                        <xmp:MyXMPArray>
                            <rdf:Bag>
                                <rdf:li xml:lang="en" />
                            </rdf:Bag>
                        </xmp:MyXMPArray>
                    </rdf:Description>
                `);
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags['MyXMPArray']).to.deep.equal({
                    value: [
                        {
                            value: {},
                            attributes: {
                                lang: 'en'
                            },
                            description: ''
                        }
                    ],
                    attributes: {},
                    description: ''
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
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
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags['MyXMPTag0'].value).to.equal('47');
                expect(tags['MyXMPTag1'].value).to.equal('11');
            });

            it('should be able to handle XML with a packet wrapper', () => {
                const xmlString = getXmlStringWithPacketWrapper('<rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag="4711"></rdf:Description>');
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags['MyXMPTag'].value).to.equal('4711');
            });

            it('should be able to handle XML with a meta element', () => {
                const xmlString = getXmlStringWithMetaElement('<rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag="4711"></rdf:Description>');
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags['MyXMPTag'].value).to.equal('4711');
            });

            it('should be able to handle XML with a meta element inside a packet wrapper', () => {
                const xmlString = getXmlStringWithMetaElementInsidePacketWrapper('<rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag="4711"></rdf:Description>');
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags['MyXMPTag'].value).to.equal('4711');
            });

            it('should be able to handle XML with a packet wrapper inside a meta element', () => {
                const xmlString = getXmlStringWithPacketWrapperInsideMetaElement('<rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag="4711"></rdf:Description>');
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
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
                ], domParser);

                expect(tags).to.deep.equal({
                    _raw: xmlString0 + xmlString1 + xmlString2,
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

            // This is non-spec but there are files in the wild using this format.
            it('should be able to handle multiple chunks where they are all part of a single XMP metadata tree', function () {
                const xmlString = getXmlString(`
                    <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag="4711">
                    </rdf:Description>
                `);
                const xmlString0 = xmlString.substr(0, 40);
                const xmlString1 = xmlString.substr(40);
                const dataView = getDataView(xmlString0 + xmlString1);

                const tags = XmpTags.read(dataView, [
                    {dataOffset: 0, length: xmlString0.length},
                    {dataOffset: xmlString0.length, length: xmlString1.length},
                ], domParser);

                expect(tags).to.deep.equal({
                    _raw: xmlString0 + xmlString1,
                    MyXMPTag: {
                        value: '4711',
                        attributes: {},
                        description: '4711'
                    }
                });
            });

            it('should handle when input is a regular string', () => {
                const xmlString = getXmlString(`
                    <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="4711">
                    </rdf:Description>
                `);
                const tags = XmpTags.read(xmlString, undefined, domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
                    MyXMPTag0: {
                        value: '4711',
                        attributes: {},
                        description: '4711'
                    }
                });
            });

            it('should be able to auto-correct when a prefix is not bound to a namespace', () => {
                const xmlString = getXmlString(`
                    <rdf:Description>
                        <xmp:MyXMPTag>4711</xmp:MyXMPTag>
                    </rdf:Description>
                `);
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
                    MyXMPTag: {
                        value: '4711',
                        attributes: {},
                        description: '4711'
                    }
                });
            });

            // Declaring the dotted prefix a second time drops every tag in the
            // packet. Only a parser that reports the unbound xmp prefix reaches
            // the repair, so the linkedom run passes even without it.
            it('should keep the tags of a packet that declares a prefix containing a dot', () => {
                const xmlString = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:a.b="http://ns.example.com/ab">
                    <rdf:Description a.b:MyDottedTag="4711">
                        <xmp:MyXMPTag>4812</xmp:MyXMPTag>
                    </rdf:Description>
                </rdf:RDF>`;
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
                    MyDottedTag: {
                        value: '4711',
                        attributes: {},
                        description: '4711'
                    },
                    MyXMPTag: {
                        value: '4812',
                        attributes: {},
                        description: '4812'
                    }
                });
            });

            // Declaring the empty-URI prefix a second time drops every tag in
            // the packet. It is only used in text here, because xmldom rejects
            // the packet as soon as such a prefix names an element or an
            // attribute. As above, only a parser that reports the unbound xmp
            // prefix reaches the repair.
            it('should keep the tags of a packet that declares a prefix with an empty namespace URI', () => {
                const xmlString = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:stEvt="">
                    <rdf:Description>
                        <xmp:MyXMPTag>stEvt:action</xmp:MyXMPTag>
                    </rdf:Description>
                </rdf:RDF>`;
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
                    MyXMPTag: {
                        value: 'stEvt:action',
                        attributes: {},
                        description: 'stEvt:action'
                    }
                });
            });

            // With the declarations inserted at the comment's tag-like
            // content instead of the root element, the retry fails and every
            // tag in the packet is lost. As above, only a parser that reports
            // the unbound xmp prefix reaches the repair.
            it('should keep the tags of a packet whose leading comment contains something tag-like', () => {
                const xmlString = `<!-- <b:note> --><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
                    <rdf:Description>
                        <xmp:MyXMPTag>4711</xmp:MyXMPTag>
                    </rdf:Description>
                </rdf:RDF>`;
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
                    MyXMPTag: {
                        value: '4711',
                        attributes: {},
                        description: '4711'
                    }
                });
            });

            describe('exceptions', () => {
                it('should rename MicrosoftPhoto:Rating to RatingPercent', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:tiff="http://ns.adobe.com/tiff/1.0/" xmlns:MicrosoftPhoto="http://ns.microsoft.com/photo/1.0/" xmlns:MicroSoftPhoto_1_="http://ns.microsoft.com/photo/1.0/">
                            <tiff:Rating>3</tiff:Rating>
                            <MicrosoftPhoto:Rating>50</MicrosoftPhoto:Rating>
                            <MicroSoftPhoto_1_:Rating>50</MicroSoftPhoto_1_:Rating>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags).to.deep.equal({
                        _raw: xmlString,
                        Rating: {
                            value: '3',
                            attributes: {},
                            description: '3'
                        },
                        RatingPercent: {
                            value: '50',
                            attributes: {},
                            description: '50'
                        }
                    });
                });
            });

            describe('names that are also object property names', () => {
                // A name without a namespace prefix always ends up in a tag named
                // "undefined", since the tag name is what follows the colon. That is
                // a separate matter from the name being an object property name.
                it('should not describe a value with an inherited property of the tag name table', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description>
                            <constructor>4711</constructor>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['undefined'].value).to.equal('4711');
                    // Without the fix this is a String object built by the
                    // inherited Object function, not a primitive.
                    expect(typeof tags['undefined'].description).to.equal('string');
                    expect(tags['undefined'].description).to.equal('4711');
                });

                it('should not describe an attribute value with an inherited property of the tag name table', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description hasOwnProperty="4711"></rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['undefined'].value).to.equal('4711');
                    // Without the fix the inherited hasOwnProperty is called here,
                    // which makes the description false instead of a string.
                    expect(tags['undefined'].description).to.equal('4711');
                });

                it('should parse a list in an element named after an object property like any other list', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description>
                            <constructor>
                                <rdf:Bag>
                                    <rdf:li>4711</rdf:li>
                                    <rdf:li>4812</rdf:li>
                                </rdf:Bag>
                            </constructor>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['undefined'].value).to.deep.equal([
                        {value: '4711', attributes: {}, description: '4711'},
                        {value: '4812', attributes: {}, description: '4812'}
                    ]);
                    expect(tags['undefined'].description).to.equal('4711, 4812');
                });

                it('should still describe a list with the description function of a real tag name', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/">
                            <exif:ComponentsConfiguration>
                                <rdf:Seq>
                                    <rdf:li>1</rdf:li>
                                    <rdf:li>2</rdf:li>
                                    <rdf:li>3</rdf:li>
                                    <rdf:li>0</rdf:li>
                                </rdf:Seq>
                            </exif:ComponentsConfiguration>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['ComponentsConfiguration'].description).to.equal('YCbCr');
                });

                it('should read a child of rdf:value named after an object property without leaking the property', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <rdf:value><constructor>4711</constructor></rdf:value>
                                <xmp:MyQualifier>4812</xmp:MyQualifier>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(Object.keys(tags['MyXMPTag'].value)).to.deep.equal(['constructor']);
                    expect(tags['MyXMPTag'].value['constructor'].value).to.equal('4711');
                    expect(tags['MyXMPTag'].attributes).to.deep.equal({MyQualifier: '4812'});
                    expect(tags['MyXMPTag'].description).to.equal('constructor: 4711');
                });

                it('should read a child of rdf:value named __proto__', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <rdf:value><__proto__>4711</__proto__></rdf:value>
                                <xmp:MyQualifier>4812</xmp:MyQualifier>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(Object.keys(tags['MyXMPTag'].value)).to.deep.equal(['__proto__']);
                    // The object has no prototype, which is what lets the
                    // __proto__ key be kept, and the caller gets that object.
                    expect(Object.getPrototypeOf(tags['MyXMPTag'].value)).to.equal(null);
                    expect(tags['MyXMPTag'].value['__proto__'].value).to.equal('4711');
                    expect(tags['MyXMPTag'].attributes).to.deep.equal({MyQualifier: '4812'});
                    expect(tags['MyXMPTag'].description).to.equal('__proto__: 4711');
                });
            });

            describe('lists with a description function that throws', () => {
                it('should keep an exif:GPSLatitude list whose description function only handles a plain value', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/">
                            <exif:GPSLatitude>
                                <rdf:Seq>
                                    <rdf:li>48,28.8N</rdf:li>
                                </rdf:Seq>
                            </exif:GPSLatitude>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['GPSLatitude']).to.deep.equal({
                        value: [
                            {value: '48,28.8N', attributes: {}, description: '48,28.8N'}
                        ],
                        attributes: {},
                        description: '48,28.8N'
                    });
                });

                it('should keep an exif:ColorSpace list whose description function only handles a plain value', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/">
                            <exif:ColorSpace>
                                <rdf:Alt>
                                    <rdf:li>1</rdf:li>
                                </rdf:Alt>
                            </exif:ColorSpace>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['ColorSpace']).to.deep.equal({
                        value: [
                            {value: '1', attributes: {}, description: '1'}
                        ],
                        attributes: {},
                        description: '1'
                    });
                });

                it('should keep a tiff:ResolutionUnit list whose items cannot be converted to a string', () => {
                    // An item whose own toString is not a function cannot be coerced to a
                    // string, so the description function throws when it converts the list.
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:tiff="http://ns.adobe.com/tiff/1.0/" xmlns:xmp="http://ns.example.com/xmp">
                            <tiff:ResolutionUnit>
                                <rdf:Seq>
                                    <rdf:li xmp:toString="4711"/>
                                </rdf:Seq>
                            </tiff:ResolutionUnit>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['ResolutionUnit']).to.deep.equal({
                        value: [
                            {toString: {value: '4711', attributes: {}, description: '4711'}}
                        ],
                        attributes: {},
                        description: 'toString: 4711'
                    });
                });

                describe('with an injected description function', () => {
                    let restoreXmpTagNames;

                    beforeEach(() => {
                        restoreXmpTagNames = swapProperties(XmpTagNames, {
                            'xmp:MyThrowingTag'() {
                                throw new Error('Test error');
                            }
                        });
                    });

                    afterEach(() => {
                        restoreXmpTagNames();
                    });

                    it('should describe the list the way a list without a description function is described', () => {
                        const xmlString = getXmlString(`
                            <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                                <xmp:MyThrowingTag>
                                    <rdf:Bag>
                                        <rdf:li>4711</rdf:li>
                                        <rdf:li>4812</rdf:li>
                                    </rdf:Bag>
                                </xmp:MyThrowingTag>
                            </rdf:Description>
                        `);
                        const dataView = getDataView(xmlString);
                        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                        expect(tags['MyThrowingTag']).to.deep.equal({
                            value: [
                                {value: '4711', attributes: {}, description: '4711'},
                                {value: '4812', attributes: {}, description: '4812'}
                            ],
                            attributes: {},
                            description: '4711, 4812'
                        });
                    });
                });
            });
        });
    }

    describe('bounded chunk allocation (GHSA-q53f-v5gx-7j78)', () => {
        it('does not allocate beyond the available data when a chunk declares a length larger than the buffer', () => {
            const xmlString = getXmlString('');
            const dataView = getDataView(xmlString);
            const oversizedLength = dataView.byteLength + 100000;

            const tags = XmpTags.read(dataView, [{dataOffset: 0, length: oversizedLength}]);

            expect(tags._raw).to.equal(xmlString);
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
