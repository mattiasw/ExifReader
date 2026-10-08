/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';

const SURROUNDING_SIZE = 200;
import {DOMParser as XmldomDomParser, onErrorStopParsing} from '@xmldom/xmldom';
import {DOMParser as LinkedomDomParser} from 'linkedom';
import {getConsoleWarnSpy, getDataView, swapProperties} from './test-utils.js';
import {createRequire} from 'node:module';
import DomParserModule from '../../src/dom-parser.js';
import TextDecoderModule from '../../src/text-decoder.js';
import XmpTags from '../../src/xmp-tags.js';
import XmpTagNames from '../../src/xmp-tag-names.js';

const PACKET_WRAPPER_START = '<?xpacket begin="ï»¿" id="W5M0MpCehiHzreSzNTczkc9d"?>';
const PACKET_WRAPPER_END = '<?xpacket end="w"?>';
const META_ELEMENT_START = '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.5-c002 1.000000, 0000/00/00-00:00:00        ">';
const META_ELEMENT_END = '</x:xmpmeta>';

const MAX_NESTING_DEPTH = 16;
// The top-level properties are the first level, so the outermost nested tag's members are the second.
const DEEPEST_ALLOWED_LEVEL = MAX_NESTING_DEPTH - 1;
const NESTING_SHAPES = {
    'rdf:parseType="Resource"': {
        nest: (leaf, inner) => `<xmp:s rdf:parseType="Resource"><xmp:t>${leaf}</xmp:t>${inner}</xmp:s>`,
        getMembers: (tag) => tag.value,
        regressionDepth: 1000
    },
    'rdf:Description': {
        nest: (leaf, inner) => `<xmp:s><rdf:Description><xmp:t>${leaf}</xmp:t>${inner}</rdf:Description></xmp:s>`,
        getMembers: (tag) => tag.value,
        regressionDepth: 500
    },
    'rdf:Seq with rdf:parseType="Resource" items': {
        nest: (leaf, inner) => `<xmp:s><rdf:Seq><rdf:li rdf:parseType="Resource"><xmp:t>${leaf}</xmp:t>${inner}</rdf:li></rdf:Seq></xmp:s>`,
        getMembers: (tag) => tag.value[0],
        regressionDepth: 333
    }
};

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

    it('should read a chunk relative to the DataView when it has a non-zero byteOffset', () => {
        const domParser = new XmldomDomParser({onError: onErrorStopParsing});
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="4711">
            </rdf:Description>
        `);
        const dataView = getPaddedDataView(xmlString, 6);

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

    it('should bound a chunk by the DataView, not by the whole buffer', () => {
        const domParser = new XmldomDomParser({onError: onErrorStopParsing});
        const xmlString = getXmlString(`
            <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="4711">
            </rdf:Description>
        `);
        const dataView = getSurroundedDataView(xmlString, 6);

        // The declared length runs past the end of the view and into the bytes
        // that follow it in the buffer.
        const tags = XmpTags.read(
            dataView,
            [{dataOffset: 0, length: xmlString.length + SURROUNDING_SIZE}],
            domParser
        );

        expect(tags._raw).to.equal(xmlString);
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

            describe('text split over several nodes, CDATA sections and comments', () => {
                it('should read text split at an entity reference as one string', () => {
                    expectMyXMPTagValue('<xmp:MyXMPTag>a&amp;b</xmp:MyXMPTag>', 'a&b');
                });

                it('should read text split at a character reference as one string', () => {
                    expectMyXMPTagValue('<xmp:MyXMPTag>a&#x41;b</xmp:MyXMPTag>', 'aAb');
                });

                it('should read the text of a CDATA section', () => {
                    expectMyXMPTagValue('<xmp:MyXMPTag><![CDATA[a<b]]></xmp:MyXMPTag>', 'a<b');
                });

                it('should read text mixed with a CDATA section as one string', () => {
                    expectMyXMPTagValue('<xmp:MyXMPTag>x<![CDATA[a<b]]>y</xmp:MyXMPTag>', 'xa<by');
                });

                it('should ignore a comment inside text', () => {
                    expectMyXMPTagValue('<xmp:MyXMPTag>a<!-- c -->b</xmp:MyXMPTag>', 'ab');
                });

                it('should ignore a processing instruction inside text', () => {
                    expectMyXMPTagValue('<xmp:MyXMPTag>a<?pi x?>b</xmp:MyXMPTag>', 'ab');
                });

                it('should keep sibling tags around a comment', () => {
                    expectSiblingTags('<!-- note -->');
                });

                it('should keep sibling tags around a processing instruction', () => {
                    expectSiblingTags('<?pi x?>');
                });

                it('should keep sibling tags around a CDATA section', () => {
                    expectSiblingTags('<![CDATA[x]]>');
                });

                it('should decode a UTF-8 sequence split by a CDATA boundary once the text is joined', () => {
                    expectMyXMPTagValue(`<xmp:MyXMPTag>caf${'\xC3'}<![CDATA[${'\xA9'}]]></xmp:MyXMPTag>`, 'café');
                });

                it('should read an element with thousands of text nodes in linear time', () => {
                    expectMyXMPTagValue(`<xmp:MyXMPTag>${'a&amp;'.repeat(10000)}</xmp:MyXMPTag>`, 'a&'.repeat(10000));
                });

                it('should find rdf:RDF after thousands of comments in linear time', () => {
                    const xmlString = `${META_ELEMENT_START}
                        ${'<!-- c -->'.repeat(10000)}
                        ${getXmlString('<rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag="4711"></rdf:Description>')}
                    ${META_ELEMENT_END}`;
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags.MyXMPTag).to.deep.equal({value: '4711', attributes: {}, description: '4711'});
                });

                it('should read a long text value in linear time', () => {
                    const text = 'A'.repeat(8 * 1024 * 1024);
                    expectMyXMPTagValue(`<xmp:MyXMPTag>${text}</xmp:MyXMPTag>`, text);
                });

                it('should not enumerate the characters of a text value', () => {
                    const keysArguments = [];
                    const originalKeys = Object.keys;
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag0>abc</xmp:MyXMPTag0>
                            <xmp:MyXMPTag1><rdf:Bag><rdf:li>def</rdf:li></rdf:Bag></xmp:MyXMPTag1>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const restore = swapProperties(Object, {
                        keys(object) {
                            if (typeof object === 'string') {
                                keysArguments.push(object);
                            }
                            return originalKeys(object);
                        }
                    });
                    let tags;
                    try {
                        tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    } finally {
                        restore();
                    }
                    expect(keysArguments).to.deep.equal([]);
                    expect(tags.MyXMPTag0).to.deep.equal({value: 'abc', attributes: {}, description: 'abc'});
                    expect(tags.MyXMPTag1.value).to.deep.equal([{value: 'def', attributes: {}, description: 'def'}]);
                });

                it('should read a long text value in a list item in linear time', () => {
                    const text = 'A'.repeat(8 * 1024 * 1024);
                    expectMyXMPTag(
                        `<xmp:MyXMPTag><rdf:Bag><rdf:li>${text}</rdf:li></rdf:Bag></xmp:MyXMPTag>`,
                        {value: [{value: text, attributes: {}, description: text}], attributes: {}, description: text}
                    );
                });

                it('should ignore long text directly inside a resource structure in linear time', () => {
                    const text = 'A'.repeat(1024 * 1024);
                    expectMyXMPTag(
                        `<xmp:MyXMPTag rdf:parseType="Resource">${text}</xmp:MyXMPTag>`,
                        {value: {}, attributes: {}, description: ''}
                    );
                });

                it('should ignore long text directly inside a nested rdf:Description in linear time', () => {
                    const text = 'A'.repeat(1024 * 1024);
                    expectMyXMPTag(
                        `<xmp:MyXMPTag><rdf:Description>${text}</rdf:Description></xmp:MyXMPTag>`,
                        {value: {}, attributes: {}, description: ''}
                    );
                });

                it('should ignore long text directly inside rdf:RDF in linear time', () => {
                    const tags = XmpTags.read(getXmlString('A'.repeat(8 * 1024 * 1024)), [], domParser);
                    expect(Object.keys(tags)).to.deep.equal(['_raw']);
                });

                it('should drop a structure with rdf:value and a nested rdf:Description holding long text in linear time', () => {
                    const text = 'A'.repeat(6 * 1024 * 1024);
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag0>4711</xmp:MyXMPTag0>
                            <xmp:MyXMPTag rdf:parseType="Resource"><rdf:value>x</rdf:value><rdf:Description>${text}</rdf:Description></xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags).to.deep.equal({
                        _raw: xmlString,
                        MyXMPTag0: {value: '4711', attributes: {}, description: '4711'}
                    });
                });

                it('should not read the characters of text inside an rdf:Description or a structure as child names', () => {
                    // Enumerating a string gives its character indexes, and every child name is
                    // split at the colon, so a split of an index shows a per-character walk.
                    const splitReceivers = [];
                    const originalSplit = String.prototype.split;
                    const xmlString = getXmlString(`
                        <rdf:Description>abc</rdf:Description>
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag0>4711</xmp:MyXMPTag0>
                            <xmp:MyXMPTag1 rdf:parseType="Resource">abc</xmp:MyXMPTag1>
                            <xmp:MyXMPTag2><rdf:Description>abc</rdf:Description></xmp:MyXMPTag2>
                            <xmp:MyXMPTag3 rdf:parseType="Resource"><rdf:value>x</rdf:value><rdf:Description>abc</rdf:Description></xmp:MyXMPTag3>
                            <xmp:MyXMPTag4><xmp:Child>abc</xmp:Child></xmp:MyXMPTag4>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const restore = swapProperties(String.prototype, {
                        split(...args) {
                            splitReceivers.push(String(this));
                            return originalSplit.apply(this, args);
                        }
                    });
                    let tags;
                    try {
                        tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    } finally {
                        restore();
                    }
                    expect(splitReceivers.filter((receiver) => /^\d+$/.test(receiver))).to.deep.equal([]);
                    expect(tags).to.deep.equal({
                        _raw: xmlString,
                        MyXMPTag0: {value: '4711', attributes: {}, description: '4711'},
                        MyXMPTag1: {value: {}, attributes: {}, description: ''},
                        MyXMPTag2: {value: {}, attributes: {}, description: ''},
                        MyXMPTag4: {value: {}, attributes: {}, description: ''}
                    });
                });

                it('should read an element holding only an empty CDATA section as an empty structure', () => {
                    expectMyXMPTag('<xmp:MyXMPTag><![CDATA[]]></xmp:MyXMPTag>', {value: {}, attributes: {}, description: ''});
                });

                it('should read a list item holding only an empty CDATA section as an empty structure', () => {
                    expectMyXMPTag(
                        '<xmp:MyXMPTag><rdf:Bag><rdf:li><![CDATA[]]></rdf:li></rdf:Bag></xmp:MyXMPTag>',
                        {value: [{}], attributes: {}, description: ''}
                    );
                });

                // Only linkedom rebuilds the attribute list on every access, and xmldom's own
                // parsing of this many attributes is slow enough to time out on a loaded machine.
                if (domParserName === 'linkedom') {
                    it('should read an element with thousands of attributes in linear time', () => {
                        const attributes = Array.from({length: 10000}, (_, index) => ` xmp:MyXMPTag${index}="${index}"`).join('');
                        const xmlString = getXmlString(`<rdf:Description xmlns:xmp="http://ns.example.com/xmp"${attributes}></rdf:Description>`);
                        const dataView = getDataView(xmlString);
                        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                        expect(tags.MyXMPTag9999).to.deep.equal({value: '9999', attributes: {}, description: '9999'});
                    });
                }

                function expectMyXMPTagValue(element, value) {
                    expectMyXMPTag(element, {value, attributes: {}, description: value});
                }

                function expectMyXMPTag(element, tag) {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            ${element}
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags).to.deep.equal({
                        _raw: xmlString,
                        MyXMPTag: tag
                    });
                }

                function expectSiblingTags(separator) {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag0>4711</xmp:MyXMPTag0>
                            ${separator}
                            <xmp:MyXMPTag1>4812</xmp:MyXMPTag1>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags).to.deep.equal({
                        _raw: xmlString,
                        MyXMPTag0: {value: '4711', attributes: {}, description: '4711'},
                        MyXMPTag1: {value: '4812', attributes: {}, description: '4812'}
                    });
                }
            });

            describe('text encoding', () => {
                // The second byte of "公" is 0x85, which xmldom turns into a line
                // feed before parsing.
                const PARK = '公园';

                it('should decode a UTF-8 element value', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag0>${toUtf8ByteString('AúC')}</xmp:MyXMPTag0>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPTag0']).to.deep.equal({
                        value: 'AúC',
                        attributes: {},
                        description: 'AúC'
                    });
                });

                it('should decode a UTF-8 attribute value that contains a 0x85 byte', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/" Iptc4xmpCore:Location="${toUtf8ByteString(PARK)}">
                            <xmp:MyXMPTag0>${toUtf8ByteString(PARK)}</xmp:MyXMPTag0>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['Location']).to.deep.equal({
                        value: PARK,
                        attributes: {},
                        description: PARK
                    });
                    expect(tags['MyXMPTag0']).to.deep.equal({
                        value: PARK,
                        attributes: {},
                        description: PARK
                    });
                });

                it('should give the decoded packet as the raw value', () => {
                    const xmlString = getXmlStringWithPacketWrapper(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="${toUtf8ByteString(PARK)}"></rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags._raw).to.equal(xmlString.replace(toUtf8ByteString('\ufeff'), '\ufeff').replace(toUtf8ByteString(PARK), PARK));
                });

                it('should decode a packet that is not valid UTF-8 as one character per byte', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag0>abcÅÄÖáéí</xmp:MyXMPTag0>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags._raw).to.equal(xmlString);
                    expect(tags['MyXMPTag0']).to.deep.equal({
                        value: 'abcÅÄÖáéí',
                        attributes: {},
                        description: 'abcÅÄÖáéí'
                    });
                });

                it('should decode a numeric character reference above U+00FF in an attribute value', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="&#x516C;&#x56ED;"></rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPTag0'].value).to.equal(PARK);
                });

                it('should keep an attribute value that is not valid UTF-8 as one character per byte', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="abcÅÄÖáéí"></rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPTag0'].value).to.equal('abcÅÄÖáéí');
                });

                it('should decode each value on its own when the packet is not valid UTF-8', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="${toUtf8ByteString('café')}" xmp:MyXMPTag1="café">
                            <xmp:MyXMPTag2>${toUtf8ByteString('café')}</xmp:MyXMPTag2>
                            <xmp:MyXMPTag3>café</xmp:MyXMPTag3>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags._raw).to.equal(xmlString);
                    for (const name of ['MyXMPTag0', 'MyXMPTag1', 'MyXMPTag2', 'MyXMPTag3']) {
                        expect(tags[name], name).to.deep.equal({
                            value: 'café',
                            attributes: {},
                            description: 'café'
                        });
                    }
                });

                it('should convert a packet that is not valid UTF-8 to a string in chunks, not one call per byte', () => {
                    expectNonUtf8PacketConvertedInChunks(domParser);
                });

                it('should keep every byte of a packet that is not valid UTF-8 across chunk boundaries', () => {
                    expectNonUtf8PacketBytesKeptAcrossChunkBoundaries(domParser);
                });

                it('should decode a UTF-8 value when the input is a byte string', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="${toUtf8ByteString(PARK)}"></rdf:Description>
                    `);
                    const tags = XmpTags.read(xmlString, undefined, domParser);
                    expect(tags['MyXMPTag0'].value).to.equal(PARK);
                });

                describe('without TextDecoder', () => {
                    let restoreTextDecoder;

                    beforeEach(() => {
                        restoreTextDecoder = swapProperties(TextDecoderModule, {
                            get() {
                                return undefined;
                            }
                        });
                    });

                    afterEach(() => {
                        restoreTextDecoder();
                    });

                    it('should decode a UTF-8 attribute value that contains a 0x85 byte', () => {
                        const xmlString = getXmlString(`
                            <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="${toUtf8ByteString(PARK)}"></rdf:Description>
                        `);
                        const dataView = getDataView(xmlString);
                        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                        expect(tags['MyXMPTag0'].value).to.equal(PARK);
                    });

                    it('should decode a packet that is not valid UTF-8 as one character per byte', () => {
                        const xmlString = getXmlString(`
                            <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="abcÅÄÖáéí"></rdf:Description>
                        `);
                        const dataView = getDataView(xmlString);
                        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                        expect(tags['MyXMPTag0'].value).to.equal('abcÅÄÖáéí');
                    });

                    it('should decode each value on its own when the packet is not valid UTF-8', () => {
                        const xmlString = getXmlString(`
                            <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="${toUtf8ByteString('café')}" xmp:MyXMPTag1="café">
                                <xmp:MyXMPTag2>${toUtf8ByteString('café')}</xmp:MyXMPTag2>
                            </rdf:Description>
                        `);
                        const dataView = getDataView(xmlString);
                        const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                        expect(tags['MyXMPTag0'].value).to.equal('café');
                        expect(tags['MyXMPTag1'].value).to.equal('café');
                        expect(tags['MyXMPTag2'].value).to.equal('café');
                    });

                    it('should convert a packet that is not valid UTF-8 to a string in chunks, not one call per byte', () => {
                        expectNonUtf8PacketConvertedInChunks(domParser);
                    });

                    it('should keep every byte of a packet that is not valid UTF-8 across chunk boundaries', () => {
                        expectNonUtf8PacketBytesKeptAcrossChunkBoundaries(domParser);
                    });
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

            it('should keep the raw packets as _raw when the standard packet has an element named _raw', function () {
                const xmlString0 = getXmlString(`
                    <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                        <xmp:_raw>x</xmp:_raw>
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

                expect(tags._raw).to.equal(xmlString0 + xmlString1 + xmlString2);
                expect(tags['MyXMPTag1'].value).to.equal('42');
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

            // Declaration-like text inside another attribute's value on the
            // root element is not a declaration, but a scan that counts it as
            // one suppresses the repair for the genuinely undeclared prefix,
            // and every tag in the packet is lost. As above, only a parser
            // that reports the unbound prefix reaches the repair.
            it('should keep the tags of a packet whose root element holds an attribute value that looks like a declaration', () => {
                const xmlString = `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:note='xmlns:p="urn:z"'><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
                    <rdf:Description xmlns:my="http://example.com/my/">
                        <my:MyXMPTag>4711</my:MyXMPTag>
                        <p:MyOtherTag>4812</p:MyOtherTag>
                    </rdf:Description>
                </rdf:RDF></x:xmpmeta>`;
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
                    MyXMPTag: {
                        value: '4711',
                        attributes: {},
                        description: '4711'
                    },
                    MyOtherTag: {
                        value: '4812',
                        attributes: {},
                        description: '4812'
                    }
                });
            });

            it('should keep the tags of a packet whose root element holds an attribute value that looks like an empty declaration', () => {
                const xmlString = `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:note='xmlns:p=""'><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
                    <rdf:Description xmlns:my="http://example.com/my/">
                        <my:MyXMPTag>4711</my:MyXMPTag>
                        <p:MyOtherTag>4812</p:MyOtherTag>
                    </rdf:Description>
                </rdf:RDF></x:xmpmeta>`;
                const dataView = getDataView(xmlString);
                const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                expect(tags).to.deep.equal({
                    _raw: xmlString,
                    MyXMPTag: {
                        value: '4711',
                        attributes: {},
                        description: '4711'
                    },
                    MyOtherTag: {
                        value: '4812',
                        attributes: {},
                        description: '4812'
                    }
                });
            });

            describe('an rdf:value element with child elements', () => {
                it('should read the children as regular tags keyed by local name', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <rdf:value><xmp:MyInnerTag>4711</xmp:MyInnerTag></rdf:value>
                                <xmp:MyQualifier>4812</xmp:MyQualifier>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPTag']).to.deep.equal({
                        value: {
                            MyInnerTag: {value: '4711', attributes: {}, description: '4711'}
                        },
                        attributes: {MyQualifier: '4812'},
                        description: 'MyInnerTag: 4711'
                    });
                });

                it('should read a list inside a child of rdf:value', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <rdf:value>
                                    <xmp:MyInnerTag>
                                        <rdf:Bag>
                                            <rdf:li>4711</rdf:li>
                                            <rdf:li>4812</rdf:li>
                                        </rdf:Bag>
                                    </xmp:MyInnerTag>
                                </rdf:value>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPTag']).to.deep.equal({
                        value: {
                            MyInnerTag: {
                                value: [
                                    {value: '4711', attributes: {}, description: '4711'},
                                    {value: '4812', attributes: {}, description: '4812'}
                                ],
                                attributes: {},
                                description: '4711, 4812'
                            }
                        },
                        attributes: {},
                        description: 'MyInnerTag: 4711, 4812'
                    });
                });

                it('should read the children of an rdf:value inside a nested rdf:Description', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag>
                                <rdf:Description xmp:MyQualifier="4812">
                                    <rdf:value><xmp:MyInnerTag>4711</xmp:MyInnerTag></rdf:value>
                                </rdf:Description>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPTag']).to.deep.equal({
                        value: {
                            MyInnerTag: {value: '4711', attributes: {}, description: '4711'}
                        },
                        attributes: {MyQualifier: '4812'},
                        description: 'MyInnerTag: 4711'
                    });
                });

                it('should describe a child with the description function for its name', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmlns:tiff="http://ns.adobe.com/tiff/1.0/">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <rdf:value><tiff:Orientation>3</tiff:Orientation></rdf:value>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPTag'].value['Orientation'].description).to.equal('Rotate 180');
                    // The description of the whole value is composed from the
                    // values of its tags, not from their descriptions.
                    expect(tags['MyXMPTag'].description).to.equal('Orientation: 3');
                });

                it('should give an unprefixed child the undefined name, so two of them collapse into one', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <rdf:value><__proto__>4711</__proto__><constructor>4812</constructor></rdf:value>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(Object.getPrototypeOf(tags['MyXMPTag'].value)).to.equal(null);
                    expect(tags['MyXMPTag'].value).to.deep.equal({
                        undefined: {value: '4812', attributes: {}, description: '4812'}
                    });
                });

                it('should read a list written directly inside rdf:value as a list', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <rdf:value>
                                    <rdf:Bag>
                                        <rdf:li>4711</rdf:li>
                                        <rdf:li>4812</rdf:li>
                                    </rdf:Bag>
                                </rdf:value>
                                <xmp:MyQualifier>4813</xmp:MyQualifier>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPTag']).to.deep.equal({
                        value: [
                            {value: '4711', attributes: {}, description: '4711'},
                            {value: '4812', attributes: {}, description: '4812'}
                        ],
                        attributes: {MyQualifier: '4813'},
                        description: '4711, 4812'
                    });
                });

                it('should keep a qualified list whose description function only handles a plain value', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/">
                            <exif:GPSLatitude rdf:parseType="Resource">
                                <rdf:value>
                                    <rdf:Seq>
                                        <rdf:li>48,28.8N</rdf:li>
                                    </rdf:Seq>
                                </rdf:value>
                                <exif:MyQualifier>4711</exif:MyQualifier>
                            </exif:GPSLatitude>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['GPSLatitude']).to.deep.equal({
                        value: [
                            {value: '48,28.8N', attributes: {}, description: '48,28.8N'}
                        ],
                        attributes: {MyQualifier: '4711'},
                        description: '48,28.8N'
                    });
                });

                it('should let a list inside rdf:value take the place of its sibling elements', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <rdf:value>
                                    <rdf:Bag><rdf:li>4711</rdf:li></rdf:Bag>
                                    <xmp:MySibling>4812</xmp:MySibling>
                                </rdf:value>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPTag'].value).to.deep.equal([
                        {value: '4711', attributes: {}, description: '4711'}
                    ]);
                });

                it('should keep the text and the language of a qualified alternatives list', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmlns:dc="http://purl.org/dc/elements/1.1/">
                            <dc:title rdf:parseType="Resource">
                                <rdf:value>
                                    <rdf:Alt>
                                        <rdf:li xml:lang="x-default">My title</rdf:li>
                                    </rdf:Alt>
                                </rdf:value>
                                <xmp:MyQualifier>4711</xmp:MyQualifier>
                            </dc:title>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['title']).to.deep.equal({
                        value: [
                            {value: 'My title', attributes: {lang: 'x-default'}, description: 'My title'}
                        ],
                        attributes: {MyQualifier: '4711'},
                        description: 'My title'
                    });
                });

                it('should keep an attribute named __proto__ inside a value as a tag of its own', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <rdf:value><xmp:MyInnerTag xmp:__proto__="4711"/></rdf:value>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(Object.getPrototypeOf(tags['MyXMPTag'].value)).to.equal(null);
                    expect(tags['MyXMPTag'].value['MyInnerTag'].value['__proto__']).to.deep.equal({
                        value: '4711',
                        attributes: {},
                        description: '4711'
                    });
                    // The prototype must carry no content, so nothing the image
                    // named shows up as an inherited property.
                    expect(tags['MyXMPTag'].value['MyInnerTag'].value.value).to.be.undefined;
                });

                it('should keep a tag named __proto__ below the value of an rdf:value element', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <rdf:value>
                                    <xmp:MyWrap rdf:parseType="Resource">
                                        <xmp:__proto__>4711</xmp:__proto__>
                                    </xmp:MyWrap>
                                </rdf:value>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPTag'].value['MyWrap'].value['__proto__']).to.deep.equal({
                        value: '4711',
                        attributes: {},
                        description: '4711'
                    });
                    expect(tags['MyXMPTag'].value['MyWrap'].value.value).to.be.undefined;
                });

                it('should not keep the grandchildren of a child that holds elements of its own', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <rdf:value><xmp:MyInnerTag><xmp:MyDeepTag>4711</xmp:MyDeepTag></xmp:MyInnerTag></rdf:value>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPTag']).to.deep.equal({
                        value: {
                            MyInnerTag: {value: {}, attributes: {}, description: ''}
                        },
                        attributes: {},
                        description: 'MyInnerTag: '
                    });
                });
            });

            describe('repeated rdf:value elements', () => {
                it('should use the last rdf:value of a tag', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <rdf:value>4711</rdf:value>
                                <rdf:value>4812</rdf:value>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPTag']).to.deep.equal({
                        value: '4812',
                        attributes: {},
                        description: '4812'
                    });
                });

                it('should use the last of repeated list elements instead of dropping the tag', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <rdf:value>
                                    <rdf:Bag><rdf:li>4711</rdf:li></rdf:Bag>
                                    <rdf:Bag><rdf:li>4812</rdf:li></rdf:Bag>
                                </rdf:value>
                            </xmp:MyXMPTag>
                            <xmp:MyOtherXMPTag>
                                <rdf:Bag><rdf:li>4813</rdf:li></rdf:Bag>
                                <rdf:Bag><rdf:li>4814</rdf:li></rdf:Bag>
                            </xmp:MyOtherXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPTag'].value).to.deep.equal([
                        {value: '4812', attributes: {}, description: '4812'}
                    ]);
                    expect(tags['MyOtherXMPTag'].value).to.deep.equal([
                        {value: '4814', attributes: {}, description: '4814'}
                    ]);
                });

                it('should keep a list whose item has repeated rdf:value elements', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPArray>
                                <rdf:Bag>
                                    <rdf:li rdf:parseType="Resource">
                                        <rdf:value>4711</rdf:value>
                                        <rdf:value>4812</rdf:value>
                                    </rdf:li>
                                </rdf:Bag>
                            </xmp:MyXMPArray>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPArray']).to.deep.equal({
                        value: [
                            {value: '4812', attributes: {}, description: '4812'}
                        ],
                        attributes: {},
                        description: '4812'
                    });
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
                it('should keep a tag named __proto__ and leave the tags around it alone', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:__proto__>4711</xmp:__proto__>
                            <xmp:MyOtherTag>4812</xmp:MyOtherTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['__proto__']).to.deep.equal({
                        value: '4711',
                        attributes: {},
                        description: '4711'
                    });
                    expect(tags['MyOtherTag'].value).to.equal('4812');
                    // Without the fix the tag replaces the prototype of the
                    // object holding it, so its own fields turn up as tags.
                    expect(tags.value).to.be.undefined;
                    expect(tags.attributes).to.be.undefined;
                    expect(tags.description).to.be.undefined;
                });

                it('should keep an attribute named __proto__ as a tag of its own', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:__proto__="4711" xmp:MyOtherTag="4812"/>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['__proto__']).to.deep.equal({
                        value: '4711',
                        attributes: {},
                        description: '4711'
                    });
                    expect(tags['MyOtherTag'].value).to.equal('4812');
                    expect(tags.value).to.be.undefined;
                });

                it('should keep the raw packet as _raw when there is an element named _raw', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:_raw>x</xmp:_raw>
                            <xmp:MyOtherTag>4812</xmp:MyOtherTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags._raw).to.equal(xmlString);
                    expect(tags['MyOtherTag']).to.deep.equal({
                        value: '4812',
                        attributes: {},
                        description: '4812'
                    });
                });

                it('should keep the raw packet as _raw when there is an attribute named _raw', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:_raw="y" xmp:MyOtherTag="4812"/>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags._raw).to.equal(xmlString);
                    expect(tags['MyOtherTag'].value).to.equal('4812');
                });

                // An unprefixed name always lands in a tag named "undefined",
                // since the tag name is what follows the colon. The point here
                // is that the attribute is kept at all: assigning a string to
                // __proto__ is a no-op, so it used to vanish. linkedom drops
                // such an attribute while parsing, so nothing reaches the tag
                // building and there is nothing to keep.
                it('should keep an unprefixed attribute named __proto__', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description __proto__="4711"/>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    if (domParserName === 'linkedom') {
                        expect(tags['undefined']).to.be.undefined;
                        return;
                    }
                    expect(tags['undefined'].value).to.equal('4711');
                });

                it('should keep a structure child named __proto__ and describe the structure correctly', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <xmp:__proto__>4711</xmp:__proto__>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['MyXMPTag'].value['__proto__']).to.deep.equal({
                        value: '4711',
                        attributes: {},
                        description: '4711'
                    });
                    expect(tags['MyXMPTag'].value.value).to.be.undefined;
                    expect(tags['MyXMPTag'].description).to.equal('__proto__: 4711');
                });

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
                                <rdf:value><xmp:constructor>4711</xmp:constructor></rdf:value>
                                <xmp:MyQualifier>4812</xmp:MyQualifier>
                            </xmp:MyXMPTag>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(Object.keys(tags['MyXMPTag'].value)).to.deep.equal(['constructor']);
                    expect(tags['MyXMPTag'].value['constructor']).to.deep.equal({
                        value: '4711',
                        attributes: {},
                        description: '4711'
                    });
                    expect(tags['MyXMPTag'].attributes).to.deep.equal({MyQualifier: '4812'});
                    expect(tags['MyXMPTag'].description).to.equal('constructor: 4711');
                });

                it('should read a child of rdf:value named __proto__', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:xmp="http://ns.example.com/xmp">
                            <xmp:MyXMPTag rdf:parseType="Resource">
                                <rdf:value><xmp:__proto__>4711</xmp:__proto__></rdf:value>
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
                    expect(tags['MyXMPTag'].value['__proto__']).to.deep.equal({
                        value: '4711',
                        attributes: {},
                        description: '4711'
                    });
                    expect(tags['MyXMPTag'].attributes).to.deep.equal({MyQualifier: '4812'});
                    expect(tags['MyXMPTag'].description).to.equal('__proto__: 4711');
                });
            });

            describe('lists with a description function written for a plain value', () => {
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

                it('should describe a tiff:XResolution list whose description function hands the list back', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:tiff="http://ns.adobe.com/tiff/1.0/">
                            <tiff:XResolution>
                                <rdf:Seq>
                                    <rdf:li>72</rdf:li>
                                </rdf:Seq>
                            </tiff:XResolution>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['XResolution'].description).to.equal('72');
                });

                it('should describe a tiff:Orientation list whose description function hands the list back', () => {
                    const xmlString = getXmlString(`
                        <rdf:Description xmlns:tiff="http://ns.adobe.com/tiff/1.0/">
                            <tiff:Orientation>
                                <rdf:Seq>
                                    <rdf:li>3</rdf:li>
                                </rdf:Seq>
                            </tiff:Orientation>
                        </rdf:Description>
                    `);
                    const dataView = getDataView(xmlString);
                    const tags = XmpTags.read(dataView, [{dataOffset: 0, length: xmlString.length}], domParser);
                    expect(tags['Orientation'].description).to.equal('3');
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

                    it('should describe a plain value by itself when its description function throws', () => {
                        const tags = readNestedXmp('<xmp:MyThrowingTag>4711</xmp:MyThrowingTag>', domParser);
                        expect(tags['MyThrowingTag']).to.deep.equal({value: '4711', attributes: {}, description: '4711'});
                    });
                });
            });

            describe('descriptions of nested values', () => {
                it('should describe a member with a description function by its value in the parent', () => {
                    const tags = readNestedXmp(`
                        <xmp:MyStruct rdf:parseType="Resource">
                            <exif:ColorSpace>1</exif:ColorSpace>
                        </xmp:MyStruct>
                    `, domParser);
                    expect(tags['MyStruct']).to.deep.equal({
                        value: {
                            ColorSpace: {value: '1', attributes: {}, description: 'sRGB'}
                        },
                        attributes: {},
                        description: 'ColorSpace: 1'
                    });
                });

                it('should describe a structure by its members even when its name has a description function', () => {
                    const tags = readNestedXmp(`
                        <exif:ColorSpace rdf:parseType="Resource"><xmp:A>1</xmp:A></exif:ColorSpace>
                    `, domParser);
                    expect(tags['ColorSpace'].description).to.equal('A: 1');
                });

                it('should describe a value with child elements by the tags in them', () => {
                    const tags = readNestedXmp(`
                        <xmp:MyTag><xmp:Inner xmp:b="2"><xmp:c>3</xmp:c></xmp:Inner></xmp:MyTag>
                    `, domParser);
                    expect(tags['MyTag']).to.deep.equal({
                        value: {
                            b: {value: '2', attributes: {}, description: '2'},
                            c: {value: '3', attributes: {}, description: '3'}
                        },
                        attributes: {},
                        description: 'b: 2; c: 3'
                    });
                });

                describe('with a description function for a list', () => {
                    let restoreXmpTagNames;

                    beforeEach(() => {
                        restoreXmpTagNames = swapProperties(XmpTagNames, {
                            'xmp:MyListTag': () => 'translated'
                        });
                    });

                    afterEach(() => {
                        restoreXmpTagNames();
                    });

                    it('should describe a list member by the descriptions of its items in the parent', () => {
                        const tags = readNestedXmp(`
                            <xmp:MyStruct rdf:parseType="Resource">
                                <xmp:MyListTag><rdf:Bag><rdf:li>a</rdf:li><rdf:li>b</rdf:li></rdf:Bag></xmp:MyListTag>
                            </xmp:MyStruct>
                        `, domParser);
                        expect(tags['MyStruct']).to.deep.equal({
                            value: {
                                MyListTag: {
                                    value: [
                                        {value: 'a', attributes: {}, description: 'a'},
                                        {value: 'b', attributes: {}, description: 'b'}
                                    ],
                                    attributes: {},
                                    description: 'translated'
                                }
                            },
                            attributes: {},
                            description: 'MyListTag: a, b'
                        });
                    });
                });

                it('should describe every level of lists of structures holding lists of structures', () => {
                    const tags = readNestedXmp(`
                        <xmp:L1><rdf:Seq>
                            <rdf:li rdf:parseType="Resource">
                                <xmp:A>a1</xmp:A>
                                <xmp:L2><rdf:Bag>
                                    <rdf:li rdf:parseType="Resource">
                                        <xmp:B>b1</xmp:B>
                                        <xmp:L3><rdf:Alt>
                                            <rdf:li rdf:parseType="Resource"><xmp:C>c1</xmp:C></rdf:li>
                                            <rdf:li>c2</rdf:li>
                                        </rdf:Alt></xmp:L3>
                                    </rdf:li>
                                    <rdf:li>b2</rdf:li>
                                </rdf:Bag></xmp:L2>
                            </rdf:li>
                            <rdf:li>a2</rdf:li>
                        </rdf:Seq></xmp:L1>
                    `, domParser);
                    expect(tags['L1']).to.deep.equal({
                        value: [
                            {
                                A: {value: 'a1', attributes: {}, description: 'a1'},
                                L2: {
                                    value: [
                                        {
                                            B: {value: 'b1', attributes: {}, description: 'b1'},
                                            L3: {
                                                value: [
                                                    {C: {value: 'c1', attributes: {}, description: 'c1'}},
                                                    {value: 'c2', attributes: {}, description: 'c2'}
                                                ],
                                                attributes: {},
                                                description: 'C: c1, c2'
                                            }
                                        },
                                        {value: 'b2', attributes: {}, description: 'b2'}
                                    ],
                                    attributes: {},
                                    description: 'B: b1; L3: C: c1, c2, b2'
                                }
                            },
                            {value: 'a2', attributes: {}, description: 'a2'}
                        ],
                        attributes: {},
                        description: 'A: a1; L2: B: b1; L3: C: c1, c2, b2, a2'
                    });
                });

                it('should describe every level of nested rdf:value lists', () => {
                    const tags = readNestedXmp(`
                        <xmp:V><rdf:Seq>
                            <rdf:li rdf:parseType="Resource">
                                <rdf:value><rdf:Seq>
                                    <rdf:li rdf:parseType="Resource">
                                        <rdf:value><rdf:Seq><rdf:li>x</rdf:li></rdf:Seq></rdf:value>
                                        <xmp:q>q2</xmp:q>
                                    </rdf:li>
                                    <rdf:li>y</rdf:li>
                                </rdf:Seq></rdf:value>
                                <xmp:q>q1</xmp:q>
                            </rdf:li>
                        </rdf:Seq></xmp:V>
                    `, domParser);
                    expect(tags['V']).to.deep.equal({
                        value: [
                            {
                                value: [
                                    {
                                        value: [{value: 'x', attributes: {}, description: 'x'}],
                                        attributes: {q: 'q2'},
                                        description: 'x'
                                    },
                                    {value: 'y', attributes: {}, description: 'y'}
                                ],
                                attributes: {q: 'q1'},
                                description: 'x, y'
                            }
                        ],
                        attributes: {},
                        description: 'x, y'
                    });
                });

                it('should describe a list item structure with a member named value by its members', () => {
                    const tags = readNestedXmp(`
                        <xmp:cuePointParams><rdf:Seq>
                            <rdf:li rdf:parseType="Resource"><xmp:key>chapter</xmp:key><xmp:value>Intro</xmp:value></rdf:li>
                            <rdf:li xmp:key="speaker" xmp:value="Ada"/>
                        </rdf:Seq></xmp:cuePointParams>
                    `, domParser);
                    expect(tags['cuePointParams'].description).to.equal('key: chapter; value: Intro, key: speaker; value: Ada');
                });

                it('should add no properties to nested tags and values', () => {
                    const tags = readNestedXmp(`
                        <xmp:MyStruct rdf:parseType="Resource">
                            <xmp:A>a</xmp:A>
                            <xmp:B><rdf:Seq><rdf:li rdf:parseType="Resource"><xmp:C>c</xmp:C></rdf:li></rdf:Seq></xmp:B>
                        </xmp:MyStruct>
                    `, domParser);
                    const structure = tags['MyStruct'];
                    const list = structure.value['B'];
                    expect(Object.getOwnPropertyNames(structure)).to.deep.equal(['value', 'attributes', 'description']);
                    expect(Object.getOwnPropertyNames(structure.value)).to.deep.equal(['A', 'B']);
                    expect(Object.getOwnPropertyNames(list)).to.deep.equal(['value', 'attributes', 'description']);
                    expect(Object.getOwnPropertyNames(list.value)).to.deep.equal(['0', 'length']);
                    expect(Object.getOwnPropertyNames(list.value[0])).to.deep.equal(['C']);
                });
            });

            describe('nesting depth', () => {
                for (const shapeName in NESTING_SHAPES) {
                    const shape = NESTING_SHAPES[shapeName];

                    describe(`of ${shapeName} values`, () => {
                        it('should keep a value nested to the deepest allowed level', () => {
                            const tags = readNestedXmp(getNestedStructures(shape, DEEPEST_ALLOWED_LEVEL, getShortLeaf), domParser);
                            expectNestedLevels(tags, shape, DEEPEST_ALLOWED_LEVEL);
                        });

                        it('should skip a value nested one level deeper and keep its ancestors and siblings', () => {
                            const tags = readNestedXmp(getNestedStructures(shape, DEEPEST_ALLOWED_LEVEL + 1, getShortLeaf), domParser);
                            expectNestedLevels(tags, shape, DEEPEST_ALLOWED_LEVEL);
                        });

                        it('should read a value nested a thousand DOM elements deep fast and with bounded descriptions', () => {
                            const xmlString = getNestedXmlString(getNestedStructures(shape, shape.regressionDepth, getLongLeaf));
                            const {tags, milliseconds} = readTimed(xmlString, domParser);
                            expect(tags.s.value).to.exist;
                            expect(milliseconds).to.be.below(1000);
                            expect(getSummedDescriptionLength(tags)).to.be.at.most(MAX_NESTING_DEPTH * xmlString.length);
                        });
                    });
                }

                describe('of rdf:value lists', () => {
                    it('should keep a list nested to the deepest allowed level', () => {
                        const tags = readNestedXmp(getNestedRdfValueLists(DEEPEST_ALLOWED_LEVEL, getShortLeaf), domParser);
                        expect(tags.v.description).to.equal(getNestedRdfValueListDescription(DEEPEST_ALLOWED_LEVEL));
                        expect(tags.sibling.value).to.equal('ok');
                    });

                    it('should skip the tag holding a list nested one level deeper and keep its siblings', () => {
                        const tags = readNestedXmp(getNestedRdfValueLists(DEEPEST_ALLOWED_LEVEL + 1, getShortLeaf), domParser);
                        expect(tags.v).to.be.undefined;
                        expect(tags.sibling.value).to.equal('ok');
                    });

                    it('should read lists nested a thousand DOM elements deep fast and with bounded descriptions', () => {
                        const xmlString = getNestedXmlString(getNestedRdfValueLists(333, getLongLeaf));
                        const {tags, milliseconds} = readTimed(xmlString, domParser);
                        expect(tags.v).to.be.undefined;
                        expect(tags.sibling.value).to.equal('ok');
                        expect(milliseconds).to.be.below(1000);
                        expect(getSummedDescriptionLength(tags)).to.be.at.most(MAX_NESTING_DEPTH * xmlString.length);
                    });
                });

                it('should bound the descriptions of lists nested directly in list items at twice the cap', () => {
                    const leaf = 'x'.repeat(100000);
                    for (let pairs = 1; pairs <= 4 * MAX_NESTING_DEPTH; pairs++) {
                        const xmlString = getNestedXmlString(getDirectlyNestedLists(pairs, leaf));
                        const {tags, milliseconds} = readTimed(xmlString, domParser);
                        expect(getSummedDescriptionLength(tags), `pairs ${pairs}`).to.be.at.most(2 * MAX_NESTING_DEPTH * xmlString.length);
                        expect(tags.s.description.includes(leaf), `pairs ${pairs}`).to.equal(pairs < 2 * MAX_NESTING_DEPTH);
                        expect(tags.sibling.value, `pairs ${pairs}`).to.equal('ok');
                        expect(milliseconds, `pairs ${pairs}`).to.be.below(1000);
                    }
                });

                it('should start every read at the top level', () => {
                    const shape = NESTING_SHAPES['rdf:parseType="Resource"'];
                    readNestedXmp(getNestedStructures(shape, DEEPEST_ALLOWED_LEVEL + 10, getShortLeaf), domParser);
                    const tags = readNestedXmp(getNestedStructures(shape, DEEPEST_ALLOWED_LEVEL, getShortLeaf), domParser);
                    expectNestedLevels(tags, shape, DEEPEST_ALLOWED_LEVEL);
                });

                it('should build each description once', () => {
                    const shape = NESTING_SHAPES['rdf:parseType="Resource"'];
                    const xmlString = getNestedXmlString(getNestedStructures(shape, DEEPEST_ALLOWED_LEVEL, getLongLeaf));
                    const {tags, joinedLength} = readCountingJoins(xmlString, domParser);
                    const summedDescriptionLength = getSummedDescriptionLength(tags);
                    expectNestedLevels(tags, shape, DEEPEST_ALLOWED_LEVEL, getLongLeaf);
                    // Joining every description once adds up to their summed length. Re-rendering the
                    // members of each level joins about six times as much at this depth.
                    expect(joinedLength).to.be.at.most(1.5 * summedDescriptionLength);
                });
            });
        });
    }

    describe('packet trimming before parsing', () => {
        const DESCRIPTION = '<rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:MyXMPTag0="4711"></rdf:Description>';

        it('should trim garbage after the trailer on the same line', () => {
            const text = getXmlStringWithPacketWrapper(DESCRIPTION);

            const {tags, received} = readWithRecordingParser(text + '\0\0\0');

            expect(received[0]).to.equal(text);
            expect(tags.MyXMPTag0.value).to.equal('4711');
        });

        for (const [name, terminator] of [['\\n', '\n'], ['\\r', '\r'], ['\\u2028', '\u2028'], ['\\u2029', '\u2029']]) {
            it(`should not trim garbage after the trailer on a following line after ${name}`, () => {
                const text = getXmlStringWithPacketWrapper(DESCRIPTION) + terminator + 'garbage';

                const {received} = readWithRecordingParser(text);

                expect(received[0]).to.equal(text);
            });
        }

        it('should not trim a trailer that ends the input', () => {
            const text = getXmlStringWithPacketWrapper(DESCRIPTION);

            const {received} = readWithRecordingParser(text);

            expect(received[0]).to.equal(text);
        });

        it('should keep everything through the last trailer end that has a character after it', () => {
            const text = getXmlStringWithPacketWrapper(DESCRIPTION);

            const {received} = readWithRecordingParser(text + 'junk"?>x');

            expect(received[0]).to.equal(text + 'junk"?>');
        });

        it('should not keep a trailer end that ends the input', () => {
            const text = getXmlStringWithPacketWrapper(DESCRIPTION);

            const {received} = readWithRecordingParser(text + 'junk"?>');

            expect(received[0]).to.equal(text);
        });

        it('should trim from the first trailer start on the last line', () => {
            const text = getXmlStringWithPacketWrapper(DESCRIPTION);

            const {received} = readWithRecordingParser(text + 'x<?xpacket end="');

            expect(received[0]).to.equal(text);
        });

        it('should not use the trailer start\'s own quote as the trailer end', () => {
            const text = getXmlString(DESCRIPTION) + '\n<?xpacket end="?>x';

            const {received} = readWithRecordingParser(text);

            expect(received[0]).to.equal(text);
        });

        it('should trim after a trailer end that directly follows the trailer start', () => {
            const text = getXmlString(DESCRIPTION) + '\n<?xpacket end=""?>';

            const {received} = readWithRecordingParser(text + 'x');

            expect(received[0]).to.equal(text);
        });

        it('should not trim after a trailer with single quotes', () => {
            const text = getXmlString(DESCRIPTION) + '\n<?xpacket end=\'w\'?>\0\0\0';

            const {received} = readWithRecordingParser(text);

            expect(received[0]).to.equal(text);
        });

        it('should not trim when the trailer start is only on an earlier line', () => {
            const text = getXmlString(DESCRIPTION) + '\n<?xpacket end="w"?>x\njunk"?>y';

            const {received} = readWithRecordingParser(text);

            expect(received[0]).to.equal(text);
        });

        it('should trim garbage before the packet header on the first line', () => {
            const text = getXmlStringWithPacketWrapper(DESCRIPTION);

            const {received} = readWithRecordingParser('junk' + text);

            expect(received[0]).to.equal(text);
        });

        // Every trailer start used to be tried against every trailer end on
        // the line, which is cubic time and makes this time out.
        it('should trim a packet with many trailer candidates on one line in linear time', function () {
            this.timeout(4000);
            const xmlString = '<?xpacket end=""?>'.repeat(1600) + '\n';

            expect(readWithStubParser(xmlString)).to.equal(xmlString);
        });

        // With no usable trailer end, every trailer start on the last line used
        // to scan the rest of the line, which is quadratic time and makes this
        // time out.
        it('should search a last line of many trailer starts in linear time', function () {
            this.timeout(4000);
            const xmlString = '<?xpacket end="'.repeat(40000) + '"?>';

            expect(readWithStubParser(xmlString)).to.equal(xmlString);
        });
    });

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

