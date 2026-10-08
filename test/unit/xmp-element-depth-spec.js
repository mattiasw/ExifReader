/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {DOMParser as XmldomDomParser, onErrorStopParsing} from '@xmldom/xmldom';
import {exceedsElementDepth} from '../../src/xmp-element-depth.js';

const BOUND = 256;

describe('xmp-element-depth', () => {
    describe('depth bound', () => {
        it('should not exceed a bound the elements are nested exactly to', () => {
            expect(exceedsElementDepth('<a><a><a></a></a></a>', 3)).to.be.false;
            expect(exceedsElementDepth(getTower(BOUND), BOUND)).to.be.false;
        });

        it('should exceed a bound the elements are nested one level deeper than', () => {
            expect(exceedsElementDepth('<a><a><a></a></a></a>', 2)).to.be.true;
            expect(exceedsElementDepth(getTower(BOUND + 1), BOUND)).to.be.true;
        });

        it('should not exceed any bound for a string without elements', () => {
            expect(exceedsElementDepth('', 0)).to.be.false;
            expect(exceedsElementDepth('text > only', 0)).to.be.false;
        });
    });

    describe('self-closing tags', () => {
        it('should count a self-closing element only as a leaf', () => {
            const xmlString = '<r><a/><a b="1"/><a /><a b=\'x\' /><a\nb="1"\n/></r>';
            expect(exceedsElementDepth(xmlString, 2)).to.be.false;
            expect(exceedsElementDepth(xmlString, 1)).to.be.true;
        });

        it('should exceed the bound with a self-closing leaf one level below it', () => {
            expect(exceedsElementDepth(getTower(BOUND - 1, '<a b="1"/>'), BOUND)).to.be.false;
            expect(exceedsElementDepth(getTower(BOUND, '<a b="1"/>'), BOUND)).to.be.true;
        });

        it('should count a self-closing root', () => {
            expect(exceedsElementDepth('<a/>', 0)).to.be.true;
            expect(exceedsElementDepth('<a/>', 1)).to.be.false;
        });
    });

    describe('end tags', () => {
        it('should lower the depth so that many shallow siblings stay within the bound', () => {
            const xmlString = '<r>' + '<a xmlns:b="u"></a>'.repeat(5000) + '</r>';
            expect(exceedsElementDepth(xmlString, 2)).to.be.false;
        });

        it('should never lower the depth below zero', () => {
            const xmlString = '</a>'.repeat(10) + getTower(3);
            expect(exceedsElementDepth(xmlString, 3)).to.be.false;
            expect(exceedsElementDepth(xmlString, 2)).to.be.true;
        });

        for (const [name, endTag] of [
            ['a comment start', '</a\n<!-->'],
            ['a comment start after a carriage return', '</a\r<!-->'],
            ['a processing instruction start', '</a\n<?>'],
            ['a declaration with a quote', '</a\n<!x ">']
        ]) {
            it(`should end an end tag at its first > when ${name} follows its name`, () => {
                const xmlString = '<a>' + endTag + getTower(BOUND + 1, '', '<a xmlns:b="u">');
                expect(exceedsElementDepth(xmlString, BOUND)).to.be.true;
            });
        }

        it('should read an end tag that swallows the next end tag as one', () => {
            const xmlString = '<a xmlns:b="u"><a xmlns:b="u"></a\n</a>'.repeat(BOUND);
            expect(exceedsElementDepth(xmlString, BOUND)).to.be.true;
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
                expect(exceedsElementDepth(xmlString, 2)).to.be.false;
                expect(exceedsElementDepth(xmlString, 1)).to.be.true;
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
                expect(exceedsElementDepth(`${doctype}<r></r><!-- -->`, 1)).to.be.false;
                const xmlString = doctype + getTower(BOUND + 1, '', '<a xmlns:b="u">') + '<!-- -->';
                expect(exceedsElementDepth(xmlString, BOUND)).to.be.true;
            });
        }
    });

    describe('attribute values', () => {
        it('should not end a tag at a > in a quoted attribute value', () => {
            expect(exceedsElementDepth('<r><a b="x>y" c=\'x>y\'><a/></a></r>', 3)).to.be.false;
            expect(exceedsElementDepth('<r><a b="x>y" c=\'x>y\'><a/></a></r>', 2)).to.be.true;
        });

        it('should not end a tag at a /> in a quoted attribute value', () => {
            expect(exceedsElementDepth(getTower(3, '', '<a b="/>">'), 2)).to.be.true;
            expect(exceedsElementDepth(getTower(3, '', '<a b=\'/>\'>'), 2)).to.be.true;
            expect(exceedsElementDepth(getTower(3, '', '<a b=\'"/>\'>'), 2)).to.be.true;
        });

        it('should read attributes with whitespace around the equals sign', () => {
            const xmlString = '<r><a b = "1"\tc\n=\n\'2\' /><a/></r>';
            expect(exceedsElementDepth(xmlString, 2)).to.be.false;
            expect(exceedsElementDepth(xmlString, 1)).to.be.true;
        });
    });

    describe('start tags that are not well-formed', () => {
        it('should count a tag with an unquoted value holding a quote as open', () => {
            expect(exceedsElementDepth(getTower(BOUND + 1, '', '<p0:x xmlns:p0="u" b=c"d> "/>'), BOUND)).to.be.true;
            expect(exceedsElementDepth(getTower(BOUND + 1, '', '<p0:x xmlns:p0=\'u\' b=c\'d> \'/>'), BOUND)).to.be.true;
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
                expect(exceedsElementDepth(getTower(3, '', tag), 2)).to.be.true;
            });
        }

        it('should not read a quoted value past the next <', () => {
            expect(exceedsElementDepth('<r><a b="x<y" /></r>', 2)).to.be.true;
            expect(exceedsElementDepth('<r><a b=\'x<y\' /></r>', 2)).to.be.true;
        });

        it('should count an element whose name is not ASCII', () => {
            expect(exceedsElementDepth(getTower(3, '', '<é xmlns:b="u">'), 2)).to.be.true;
            expect(exceedsElementDepth(getTower(3, '', '<é xmlns:b="u">'), 3)).to.be.false;
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
                expect(exceedsElementDepth(xmlString, 1)).to.be.false;
            });
        }
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
                    if (domDepth > 0 && !exceedsElementDepth(DIFFERENTIAL_INPUTS[name], domDepth - 1)) {
                        undercounts.push(`${name} (xmldom depth ${domDepth})`);
                    }
                }
                expect(undercounts).to.deep.equal([]);
                expect(parsedCount).to.be.at.least(30);
            });
        }
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
    });
});

function getTower(depth, leaf = '', startTag = '<a>', endTag = '</a>') {
    return startTag.repeat(depth) + leaf + endTag.repeat(depth);
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
    exceedsElementDepth(xmlString, Infinity);
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
