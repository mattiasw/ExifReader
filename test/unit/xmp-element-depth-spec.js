/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {DOMParser as XmldomDomParser, Document as XmldomDocument, DOMImplementation as XmldomDomImplementation, onErrorStopParsing} from '@xmldom/xmldom';
import {exceedsMarkupBounds} from '../../src/xmp-element-depth.js';
import {swapProperties} from './test-utils.js';

const BOUND = 256;

// xmldom reads every character up to a space as whitespace, \u0080 too, and the
// line ends its normalizeLineEndings turns into \n.
const XMLDOM_WHITESPACE = [
    ['a space', ' '],
    ['a tab', '\t'],
    ['a carriage return', '\r'],
    ['a line feed', '\n'],
    ['a control character', '\x01'],
    ['a vertical tab', '\x0b'],
    ['U+0080', '\u0080'],
    ['a next line character', '\u0085'],
    ['a line separator', '\u2028'],
    ['a paragraph separator', '\u2029']
];

const NOT_XMLDOM_WHITESPACE = [
    ['a no-break space', '\u00a0'],
    ['U+0084', '\u0084'],
    ['U+2027', '\u2027'],
    ['U+0021', '!']
];

// Start tags in every attribute shape xmldom reads, with the markup node count the scan gives each.
const ATTRIBUTE_SHAPES = [
    ['unquoted values', '<r><a b=c d=e/></r>', 4],
    ['attributes without a value', '<r><a b c d/></r>', 5],
    ['attributes without whitespace between them', '<r><a b="1"c="2"/></r>', 4],
    ['quoted values without an equals sign', '<r><a b"1" c"2"/></r>', 4],
    ['duplicate attributes', '<r><a b="1" b="2"/></r>', 4],
    ['> and /> in quoted values', '<r><a b=">" c="/>" d=\'>\' e=\'/>\'/></r>', 6],
    ['whitespace around the equals sign', '<r><a b = "1" c\t=\t\'2\'/></r>', 4],
    ['a quote right after an unquoted value', '<r><a b=c"d e="x>y" f g h i/></r>', 9],
    ['a quote right after an unquoted value, repeated', `<r>${'<a b=c"d e="x>y" f g h i/>'.repeat(5)}</r>`, 41],
    ['a < in an attribute name', '<r><a b<c="1" d="2"/></r>', 4],
    ['a < after an attribute name', '<r><a b <c="1" d="2"/></r>', 4],
    ['a < in an unquoted value', '<r><a b=c<d e="1"/></r>', 5],
    ['a < as a value', '<r><a b=<"x" c="1"/></r>', 3],
    ['a value whose quote ends at the next attribute', '<r><a b="1 c="2" d="3"/></r>', 4],
    ['an unterminated quote', '<r><a b="x/></r>', 2],
    ['an unterminated quote and no further tag', '<r><a b c=\'x d e', 3],
    ['an unterminated tag', '<r><a b c', 4],
    ['an unterminated tag with an unquoted value', '<r><a b=c', 3],
    ['an equals sign without a value', '<r><a b=/></r>', 2],
    ['a slash right after an equals sign', '<r><a b=/c d="1"/></r>', 2],
    ['an equals sign after a quoted value', '<r><a b="1"=c d="2"/></r>', 3],
    ['a slash inside a tag', '<r><a b="1"/ c="2"/></r>', 3],
    ['a slash before an attribute', '<r><a/b="1"/></r>', 2],
    ['a slash in an attribute name', '<r><a b/c="1"/></r>', 3],
    ['a slash in an unquoted value', '<r><a b=c/d e="1"/></r>', 4],
    ['a slash after an attribute name and whitespace', '<r><a b / c="1"/></r>', 4],
    ['an attribute that ends the tag without a value', '<r><a b c>x</a></r>', 4],
    ['an unquoted value that ends the tag', '<r><a b=c>d e="1"</a></r>', 3],
    ['namespace declarations beside attributes', '<r xmlns="u" xmlns:b="v"><b:a xmlns:c="w" c:d="1"/></r>', 6]
];