function expectNonUtf8PacketConvertedInChunks(domParser) {
    const text = 'a'.repeat(100000);
    const packet = getXmlString(`<rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:Bad="\xFF"><xmp:T>${text}</xmp:T></rdf:Description>`);
    const dataView = getDataView(packet);
    const originalFromCharCode = String.fromCharCode;
    let calls = 0;
    let maxArgs = 0;
    const restoreFromCharCode = swapProperties(String, {
        fromCharCode(...charCodes) {
            maxArgs = Math.max(maxArgs, charCodes.length);
            calls++;
            return originalFromCharCode.apply(String, charCodes);
        }
    });

    let tags;
    try {
        tags = XmpTags.read(dataView, [{dataOffset: 0, length: packet.length}], domParser);
    } finally {
        restoreFromCharCode();
    }

    expect(calls).to.be.at.most(Math.ceil(packet.length / 8192) + 2);
    expect(maxArgs).to.be.at.most(8192);
    expect(tags['T'].value).to.equal(text);
    expect(tags['Bad'].value).to.equal('\xFF');
}

// The first byte of the UTF-8 é is the last byte of the first 8192-byte chunk.
function expectNonUtf8PacketBytesKeptAcrossChunkBoundaries(domParser) {
    const prefix = '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        + '<rdf:Description xmlns:xmp="http://ns.example.com/xmp" xmp:Controls="\x80\x85\x9F"><xmp:T>';
    const padding = 'a'.repeat(8191 - prefix.length);
    const packet = prefix + padding + '\xC3\xA9' + 'b' + '</xmp:T></rdf:Description></rdf:RDF>';
    expect(packet.indexOf('\xC3')).to.equal(8191);
    expect(packet.length).to.be.above(8192);
    expect(packet.length % 8192).to.not.equal(0);

    const tags = XmpTags.read(getDataView(packet), [{dataOffset: 0, length: packet.length}], domParser);

    expect(tags._raw).to.equal(packet);
    expect(tags['T'].value).to.equal(padding + 'é' + 'b');
}

