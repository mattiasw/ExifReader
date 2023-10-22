const moduleTypes = [
    {
        name: 'AMD',
        path: 'amd',
        codeIdentifier: 'requirejs('
    },
    {
        name: 'ES module',
        path: 'esm',
        codeIdentifier: 'import ExifReader'
    },
    {
        name: 'global object',
        path: 'global',
        codeIdentifier: '(function (window, document) {'
    }
];

const images = [
    {
        name: 'test.jpg',
        hasThumbnail: true,
        tags: {
            'Image Width': '12px', // File
            'DateTimeDigitized': '2011:06:28 12:06:14', // Exif
            'CreatorTool': 'GIMP 2.10' // XMP
        }
    },
    {
        name: 'test-iptc.jpg',
        hasThumbnail: true,
        tags: {
            'Image Width': '22px', // File
            'LensModel': 'EF24-105mm f/4L IS USM', // Exif
            'Sub-location': 'My Sublocation', // IPTC
            'AuthorsPosition': 'Photographer', // XMP
            'ICC Signature': 'acsp' // ICC profile
        }
    },
    {
        name: 'test.tiff',
        hasThumbnail: false,
        tags: {
            'ImageWidth': '50', // Exif
            'ResolutionUnit': 'inches', // Exif
            'Date Created': '2020-04-08', // IPTC
            'subject': 'My Keyword 1, Another Keyword, A third keyword' // XMP
        }
    },
    {
        name: 'test.png',
        hasThumbnail: false,
        tags: {
            'Image Width': '14px', // File,
            'format': 'image/png' // XMP
        }
    },
    {
        name: 'test.heic',
        hasThumbnail: false,
        tags: {
            'LensModel': 'iPhone 7 back camera 3.99mm f/1.8' // Exif
        }
    },
    {
        name: 'test-not-an-image.txt',
        hasThumbnail: false,
        tags: {},
        error: 'Error: Invalid image format'
    },
    {
        name: 'test-no-meta-data.heic',
        hasThumbnail: false,
        tags: {},
        error: 'MetadataMissingError: No Exif data'
    },
    {
        url: 'https://i.imgur.com/DX2kvpG.jpg',
        hasThumbnail: false,
        tags: {
            'Bits Per Sample': '8',
            'Image Height': '3024px',
            'Image Width': '4032px',
            'Color Components': '3',
            'Subsampling': 'YCbCr4:2:2 (2 1)',
            'JFIF Version': '1.1',
            'Resolution Unit': 'None',
            'XResolution': '1',
            'YResolution': '1',
            'JFIF Thumbnail Width': '0px',
            'JFIF Thumbnail Height': '0px'
        }
    },
    {
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAALCAYAAABGbhwYAAAABGdBTUEAALGPC/xhBQAAAARzQklUBQUFBU2lLfYAAAAJcEhZcwAADsQAAA7EAZUrDhsAAAAscENBTGJvZ3VzIHVuaXRzAAAAAAAAAP//AAJmb28vYmFyADEuMGUwADY1LjUzNWUzV0B7HAAAAAd0SU1FB8wGBxE6CI7/JnoAAAAGYktHRADgAOAAgJXNLyAAAAAbSURBVChTY/wPBAxEACYoTRCMKsQLqK2QgQEAEIsEEp9yDucAAAAASUVORK5CYII=',
        hasThumbnail: false,
        tags: {
            'Image Width': '10px',
            'Image Height': '11px',
            'Bit Depth': '8',
            'Color Type': 'RGB with Alpha',
            'Compression': 'Deflate/Inflate',
            'Filter': 'Adaptive',
            'Interlace': 'Noninterlaced',
            'Pixels Per Unit X': '3780',
            'Pixels Per Unit Y': '3780',
            'Pixel Units': 'meters',
            'Modify Date': '1996-06-07 17:58:08'
        }
    },
    {
        url: 'data:image/png,%C2%89PNG%0D%0A%1A%0A%00%00%00%0DIHDR%00%00%00%0A%00%00%00%0B%08%06%00%00%00Fn%1C%18%00%00%00%04gAMA%00%00%C2%B1%C2%8F%0B%C3%BCa%05%00%00%00%04sBIT%05%05%05%05M%C2%A5-%C3%B6%00%00%00%09pHYs%00%00%0E%C3%84%00%00%0E%C3%84%01%C2%95%2B%0E%1B%00%00%00%2CpCALbogus%20units%00%00%00%00%00%00%00%C3%BF%C3%BF%00%02foo%2Fbar%001.0e0%0065.535e3W%40%7B%1C%00%00%00%07tIME%07%C3%8C%06%07%11%3A%08%C2%8E%C3%BF%26z%00%00%00%06bKGD%00%C3%A0%00%C3%A0%00%C2%80%C2%95%C3%8D%2F%20%00%00%00%1BIDAT(Sc%C3%BC%0F%04%0CD%00%26(M%10%C2%8C*%C3%84%0B%C2%A8%C2%AD%C2%90%C2%81%01%00%10%C2%8B%04%12%C2%9Fr%0E%C3%A7%00%00%00%00IEND%C2%AEB%60%C2%82',
        hasThumbnail: false,
        tags: {
            'Image Width': '10px',
            'Image Height': '11px',
            'Bit Depth': '8',
            'Color Type': 'RGB with Alpha',
            'Compression': 'Deflate/Inflate',
            'Filter': 'Adaptive',
            'Interlace': 'Noninterlaced',
            'Pixels Per Unit X': '3780',
            'Pixels Per Unit Y': '3780',
            'Pixel Units': 'meters',
            'Modify Date': '1996-06-07 17:58:08'
        }
    }
];

for (const moduleType of moduleTypes) {
    describe(moduleType.name, function () {
        it('shows the source code', function () {
            cy
                .visit('/')
                .get(`a[href^="${moduleType.path}"]`)
                .click()
                .get('.source-code pre.hidden')
                .get('.show-button')
                .click()
                .get('.source-code pre:not(.hidden)')
                .contains(moduleType.codeIdentifier)
                .get('.show-button')
                .click()
                .get('.source-code pre.hidden');
        });

        for (const image of images) {
            describe(image.name || image.url, function () {
                beforeEach(function () {
                    cy
                        .visit(`/${moduleType.path}/`)
                        .get('html[data-initialized]');
                });

                it('loads the tags', function () {
                    if (image.url) {
                        cy.get('#url').invoke('val', image.url);
                    } else {
                        cy
                            .get('#file')
                            .selectFile({
                                contents: `test/fixtures/images/${image.name}`,
                            });
                    }
                    cy.get('input[value="Load file"]').click();
                    if (image.hasThumbnail) {
                        cy.get('#thumbnail[src^="data"]');
                    }
                    for (const tagName in image.tags) {
                        cy
                            .contains('tr', tagName)
                            .contains(image.tags[tagName]);
                    }
                    if (image.error) {
                        cy.contains('.error', image.error);
                    }
                });
            });
        }
    });
}