describe('xmp-element-depth', () => {
    describe('depth bound', () => {
        it('should not exceed a bound the elements are nested exactly to', () => {
            expect(exceedsMarkupBounds('<a><a><a></a></a></a>', 3)).to.be.false;
            expect(exceedsMarkupBounds(getTower(BOUND), BOUND)).to.be.false;
        });

        it('should exceed a bound the elements are nested one level deeper than', () => {
            expect(exceedsMarkupBounds('<a><a><a></a></a></a>', 2)).to.be.true;
            expect(exceedsMarkupBounds(getTower(BOUND + 1), BOUND)).to.be.true;
        });

        it('should not exceed any bound for a string without elements', () => {
            expect(exceedsMarkupBounds('', 0)).to.be.false;
            expect(exceedsMarkupBounds('text > only', 0)).to.be.false;
        });
    });

    describe('self-closing tags', () => {
        it('should count a self-closing element only as a leaf', () => {
            const xmlString = '<r><a/><a b="1"/><a /><a b=\'x\' /><a\nb="1"\n/></r>';
            expect(exceedsMarkupBounds(xmlString, 2)).to.be.false;
            expect(exceedsMarkupBounds(xmlString, 1)).to.be.true;
        });

        it('should exceed the bound with a self-closing leaf one level below it', () => {
            expect(exceedsMarkupBounds(getTower(BOUND - 1, '<a b="1"/>'), BOUND)).to.be.false;
            expect(exceedsMarkupBounds(getTower(BOUND, '<a b="1"/>'), BOUND)).to.be.true;
        });

        it('should count a self-closing root', () => {
            expect(exceedsMarkupBounds('<a/>', 0)).to.be.true;
            expect(exceedsMarkupBounds('<a/>', 1)).to.be.false;
        });
    });

    describe('end tags', () => {
        it('should lower the depth so that many shallow siblings stay within the bound', () => {
            const xmlString = '<r>' + '<a xmlns:b="u"></a>'.repeat(5000) + '</r>';
            expect(exceedsMarkupBounds(xmlString, 2)).to.be.false;
        });

        it('should never lower the depth below zero', () => {
            const xmlString = '</a>'.repeat(10) + getTower(3);
            expect(exceedsMarkupBounds(xmlString, 3)).to.be.false;
            expect(exceedsMarkupBounds(xmlString, 2)).to.be.true;
        });

        for (const [name, endTag] of [
            ['a comment start', '</a\n<!-->'],
            ['a comment start after a carriage return', '</a\r<!-->'],
            ['a processing instruction start', '</a\n<?>'],
            ['a declaration with a quote', '</a\n<!x ">']
        ]) {
            it(`should end an end tag at its first > when ${name} follows its name`, () => {
                const xmlString = '<a>' + endTag + getTower(BOUND + 1, '', '<a xmlns:b="u">');
                expect(exceedsMarkupBounds(xmlString, BOUND)).to.be.true;
            });
        }

        it('should read an end tag that swallows the next end tag as one', () => {
            const xmlString = '<a xmlns:b="u"><a xmlns:b="u"></a\n</a>'.repeat(BOUND);
            expect(exceedsMarkupBounds(xmlString, BOUND)).to.be.true;
        });
    });

    describe('markup that is not an element', () => {
        for (const [name, markup] of [
            ['a comment', '<!-- <a><a> " \' > -->'],
            ['a CDATA section', '<![CDATA[ <a><a> " \' > ]]>'],
            ['a processing instruction', '<?p <a><a> " \' > ?>']
        ]) {
            it(`should skip ${name}`, () => {
                const xmlString = `<r>${markup}<a></a></r>`;
                expect(exceedsMarkupBounds(xmlString, 2)).to.be.false;
                expect(exceedsMarkupBounds(xmlString, 1)).to.be.true;
            });
        }

        for (const [name, doctype] of [
            ['an external ID whose literal holds a comment start', '<!DOCTYPE r SYSTEM "a><!--">'],
            ['a public ID whose literals hold markup', '<!DOCTYPE r PUBLIC "<a>" \'a>"<b>\'>'],
            [
                'an internal subset whose entity values hold markup and quotes',
                '<!DOCTYPE r [<!ENTITY e "<a>x><!--]>\'"><!ENTITY f \'<a>"]>\'>]>'
            ],
            [
                'a comment and a processing instruction with apostrophes in its internal subset',
                '<!DOCTYPE r [<!-- it\'s <a> --><?p it\'s <a> ?><!ENTITY e \'y\'>]>'
            ],
            ['a lowercase doctype', '<!doctype r [<!ENTITY e "x><!--">]>']
        ]) {
            it(`should skip a DOCTYPE with ${name} and still count the elements after it`, () => {
                expect(exceedsMarkupBounds(`${doctype}<r></r><!-- -->`, 1)).to.be.false;
                const xmlString = doctype + getTower(BOUND + 1, '', '<a xmlns:b="u">') + '<!-- -->';
                expect(exceedsMarkupBounds(xmlString, BOUND)).to.be.true;
            });
        }
    });

    describe('attribute values', () => {
        it('should not end a tag at a > in a quoted attribute value', () => {
            expect(exceedsMarkupBounds('<r><a b="x>y" c=\'x>y\'><a/></a></r>', 3)).to.be.false;
            expect(exceedsMarkupBounds('<r><a b="x>y" c=\'x>y\'><a/></a></r>', 2)).to.be.true;
        });

        it('should not end a tag at a /> in a quoted attribute value', () => {
            expect(exceedsMarkupBounds(getTower(3, '', '<a b="/>">'), 2)).to.be.true;
            expect(exceedsMarkupBounds(getTower(3, '', '<a b=\'/>\'>'), 2)).to.be.true;
            expect(exceedsMarkupBounds(getTower(3, '', '<a b=\'"/>\'>'), 2)).to.be.true;
        });

        it('should read attributes with whitespace around the equals sign', () => {
            const xmlString = '<r><a b = "1"\tc\n=\n\'2\' /><a/></r>';
            expect(exceedsMarkupBounds(xmlString, 2)).to.be.false;
            expect(exceedsMarkupBounds(xmlString, 1)).to.be.true;
        });
    });

    describe('start tags that are not well-formed', () => {
        it('should count a tag with an unquoted value holding a quote as open', () => {
            expect(exceedsMarkupBounds(getTower(BOUND + 1, '', '<p0:x xmlns:p0="u" b=c"d> "/>'), BOUND)).to.be.true;
            expect(exceedsMarkupBounds(getTower(BOUND + 1, '', '<p0:x xmlns:p0=\'u\' b=c\'d> \'/>'), BOUND)).to.be.true;
        });

        for (const tag of [
            '<a b>',
            '<a b/>',
            '<a b"x">',
            '<a b"x"/>',
            '<a "x"/>',
            '<a ="x"/>',
            '<a b x="y"/>',
            '<a b x"y"/>',
            '<a b=/>',
            '<a b=c/>',
            '<a b=cdc/>',
            '<a / >',
            '<a b="1"/ >',
            '<a b="1"c="2"/>',
            '<a/b/>',
            '<a b="x>',
            '<a b=\'x>',
            '< a/>',
            '< />',
            '<>',
            '<=a/>'
        ]) {
            it(`should count ${tag} as an open element`, () => {
                expect(exceedsMarkupBounds(getTower(3, '', tag), 2)).to.be.true;
            });
        }

        it('should not read a quoted value past the next <', () => {
            expect(exceedsMarkupBounds('<r><a b="x<y" /></r>', 2)).to.be.true;
            expect(exceedsMarkupBounds('<r><a b=\'x<y\' /></r>', 2)).to.be.true;
        });

        it('should count an element whose name is not ASCII', () => {
            expect(exceedsMarkupBounds(getTower(3, '', '<é xmlns:b="u">'), 2)).to.be.true;
            expect(exceedsMarkupBounds(getTower(3, '', '<é xmlns:b="u">'), 3)).to.be.false;
        });
    });

    describe('unterminated markup', () => {
        for (const xmlString of [
            '<r><!-- <a><a>',
            '<r><![CDATA[ <a><a>',
            '<r><? <a><a>',
            '<!DOCTYPE r "<a><a>',
            '<!DOCTYPE r [<!ENTITY e "<a><a>',
            '<!DOCTYPE r SYSTEM \'<a><a>',
            '<!DOCTYPE r',
            '<r><!x',
            '<r a="',
            '<r a=\'x',
            '<r',
            '<',
            '<r></r',
            '<r></'
        ]) {
            it(`should return for ${JSON.stringify(xmlString)}`, () => {
                expect(exceedsMarkupBounds(xmlString, 1)).to.be.false;
            });
        }
    });

    describe('node count bound', () => {
        for (const [name, xmlString, nodeCount] of [
            ['start tags', '<r><a></a><a>x</a></r>', 3],
            ['self-closing tags', '<r><a/><a /></r>', 3],
            ['attributes', '<r a="1"><a b=\'2\' c="3"/></r>', 5],
            ['namespace declarations', '<r xmlns="u"><a xmlns:b="v"/></r>', 4],
            ['comments', '<!-- c --><r><!-- <a> --></r>', 3],
            ['processing instructions', '<?xml version="1.0"?><r><?p <a> ?></r>', 3],
            ['CDATA sections', '<r><![CDATA[<a>]]><![CDATA[x]]></r>', 3],
            ['a DOCTYPE', '<!DOCTYPE r><r/>', 2],
            ['the declarations in an internal subset', '<!DOCTYPE r [<!ENTITY e "x"><!ELEMENT r ANY>]><r/>', 4]
        ]) {
            it(`should count ${name}`, () => {
                expectNodeCount(xmlString, nodeCount);
            });
        }

        it('should not count text', () => {
            expect(exceedsMarkupBounds('text > = "x" only', Infinity, 0)).to.be.false;
            expectNodeCount('<r>a="1" b c</r>', 1);
            expectNodeCount('<r><a b="1">c="2" d e=f g</a> h</r>', 3);
        });

        it('should not count any node without a bound', () => {
            expect(exceedsMarkupBounds('<r><a b="1"/><!-- --></r>', Infinity)).to.be.false;
        });

        it('should bound the nodes and the depth independently', () => {
            expect(exceedsMarkupBounds('<a><a><a></a></a></a>', 2, 100)).to.be.true;
            expect(exceedsMarkupBounds('<a><a><a></a></a></a>', 3, 2)).to.be.true;
            expect(exceedsMarkupBounds('<a><a><a></a></a></a>', 3, 3)).to.be.false;
        });

        for (const [name, xmlString, nodeCount] of ATTRIBUTE_SHAPES) {
            it(`should count every attribute xmldom can build with ${name}`, () => {
                expectNodeCount(xmlString, nodeCount);
            });
        }

        for (const [name, separator] of XMLDOM_WHITESPACE) {
            it(`should separate attributes at ${name} as xmldom does`, () => {
                expectNodeCount(`<r><a b${separator}c${separator}d/></r>`, 5);
                expectNodeCount(`<r><a b=c${separator}d${separator}e=f/></r>`, 5);
                expectNodeCount(`<r><a b=c${separator}"f"${getAttributes(50)}"/></r>`, 3);
            });
        }

        for (const [name, character] of NOT_XMLDOM_WHITESPACE) {
            it(`should not separate attributes at ${name}, as xmldom does not`, () => {
                expectNodeCount(`<r><a b${character}c${character}d/></r>`, 3);
                expectNodeCount(`<r><a b=c${character}"f"${getAttributes(50)}"/></r>`, 54);
            });
        }

        it('should stop scanning at the first node over the bound', () => {
            const xmlString = new String('<r>' + '<a b="1"/>'.repeat(100000) + '</r>');
            let furthestIndex = 0;
            xmlString.indexOf = function (searchString, fromIndex) {
                furthestIndex = Math.max(furthestIndex, fromIndex ?? 0);
                return String.prototype.indexOf.call(this, searchString, fromIndex);
            };
            expect(exceedsMarkupBounds(xmlString, Infinity, 10)).to.be.true;
            expect(furthestIndex).to.be.below(100);
        });
    });

    // The bound holds only if the scan never sees the elements shallower than xmldom builds them.
    describe('agreement with @xmldom/xmldom', () => {
        const xmldomParsers = {
            'stopping on errors': new XmldomDomParser({onError: onErrorStopParsing}),
            'ignoring errors': new XmldomDomParser({onError: () => undefined})
        };

        for (const parserName in xmldomParsers) {
            it(`should see every element at least as deep as xmldom ${parserName}`, () => {
                const parser = xmldomParsers[parserName];
                const undercounts = [];
                let parsedCount = 0;
                for (const name in DIFFERENTIAL_INPUTS) {
                    const domDepth = getXmldomDepth(parser, DIFFERENTIAL_INPUTS[name]);
                    if (domDepth === undefined) {
                        continue;
                    }
                    parsedCount++;
                    if (domDepth > 0 && !exceedsMarkupBounds(DIFFERENTIAL_INPUTS[name], domDepth - 1)) {
                        undercounts.push(`${name} (xmldom depth ${domDepth})`);
                    }
                }
                expect(undercounts).to.deep.equal([]);
                expect(parsedCount).to.be.at.least(30);
            });
        }

        describe('node counts', () => {
            let createdNodeCount = 0;
            let restoreDocument;
            let restoreDomImplementation;

            beforeEach(() => {
                restoreDocument = swapProperties(XmldomDocument.prototype, getCountingMethods(XmldomDocument.prototype, [
                    'createElementNS',
                    'createElement',
                    'createAttributeNS',
                    'createAttribute',
                    'createComment',
                    'createCDATASection',
                    'createProcessingInstruction'
                ]));
                restoreDomImplementation = swapProperties(
                    XmldomDomImplementation.prototype,
                    getCountingMethods(XmldomDomImplementation.prototype, ['createDocumentType'])
                );
            });

            afterEach(() => {
                restoreDocument();
                restoreDomImplementation();
            });

            function getCountingMethods(prototype, names) {
                const methods = {};
                for (const name of names) {
                    const method = prototype[name];
                    methods[name] = function (...args) {
                        createdNodeCount++;
                        return method.apply(this, args);
                    };
                }
                return methods;
            }

            function getCreatedNodeCount(parser, xmlString) {
                createdNodeCount = 0;
                try {
                    parser.parseFromString(xmlString, 'application/xml');
                } catch (error) {
                    // The nodes created before the error still count.
                }
                return createdNodeCount;
            }

            for (const parserName in xmldomParsers) {
                it(`should count at least the nodes xmldom ${parserName} creates`, () => {
                    const undercounts = getUndercounts(xmldomParsers[parserName], DIFFERENTIAL_INPUTS, 0.6);
                    expect(undercounts).to.deep.equal([]);
                });

                it(`should count at least the nodes xmldom ${parserName} creates for attribute shapes`, () => {
                    const undercounts = getUndercounts(xmldomParsers[parserName], ATTRIBUTE_SHAPE_INPUTS, 0.5);
                    expect(undercounts).to.deep.equal([]);
                });

                it(`should count at least the nodes xmldom ${parserName} creates for random start tags`, () => {
                    const undercounts = getUndercounts(xmldomParsers[parserName], getRandomStartTags(6000), 0.1);
                    expect(undercounts).to.deep.equal([]);
                });
            }

            // The <r> wrapper always builds, so only an input that builds more than one node tests the count.
            function getUndercounts(parser, inputs, minimumTestingShare) {
                const undercounts = [];
                let testingCount = 0;
                for (const name in inputs) {
                    const domNodeCount = getCreatedNodeCount(parser, inputs[name]);
                    if (domNodeCount > 1) {
                        testingCount++;
                    }
                    if (domNodeCount > 0 && !exceedsMarkupBounds(inputs[name], Infinity, domNodeCount - 1)) {
                        undercounts.push(`${name} ${JSON.stringify(inputs[name])} (xmldom nodes ${domNodeCount})`);
                    }
                }
                expect(testingCount).to.be.at.least(Object.keys(inputs).length * minimumTestingShare);
                return undercounts;
            }
        });
    });

    describe('running time', () => {
        const SIZE = 2 * 1024 * 1024;

        for (const [name, unit] of [
            ['many tags with an unclosed double quote', '<a b="x '],
            ['many tags with an unclosed single quote', '<a b=\'x '],
            ['many end tags without >', '</a '],
            ['many < characters', '<'],
            ['a DOCTYPE with many [', '<!DOCTYPE r ['],
            ['many shallow towers', getTower(255)],
            ['many self-closing siblings', '<a b="1"/>']
        ]) {
            it(`should scan ${name} in linear time`, function () {
                this.timeout(10000);
                expectLinearScan(unit.repeat(Math.ceil(SIZE / unit.length)));
            });
        }

        it('should scan a tag with many attributes and no > in linear time', function () {
            this.timeout(10000);
            expectLinearScan('<a' + ' b="1"'.repeat(Math.ceil(SIZE / 6)));
        });

        it('should scan a tag with many quotes and no > in linear time', function () {
            this.timeout(10000);
            expectLinearScan('<a b="' + '\''.repeat(SIZE));
        });

        for (const [name, unit] of [
            ['many unquoted values', ' b=c'],
            ['many equals signs', '='],
            ['many quoted values without an equals sign', ' b"x"'],
            ['many quotes after unquoted values', ' b=c"'],
            ['many control character separators', '\x01b'],
            ['many attributes without a value', ' b']
        ]) {
            it(`should scan a tag with ${name} and no > in linear time`, function () {
                this.timeout(10000);
                expectLinearScan('<a b' + unit.repeat(Math.ceil(SIZE / unit.length)));
            });
        }
    });
});