// getDataView takes one byte per character, so text that goes into a packet
// as UTF-8 has to be spelled out as its bytes.
function toUtf8ByteString(text) {
    return Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join('');
}

function readWithRecordingParser(text) {
    const bytes = toUtf8ByteString(text);
    const received = [];
    const realParser = new XmldomDomParser({onError: onErrorStopParsing});
    const domParser = {
        parseFromString(xml, mimeType) {
            received.push(xml);
            return realParser.parseFromString(xml, mimeType);
        }
    };

    const tags = XmpTags.read(getDataView(bytes), [{dataOffset: 0, length: bytes.length}], domParser);

    return {tags, received};
}

// Only the trimming is timed: the stub hands back an empty document.
function readWithStubParser(xmlString) {
    const received = [];
    const domParser = {
        parseFromString(xml) {
            received.push(xml);
            return {getElementsByTagName: () => [], childNodes: []};
        }
    };

    XmpTags.read(getDataView(xmlString), [{dataOffset: 0, length: xmlString.length}], domParser);

    return received[0];
}

// getPaddedDataView leaves the window ending where the buffer ends, so an
// over-read past the end cannot show up. This one surrounds the window.
function getSurroundedDataView(content, pad) {
    const buffer = new ArrayBuffer(pad + content.length + SURROUNDING_SIZE);
    const view = new Uint8Array(buffer);
    view.fill(0x99);
    for (let i = 0; i < content.length; i++) {
        view[pad + i] = content.charCodeAt(i);
    }
    return new DataView(buffer, pad, content.length);
}

