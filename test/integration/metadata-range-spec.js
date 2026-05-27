const {expect} = require('chai');
const path = require('path');
const fs = require('fs');
const {DOMParser, onErrorStopParsing} = require('@xmldom/xmldom');

const ExifReader = require('../../src/exif-reader.js');
const FIXTURES = path.join(__dirname, '..', 'fixtures', 'images');
const domParser = new DOMParser({onError: onErrorStopParsing});

describe('metadataRange / includeOffsets — real fixtures', function () {
    this.timeout(30000);

    describe('JPEG (test.jpg)', () => {
        let tags;
        let fileSize;

        before(async () => {
            const buffer = fs.readFileSync(path.join(FIXTURES, 'test.jpg'));
            fileSize = buffer.length;
            tags = await ExifReader.load(buffer, {
                expanded: true,
                includeOffsets: true,
                async: true,
                domParser,
            });
        });

        it('returns a metadataRange object', () => {
            expect(tags.metadataRange).to.be.an('object');
        });

        it('reports complete:true for a well-formed file', () => {
            expect(tags.metadataRange.complete).to.equal(true);
        });

        it('reports end within the file', () => {
            expect(tags.metadataRange.end).to.be.above(0);
            expect(tags.metadataRange.end).to.be.at.most(fileSize);
        });

        it('starts at the byte right after SOI', () => {
            // Real JPEG: SOI is at offset 0..1, first marker at offset 2.
            expect(tags.metadataRange.start).to.equal(2);
        });

        it('emits blocks of the expected types', () => {
            const types = tags.metadataRange.blocks.map((block) => block.type);
            // test.jpg carries a JFIF APP0, Exif APP1, XMP APP1, and a SOF
            // (file group).
            expect(types).to.include('jfif');
            expect(types).to.include('exif');
            expect(types).to.include('xmp');
            expect(types).to.include('file');
        });

        it('emits blocks sorted by start with no negative or zero-length entries', () => {
            const {blocks} = tags.metadataRange;
            for (let i = 0; i < blocks.length; i++) {
                expect(blocks[i].end).to.be.above(blocks[i].start);
                if (i > 0) {
                    expect(blocks[i].start).to.be.at.least(blocks[i - 1].start);
                }
            }
        });

        it('block ends never exceed the file size', () => {
            for (const block of tags.metadataRange.blocks) {
                expect(block.end).to.be.at.most(fileSize);
            }
        });

        it('round-trips: re-parsing the 0..end slice yields the same exif tags', async () => {
            const fullBuffer = fs.readFileSync(path.join(FIXTURES, 'test.jpg'));
            const slice = fullBuffer.slice(0, tags.metadataRange.end);
            // Re-parse the slice. JPEG will not see SOS so complete may be
            // false — that is the documented trim-and-reload semantic. What
            // matters is that the exif tags survive intact.
            const sliceTags = await ExifReader.load(slice, {
                expanded: true,
                async: true,
                domParser,
            });
            expect(sliceTags.exif).to.exist;
            if (tags.exif && tags.exif.DateTimeOriginal) {
                expect(sliceTags.exif.DateTimeOriginal.description)
                    .to.equal(tags.exif.DateTimeOriginal.description);
            }
        });
    });

    describe('HEIC (test.heic)', () => {
        let tags;
        let fileSize;

        before(async () => {
            const buffer = fs.readFileSync(path.join(FIXTURES, 'test.heic'));
            fileSize = buffer.length;
            tags = await ExifReader.load(buffer, {
                expanded: true,
                includeOffsets: true,
                async: true,
                domParser,
            });
        });

        it('returns a metadataRange object', () => {
            expect(tags.metadataRange).to.be.an('object');
        });

        it('reports complete:true for a well-formed file', () => {
            expect(tags.metadataRange.complete).to.equal(true);
        });

        it('emits blocks for the items located through iloc', () => {
            const types = tags.metadataRange.blocks.map((block) => block.type);
            expect(types).to.include('exif');
            expect(types).to.include('xmp');
            expect(types).to.include('icc');
        });

        it('demonstrates the iloc-into-mdat layout: start is well past byte 0', () => {
            // HEIC stores iloc-referenced bytes deeper into the file than
            // the meta box itself. For test.heic the lowest block start is
            // beyond a kilobyte from the file's start.
            expect(tags.metadataRange.start).to.be.above(1000);
        });

        it('block ends never exceed the file size', () => {
            for (const block of tags.metadataRange.blocks) {
                expect(block.end).to.be.at.most(fileSize);
            }
        });

        it('saves a meaningful prefix: end is much smaller than the full file', () => {
            // The metadata-bearing prefix should be a fraction of a HEIC
            // file (the bulk is image data in mdat). For test.heic it is
            // well under 10% of the file size.
            expect(tags.metadataRange.end).to.be.below(fileSize * 0.1);
        });
    });

    describe('JPEG XL with Brotli-compressed metadata (test-brotli.jxl, async + brob)', () => {
        let tags;
        let fileSize;

        before(async () => {
            const buffer = fs.readFileSync(path.join(FIXTURES, 'test-brotli.jxl'));
            fileSize = buffer.length;
            tags = await ExifReader.load(buffer, {
                expanded: true,
                includeOffsets: true,
                async: true,
                domParser,
            });
        });

        it('returns a metadataRange object after async deferred parsing resolves', () => {
            expect(tags.metadataRange).to.be.an('object');
        });

        it('reports complete:true', () => {
            expect(tags.metadataRange.complete).to.equal(true);
        });

        it('emits blocks for the brob(Exif) and brob(xml) boxes', () => {
            const types = tags.metadataRange.blocks.map((block) => block.type);
            expect(types).to.include('exif');
            expect(types).to.include('xmp');
        });

        it('block ends never exceed the file size', () => {
            for (const block of tags.metadataRange.blocks) {
                expect(block.end).to.be.at.most(fileSize);
            }
        });

        it('did not include a `file` block for the codestream (would inflate end past pixel data)', () => {
            const types = tags.metadataRange.blocks.map((block) => block.type);
            expect(types).to.not.include('file');
        });
    });
});