function getTower(depth, leaf = '', startTag = '<a>', endTag = '</a>') {
    return startTag.repeat(depth) + leaf + endTag.repeat(depth);
}

function expectNodeCount(xmlString, nodeCount) {
    expect(exceedsMarkupBounds(xmlString, Infinity, nodeCount)).to.be.false;
    expect(exceedsMarkupBounds(xmlString, Infinity, nodeCount - 1)).to.be.true;
}

function getAttributes(count) {
    let attributes = '';
    for (let i = 0; i < count; i++) {
        attributes += ` d${i}="g${i}"`;
    }
    return attributes;
}

function getXmldomDepth(parser, xmlString) {
    let doc;
    try {
        doc = parser.parseFromString(xmlString, 'application/xml');
    } catch (error) {
        return undefined;
    }
    let maxDepth = 0;
    const stack = [{node: doc, depth: 0}];
    while (stack.length > 0) {
        const {node, depth} = stack.pop();
        maxDepth = Math.max(maxDepth, depth);
        for (let child = node.firstChild; child; child = child.nextSibling) {
            if (child.nodeType === 1) {
                stack.push({node: child, depth: depth + 1});
            }
        }
    }
    return maxDepth;
}

function expectLinearScan(xmlString) {
    const start = Date.now();
    exceedsMarkupBounds(xmlString, Infinity);
    expect(Date.now() - start).to.be.below(1000);
}