function getPaddedDataView(content, pad) {
    const buffer = new ArrayBuffer(pad + content.length);
    const view = new Uint8Array(buffer);
    view.fill(0x99, 0, pad);
    for (let i = 0; i < content.length; i++) {
        view[pad + i] = content.charCodeAt(i);
    }
    return new DataView(buffer, pad);
}

function readNestedXmp(content, domParser) {
    return XmpTags.read(getNestedXmlString(content), [], domParser);
}

function getNestedXmlString(content) {
    return getXmlString(`
        <rdf:Description
            xmlns:xmp="http://ns.example.com/xmp"
            xmlns:exif="http://ns.adobe.com/exif/1.0/"
            xmlns:b="http://ns.example.com/b"
            xmlns:c="http://ns.example.com/c">
            ${content}
        </rdf:Description>
    `);
}

function getNestedStructures(shape, depth, getLeaf) {
    let content = '';
    for (let level = depth; level >= 1; level--) {
        content = shape.nest(getLeaf(level), content);
    }
    return `${content}<xmp:sibling>ok</xmp:sibling>`;
}

function getShortLeaf(level) {
    return `leaf${level}`;
}

function expectNestedLevels(tags, shape, deepestLevel, getLeaf = getShortLeaf) {
    expect(tags.sibling.value).to.equal('ok');
    let tag = tags.s;
    for (let level = 1; level <= deepestLevel; level++) {
        expect(tag.description).to.equal(getNestedDescription(level, deepestLevel, getLeaf));
        const members = shape.getMembers(tag);
        expect(members.t.value).to.equal(getLeaf(level));
        tag = members.s;
    }
    expect(tag).to.be.undefined;
}

