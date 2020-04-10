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
            'ImageWidth': '11', // Exif
            'FocalLength': '9 mm' // Exif
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
            describe(image.name, function () {
                beforeEach(function () {
                    cy
                        .visit(`/${moduleType.path}/`)
                        .get('html[data-initialized]');
                });

                it('loads the tags', function () {
                    cy
                        .get('#file')
                        .attachFile({
                            filePath: `images/${image.name}`,
                            encoding: 'binary'
                        });
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