const DEEP = 300;

const DIFFERENTIAL_INPUTS = {
    doctypeEntityComment: '<!DOCTYPE r [<!ENTITY e "x><!--">]><r><a><a></a></a></r><!-- -->',
    entityExpansion: '<!DOCTYPE r [<!ENTITY e "<a><a/></a>">]><r>&e;</r>',
    nonAscii: '<r><é><é></é></é></r>',
    colonStart: '<r><:a><:a></:a></:a></r>',
    unquotedSlash: '<r><a b=c/><a></a></a></r>',
    strayQuote: '<r><a x="1" \'><a><a></a></a></a></r>',
    spaceSlash: '<r><a / ><b/></a></r>',
    mismatch: '<r><a><b></c></b></a></r>',
    ltSpace: '<r>< 1</r>',
    shortComment: '<r><!--><a><a></a></a><!-- --></r>',
    shortComment3: '<r><!---><a><a></a></a><!-- --></r>',
    piQuote: '<r><?x a="?>"?><a></a></r>',
    systemLiteral: '<!DOCTYPE r SYSTEM "a><!--"><r><a><a></a></a></r><!-- -->',
    publicLiteralGt: '<!DOCTYPE r PUBLIC "p" "a>b"><r><a><a></a></a></r>',
    bangOther: '<r><!foo><a></a></r>',
    endSpace: '<r><a><a></ a></a></r>',
    ltInAttribute: '<r><a b="<c>"><a></a></a></r>',
    doctypeCommentInSubset: '<!DOCTYPE r [<!-- > <!-- -->]><r><a><a></a></a></r>',
    doctypePiInSubset: '<!DOCTYPE r [<?p > ?>]><r><a></a></r>',
    attlistDefaultGt: '<!DOCTYPE r [<!ATTLIST r a CDATA "x><!--">]><r><a><a></a></a></r><!-- -->',
    subsetBracketInLiteral: '<!DOCTYPE r [<!ENTITY e "]>">]><r><a><a></a></a></r>',
    cdataBrackets: '<r><![CDATA[ ]] > ]]><a></a></r>',
    xmlDeclarationInside: '<r><?xml version="1.0"?><a/></r>',
    tabEnd: '<r><a\t/><a></a></r>',
    equalsSpaceUnquoted: '<r><a b = c/><a></a></a></r>',
    duplicateAttribute: '<r><a b="1" b="2"><a></a></a></r>',
    unquotedQuoteInValue: '<r><a b=c"d> x "/><a b=c"d> x "/></a></a></r>',
    unquotedEmptySlash: '<r><a b=/><a></a></a></r>',
    slashSpace: '<r><a/ ><a></a></a></r>',
    attributeSlashSpace: '<r><a b="1"/ ><a></a></a></r>',
    singleQuotedLt: '<r><a b=\'x<y\'><a></a></a></r>',
    unquotedLt: '<r><a b=x<y><a></a></a></r>',
    quoteWithoutName: '<r><a "x"><a></a></a></r>',
    noEquals: '<r><a b"x"><a></a></a></r>',
    noSpaceBetweenAttributes: '<r><a b="x"c="y"><a></a></a></r>',
    singleQuotedDoubleQuoteSlash: '<r><a b=\'"/>\'><a></a></a></r>',
    unquotedSingleQuote: '<r><a b=c\'d>x\'/><a></a></a></r>',
    whitespaceAroundEquals: '<r><a b = "x" ><a></a></a></r>',
    newlineSelfClosing: '<r><a\nb="x"\n/><a></a></r>',
    slashNewline: '<r><a b="x"/\n><a></a></a></r>',
    noValue: '<r><a b><a></a></a></r>',
    unquotedGtInTextAfter: '<r><a b=c>x/><a></a></a></r>',
    unquotedThenQuoted: '<r><a b=c d="/>"><a></a></a></r>',
    nameWithQuote: '<r><a"b="x"><a></a></a></r>',
    tagNameSlash: '<r><a/b><a></a></a></r>',
    lowercaseDoctype: '<!doctype r [<!ENTITY e "x><!--">]><r><a><a></a></a></r><!-- -->',
    doctypeAfterRoot: '<r><a></a></r><!DOCTYPE r>',
    doctypeInRoot: '<r><!DOCTYPE r><a></a></r>',
    parameterEntity: '<!DOCTYPE r [<!ENTITY % p "x"> %p; ]><r><a></a></r>',
    subsetCommentQuote: '<!DOCTYPE r [<!-- it\'s --><!ENTITY e \'y\'>]><r><a></a></r>',
    subsetPiQuote: '<!DOCTYPE r [<?p it\'s ?><!ENTITY e \'y\'>]><r><a></a></r>',
    systemSingleDoubleQuote: '<!DOCTYPE r SYSTEM \'a"b\'><r><a></a></r>',
    cdataOutsideRoot: '<![CDATA[x]]><r><a></a></r>',
    textGt: '<r>a > b<a></a></r>',
    unterminatedQuoteInTag: '<r><a b="x><a></a></r>',
    ltDigit: '<r><1a><a></a></1a></r>',
    ltDash: '<r><-a><a></a></-a></r>',
    ltDot: '<r><.a><a></a></.a></r>',
    ltSpaceName: '<r>< a><a></a></ a></r>',
    ltTabName: '<r><\ta><a></a></a></r>',
    emptyEndTag: '<r><a></></a></r>',
    endTagLeadingSpace: '<r><a><a></ a></a></r>',
    endTagAttribute: '<r><a><a></a b></a></r>',
    endTagNewlineComment: `<r><a></a\n<!-->${getTower(3)}</r>`,
    endTagCarriageReturnComment: `<r><a></a\r<!-->${getTower(3)}</r>`,
    endTagNewlinePi: `<r><a></a\n<?>${getTower(3)}</r>`,
    endTagNewlineDeclaration: `<r><a></a\n<!x ">${getTower(3)}</r>`,
    endTagSwallowsEndTag: '<a xmlns:b="u"><a xmlns:b="u"></a\n</a>'.repeat(3),
    deepDoctypeEntityComment: `<!DOCTYPE r [<!ENTITY e "x><!--">]><r>${getTower(DEEP, '', '<a xmlns:b="u">')}</r><!-- -->`,
    deepSystemLiteral: `<!DOCTYPE r SYSTEM "a><!--"><r>${getTower(DEEP, '', '<a xmlns:b="u">')}</r><!-- -->`,
    deepUnquoted: `<r>${getTower(DEEP, '', '<a xmlns:b="u" c=d"e> "/>')}</r>`,
    deepUnquotedSingle: `<r>${getTower(DEEP, '', '<a xmlns:b=\'u\' c=d\'e> \'/>')}</r>`,
    deepNonAscii: `<r>${getTower(DEEP, '', '<é xmlns:b="u">', '</é>')}</r>`,
    deepNoEquals: `<r>${getTower(DEEP, '', '<a b"x" xmlns:c="u">')}</r>`,
    deepEndTagComment: `<r><a></a\n<!-->${getTower(DEEP, '', '<a xmlns:b="u">')}</r>`,
    deepSelfClosingLeaf: `<r>${getTower(DEEP, '<a b="1"/>', '<a xmlns:b="u">')}</r>`
};