function getNestedDescription(level, deepestLevel, getLeaf) {
    const memberDescriptions = [];
    for (let nestedLevel = level; nestedLevel <= deepestLevel; nestedLevel++) {
        memberDescriptions.push(`t: ${getLeaf(nestedLevel)}`);
    }
    return memberDescriptions.join('; s: ');
}

function getLongLeaf(level) {
    return `leaf${level}`.padEnd(200, 'x');
}

function readTimed(xmlString, domParser) {
    const start = Date.now();
    const tags = XmpTags.read(xmlString, [], domParser);
    return {tags, milliseconds: Date.now() - start};
}

function getSummedDescriptionLength(tags) {
    let length = 0;
    for (const name in tags) {
        if (name !== '_raw') {
            length += getSummedDescriptionLengthOfTag(tags[name]);
        }
    }
    return length;
}

function getSummedDescriptionLengthOfTag(tag) {
    return tag.description.length + getSummedDescriptionLengthOfValue(tag.value);
}

function getSummedDescriptionLengthOfValue(value) {
    if (Array.isArray(value)) {
        return value.reduce((length, item) => length + getSummedDescriptionLengthOfItem(item), 0);
    }
    if (typeof value === 'object') {
        return getSummedDescriptionLength(value);
    }
    return 0;
}

