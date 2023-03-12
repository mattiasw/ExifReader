/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {__RewireAPI__ as ExifReaderRewireAPI} from '../../src/exif-reader';
import {getCharacterArray} from '../../src/utils';
import * as ExifReader from '../../src/exif-reader';
import exifErrors from '../../src/errors';

const OFFSET_TEST_VALUE = 4711;
const XMP_FIELD_LENGTH_TEST_VALUE = 47;
const PNG_FIELD_LENGTH_TEST_VALUE = 47;
const OFFSET_TEST_VALUE_ICC2_1 = 27110;
const OFFSET_TEST_VALUE_ICC2_2 = 47110;

describe('exif-reader', function () {
    afterEach(() => {
        ExifReaderRewireAPI.__ResetDependency__('DataViewWrapper');
        ExifReaderRewireAPI.__ResetDependency__('loadView');
        ExifReaderRewireAPI.__ResetDependency__('Constants');
        ExifReaderRewireAPI.__ResetDependency__('ImageHeader');
        ExifReaderRewireAPI.__ResetDependency__('FileTags');
        ExifReaderRewireAPI.__ResetDependency__('Tags');
        ExifReaderRewireAPI.__ResetDependency__('IptcTags');
        ExifReaderRewireAPI.__ResetDependency__('XmpTags');
        ExifReaderRewireAPI.__ResetDependency__('PngFileTags');
        ExifReaderRewireAPI.__ResetDependency__('PngTextTags');
        ExifReaderRewireAPI.__ResetDependency__('Thumbnail');
    });

    it('should throw an error if the passed buffer is non-compliant', () => {
        expect(() => ExifReader.load()).to.throw;
    });

    describe('managing file loading internally', () => {
        const IMAGE = '<image>';
        const TAGS = {MyTag: 42};

        beforeEach(() => {
            ExifReaderRewireAPI.__Rewire__('isNodeBuffer', function () {
                return false;
            });
            ExifReaderRewireAPI.__Rewire__('DataViewWrapper', function (buffer) {
                this.buffer = buffer.slice(0, IMAGE.length).toString();
                if (this.buffer !== IMAGE) {
                    throw new Error('Buffer error, does not match image.');
                }
            });
            ExifReaderRewireAPI.__Rewire__('loadView', function (dataView) {
                if (dataView.buffer !== IMAGE) {
                    throw new Error('DataView error, does not match image.');
                }
                return TAGS;
            });
            rewireForLoadView({fileDataOffset: OFFSET_TEST_VALUE}, 'FileTags', TAGS);
        });

        describe('loading from URL in a browser context', () => {
            const URL = 'https://domain.com/path/to/image.jpg';

            beforeEach(() => {
                this.originalWindow = global.window;
                this.originalFetch = global.fetch;
                global.window = {};
                global.fetch = (url) => {
                    if (url !== URL) {
                        throw new Error();
                    }
                    return Promise.resolve({
                        arrayBuffer() {
                            return IMAGE;
                        }
                    });
                };
            });

            afterEach(() => {
                global.window = this.originalWindow;
                global.fetch = this.originalFetch;
            });

            it('should load data from a remote location when a URL is passed in', (done) => {
                ExifReader.load(URL).then((tags) => {
                    expect(tags).to.deep.equal(TAGS);
                    done();
                });
            });
        });

        describe('loading from URL in a Node.js context', () => {
            const URL = 'https://domain.com/path/to/image.jpg';
            const HTTP_URL = URL.replace('https', 'http');
            let getEvents;
            let getResult;
            let httpResponse;

            beforeEach(() => {
                // In case the tests are run on a newer Node version (18+) with a native fetch function we disable
                // the fetch function to not accidentally go down that execution path during these tests.
                this.originalWindow = global.window;
                this.originalFetch = global.fetch;
                global.window = {};
                delete global.fetch;

                getEvents = {
                    data(callback) {
                        setTimeout(() => callback(IMAGE), 0);
                    },
                    end(callback) {
                        setTimeout(() => callback(), 0);
                    }
                };
                getResult = {on: () => undefined};
                httpResponse = {
                    statusCode: 200,
                    on(eventName, responseCallback) {
                        setTimeout(() => getEvents[eventName] && getEvents[eventName](responseCallback), 0);
                    },
                    resume: () => undefined
                };
                this.originalNonWebpackRequire = global.__non_webpack_require__;
                global.__non_webpack_require__ = function (moduleName) {
                    if (/^https?$/.test(moduleName)) {
                        return {
                            get(url, options, callback) {
                                if ((url !== URL) && (url !== HTTP_URL)) {
                                    throw new Error('Error.');
                                }
                                setTimeout(() => callback(httpResponse), 0);
                                return getResult;
                            }
                        };
                    }
                };
            });

            afterEach(() => {
                global.window = this.originalWindow;
                global.fetch = this.originalFetch;
            });

            it('should load data from a remote location when an HTTPS URL is passed in', (done) => {
                ExifReader.load(URL).then((tags) => {
                    expect(tags).to.deep.equal(TAGS);
                    done();
                });
            });

            it('should load data from a remote location when an HTTP URL is passed in', (done) => {
                ExifReader.load(HTTP_URL).then((tags) => {
                    expect(tags).to.deep.equal(TAGS);
                    done();
                });
            });

            it('should fail when Node.js\' require is missing', (done) => {
                delete global.__non_webpack_require__;
                ExifReader.load(URL).catch(() => done());
            });

            it('should fail when the get request fails', (done) => {
                getResult = {
                    on(eventName, callback) {
                        if (eventName === 'error') {
                            callback('Error.');
                        }
                    }
                };
                ExifReader.load(URL).catch(() => done());
            });

            it('should fail when request response code is not 2XX', (done) => {
                httpResponse.statusCode = 500;
                ExifReader.load(URL).catch(() => done());
            });

            it('should fail when request response reading fails', (done) => {
                getEvents.error = (callback) => callback('Error.');
                ExifReader.load(URL).catch(() => done());
            });
        });

        describe('loading from file path', () => {
            const FILENAME = '/path/to/image.jpg';
            const FILE_DESCRIPTOR = 42;
            let fsMethods;

            beforeEach(() => {
                fsMethods = {
                    open(filename, callback) {
                        if (filename === FILENAME) {
                            callback(undefined, FILE_DESCRIPTOR);
                        } else {
                            callback('Error.');
                        }
                    },
                    stat(filename, callback) {
                        if (filename === FILENAME) {
                            callback(undefined, {size: 4711});
                        } else {
                            callback('Error.');
                        }
                    },
                    read(fd, {buffer}, callback) {
                        if (fd === FILE_DESCRIPTOR) {
                            buffer.write(IMAGE);
                            callback(undefined);
                        } else {
                            callback('Error.');
                        }
                    },
                    close(fd, callback) {
                        if (fd === FILE_DESCRIPTOR) {
                            callback(undefined);
                        } else {
                            callback('Error.');
                        }
                    }
                };
                this.originalNonWebpackRequire = global.__non_webpack_require__;
                global.__non_webpack_require__ = function (moduleName) {
                    if (moduleName === 'fs') {
                        return fsMethods;
                    }
                };
            });

            afterEach(() => {
                global.__non_webpack_require__ = this.originalNonWebpackRequire;
            });

            it('should load data from a file on disk when a path is passed in', (done) => {
                ExifReader.load(FILENAME).then((tags) => {
                    expect(tags).to.deep.equal(TAGS);
                    done();
                });
            });

            it('should fail when Node.js\' require is missing', (done) => {
                delete global.__non_webpack_require__;
                ExifReader.load(FILENAME).catch(() => done());
            });

            it('should fail if opening a file fails', (done) => {
                fsMethods.open = (_, callback) => callback('Error.');
                ExifReader.load(FILENAME).catch(() => done());
            });

            it('should fail if reading the file size fails', (done) => {
                fsMethods.stat = (_, callback) => callback('Error.');
                ExifReader.load(FILENAME).catch(() => done());
            });

            it('should fail if reading a file fails', (done) => {
                fsMethods.read = (_0, _1, callback) => callback('Error.');
                ExifReader.load(FILENAME).catch(() => done());
            });

            it('should NOT fail if closing a file fails', (done) => {
                fsMethods.close = (_, callback) => callback('Error.');
                ExifReader.load(FILENAME).then(() => done());
            });
        });

        describe('loading from a File object', () => {
            let file;
            let onReadStart;

            beforeEach(() => {
                this.originalWindow = global.window;
                global.window = {};
                this.originalFile = global.File;
                this.originalFileReader = global.FileReader;
                global.File = function () {
                    // Not used for anything.
                };
                onReadStart = {
                    callback() {
                        this.onload({
                            target: {
                                result: IMAGE
                            }
                        });
                    }
                };
                global.FileReader = function () {
                    this.readAsArrayBuffer = (_file) => {
                        if (_file === file) {
                            setTimeout(onReadStart.callback.bind(this), 0);
                        }
                    };
                };
                file = new global.File();
            });

            afterEach(() => {
                global.window = this.originalWindow;
                global.File = this.originalFile;
                global.FileReader = this.originalFileReader;
            });

            it('should load data from a File object', (done) => {
                ExifReader.load(file).then((tags) => {
                    expect(tags).to.deep.equal(TAGS);
                    done();
                });
            });

            it('should fail if reading a file fails', (done) => {
                onReadStart = {
                    callback() {
                        this.onerror();
                    }
                };
                ExifReader.load(file).catch(() => done());
            });
        });
    });

    it('should fall back on DataView wrapper if a full DataView implementation is not available', () => {
        let dataViewWrapperWasCalled = false;
        ExifReaderRewireAPI.__Rewire__('DataViewWrapper', function () {
            dataViewWrapperWasCalled = true;
        });
        ExifReaderRewireAPI.__Rewire__('loadView', function () {
            // Do nothing in this test.
        });

        ExifReader.load();

        expect(dataViewWrapperWasCalled).to.be.true;
    });

    it('should fail when there is no Exif data', () => {
        rewireImageHeader({
            hasAppMarkers: false,
            fileDataOffset: undefined,
            jfifDataOffset: undefined,
            tiffHeaderOffset: undefined,
            iptcDataOffset: undefined,
            xmpChunks: undefined,
            iccChunks: undefined,
            mpfDataOffset: undefined
        });
        expect(() => ExifReader.loadView()).to.throw(exifErrors.MetadataMissingError);
    });

    it('should be able to find file data segment', () => {
        const myTags = {MyTag: 42};
        rewireForLoadView({fileDataOffset: OFFSET_TEST_VALUE}, 'FileTags', myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find JFIF data segment', () => {
        const myTags = {MyTag: 42};
        rewireForLoadView({jfifDataOffset: OFFSET_TEST_VALUE}, 'JfifTags', myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find Exif APP segment', () => {
        const myTags = {MyExifTag: 42};
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find IPTC segment inside Exif APP segment (used in TIFF files)', () => {
        const myExifTags = {'IPTC-NAA': {value: ['<IPTC block array>']}};
        const myIptcTags = {MyIptcTag: 42};
        const myTags = {...myExifTags, ...myIptcTags};
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myExifTags);
        rewireTagsRead('IptcTags', myIptcTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find XMP segment inside Exif APP segment (used in TIFF files)', () => {
        const myExifTags = {ApplicationNotes: {value: getCharacterArray('<x:xmpmeta></x:xmpmeta>')}};
        const myXmpTags = {MyXmpTag: 45};
        const myTags = {...myExifTags, ...myXmpTags};
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myExifTags);
        rewireXmpTagsRead(myXmpTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find ICC segment inside Exif APP segment (used in TIFF files)', () => {
        const myExifTags = {ICC_Profile: {value: [1, 2, 3]}};
        const myIccTags = {MyIccTag: 42};
        const myTags = {...myExifTags, ...myIccTags};
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myExifTags);
        rewireIccTagsRead(myIccTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find IPTC APP segment', () => {
        const myTags = {MyIptcTag: 42};
        rewireForLoadView({iptcDataOffset: OFFSET_TEST_VALUE}, 'IptcTags', myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find XMP APP segment', () => {
        const myTags = {MyXmpTag: 42};

        rewireImageHeader({xmpChunks: [{dataOffset: OFFSET_TEST_VALUE, length: XMP_FIELD_LENGTH_TEST_VALUE}]});
        rewireXmpTagsRead(myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find ICC APP segment', () => {
        const myTags = {MyIccTag: 42};

        rewireImageHeader({iccChunks: [OFFSET_TEST_VALUE_ICC2_1, OFFSET_TEST_VALUE_ICC2_2]});
        rewireIccTagsRead(myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find MPF APP segment', () => {
        const myTags = {MyMpfTag: 42};
        rewireImageHeader({mpfDataOffset: OFFSET_TEST_VALUE});
        rewireTagsRead('Tags', {}, myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find PNG file data segment', () => {
        const myTags = {MyTag: 42};
        rewireForLoadView({pngHeaderOffset: OFFSET_TEST_VALUE}, 'PngFileTags', myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find PNG text data segment', () => {
        const myTags = {MyTag: 42};
        rewireImageHeader({pngTextChunks: [{length: PNG_FIELD_LENGTH_TEST_VALUE, offset: OFFSET_TEST_VALUE}]});
        rewirePngTextTagsRead(myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find PNG chunk data segment', () => {
        const myTags = {MyTag: 42};
        rewireImageHeader({pngChunkOffsets: [OFFSET_TEST_VALUE]});
        rewirePngTagsRead(myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should expand segments into separated properties on return object if specified', () => {
        const myTags = {
            file: {MyFileTag: 42},
            jfif: {MyJfifTag: 48},
            exif: {MyExifTag: 43},
            iptc: {MyIptcTag: 44},
            xmp: {MyXmpTag: 45},
            icc: {MyIccTag: 42},
            mpf: {MyMpfTag: 47},
            Thumbnail: {type: 'image/jpeg'}
        };
        rewireImageHeader({
            fileDataOffset: OFFSET_TEST_VALUE,
            jfifDataOffset: OFFSET_TEST_VALUE,
            tiffHeaderOffset: OFFSET_TEST_VALUE,
            iptcDataOffset: OFFSET_TEST_VALUE,
            xmpChunks: [{
                dataOffset: OFFSET_TEST_VALUE,
                length: XMP_FIELD_LENGTH_TEST_VALUE
            }],
            iccChunks: [OFFSET_TEST_VALUE_ICC2_1, OFFSET_TEST_VALUE_ICC2_2],
            mpfDataOffset: OFFSET_TEST_VALUE
        });
        rewireTagsRead('FileTags', myTags.file);
        rewireTagsRead('JfifTags', myTags.jfif);
        rewireTagsRead('Tags', {...myTags.exif, Thumbnail: myTags.Thumbnail}, myTags.mpf);
        rewireTagsRead('IptcTags', myTags.iptc);
        rewireXmpTagsRead(myTags.xmp);
        rewireIccTagsRead(myTags.icc);

        expect(ExifReader.loadView({}, {expanded: true})).to.deep.equal(myTags);
    });

    it('should expand inlined TIFF segments for XMP, IPTC, and ICC into separated properties on return object if specified', () => {
        const myTags = {
            exif: {
                ApplicationNotes: {value: getCharacterArray('<x:xmpmeta></x:xmpmeta>')},
                'IPTC-NAA': {value: ['<IPTC block array>']},
                ICC_Profile: {value: [1, 2, 3]}
            },
            iptc: {MyIptcTag: 42},
            xmp: {MyXmpTag: 43},
            icc: {MyIccTag: 44}
        };
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags.exif);
        rewireTagsRead('IptcTags', myTags.iptc);
        rewireXmpTagsRead(myTags.xmp);
        rewireIccTagsRead(myTags.icc);
        expect(ExifReader.loadView({}, {expanded: true})).to.deep.equal(myTags);
    });

    it('should retrieve a thumbnail', () => {
        const myThumbnail = {type: 'image/jpeg'};
        const myTags = {MyExifTag: 43, Thumbnail: myThumbnail};
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);
        rewireThumbnail(myThumbnail);

        expect(ExifReader.loadView({})['Thumbnail']).to.deep.equal({image: '<image data>', ...myThumbnail});
    });

    it('should retrieve a thumbnail when using expanded result', () => {
        const myThumbnail = {type: 'image/jpeg'};
        const myTags = {MyExifTag: 43, Thumbnail: myThumbnail};
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);
        rewireThumbnail(myThumbnail);

        expect(ExifReader.loadView({}, {expanded: true})['Thumbnail']).to.deep.equal({image: '<image data>', ...myThumbnail});
    });

    describe('gps group', () => {
        it('should not create a "gps" group if there are no GPS values', () => {
            const myTags = {MyExifTag: 43};
            rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);

            expect(ExifReader.loadView({}, {expanded: true})).to.deep.equal({exif: myTags});
        });

        it('should add a converted latitude value for north latitude', () => {
            const myTags = {
                GPSLatitudeRef: {value: ['N']},
                GPSLatitude: {value: [[34, 1], [3, 1], [3780, 100]]},
            };
            rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);

            expect(ExifReader.loadView({}, {expanded: true})['gps']).to.deep.equal({Latitude: 34.0605});
        });

        it('should add a converted latitude value for south latitude', () => {
            const myTags = {
                GPSLatitudeRef: {value: ['S']},
                GPSLatitude: {value: [[34, 1], [3, 1], [3780, 100]]},
            };
            rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);

            expect(ExifReader.loadView({}, {expanded: true})['gps']).to.deep.equal({Latitude: -34.0605});
        });

        it('should handle wrong format on latitude value', () => {
            const myTags = {
                GPSLatitudeRef: {value: ['se']},
                GPSLatitude: {value: [31, 1]},
            };
            rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);

            expect(ExifReader.loadView({}, {expanded: true})['gps']).to.deep.equal({});
        });

        it('should add a converted longitude value for east longitude', () => {
            const myTags = {
                GPSLongitudeRef: {value: ['E']},
                GPSLongitude: {value: [[44, 1], [45, 1], [3240, 100]]},
            };
            rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);

            expect(ExifReader.loadView({}, {expanded: true})['gps']).to.deep.equal({Longitude: 44.759});
        });

        it('should add a converted longitude value for west longitude', () => {
            const myTags = {
                GPSLongitudeRef: {value: ['W']},
                GPSLongitude: {value: [[44, 1], [45, 1], [3240, 100]]},
            };
            rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);

            expect(ExifReader.loadView({}, {expanded: true})['gps']).to.deep.equal({Longitude: -44.759});
        });

        it('should handle wrong format on longitude value', () => {
            const myTags = {
                GPSLongitudeRef: {value: ['se']},
                GPSLongitude: {value: [31, 1]},
            };
            rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);

            expect(ExifReader.loadView({}, {expanded: true})['gps']).to.deep.equal({});
        });

        it('should add a converted altitude value for above sealevel', () => {
            const myTags = {
                GPSAltitudeRef: {value: 0},
                GPSAltitude: {value: [46, 2]},
            };
            rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);

            expect(ExifReader.loadView({}, {expanded: true})['gps']).to.deep.equal({Altitude: 23});
        });

        it('should add a converted altitude value for below sealevel', () => {
            const myTags = {
                GPSAltitudeRef: {value: 1},
                GPSAltitude: {value: [46, 2]},
            };
            rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);

            expect(ExifReader.loadView({}, {expanded: true})['gps']).to.deep.equal({Altitude: -23});
        });
    });

    describe('custom builds', () => {
        let Constants;

        beforeEach(() => {
            Constants = {
                USE_FILE: true,
                USE_JFIF: true,
                USE_PNG_FILE: true,
                USE_EXIF: true,
                USE_IPTC: true,
                USE_XMP: true,
                USE_ICC: true,
                USE_MPF: true,
                USE_THUMBNAIL: true,
                USE_TIFF: true,
                USE_JPEG: true,
                USE_PNG: true,
                USE_HEIC: true,
                USE_WEBP: true
            };
        });

        it('should handle when file tags have been excluded', () => {
            Constants.USE_FILE = false;
            rewireForCustomBuild({fileDataOffset: OFFSET_TEST_VALUE}, Constants);
            expect(() => ExifReader.loadView()).to.throw(/No Exif data/);
        });

        it('should handle when JFIF tags have been excluded', () => {
            Constants.USE_JFIF = false;
            rewireForCustomBuild({jfifDataOffset: OFFSET_TEST_VALUE}, Constants);
            expect(() => ExifReader.loadView()).to.throw(/No Exif data/);
        });

        it('should handle when PNG file tags have been excluded', () => {
            Constants.USE_PNG_FILE = false;
            rewireForCustomBuild({pngHeaderOffset: OFFSET_TEST_VALUE}, Constants);
            expect(() => ExifReader.loadView()).to.throw(/No Exif data/);
        });

        it('should handle when JPEG files have been excluded', () => {
            Constants.USE_JPEG = false;
            rewireForCustomBuild({
                fileDataOffset: OFFSET_TEST_VALUE,
                jfifDataOffset: OFFSET_TEST_VALUE,
                iptcDataOffset: OFFSET_TEST_VALUE
            }, Constants);
            expect(() => ExifReader.loadView()).to.throw(/No Exif data/);
        });

        it('should handle when Exif tags have been excluded', () => {
            Constants.USE_EXIF = false;
            rewireForCustomBuild({tiffHeaderOffset: OFFSET_TEST_VALUE}, Constants);
            expect(() => ExifReader.loadView()).to.throw(/No Exif data/);
        });

        it('should handle thumbnail when Exif tags have been excluded', () => {
            Constants.USE_EXIF = false;
            ExifReaderRewireAPI.__Rewire__('Thumbnail', {get: () => true});
            rewireForCustomBuild({}, Constants);
            expect(() => ExifReader.loadView()).to.throw(/No Exif data/);
        });

        it('should handle when IPTC tags have been excluded', () => {
            Constants.USE_IPTC = false;
            rewireForCustomBuild({iptcDataOffset: OFFSET_TEST_VALUE}, Constants);
            expect(() => ExifReader.loadView()).to.throw(/No Exif data/);
        });

        it('should handle when XMP tags have been excluded', () => {
            Constants.USE_XMP = false;
            rewireForCustomBuild({xmpChunks: [{dataOffset: OFFSET_TEST_VALUE, length: XMP_FIELD_LENGTH_TEST_VALUE}]}, Constants);
            expect(() => ExifReader.loadView()).to.throw(/No Exif data/);
        });

        it('should handle when ICC tags have been excluded', () => {
            Constants.USE_ICC = false;
            rewireForCustomBuild({iccChunks: [OFFSET_TEST_VALUE_ICC2_1, OFFSET_TEST_VALUE_ICC2_2]}, Constants);
            expect(() => ExifReader.loadView()).to.throw(/No Exif data/);
        });

        it('should handle when MPF tags have been excluded', () => {
            Constants.USE_MPF = false;
            rewireForCustomBuild({mpfDataOffset: OFFSET_TEST_VALUE}, Constants);
            expect(() => ExifReader.loadView()).to.throw(/No Exif data/);
        });

        it('should handle when PNG files have been excluded', () => {
            Constants.USE_PNG = false;
            rewireForCustomBuild({pngHeaderOffset: OFFSET_TEST_VALUE}, Constants);
            expect(() => ExifReader.loadView()).to.throw(/No Exif data/);
        });

        it('should handle when JPEG files but not WebP files have been excluded', () => {
            Constants.USE_JPEG = false;
            const myTags = {
                exif: {MyExifTag: 43},
                iptc: {MyIptcTag: 44},
                xmp: {MyXmpTag: 45},
                icc: {MyIccTag: 42},
                Thumbnail: {type: 'image/jpeg'}
            };
            rewireForCustomBuild({
                tiffHeaderOffset: OFFSET_TEST_VALUE,
                iptcDataOffset: OFFSET_TEST_VALUE,
                xmpChunks: [{
                    dataOffset: OFFSET_TEST_VALUE,
                    length: XMP_FIELD_LENGTH_TEST_VALUE
                }],
                iccChunks: [OFFSET_TEST_VALUE_ICC2_1, OFFSET_TEST_VALUE_ICC2_2]
            }, Constants);
            rewireTagsRead('Tags', {...myTags.exif, Thumbnail: myTags.Thumbnail});
            rewireTagsRead('IptcTags', myTags.iptc);
            rewireXmpTagsRead(myTags.xmp);
            rewireIccTagsRead(myTags.icc);

            expect(ExifReader.loadView({}, {expanded: true})).to.deep.equal({
                exif: myTags.exif,
                xmp: myTags.xmp,
                icc: myTags.icc,
                Thumbnail: myTags.Thumbnail,
            });
        });

        it('should handle when thumbnail has been excluded', () => {
            Constants.USE_THUMBNAIL = false;
            ExifReaderRewireAPI.__Rewire__('Thumbnail', {get: () => true});
            rewireForCustomBuild({
                tiffHeaderOffset: OFFSET_TEST_VALUE,
            }, Constants);
            rewireTagsRead('Tags', {Thumbnail: {type: 'image/jpeg'}});
            expect(ExifReader.loadView()['Thumbnail']).to.be.undefined;
        });
    });
});

