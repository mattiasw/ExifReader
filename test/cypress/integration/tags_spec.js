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
                        cy.get('#url').type(image.url);
                    } else {
                        cy
                            .get('#file')
                            .attachFile({
                                filePath: `images/${image.name}`,
                                encoding: 'binary'
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