// A list item is either a tag or a bare structure of tags.
function getSummedDescriptionLengthOfItem(item) {
    if (typeof item.description === 'string') {
        return getSummedDescriptionLengthOfTag(item);
    }
    return getSummedDescriptionLength(item);
}

// Every rdf:value list holds a leaf followed by the next level, down to a last item with the value "end".
function getNestedRdfValueLists(depth, getLeaf) {
    let item = '<rdf:li rdf:parseType="Resource"><rdf:value>end</rdf:value></rdf:li>';
    for (let level = depth; level >= 1; level--) {
        item = `<rdf:li rdf:parseType="Resource"><rdf:value><rdf:Seq><rdf:li>${getLeaf(level)}</rdf:li>${item}</rdf:Seq></rdf:value></rdf:li>`;
    }
    return `<xmp:v><rdf:Seq>${item}</rdf:Seq></xmp:v><xmp:sibling>ok</xmp:sibling>`;
}

function getNestedRdfValueListDescription(depth) {
    const itemDescriptions = [];
    for (let level = 1; level <= depth; level++) {
        itemDescriptions.push(getShortLeaf(level));
    }
    return [...itemDescriptions, 'end'].join(', ');
}

// Every list holds one item, which holds the next list directly. Each pair of
// elements is half a level: the list tag and the item tag both carry the subtree.
function getDirectlyNestedLists(pairs, leaf) {
    let content = leaf;
    for (let pair = 1; pair <= pairs; pair++) {
        content = `<rdf:Seq><rdf:li>${content}</rdf:li></rdf:Seq>`;
    }
    return `<xmp:s>${content}</xmp:s><xmp:sibling>ok</xmp:sibling>`;
}

// The document is parsed before Array.prototype.join is counted so that only the reading of the
// tags is counted, not the DOM parser's own joins.
function readCountingJoins(xmlString, domParser) {
    const doc = (domParser || new XmldomDomParser({onError: onErrorStopParsing})).parseFromString(xmlString, 'application/xml');
    const originalJoin = Array.prototype.join;
    let joinedLength = 0;
    const restore = swapProperties(Array.prototype, {
        join(...args) {
            const joined = originalJoin.apply(this, args);
            joinedLength += joined.length;
            return joined;
        }
    });
    let tags;
    try {
        tags = XmpTags.read(xmlString, [], {parseFromString: () => doc});
    } finally {
        restore();
    }
    return {tags, joinedLength};
}