function rewireForLoadView(appMarkersValue, tagsObject, tagsValue) {
    rewireImageHeader(appMarkersValue);
    rewireTagsRead(tagsObject, tagsValue);
}

function rewireImageHeader(appMarkersValue) {
    ExifReaderRewireAPI.__Rewire__('ImageHeader', {
        parseAppMarkers() {
            return appMarkersValue;
        }
    });
}

function rewireTagsRead(tagsObject, tagsValue, mpfTagsValue = {}) {
    ExifReaderRewireAPI.__Rewire__(tagsObject, {
        read(dataView, offset) {
            if (Array.isArray(dataView) || (offset === OFFSET_TEST_VALUE)) {
                return tagsValue;
            }
            return {};
        },
        readMpf(dataView, offset) {
            if (Array.isArray(dataView) || (offset === OFFSET_TEST_VALUE)) {
                return mpfTagsValue;
            }
            return {};
        }
    });
}

function rewireXmpTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('XmpTags', {
        read(dataView, xmpData) {
            if (typeof dataView === 'string') {
                return tagsValue;
            }
            if ((xmpData[0].dataOffset === OFFSET_TEST_VALUE) && (xmpData[0].length === XMP_FIELD_LENGTH_TEST_VALUE)) {
                return tagsValue;
            }
            return {};
        }
    });
}

function rewireIccTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('IccTags', {
        read(dataView, iccData) {
            if (((iccData.length === 2) && (iccData[0] === OFFSET_TEST_VALUE_ICC2_1) && (iccData[1] === OFFSET_TEST_VALUE_ICC2_2))
                || (iccData.length === 1) && (iccData[0].offset === 0) && (iccData[0].length === dataView.length)) {
                return tagsValue;
            }
            return {};
        }
    });
}

function rewirePngTextTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('PngTextTags', {
        read(dataView, pngTextChunks) {
            if ((pngTextChunks[0].offset === OFFSET_TEST_VALUE) && (pngTextChunks[0].length === PNG_FIELD_LENGTH_TEST_VALUE)) {
                return tagsValue;
            }
            return {};
        }
    });
}

function rewirePngTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('PngTags', {
        read(dataView, pngChunkOffsets) {
            if (pngChunkOffsets[0] === OFFSET_TEST_VALUE) {
                return tagsValue;
            }
            return {};
        }
    });
}

function rewireThumbnail(thumbnailTags) {
    ExifReaderRewireAPI.__Rewire__('Thumbnail', {
        get(dataView, tags) {
            expect(tags).to.deep.equal(thumbnailTags);
            return {image: '<image data>', ...thumbnailTags};
        }
    });
}

function rewireForCustomBuild(appMarkersValue, Constants) {
    rewireImageHeader(appMarkersValue);
    ExifReaderRewireAPI.__Rewire__('Constants', Constants);
}
