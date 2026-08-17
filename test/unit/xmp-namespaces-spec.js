import {expect} from 'chai';
import {isMissingNamespaceError, addMissingNamespaces} from '../../src/xmp-namespaces.js';

describe('xmp-namespaces', function () {
    describe('isMissingNamespaceError', function () {
        it('should detect parse error', function () {
            expect(isMissingNamespaceError({message: 'prefix is non-null and namespace is null'})).to.be.true;
        });

        it('should not detect parse error if the error is not a parse error', function () {
            expect(isMissingNamespaceError({message: 'some other error message'})).to.be.false;
        });
    });

    describe('addMissingNamespaces', function () {
        it('should return the original string if no root element is found', function () {
            const xmlString = 'Just some text';
            const result = addMissingNamespaces(xmlString);
            expect(result).to.equal(xmlString);
        });

        it('should insert declarations into the root element, not into a comment that contains something tag-like', function () {
            const xmlString = '<!-- <b:note> --><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Description><undeclared:Tag>1</undeclared:Tag></rdf:Description></x:xmpmeta>';
            const result = addMissingNamespaces(xmlString);

            expect(result.indexOf('<!-- <b:note> -->')).to.equal(0);
            expect(result).to.match(/<x:xmpmeta [^>]*xmlns:undeclared="http:\/\/fallback\.namespace\/undeclared"[^>]*>/);
        });

        it('should skip a processing instruction that contains something tag-like', function () {
            const xmlString = '<?xpacket <a:b> ?><root><x:child>1</x:child></root>';
            const result = addMissingNamespaces(xmlString);

            expect(result.indexOf('<?xpacket <a:b> ?>')).to.equal(0);
            expect(result).to.match(/<root [^>]*xmlns:x="http:\/\/fallback\.namespace\/x"[^>]*>/);
        });

        it('should skip a CDATA section that contains something tag-like', function () {
            const xmlString = '<![CDATA[<b:note>]]><root><x:child>1</x:child></root>';
            const result = addMissingNamespaces(xmlString);

            expect(result.indexOf('<![CDATA[<b:note>]]>')).to.equal(0);
            expect(result).to.match(/<root [^>]*xmlns:x="http:\/\/fallback\.namespace\/x"[^>]*>/);
        });

        it('should return the original string if it only holds a comment, even one that contains something tag-like', function () {
            const xmlString = '<!-- <b:note> -->';
            const result = addMissingNamespaces(xmlString);

            expect(result).to.equal(xmlString);
        });

        it('should return the original string if an unterminated comment swallows the root element', function () {
            const xmlString = '<!-- <b:note> <root><x:child>1</x:child></root>';
            const result = addMissingNamespaces(xmlString);

            expect(result).to.equal(xmlString);
        });

        it('should insert declarations before the slash of a self-closing root element', function () {
            const xmlString = '<root a:b="1"/>';
            const result = addMissingNamespaces(xmlString);

            expect(result).to.equal('<root a:b="1" xmlns:a="http://fallback.namespace/a"/>');
        });

        it('should not end the root start tag at a ">" inside a quoted attribute value', function () {
            const xmlString = '<root a="b>c"><x:child>1</x:child></root>';
            const result = addMissingNamespaces(xmlString);

            expect(result).to.equal('<root a="b>c" xmlns:x="http://fallback.namespace/x"><x:child>1</x:child></root>');
        });

        it('should handle single-quoted attribute values and quote characters inside the other kind of quotes', function () {
            const xmlString = '<root a="it\'s" b=\'>\'><x:child>1</x:child></root>';
            const result = addMissingNamespaces(xmlString);

            expect(result).to.equal('<root a="it\'s" b=\'>\' xmlns:x="http://fallback.namespace/x"><x:child>1</x:child></root>');
        });

        it('should return the original string if the root start tag never ends', function () {
            const xmlString = '<root x:a="1"';
            const result = addMissingNamespaces(xmlString);

            expect(result).to.equal(xmlString);
        });

        it('should step over a "<" that does not start an element, comment, CDATA section, or processing instruction', function () {
            const xmlString = '1 < 2 <root><x:child>1</x:child></root>';
            const result = addMissingNamespaces(xmlString);

            expect(result).to.equal('1 < 2 <root xmlns:x="http://fallback.namespace/x"><x:child>1</x:child></root>');
        });

        it('should not modify XML if all used prefixes are already declared on root element', function () {
            const xmlString = `
                <root xmlns:x="http://example.com/x">
                    <x:child>Content</x:child>
                </root>
            `;
            const result = addMissingNamespaces(xmlString);
            expect(result).to.equal(xmlString);
        });

        it('should not modify XML if all used prefixes are already declared on any element', function () {
            const xmlString = `
                <root xmlns:x="http://example.com/x">
                    <x:wrapper xmlns:y="http://example.com/y">
                        <y:child xmlns:z="http://example.com/z" z:attribute="Attribute content">Content</y:child>
                    </x:wrapper>
                </root>
            `;
            const result = addMissingNamespaces(xmlString);
            expect(result).to.equal(xmlString);
        });

        it('should add a missing namespace for a used prefix that is not declared', function () {
            const xmlString = `
                <root>
                    <x:child y:attribute="Attribute content">Content</x:child>
                </root>
            `;
            const result = addMissingNamespaces(xmlString);

            expect(result).to.match(/<root[^>]+xmlns:x="http:\/\/fallback\.namespace\/x"/);
            expect(result).to.match(/<root[^>]+xmlns:y="http:\/\/fallback\.namespace\/y"/);
            expect(result).to.match(/<x:child y:attribute="Attribute content">Content<\/x:child>/);
        });

        it('should add multiple missing namespaces if more than one prefix is used but not declared', function () {
            const xmlString = `
                <root>
                    <x:child>One</x:child>
                    <y:child>Two</y:child>
                </root>
            `;
            const result = addMissingNamespaces(xmlString);

            expect(result).to.match(/xmlns:x="http:\/\/fallback\.namespace\/x"/);
            expect(result).to.match(/xmlns:y="http:\/\/fallback\.namespace\/y"/);
            expect(result).to.match(/<x:child>One<\/x:child>/);
            expect(result).to.match(/<y:child>Two<\/y:child>/);
        });

        it('should ignore the xml prefix if encountered', function () {
            // "xml" is reserved and should not be declared even if used.
            const xmlString = `
                <root>
                    <xml:child>Reserved</xml:child>
                </root>
            `;
            const result = addMissingNamespaces(xmlString);

            expect(result).to.not.match(/xmlns:xml=/);
            expect(result).to.match(/<xml:child>Reserved<\/xml:child>/);
        });

        it('should ignore the xmlns prefix if encountered', function () {
            // "xmlns" is also reserved.
            const xmlString = `
                <root>
                    <xmlns:child>Reserved</xmlns:child>
                </root>
            `;
            const result = addMissingNamespaces(xmlString);

            expect(result).to.not.match(/xmlns:xmlns=/);
            expect(result).to.match(/<xmlns:child>Reserved<\/xmlns:child>/);
        });

        it('should use known URIs for recognized prefixes and a fallback URI for unknown ones', function () {
            const xmlString = `
                <root>
                    <xmp:Description>Some XMP content</xmp:Description>
                    <tiff:Orientation>1</tiff:Orientation>
                    <photoshop:Credit>Photo by Me</photoshop:Credit>
                    <foo:bar>Unknown prefix</foo:bar>
                </root>
            `;
            const result = addMissingNamespaces(xmlString);

            expect(result).to.match(/xmlns:xmp="http:\/\/ns\.adobe\.com\/xap\/1\.0\/"/);
            expect(result).to.match(/xmlns:tiff="http:\/\/ns\.adobe\.com\/tiff\/1\.0\/"/);
            expect(result).to.match(/xmlns:photoshop="http:\/\/ns\.adobe\.com\/photoshop\/1\.0\/"/);

            expect(result).to.match(/xmlns:foo="http:\/\/fallback\.namespace\/foo"/);

            expect(result).to.match(/<xmp:Description>Some XMP content<\/xmp:Description>/);
            expect(result).to.match(/<tiff:Orientation>1<\/tiff:Orientation>/);
            expect(result).to.match(/<photoshop:Credit>Photo by Me<\/photoshop:Credit>/);
            expect(result).to.match(/<foo:bar>Unknown prefix<\/foo:bar>/);
        });

        it('should declare a repeated prefix once and keep the order the prefixes were first used in', function () {
            const xmlString = `
                <root>
                    <b:first>One</b:first>
                    <a:second>Two</a:second>
                    <b:third>Three</b:third>
                </root>
            `;
            const result = addMissingNamespaces(xmlString);

            expect(result.match(/xmlns:b=/g)).to.have.lengthOf(1);
            expect(result.match(/xmlns:a=/g)).to.have.lengthOf(1);
            expect(result.indexOf('xmlns:b=')).to.be.below(result.indexOf('xmlns:a='));
        });

        it('should not declare an already declared prefix again', function () {
            const xmlString = `
                <root xmlns:a="http://example.com/a">
                    <a:first>One</a:first>
                    <b:second>Two</b:second>
                </root>
            `;
            const result = addMissingNamespaces(xmlString);

            expect(result.match(/xmlns:a=/g)).to.have.lengthOf(1);
            expect(result.match(/xmlns:b=/g)).to.have.lengthOf(1);
        });

        it('should find both prefixes of adjacent usages that share a single separator character', function () {
            const xmlString = '<root><x:a><y:b>a:b c:d</y:b></x:a><e:f g:h="1"i:j="2"/></root>';
            const result = addMissingNamespaces(xmlString);

            for (const prefix of ['x', 'y', 'a', 'c', 'e', 'g', 'i']) {
                expect(result, prefix).to.match(new RegExp(`xmlns:${prefix}="`));
            }
        });

        it('should find a prefix usage at the very start of the string', function () {
            const xmlString = 'a:b<root>Content</root>';
            const result = addMissingNamespaces(xmlString);

            expect(result).to.match(/xmlns:a="http:\/\/fallback\.namespace\/a"/);
        });

        it('should treat every other token in a colon chain as a prefix', function () {
            // In "a:b:c:d" the first token is a:b; the b is consumed as its
            // local part, so the next found prefix is c. In "e:f:g" the f is
            // consumed as the local part of e's token, so it is never a prefix.
            const xmlString = '<root><n:m p="a:b:c:d" q="e:f:g" r="adobe:docid:photoshop:abc123"/></root>';
            const result = addMissingNamespaces(xmlString);

            for (const prefix of ['n', 'a', 'c', 'e', 'adobe', 'photoshop']) {
                expect(result, prefix).to.match(new RegExp(`xmlns:${prefix}="`));
            }
            for (const nonPrefix of ['b', 'd', 'f', 'g', 'docid']) {
                expect(result, nonPrefix).to.not.match(new RegExp(`xmlns:${nonPrefix}=`));
            }
        });

        it('should handle a dotted prefix inside an attribute value', function () {
            const xmlString = '<root><s:t u="xmp.iid:F77F117407206811822AB3958E7D1AC6"/></root>';
            const result = addMissingNamespaces(xmlString);

            expect(result).to.match(/xmlns:xmp\.iid="/);
            expect(result).to.not.match(/xmlns:iid=/);
        });

        it('should not treat a token as a usage when other prefix characters precede it', function () {
            // Each of these tokens sits inside a single run of prefix
            // characters whose start cannot begin a prefix, so the run holds
            // no usage. The word-boundary scan that the linear scan replaced
            // treated the letters after the dots and the dash as prefixes.
            const xmlString = '<root><x:child>1.a:b .c:d -e:f</x:child></root>';
            const result = addMissingNamespaces(xmlString);

            expect(result).to.match(/xmlns:x="/);
            expect(result.match(/xmlns:/g)).to.have.lengthOf(1);
        });

        it('should scan a colon chain from its first possible token', function () {
            // ".X" cannot start a prefix, so the chain's first token is a:a
            // and its prefix is a. The word-boundary scan that the linear
            // scan replaced started at the X and read X:a as the first token.
            const xmlString = '<root><x:child>.X:a:a</x:child></root>';
            const result = addMissingNamespaces(xmlString);

            expect(result).to.match(/xmlns:a="/);
            expect(result).to.not.match(/xmlns:X=/);
        });

        it('should recognize a declaration of a prefix that contains a dot', function () {
            const xmlString = '<root xmlns:a.b="http://example.com/a"><a.b:child>Content</a.b:child></root>';
            const result = addMissingNamespaces(xmlString);

            expect(result).to.equal(xmlString);
        });

        // A shape the usage scan finds but the declaration scan misses gets a
        // second declaration appended, and the parse retry then fails on the
        // duplicate attribute.
        it('should recognize a declaration of every prefix shape the usage scan finds', function () {
            const prefixes = ['a', '_a', 'a1', 'a-b', 'a.b', 'a.b.c', 'xmp.iid'];
            const declarationFor = (prefix) => ` xmlns:${prefix}="http://example.com/${prefix}"`;
            const usages = prefixes.map((prefix) => `<${prefix}:child>Content</${prefix}:child>`).join('');
            const xmlString = `<root${prefixes.map(declarationFor).join('')}>${usages}</root>`;

            expect(addMissingNamespaces(xmlString)).to.equal(xmlString);

            // Dropping one declaration must bring back exactly that prefix.
            // Without this the test would also pass if neither scan found a
            // shape, which is what it is meant to rule out.
            for (const droppedPrefix of prefixes) {
                const declarations = prefixes.filter((prefix) => prefix !== droppedPrefix).map(declarationFor).join('');
                const result = addMissingNamespaces(`<root${declarations}>${usages}</root>`);
                const fallback = `xmlns:${droppedPrefix}="http://fallback.namespace/${droppedPrefix}"`;

                expect(result, droppedPrefix).to.contain(fallback);
            }
        });

        it('should declare a missing dotted prefix without declaring an already declared one again', function () {
            const xmlString = '<root xmlns:a.b="http://example.com/a"><a.b:one>One</a.b:one><c.d:two>Two</c.d:two></root>';
            const result = addMissingNamespaces(xmlString);

            expect(result.match(/xmlns:a\.b=/g)).to.have.lengthOf(1);
            expect(result).to.match(/xmlns:c\.d="http:\/\/fallback\.namespace\/c\.d"/);
        });

        // XML allows whitespace on either side of the equals sign of an
        // attribute (Eq ::= S? '=' S?), so a declaration written that way is a
        // shape the usage scan finds but the declaration scan has to find too.
        it('should recognize a declaration with whitespace around the equals sign', function () {
            const spaced = '<root xmlns:a.b = "http://example.com/a"><a.b:one>One</a.b:one><c:two>Two</c:two></root>';
            const broken = '<root xmlns:a.b\n    =\t"http://example.com/a"><a.b:one>One</a.b:one></root>';

            const result = addMissingNamespaces(spaced);

            expect(result.match(/xmlns:a\.b\s*=/g)).to.have.lengthOf(1);
            expect(result).to.match(/xmlns:c="http:\/\/fallback\.namespace\/c"/);
            expect(addMissingNamespaces(broken)).to.equal(broken);
        });

        // An empty URI is illegal on a prefixed declaration in XML Namespaces
        // 1.0 and undeclares the prefix in 1.1, but the scan has to find the
        // declaration either way, or the prefix is declared a second time on
        // the root element and the retry fails on the duplicate attribute.
        it('should recognize a declaration with an empty namespace URI', function () {
            const xmlString = '<root xmlns:a="" xmlns:b=\'\' xmlns:c = "" xmlns:d=\'http://example.com/d\'><a:one>One</a:one><b:two>Two</b:two><c:three>Three</c:three><d:four>Four</d:four><e:five>Five</e:five></root>';
            const result = addMissingNamespaces(xmlString);

            for (const prefix of ['a', 'b', 'c', 'd']) {
                expect(result.match(new RegExp(`xmlns:${prefix}\\s*=`, 'g')), prefix).to.have.lengthOf(1);
            }
            expect(result).to.match(/xmlns:e="http:\/\/fallback\.namespace\/e"/);
            expect(result.match(/xmlns:/g)).to.have.lengthOf(5);

            // A self-closing root element puts the insertion point at the
            // slash, so a declaration written last ends right against the
            // boundary the scan compares with.
            const selfClosing = '<root a:b="1" xmlns:a=""/>';
            expect(addMissingNamespaces(selfClosing)).to.equal(selfClosing);
        });

        // Only the root start tag can collect a duplicate, so declaration-like
        // text before it is not a declaration. Counting it as one would cost
        // the packet every tag, which is what the empty URI is tolerated to
        // avoid in the first place.
        it('should not treat an empty declaration before the root element as a declaration', function () {
            const inComment = '<!-- xmlns:a="" --><root><a:child>Content</a:child></root>';
            const inProcessingInstruction = '<?xpacket xmlns:a="" ?><root><a:child>Content</a:child></root>';

            expect(addMissingNamespaces(inComment)).to.contain('<root xmlns:a="http://fallback.namespace/a">');
            expect(addMissingNamespaces(inProcessingInstruction)).to.contain('<root xmlns:a="http://fallback.namespace/a">');
        });

        // A duplicate attribute needs both declarations on one element, so an
        // empty declaration below the root cannot cause one. Counting it as a
        // declaration there would only rob a usage outside its element of the
        // declaration the repair adds to the root, which is what binds it.
        it('should still repair a prefix whose only empty declaration is below the root element', function () {
            const xmlString = '<root><mid xmlns:a=""/><a:child>Content</a:child></root>';
            const result = addMissingNamespaces(xmlString);

            expect(result).to.match(/<root xmlns:a="http:\/\/fallback\.namespace\/a">/);
            expect(result.match(/xmlns:a\s*=/g)).to.have.lengthOf(2);
        });

        // The scan is a text scan, so without tracking the quotes of the root
        // start tag it counts declaration-like text inside another attribute's
        // value as a declaration. That suppresses the repair for a genuinely
        // undeclared prefix, and the packet loses every tag.
        it('should not treat a declaration inside the value of another attribute on the root element as a declaration', function () {
            const doubleInsideSingle = '<root xmlns:x="http://example.com/x" x:note=\'xmlns:p="z"\'><p:child>1</p:child></root>';
            const emptyUri = '<root xmlns:x="http://example.com/x" x:note=\'xmlns:p=""\'><p:child>1</p:child></root>';
            const singleInsideDouble = '<root xmlns:x="http://example.com/x" x:note="xmlns:p=\'z\'"><p:child>1</p:child></root>';

            for (const xmlString of [doubleInsideSingle, emptyUri, singleInsideDouble]) {
                const result = addMissingNamespaces(xmlString);

                expect(result, xmlString).to.match(/xmlns:p="http:\/\/fallback\.namespace\/p"/);
                expect(result.match(/xmlns:x=/g), xmlString).to.have.lengthOf(1);
            }
        });

        // Matched from inside the value, the declaration-like text reads as
        // xmlns:p=' xmlns:q=", which also consumes the genuine declaration of
        // q. A scan that accepts or steps past such a match declares q a
        // second time, and the retry fails on the duplicate attribute.
        it('should not let a declaration-like attribute value hide the declaration that follows it', function () {
            const xmlString = '<root xmlns:x="http://example.com/x" x:note=\'xmlns:p=\' xmlns:q="u"><p:a>1</p:a><q:b>2</q:b></root>';
            const result = addMissingNamespaces(xmlString);

            expect(result.match(/xmlns:q=/g)).to.have.lengthOf(1);
            expect(result).to.match(/xmlns:p="http:\/\/fallback\.namespace\/p"/);
        });

        // Every declaration shape the scan has to find remains an attribute
        // of the root start tag when declaration-like values sit between the
        // declarations. One missed here would be redeclared, and the retry
        // would fail on the duplicate attribute.
        it('should recognize every genuine declaration on a root element that also holds declaration-like attribute values', function () {
            const xmlString = '<root a=\'xmlns:v="z"\' xmlns:a.b="http://example.com/ab" b="xmlns:w=\'z\'" xmlns:c = "http://example.com/c" xmlns:d=\'\'><a.b:one>One</a.b:one><c:two>Two</c:two><d:three>Three</d:three></root>';

            expect(addMissingNamespaces(xmlString)).to.equal(xmlString);
        });

        it('should still repair a prefix whose only empty declaration is in element text below the root element', function () {
            const xmlString = '<root><a:child>xmlns:p=""</a:child><p:other>1</p:other></root>';
            const result = addMissingNamespaces(xmlString);

            expect(result).to.match(/xmlns:p="http:\/\/fallback\.namespace\/p"/);
        });

        // Neither shape ever lost tags: an unused declaration is never looked
        // up, and one below the root was merely shadowed by the redundant
        // declaration added to the root. Now nothing is added for either.
        it('should leave a dotted declaration alone when it is unused or not on the root element', function () {
            const unused = '<root xmlns:a.b="http://example.com/a"><x:child>Content</x:child></root>';
            const belowRoot = '<root><mid xmlns:a.b="http://example.com/a"><a.b:child>Content</a.b:child></mid></root>';

            expect(addMissingNamespaces(unused).match(/xmlns:a\.b=/g)).to.have.lengthOf(1);
            expect(addMissingNamespaces(belowRoot).match(/xmlns:a\.b=/g)).to.have.lengthOf(1);
        });

        // The number of distinct prefixes grows with the size of the XMP packet, so
        // both the declared and the used prefixes have to be looked up in constant
        // time to keep a large packet from blocking the CPU. Looking either of them
        // up with Array.indexOf takes seconds instead of milliseconds here, which
        // makes this time out.
        it('should handle a large number of distinct prefixes without slowing down quadratically', function () {
            this.timeout(4000);
            const numberOfDeclarations = 30000;
            const numberOfUsages = 90000;
            const declarations = [];
            const usages = [];
            for (let i = 0; i < numberOfDeclarations; i++) {
                declarations.push(` xmlns:d${i}="u${i}"`);
                usages.push(`d${i}:v`);
            }
            for (let i = 0; i < numberOfUsages; i++) {
                usages.push(`p${i}:v`);
            }
            const xmlString = `<root${declarations.join('')}><x:child>${usages.join(' ')}</x:child></root>`;
            const result = addMissingNamespaces(xmlString);

            expect(result.match(/xmlns:p\d+=/g)).to.have.lengthOf(numberOfUsages);
            expect(result.match(/xmlns:d\d+=/g)).to.have.lengthOf(numberOfDeclarations);
        });

        // A long run of prefix-like characters without a colon produces no
        // usages at all, but used to make the usage scan re-read the rest of
        // the run from each position in it that could start a prefix. That
        // is quadratic time, so this times out unless the scan is linear.
        it('should handle a large colon-free run without slowing down quadratically', function () {
            this.timeout(4000);
            const filler = 'a.'.repeat(262144);
            const xmlString = `<root><x:child>${filler}</x:child></root>`;
            const result = addMissingNamespaces(xmlString);

            expect(result).to.match(/<root xmlns:x="http:\/\/fallback\.namespace\/x">/);
            expect(result.match(/xmlns:/g)).to.have.lengthOf(1);
        });

        // The declaration matches have to be merged with the root start tag's
        // attribute value spans in one forward pass. Looking up each match's
        // span with a scan over all the spans does on the order of 10^9 span
        // comparisons here, which makes this time out.
        it('should handle a large number of attribute values without slowing down quadratically', function () {
            this.timeout(4000);
            const numberOfAttributes = 50000;
            const attributes = [];
            const usages = [];
            for (let i = 0; i < numberOfAttributes; i++) {
                attributes.push(` n${i}='xmlns:a${i}="u"' xmlns:d${i}="w${i}"`);
                usages.push(`d${i}:v a${i}:v`);
            }
            const xmlString = `<root${attributes.join('')}><x:child>${usages.join(' ')}</x:child></root>`;
            const result = addMissingNamespaces(xmlString);

            expect(result.match(/xmlns:a\d+=/g)).to.have.lengthOf(2 * numberOfAttributes);
            expect(result.match(/xmlns:d\d+=/g)).to.have.lengthOf(numberOfAttributes);
        });

        // A root scan that re-reads or re-copies the rest of the input for
        // each construct it skips does on the order of 10^11 character
        // operations here, which makes this time out.
        it('should skip a large number of comments without slowing down quadratically', function () {
            this.timeout(4000);
            const comments = '<!-- <b:note> -->'.repeat(100000);
            const xmlString = `${comments}<root><x:child>1</x:child></root>`;
            const result = addMissingNamespaces(xmlString);

            expect(result).to.contain('<root xmlns:b="http://fallback.namespace/b" xmlns:x="http://fallback.namespace/x">');
        });

        it('should handle prefixes that have the same names as object properties', function () {
            const xmlString = `
                <root>
                    <__proto__:first>One</__proto__:first>
                    <constructor:second>Two</constructor:second>
                    <__proto__:third>Three</__proto__:third>
                    <constructor:fourth>Four</constructor:fourth>
                </root>
            `;
            const result = addMissingNamespaces(xmlString);

            expect(result).to.match(/xmlns:__proto__="http:\/\/fallback\.namespace\/__proto__"/);
            expect(result).to.match(/xmlns:constructor="http:\/\/fallback\.namespace\/constructor"/);
            expect(result.match(/xmlns:__proto__=/g)).to.have.lengthOf(1);
            expect(result.match(/xmlns:constructor=/g)).to.have.lengthOf(1);
        });

        it('should tell a declared prefix from an undeclared one when they have the same names as object properties', function () {
            const xmlString = `
                <root xmlns:__proto__="http://example.com/proto">
                    <__proto__:first>One</__proto__:first>
                    <constructor:second>Two</constructor:second>
                </root>
            `;
            const result = addMissingNamespaces(xmlString);

            expect(result.match(/xmlns:__proto__=/g)).to.have.lengthOf(1);
            expect(result).to.match(/xmlns:constructor="http:\/\/fallback\.namespace\/constructor"/);
        });
    });
});
