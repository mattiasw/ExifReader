import {expect} from 'chai';
import {isMissingNamespaceError, addMissingNamespaces} from '../../src/xmp-namespaces';

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
    });
});
