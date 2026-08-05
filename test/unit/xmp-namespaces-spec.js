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