const ATTRIBUTE_SHAPE_INPUTS = {
    ...Object.fromEntries(ATTRIBUTE_SHAPES.map(([name, xmlString]) => [name, xmlString])),
    ...getSeparatorInputs()
};

function getSeparatorInputs() {
    const inputs = {};
    for (const [name, character] of [...XMLDOM_WHITESPACE, ...NOT_XMLDOM_WHITESPACE]) {
        inputs[`separator ${name}`] = `<r><a b${character}c${character}d/></r>`;
        inputs[`unquoted value then ${name}`] = `<r><a b=c${character}d${character}e=f/></r>`;
        inputs[`unquoted value, ${name} and a quote`] = `<r><a b=c${character}"f"${getAttributes(50)}"/></r>`;
    }
    return inputs;
}

// Start tags with unique attribute names in every value form, xmldom whitespace
// and near misses between them, and a stray character now and then. A small
// linear congruential generator keeps the inputs the same on every run.
function getRandomStartTags(count) {
    const valueForms = ['', '="v"', '=\'v\'', '=v', '=v', '"v"', ' = "v"', '=v"w"'];
    const separators = [
        ' ',
        '',
        ...XMLDOM_WHITESPACE.map(([, character]) => character),
        ...NOT_XMLDOM_WHITESPACE.map(([, character]) => character),
        ...NOT_XMLDOM_WHITESPACE.map(([, character]) => character)
    ];
    const strayCharacters = ['"', '"', '\'', '=', '/', '>', '<'];
    const tagEnds = ['/>', '>', '"/>', '\'/>'];
    let seed = 20261009;
    const getRandomInteger = (bound) => {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        return (seed >>> 16) % bound;
    };
    const inputs = {};
    for (let i = 0; i < count; i++) {
        let body = '';
        const attributeCount = 1 + getRandomInteger(8);
        for (let j = 0; j < attributeCount; j++) {
            body += `n${j}${valueForms[getRandomInteger(valueForms.length)]}${separators[getRandomInteger(separators.length)]}`;
            if (getRandomInteger(3) === 0) {
                body += strayCharacters[getRandomInteger(strayCharacters.length)];
            }
        }
        inputs[`random ${i}`] = `<r><a ${body}${tagEnds[getRandomInteger(tagEnds.length)]}</r>`;
    }
    return inputs;
}
