/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {__RewireAPI__ as ExifReaderRewireAPI} from '../../src/exif-reader';
import {getCharacterArray, getBase64Image} from '../../src/utils';
import * as ExifReader from '../../src/exif-reader';
import exifErrors from '../../src/errors';
import {BIG_ENDIAN} from '../../src/byte-order';

const OFFSET_TEST_VALUE = 4711;
const XMP_FIELD_LENGTH_TEST_VALUE = 47;
const PNG_FIELD_LENGTH_TEST_VALUE = 47;
const OFFSET_TEST_VALUE_ICC2_1 = 27110;
const OFFSET_TEST_VALUE_ICC2_2 = 47110;
const OFFSET_TEST_VALUE_ICC2_3 = 67110;
const OFFSET_TEST_VALUE_MAKER_NOTE = 4812;

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
        ExifReaderRewireAPI.__ResetDependency__('Vp8xTags');
        ExifReaderRewireAPI.__ResetDependency__('GifFileTags');
        ExifReaderRewireAPI.__ResetDependency__('JxlFileTags');
        ExifReaderRewireAPI.__ResetDependency__('Thumbnail');
        ExifReaderRewireAPI.__ResetDependency__('Composite');
    });

    it('should throw an error if the passed buffer is non-compliant', () => {
        expect(() => ExifReader.load()).to.throw;
    });

    describe('managing file loading internally', () => {
        const IMAGE = '<image>';
        const TAGS = {MyTag: 42};
        const DATA_URI_BASE64 = `data:image/png;base64,${getBase64Image(IMAGE)}`;
        const DATA_URI_URL_ENC = `data:image/png,${encodeURIComponent(IMAGE)}`;

        beforeEach(() => {
            ExifReaderRewireAPI.__Rewire__('isNodeBuffer', function () {
                return false;
            });
            ExifReaderRewireAPI.__Rewire__('DataViewWrapper', function (buffer) {
                if (buffer.slice(0, 5) === 'data:') {
                    this.buffer = buffer.slice(buffer.indexOf(',') + 1, IMAGE.length).toString();
                } else {
                    this.buffer = buffer.slice(0, IMAGE.length).toString();
                }
                if (this.buffer !== IMAGE) {
                    throw new Error('Buffer error, does not match image.');
                }
            });
            ExifReaderRewireAPI.__Rewire__('loadView', function (dataView) {
                if ((dataView.buffer instanceof Buffer && dataView.buffer !== IMAGE)
                    || (dataView instanceof DataView && new TextDecoder().decode(dataView) !== IMAGE)) {
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

            it('should load data when a base64-encoded data URI is passed in', (done) => {
                ExifReader.load(DATA_URI_BASE64).then((tags) => {
                    expect(tags).to.deep.equal(TAGS);
                    done();
                });
            });

            it('should load data when a URL-encoded data URI is passed in', (done) => {
                ExifReader.load(DATA_URI_URL_ENC).then((tags) => {
                    expect(tags).to.deep.equal(TAGS);
                    done();
                });
            });

            it('should reject with the HTTP status when a remote fetch returns 404', async () => {
                global.fetch = () => Promise.resolve({
                    status: 404,
                    statusText: 'Not Found',
                    headers: {get: () => null},
                    arrayBuffer() {
                        return Promise.resolve(new ArrayBuffer(8));
                    }
                });

                let error;
                try {
                    await ExifReader.load(URL);
                } catch (e) {
                    error = e;
                }

                expect(error).to.be.an('error');
                expect(error.message).to.contain('404');
            });

            it('should reject with the HTTP status when a remote fetch returns 500', async () => {
                global.fetch = () => Promise.resolve({
                    status: 500,
                    statusText: 'Internal Server Error',
                    headers: {get: () => null},
                    arrayBuffer() {
                        return Promise.resolve(new ArrayBuffer(8));
                    }
                });

                let error;
                try {
                    await ExifReader.load(URL);
                } catch (e) {
                    error = e;
                }

                expect(error).to.be.an('error');
                expect(error.message).to.contain('500');
            });
        });

        describe('loading from URL in a Node.js context', () => {
            const URL = 'https://domain.com/path/to/image.jpg';
            const HTTP_URL = URL.replace('https', 'http');
            const OTHER_PROTOCOL_URL = 'app://domain.com/path/to/image.jpg';
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
                                if ((url !== URL) && (url !== HTTP_URL) && (url !== OTHER_PROTOCOL_URL)) {
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

            it('should load data from a remote location when a URL with another protocol is passed in', (done) => {
                ExifReader.load(OTHER_PROTOCOL_URL).then((tags) => {
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

    it('should skip Exif but keep other data when Tags.read throws on a malformed TIFF header', () => {
        rewireImageHeader({fileType: {value: 'heic', description: 'HEIC'}, tiffHeaderOffset: OFFSET_TEST_VALUE});
        ExifReaderRewireAPI.__Rewire__('Tags', {
            read() {
                throw new Error('Illegal byte order value. Faulty image.');
            },
        });

        let tags;
        expect(() => {
            tags = ExifReader.loadView({}, {expanded: true});
        }).to.not.throw();
        // Exif is skipped (no tags), but the rest of the result is intact.
        expect(tags.exif).to.deep.equal({});
        expect(tags.file.FileType).to.deep.equal({value: 'heic', description: 'HEIC'});
    });

    it('should pass xmpDataView from BMFF multi-extent items to XmpTags.read instead of the source dataView', () => {
        const myTags = {MyXmpTag: 99};
        const SYNTHETIC = {synthetic: true};
        rewireImageHeader({xmpChunks: [{dataOffset: 0, length: 4}], xmpDataView: SYNTHETIC});
        let capturedDataView;
        ExifReaderRewireAPI.__Rewire__('XmpTags', {
            read(dataView) {
                capturedDataView = dataView;
                return myTags;
            },
        });

        expect(ExifReader.loadView({})).to.deep.equal(myTags);
        expect(capturedDataView).to.equal(SYNTHETIC);
    });

    it('should pass exifDataView from BMFF multi-extent items to CanonTags.read instead of the source dataView', () => {
        const myExifTags = {
            Make: {value: ['Canon']},
            MakerNote: {__offset: OFFSET_TEST_VALUE_MAKER_NOTE}
        };
        const SYNTHETIC = {synthetic: true};
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE, exifDataView: SYNTHETIC}, 'Tags', myExifTags);
        let capturedDataView;
        ExifReaderRewireAPI.__Rewire__('CanonTags', {
            read(dataView) {
                capturedDataView = dataView;
                return {AutoRotate: 42};
            }
        });

        ExifReader.loadView();
        expect(capturedDataView).to.equal(SYNTHETIC);
    });

    it('should pass exifDataView from BMFF multi-extent items to PentaxTags.read instead of the source dataView', () => {
        const myExifTags = {
            MakerNote: {__offset: OFFSET_TEST_VALUE_MAKER_NOTE, value: getCharacterArray('PENTAX \x00\x00\x00')}
        };
        const SYNTHETIC = {synthetic: true};
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE, exifDataView: SYNTHETIC}, 'Tags', myExifTags);
        let capturedDataView;
        ExifReaderRewireAPI.__Rewire__('PentaxTags', {
            read(dataView) {
                capturedDataView = dataView;
                return {LensType: {value: 1, description: '1'}};
            }
        });

        ExifReader.loadView();
        expect(capturedDataView).to.equal(SYNTHETIC);
    });

    it('should pass exifDataView from BMFF multi-extent items to Thumbnail.get instead of the source dataView', () => {
        const SYNTHETIC = {synthetic: true};
        const myThumbnail = {type: 'image/jpeg'};
        const myTags = {MyExifTag: 43, Thumbnail: myThumbnail};
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE, exifDataView: SYNTHETIC}, 'Tags', myTags);
        let capturedDataView;
        ExifReaderRewireAPI.__Rewire__('Thumbnail', {
            get(dataView) {
                capturedDataView = dataView;
                return {image: '<image data>', ...myThumbnail};
            }
        });

        ExifReader.loadView();
        expect(capturedDataView).to.equal(SYNTHETIC);
    });

    it('should pass exifDataView from BMFF multi-extent items to Tags.read instead of the source dataView', () => {
        const myTags = {MyExifTag: 42};
        const SYNTHETIC = {synthetic: true};
        rewireImageHeader({tiffHeaderOffset: OFFSET_TEST_VALUE, exifDataView: SYNTHETIC});
        let capturedDataView;
        ExifReaderRewireAPI.__Rewire__('Tags', {
            read(dataView, offset) {
                capturedDataView = dataView;
                if (offset === OFFSET_TEST_VALUE) {
                    return {tags: myTags, byteOrder: BIG_ENDIAN};
                }
                return {tags: {}, byteOrder: BIG_ENDIAN};
            },
        });

        expect(ExifReader.loadView({})).to.deep.equal(myTags);
        expect(capturedDataView).to.equal(SYNTHETIC);
    });

    it('should pass on computed option to Exif tags parsing', function () {
        const myTags = {MyExifTag: 42};
        rewireImageHeader({tiffHeaderOffset: OFFSET_TEST_VALUE});
        ExifReaderRewireAPI.__Rewire__('Tags', {
            read(dataView, offset, includeUnknown, computed) {
                expect(offset).to.equal(OFFSET_TEST_VALUE);
                expect(includeUnknown).to.equal(false);
                expect(computed).to.equal(true);

                return {tags: myTags, byteOrder: BIG_ENDIAN};
            },
        });

        expect(ExifReader.loadView({}, {computed: true})).to.deep.equal(myTags);
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

    it('should be able to find Canon MakerNote segment', () => {
        const myExifTags = {
            Make: {value: ['Canon']},
            MakerNote: {__offset: OFFSET_TEST_VALUE_MAKER_NOTE}
        };
        const myCanonTags = {AutoRotate: 42};
        const myTags = {...myExifTags, ...myCanonTags};
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myExifTags);
        rewireMakerNoteTagsRead(myCanonTags, 'CanonTags');
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should keep Exif LensModel in flat mode when maker notes also has LensModel', () => {
        const exifLensModel = {value: ['Exif Lens'], description: 'Exif Lens'};
        const makerNotesLensModel = {
            value: ['MakerNotes Lens'],
            description: 'MakerNotes Lens'
        };
        const myExifTags = {
            Make: {value: ['Canon']},
            MakerNote: {__offset: OFFSET_TEST_VALUE_MAKER_NOTE},
            LensModel: exifLensModel
        };
        const myCanonTags = {
            LensModel: makerNotesLensModel,
            LensType: {value: 61182, description: '61182'}
        };
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myExifTags);
        rewireMakerNoteTagsRead(myCanonTags, 'CanonTags');

        const tags = ExifReader.loadView();

        expect(tags['LensModel']).to.deep.equal(exifLensModel);
        expect(tags['LensType']).to.deep.equal(myCanonTags.LensType);
    });

    it('should be able to find Pentax Type 1 MakerNote segment', () => {
        const myExifTags = {
            MakerNote: {
                __offset: OFFSET_TEST_VALUE_MAKER_NOTE,
                value: getCharacterArray('PENTAX \x00')
            }
        };
        const myPentaxTags = {Artist: 'Arty'};
        const myTags = {...myExifTags, ...myPentaxTags};
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myExifTags);
        rewireMakerNoteTagsRead(myPentaxTags, 'PentaxTags');
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

    it('should be able to find compressed ICC segment', async () => {
        const myTags = {MyIccTag: 42};

        rewireImageHeader({iccChunks: [OFFSET_TEST_VALUE_ICC2_3]});
        rewireIccTagsRead(myTags, true);
        expect(await ExifReader.loadView(undefined, {async: true})).to.deep.equal(myTags);
    });

    it('should decompress and parse brob Exif data in JXL files', async () => {
        const myTags = {MyBrobExifTag: 42};

        const decompressedBuffer = new ArrayBuffer(OFFSET_TEST_VALUE + 100);
        const decompressedView = new DataView(decompressedBuffer);
        decompressedView.setUint32(0, OFFSET_TEST_VALUE - 4);

        rewireImageHeader({
            fileType: {value: 'jxl', description: 'JPEG XL'},
            brobExifChunk: {dataOffset: 0, length: 10}
        });
        rewireTagsRead('Tags', myTags);

        const result = await ExifReader.loadView(
            new DataView(new ArrayBuffer(10)),
            {
                async: true,
                decompress: {brotli: () => Promise.resolve(decompressedBuffer)}
            }
        );

        expect(result.MyBrobExifTag).to.equal(42);
    });

    it('should decompress and parse brob XMP data in JXL files', async () => {
        const myTags = {MyBrobXmpTag: 45};

        rewireImageHeader({
            fileType: {value: 'jxl', description: 'JPEG XL'},
            brobXmpChunk: {dataOffset: 0, length: 10}
        });
        ExifReaderRewireAPI.__Rewire__('XmpTags', {
            read(dataView, xmpData) {
                if (xmpData && xmpData[0] && xmpData[0].dataOffset === 0) {
                    return myTags;
                }
                return {};
            }
        });

        const xmpBytes = new TextEncoder().encode('<xmp>test</xmp>');

        const result = await ExifReader.loadView(
            new DataView(new ArrayBuffer(10)),
            {
                async: true,
                decompress: {brotli: () => Promise.resolve(xmpBytes)}
            }
        );

        expect(result.MyBrobXmpTag).to.equal(45);
    });

    it('should skip brob data in sync mode', () => {
        rewireImageHeader({
            fileType: {value: 'jxl', description: 'JPEG XL'},
            brobExifChunk: {dataOffset: 0, length: 10}
        });

        const result = ExifReader.loadView(new DataView(new ArrayBuffer(10)));

        expect(result.FileType).to.deep.equal({value: 'jxl', description: 'JPEG XL'});
        expect(result.MyBrobExifTag).to.be.undefined;
    });

    it('should handle brob decompression failure gracefully', async () => {
        rewireImageHeader({
            fileType: {value: 'jxl', description: 'JPEG XL'},
            brobExifChunk: {dataOffset: 0, length: 10}
        });

        const result = await ExifReader.loadView(
            new DataView(new ArrayBuffer(10)),
            {
                async: true,
                decompress: {brotli: () => Promise.reject(new Error('fail'))}
            }
        );

        expect(result.FileType).to.deep.equal({value: 'jxl', description: 'JPEG XL'});
    });

    it('should expand brob Exif into exif group', async () => {
        const myTags = {MyBrobExifTag: 42};

        const decompressedBuffer = new ArrayBuffer(OFFSET_TEST_VALUE + 100);
        const decompressedView = new DataView(decompressedBuffer);
        decompressedView.setUint32(0, OFFSET_TEST_VALUE - 4);

        rewireImageHeader({
            fileType: {value: 'jxl', description: 'JPEG XL'},
            brobExifChunk: {dataOffset: 0, length: 10}
        });
        rewireTagsRead('Tags', myTags);

        const result = await ExifReader.loadView(
            new DataView(new ArrayBuffer(10)),
            {
                async: true,
                expanded: true,
                decompress: {brotli: () => Promise.resolve(decompressedBuffer)}
            }
        );

        expect(result.exif).to.deep.equal(myTags);
    });

    it('should prefer plain Exif over brob Exif in loadView', async () => {
        const plainTags = {PlainExifTag: 99};

        rewireImageHeader({
            tiffHeaderOffset: OFFSET_TEST_VALUE,
            brobExifChunk: {dataOffset: 0, length: 10}
        });
        rewireTagsRead('Tags', plainTags);

        const result = await ExifReader.loadView(
            new DataView(new ArrayBuffer(10)),
            {
                async: true,
                decompress: {brotli: () => Promise.resolve(new ArrayBuffer(100))}
            }
        );

        expect(result.PlainExifTag).to.equal(99);
        expect(result.BrobExifTag).to.be.undefined;
    });

    it('should be able to find JXL file tags', () => {
        const myTags = {'Image Width': {value: 42, description: '42px'}};
        rewireImageHeader({jxlCodestreamOffset: OFFSET_TEST_VALUE});
        rewireTagsRead('JxlFileTags', myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should put JXL file tags in file group when expanded', () => {
        const myTags = {'Image Width': {value: 42, description: '42px'}};
        rewireImageHeader({jxlCodestreamOffset: OFFSET_TEST_VALUE});
        rewireTagsRead('JxlFileTags', myTags);
        const result = ExifReader.loadView(undefined, {expanded: true});
        expect(result.file).to.deep.equal(myTags);
    });

    it('should be able to find MPF APP segment', () => {
        const myTags = {MyMpfTag: 42};
        rewireImageHeader({mpfDataOffset: OFFSET_TEST_VALUE});
        rewireMpfTagsRead(myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find PNG file data segment', () => {
        const myTags = {MyTag: 42};
        rewireForLoadView({pngHeaderOffset: OFFSET_TEST_VALUE}, 'PngFileTags', myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find PNG text data segment', async () => {
        const myTags = {MyTag: 42};
        const myAsyncTags = {MyAsyncTag: 42};
        rewireImageHeader({
            pngTextChunks: [
                {type: 'tEXt', length: PNG_FIELD_LENGTH_TEST_VALUE, offset: OFFSET_TEST_VALUE},
                {type: 'zTXt', length: PNG_FIELD_LENGTH_TEST_VALUE, offset: OFFSET_TEST_VALUE}
            ]
        });
        rewirePngTextTagsRead(myTags, myAsyncTags);
        expect(await ExifReader.loadView(undefined, {async: true})).to.deep.equal({...myTags, ...myAsyncTags});
    });

    it('should be able to find PNG chunk data segment', () => {
        const myTags = {MyTag: 42};
        rewireImageHeader({pngChunkOffsets: [OFFSET_TEST_VALUE]});
        rewirePngTagsRead(myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find RIFF chunk data segment', () => {
        const myTags = {MyTag: 42};
        rewireImageHeader({vp8xChunkOffset: OFFSET_TEST_VALUE});
        rewireVp8xTagsRead(myTags);
        expect(ExifReader.loadView()).to.deep.equal(myTags);
    });

    it('should be able to find GIF file data segment', () => {
        const myTags = {MyTag: 42};
        rewireForLoadView({gifHeaderOffset: OFFSET_TEST_VALUE}, 'GifFileTags', myTags);
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
            riff: {MyRiffTag: 49},
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
            mpfDataOffset: OFFSET_TEST_VALUE,
            vp8xChunkOffset: OFFSET_TEST_VALUE
        });
        rewireTagsRead('FileTags', myTags.file);
        rewireTagsRead('JfifTags', myTags.jfif);
        rewireTagsRead('Tags', {...myTags.exif, Thumbnail: myTags.Thumbnail});
        rewireMpfTagsRead(myTags.mpf);
        rewireTagsRead('IptcTags', myTags.iptc);
        rewireXmpTagsRead(myTags.xmp);
        rewireIccTagsRead(myTags.icc);
        rewireTagsRead('Vp8xTags', myTags.riff);

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

    it('should add file type', () => {
        const myTags = {MyTag: 42, FileType: 'will be overwritten'};
        rewireForLoadView({fileType: {value: 'heic', description: 'HEIC'}, tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);
        expect(ExifReader.loadView({})).to.deep.equal({...myTags, FileType: {value: 'heic', description: 'HEIC'}});
    });

    it('should add file type when using expanded result', () => {
        const myTags = {exif: {MyTag: 42}, file: {FileType: 'will be overwritten'}};
        rewireForLoadView({fileType: {value: 'webp', description: 'WebP'}, tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags.exif);
        expect(ExifReader.loadView({}, {expanded: true})).to.deep.equal({...myTags, file: {FileType: {value: 'webp', description: 'WebP'}}});
    });

    it('should calculate composite values', () => {
        const myTags = {MyExifTag: 42};
        const compositeTags = {MyCompositeTag: 4711};
        rewireForLoadView({tiffHeaderOffset: OFFSET_TEST_VALUE}, 'Tags', myTags);
        ExifReaderRewireAPI.__Rewire__('Composite', {
            get() {
                return compositeTags;
            }
        });

        expect(ExifReader.loadView()).to.deep.equal({...myTags, ...compositeTags});
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
                USE_WEBP: true,
                USE_GIF: true
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

        it('should handle when GIF files have been excluded', () => {
            Constants.USE_GIF = false;
            rewireForCustomBuild({gifHeaderOffset: OFFSET_TEST_VALUE}, Constants);
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

    describe('metadataRange (includeOffsets)', () => {
        it('should return metadataRange in expanded mode when includeOffsets is true', () => {
            rewireImageHeader({
                tiffHeaderOffset: OFFSET_TEST_VALUE,
                metadataBlocks: [
                    {type: 'exif', start: 2, end: 100},
                    {type: 'xmp', start: 100, end: 200},
                ],
            });
            rewireTagsRead('Tags', {MyExifTag: 42});

            const tags = ExifReader.loadView(
                {byteLength: 1024},
                {expanded: true, includeOffsets: true}
            );

            expect(tags.metadataRange).to.deep.equal({
                start: 2,
                end: 200,
                complete: true,
                blocks: [
                    {type: 'exif', start: 2, end: 100},
                    {type: 'xmp', start: 100, end: 200},
                ],
            });
        });

        it('should pass the includeOffsets flag to parseAppMarkers', () => {
            let receivedFlag;
            ExifReaderRewireAPI.__Rewire__('ImageHeader', {
                parseAppMarkers(_dataView, _async, includeMetadataBlocks) {
                    receivedFlag = includeMetadataBlocks;
                    return {tiffHeaderOffset: OFFSET_TEST_VALUE, metadataBlocks: []};
                }
            });
            rewireTagsRead('Tags', {MyExifTag: 42});

            ExifReader.loadView(
                {byteLength: 1024},
                {expanded: true, includeOffsets: true}
            );

            expect(receivedFlag).to.equal(true);
        });

        it('should not return metadataRange in flat mode even when includeOffsets is true', () => {
            rewireImageHeader({
                tiffHeaderOffset: OFFSET_TEST_VALUE,
                metadataBlocks: [{type: 'exif', start: 2, end: 100}],
            });
            rewireTagsRead('Tags', {MyExifTag: 42});

            const tags = ExifReader.loadView(
                {byteLength: 1024},
                {includeOffsets: true}
            );

            expect(tags.metadataRange).to.equal(undefined);
        });

        it('should NOT ask parseAppMarkers to build blocks when expanded is omitted (no wasted work)', () => {
            let receivedFlag;
            ExifReaderRewireAPI.__Rewire__('ImageHeader', {
                parseAppMarkers(_dataView, _async, includeMetadataBlocks) {
                    receivedFlag = includeMetadataBlocks;
                    return {tiffHeaderOffset: OFFSET_TEST_VALUE};
                }
            });
            rewireTagsRead('Tags', {MyExifTag: 42});

            ExifReader.loadView(
                {byteLength: 1024},
                {includeOffsets: true} // expanded omitted
            );

            expect(receivedFlag).to.equal(false);
        });

        it('should not return metadataRange when includeOffsets is omitted', () => {
            rewireImageHeader({
                tiffHeaderOffset: OFFSET_TEST_VALUE,
                metadataBlocks: [{type: 'exif', start: 2, end: 100}],
            });
            rewireTagsRead('Tags', {MyExifTag: 42});

            const tags = ExifReader.loadView(
                {byteLength: 1024},
                {expanded: true}
            );

            expect(tags.metadataRange).to.equal(undefined);
        });

        it('should mark complete:false when metadata extends past the buffer', () => {
            rewireImageHeader({
                tiffHeaderOffset: OFFSET_TEST_VALUE,
                metadataBlocks: [{type: 'exif', start: 2, end: 5000}],
            });
            rewireTagsRead('Tags', {MyExifTag: 42});

            const tags = ExifReader.loadView(
                {byteLength: 1024},
                {expanded: true, includeOffsets: true}
            );

            expect(tags.metadataRange.complete).to.equal(false);
            expect(tags.metadataRange.end).to.equal(5000);
        });

        it('should omit metadataRange when there are no blocks (e.g. plain TIFF)', () => {
            rewireImageHeader({
                tiffHeaderOffset: OFFSET_TEST_VALUE,
                metadataBlocks: [],
            });
            rewireTagsRead('Tags', {MyExifTag: 42});

            const tags = ExifReader.loadView(
                {byteLength: 1024},
                {expanded: true, includeOffsets: true}
            );

            expect(tags.metadataRange).to.equal(undefined);
        });

        it('should include MPF embedded images as mpfImage blocks', () => {
            rewireImageHeader({
                mpfDataOffset: OFFSET_TEST_VALUE,
                metadataBlocks: [{type: 'mpf', start: 2, end: 100}],
            });
            rewireMpfTagsRead({
                NumberOfImages: {value: 3},
                Images: [
                    {ImageOffset: {value: 0}, ImageSize: {value: 200}},
                    {ImageOffset: {value: 5000}, ImageSize: {value: 1000}},
                    {ImageOffset: {value: 8000}, ImageSize: {value: 500}},
                ],
            });

            const tags = ExifReader.loadView(
                {byteLength: 16384},
                {expanded: true, includeOffsets: true}
            );

            const mpfImageBlocks = tags.metadataRange.blocks.filter(
                (block) => block.type === 'mpfImage'
            );
            expect(mpfImageBlocks).to.deep.equal([
                {type: 'mpfImage', start: 5000, end: 6000},
                {type: 'mpfImage', start: 8000, end: 8500},
            ]);
            expect(tags.metadataRange.end).to.equal(8500);
        });

        it('should emit no mpfImage blocks when MPF parsing is excluded', () => {
            rewireImageHeader({
                mpfDataOffset: OFFSET_TEST_VALUE,
                tiffHeaderOffset: OFFSET_TEST_VALUE,
                metadataBlocks: [
                    {type: 'exif', start: 2, end: 100},
                    {type: 'mpf', start: 100, end: 200},
                ],
            });
            // Tags.read is rewired to return tags only when offset matches; ensure exif read succeeds.
            rewireTagsRead('Tags', {MyExifTag: 42});
            // MpfTags must NOT be consulted; rewire to throw if it is.
            ExifReaderRewireAPI.__Rewire__('MpfTags', {
                read() {
                    throw new Error('MpfTags.read should not be called when mpf group is excluded');
                },
            });

            const tags = ExifReader.loadView(
                {byteLength: 16384},
                {
                    expanded: true,
                    includeOffsets: true,
                    excludeTags: {mpf: true},
                }
            );

            const mpfImageBlocks = tags.metadataRange.blocks.filter(
                (block) => block.type === 'mpfImage'
            );
            expect(mpfImageBlocks).to.deep.equal([]);
            expect(tags.metadataRange.end).to.equal(200);
        });
    });

    describe('length: "auto"', () => {
        const AUTO_OPTIONS = {length: 'auto', expanded: true, includeOffsets: true};

        function rewireForAutoTest({end} = {}) {
            rewireImageHeader({
                tiffHeaderOffset: OFFSET_TEST_VALUE,
                metadataBlocks: end !== undefined ? [{type: 'exif', start: 2, end}] : [],
            });
            rewireTagsRead('Tags', {MyExifTag: 42});
        }

        function expectAutoToThrow(opts, pattern) {
            expect(() => ExifReader.load(new ArrayBuffer(8), opts)).to.throw(pattern);
        }

        it('should throw synchronously when length:"auto" is passed without expanded:true', () => {
            expectAutoToThrow({length: 'auto', includeOffsets: true}, /expanded/i);
        });

        it('should throw synchronously when length:"auto" is passed without includeOffsets:true', () => {
            expectAutoToThrow({length: 'auto', expanded: true}, /includeOffsets/i);
        });

        it('should throw synchronously when length:"auto" is passed without either', () => {
            expectAutoToThrow({length: 'auto'}, /expanded|includeOffsets/i);
        });

        it('should not mutate the caller-supplied options object', async () => {
            rewireForAutoTest({end: 100});

            const options = Object.assign({}, AUTO_OPTIONS);
            const snapshot = JSON.stringify(options);
            await ExifReader.load(new ArrayBuffer(1024), options);

            expect(JSON.stringify(options)).to.equal(snapshot);
            expect('async' in options).to.equal(false);
        });

        describe('in-memory inputs', () => {
            it('should return a Promise and attach metadataRange.buffer for an ArrayBuffer input', async () => {
                rewireForAutoTest({end: 100});

                const result = ExifReader.load(new ArrayBuffer(1024), AUTO_OPTIONS);

                expect(result).to.be.a('promise');
                const tags = await result;

                expect(tags.metadataRange.complete).to.equal(true);
                expect(tags.metadataRange.end).to.equal(100);
                expect(tags.metadataRange.buffer).to.be.instanceOf(ArrayBuffer);
                expect(tags.metadataRange.buffer.byteLength).to.equal(100);
                expect(tags.metadataRange.fetched).to.equal(100);
                expect(tags.metadataRange.requests).to.equal(0);
            });

            it('should attach a Node Buffer slice when the input is a Buffer', async () => {
                rewireForAutoTest({end: 64});

                const tags = await ExifReader.load(Buffer.alloc(1024), AUTO_OPTIONS);

                expect(Buffer.isBuffer(tags.metadataRange.buffer)).to.equal(true);
                expect(tags.metadataRange.buffer.length).to.equal(64);
                expect(tags.metadataRange.requests).to.equal(0);
            });

            it('should reject when the input has no metadataRange (plain TIFF / bare JXL codestream)', () => {
                rewireForAutoTest();

                return ExifReader.load(new ArrayBuffer(1024), AUTO_OPTIONS)
                    .then(() => {
                        throw new Error('expected rejection');
                    }, (error) => {
                        expect(String(error.message || error)).to.match(/length: "auto"|metadata container/i);
                    });
            });
        });

        describe('URL via browser fetch', () => {
            const URL = 'https://example.com/image.jpg';
            let originalFetch;
            let originalWindow;
            let fetchCalls;
            let originalWarn;
            let warnings;

            beforeEach(() => {
                originalFetch = global.fetch;
                originalWindow = global.window;
                global.window = {};
                fetchCalls = [];
                originalWarn = console.warn; // eslint-disable-line no-console
                warnings = [];
                console.warn = (...args) => warnings.push(args.join(' ')); // eslint-disable-line no-console
            });

            afterEach(() => {
                global.window = originalWindow;
                global.fetch = originalFetch;
                console.warn = originalWarn; // eslint-disable-line no-console
            });

            function installFetchMock(fullBufferOrBytes, {alwaysFullBody = false, status416 = false} = {}) {
                const full = ensureArrayBuffer(fullBufferOrBytes);
                global.fetch = (url, options) => {
                    const range = options && options.headers && options.headers.range;
                    fetchCalls.push({url, range});
                    if (status416) {
                        return Promise.resolve({
                            status: 416,
                            headers: makeHeaders(undefined, undefined),
                            arrayBuffer() {
                                return Promise.resolve(new ArrayBuffer(0));
                            },
                        });
                    }
                    if (alwaysFullBody || !range) {
                        return Promise.resolve({
                            status: 200,
                            headers: makeHeaders(undefined, full.byteLength),
                            arrayBuffer() {
                                return Promise.resolve(full);
                            },
                        });
                    }
                    const m = /^bytes=(\d+)-(\d*)$/.exec(range);
                    const start = m ? parseInt(m[1], 10) : 0;
                    const end = m && m[2] ? parseInt(m[2], 10) + 1 : full.byteLength;
                    const slice = full.slice(start, end);
                    return Promise.resolve({
                        status: 206,
                        headers: makeHeaders(`bytes ${start}-${end - 1}/${full.byteLength}`, slice.byteLength),
                        arrayBuffer() {
                            return Promise.resolve(slice);
                        },
                    });
                };
            }

            function ensureArrayBuffer(b) {
                if (b instanceof ArrayBuffer) {
                    return b;
                }
                if (typeof b === 'number') {
                    return new ArrayBuffer(b);
                }
                return b;
            }

            function makeHeaders(contentRange, contentLength) {
                return {
                    get(name) {
                        const lower = String(name).toLowerCase();
                        if (lower === 'content-range') {
                            return contentRange || null;
                        }
                        if (lower === 'content-length') {
                            return contentLength !== undefined ? String(contentLength) : null;
                        }
                        return null;
                    },
                };
            }

            it('should converge in 1 fetch when metadata fits in the initial 128 KiB', async () => {
                rewireForAutoTest({end: 4000});
                installFetchMock(200000);

                const tags = await ExifReader.load(URL, AUTO_OPTIONS);

                expect(fetchCalls).to.have.lengthOf(1);
                expect(tags.metadataRange.complete).to.equal(true);
                expect(tags.metadataRange.end).to.equal(4000);
                expect(tags.metadataRange.requests).to.equal(1);
                expect(tags.metadataRange.buffer).to.be.instanceOf(ArrayBuffer);
                expect(tags.metadataRange.fetched).to.be.at.least(4000);
            });

            it('should converge in 2 fetches when metadata extends past the initial 128 KiB', async () => {
                rewireForAutoTest({end: 200000});
                installFetchMock(300000);

                const tags = await ExifReader.load(URL, AUTO_OPTIONS);

                expect(fetchCalls).to.have.lengthOf(2);
                expect(fetchCalls[0].range).to.equal('bytes=0-131071');
                // Second fetch starts where the first ended (end-1 is inclusive).
                expect(fetchCalls[1].range).to.match(/^bytes=131072-/);
                expect(tags.metadataRange.requests).to.equal(2);
                expect(tags.metadataRange.complete).to.equal(true);
            });

            it('should converge in 1 fetch when the server returns 200 with the full body', async () => {
                rewireForAutoTest({end: 200000});
                installFetchMock(300000, {alwaysFullBody: true});

                const tags = await ExifReader.load(URL, AUTO_OPTIONS);

                expect(fetchCalls).to.have.lengthOf(1);
                expect(tags.metadataRange.complete).to.equal(true);
                expect(tags.metadataRange.requests).to.equal(1);
            });

            it('should not corrupt the buffer when the server returns 200 on a follow-up Range request', async () => {
                // First fetch gets a partial body (206). The second claims
                // to honor Range but the server ignores it and returns the
                // full body (200). Without the fix this would concatenate
                // the full body to the partial prefix and corrupt every
                // offset past the first 128 KiB.
                rewireForAutoTest({end: 200000});

                const FULL_SIZE = 300000;
                const fullBuffer = new ArrayBuffer(FULL_SIZE);
                installCustomFetchMock([
                    {status: 206, contentRange: `bytes 0-131071/${FULL_SIZE}`, body: () => fullBuffer.slice(0, 131072)},
                    {status: 200, body: () => fullBuffer},
                ]);

                const tags = await ExifReader.load(URL, AUTO_OPTIONS);

                expect(tags.metadataRange.complete).to.equal(true);
                expect(tags.metadataRange.fetched).to.equal(FULL_SIZE);
                expect(tags.metadataRange.requests).to.equal(2);
                expect(tags.metadataRange.buffer.byteLength).to.equal(200000);
            });

            it('should fall back to a single full GET when the server returns 416', async () => {
                rewireForAutoTest({end: 4000});

                const FULL_SIZE = 100000;
                const fullBuffer = new ArrayBuffer(FULL_SIZE);
                installCustomFetchMock([
                    {status: 416, body: () => new ArrayBuffer(0)},
                    {status: 200, contentLength: FULL_SIZE, body: () => fullBuffer, expectNoRange: true},
                ]);

                const tags = await ExifReader.load(URL, AUTO_OPTIONS);

                expect(fetchCalls).to.have.lengthOf(2);
                expect(fetchCalls[0].range).to.match(/^bytes=0-/); // initial probe
                expect(fetchCalls[1].range).to.equal(undefined); // fallback: no Range
                expect(tags.metadataRange.complete).to.equal(true);
                expect(tags.metadataRange.requests).to.equal(2);
                expect(warnings.some((w) => /did not converge/i.test(w))).to.equal(false);
            });

            it('should jump to EOF in one extra fetch when the parser finds no blocks in the initial prefix', async () => {
                // Simulates an ISO-BMFF file whose `meta` box sits past
                // the initial 128 KiB. The parser cannot produce blocks
                // until the meta box is in the buffer, so the loop should
                // jump straight to totalSize instead of doubling and
                // hitting the iteration cap.
                let parseCalls = 0;
                rewireImageHeaderDynamic((dataView) => {
                    parseCalls++;
                    const len = dataView && typeof dataView.byteLength === 'number' ? dataView.byteLength : 0;
                    if (len < 250000) {
                        return {fileType: 'heic'};
                    }
                    return {
                        fileType: 'heic',
                        tiffHeaderOffset: OFFSET_TEST_VALUE,
                        metadataBlocks: [{type: 'exif', start: 200000, end: 230000}],
                    };
                });
                rewireTagsRead('Tags', {MyExifTag: 42});
                installFetchMock(300000);

                const tags = await ExifReader.load(URL, AUTO_OPTIONS);

                expect(fetchCalls).to.have.lengthOf(2);
                expect(tags.metadataRange.complete).to.equal(true);
                expect(tags.metadataRange.requests).to.equal(2);
                expect(warnings.some((w) => /did not converge/i.test(w))).to.equal(false);
                expect(parseCalls).to.equal(2);
            });

            it('should warn and fall back when the loop does not converge in 4 iterations', async () => {
                // Each parse claims it needs 1000 more bytes than the
                // current buffer holds, so the loop never converges and
                // hits MAX_ITERATIONS.
                rewireImageHeaderDynamic((dataView) => {
                    const len = dataView && typeof dataView.byteLength === 'number' ? dataView.byteLength : 0;
                    return {
                        tiffHeaderOffset: OFFSET_TEST_VALUE,
                        metadataBlocks: [{type: 'exif', start: 2, end: len + 1000}],
                    };
                });
                rewireTagsRead('Tags', {MyExifTag: 42});
                installFetchMock(10 * 1024 * 1024);

                const tags = await ExifReader.load(URL, AUTO_OPTIONS);

                expect(warnings.some((w) => /did not converge/i.test(w))).to.equal(true);
                expect(tags.metadataRange).to.exist;
                expect(tags.metadataRange.requests).to.be.at.least(4);
            });

            it('should not double the buffer in the fallback when a Range-ignoring server returns 200 with no size', async () => {
                // The parse never reports complete (its block always extends
                // past the buffer), so the loop exhausts its iterations and
                // falls back. The server ignores Range and returns the whole
                // body each time with no Content-Length, so totalSize is never
                // learned. The fallback must replace the buffer like the main
                // loop, not concatenate it (which would double it).
                const BODY_SIZE = 1000;
                rewireImageHeaderDynamic((dataView) => {
                    const len = dataView && typeof dataView.byteLength === 'number' ? dataView.byteLength : 0;
                    return {
                        tiffHeaderOffset: OFFSET_TEST_VALUE,
                        metadataBlocks: [{type: 'exif', start: 2, end: len + 1000}],
                    };
                });
                rewireTagsRead('Tags', {MyExifTag: 42});
                installCustomFetchMock([
                    {status: 200, body: () => new ArrayBuffer(BODY_SIZE)},
                    {status: 200, body: () => new ArrayBuffer(BODY_SIZE)},
                    {status: 200, body: () => new ArrayBuffer(BODY_SIZE)},
                    {status: 200, body: () => new ArrayBuffer(BODY_SIZE)},
                    {status: 200, body: () => new ArrayBuffer(BODY_SIZE)},
                ]);

                const tags = await ExifReader.load(URL, AUTO_OPTIONS);

                expect(tags.metadataRange.fetched).to.equal(BODY_SIZE);
            });

            function installCustomFetchMock(stages) {
                let idx = 0;
                global.fetch = (url, options) => {
                    const range = options && options.headers && options.headers.range;
                    fetchCalls.push({url, range});
                    const stage = stages[idx++];
                    return Promise.resolve({
                        status: stage.status,
                        headers: makeHeaders(stage.contentRange, stage.contentLength),
                        arrayBuffer() {
                            return Promise.resolve(stage.body());
                        },
                    });
                };
            }
        });

        describe('URL via Node http', () => {
            const URL = 'https://example.com/image.jpg';
            let originalRequire;
            let originalFetch;
            let originalWindow;
            let getCalls;

            beforeEach(() => {
                originalRequire = global.__non_webpack_require__;
                originalFetch = global.fetch;
                originalWindow = global.window;
                global.window = {};
                delete global.fetch;
                getCalls = [];
            });

            afterEach(() => {
                global.window = originalWindow;
                global.fetch = originalFetch;
                global.__non_webpack_require__ = originalRequire;
            });

            function installHttpMock(fullBuffer) {
                const full = Buffer.isBuffer(fullBuffer) ? fullBuffer : Buffer.alloc(fullBuffer);
                global.__non_webpack_require__ = function (moduleName) {
                    if (/^https?$/.test(moduleName)) {
                        return {
                            get(url, options, callback) {
                                const range = options && options.headers && options.headers.range;
                                getCalls.push({url, range});
                                const m = range && /^bytes=(\d+)-(\d*)$/.exec(range);
                                const start = m ? parseInt(m[1], 10) : 0;
                                const end = m && m[2] ? parseInt(m[2], 10) + 1 : full.length;
                                const slice = full.subarray(start, end);
                                const response = {
                                    statusCode: range ? 206 : 200,
                                    statusMessage: 'OK',
                                    headers: {
                                        'content-range': range ? `bytes ${start}-${end - 1}/${full.length}` : undefined,
                                        'content-length': String(slice.length),
                                    },
                                    on(eventName, cb) {
                                        if (eventName === 'data') {
                                            setTimeout(() => cb(slice), 0);
                                        } else if (eventName === 'end') {
                                            setTimeout(() => cb(), 0);
                                        }
                                    },
                                    resume: () => undefined,
                                };
                                setTimeout(() => callback(response), 0);
                                return {on: () => undefined};
                            }
                        };
                    }
                };
            }

            it('should converge in 2 fetches via Node http with Range header', async () => {
                rewireForAutoTest({end: 200000});
                installHttpMock(300000);

                const tags = await ExifReader.load(URL, AUTO_OPTIONS);

                expect(getCalls).to.have.lengthOf(2);
                expect(getCalls[0].range).to.equal('bytes=0-131071');
                expect(getCalls[1].range).to.match(/^bytes=131072-/);
                expect(tags.metadataRange.complete).to.equal(true);
                expect(tags.metadataRange.requests).to.equal(2);
                expect(Buffer.isBuffer(tags.metadataRange.buffer)).to.equal(true);
            });
        });

        describe('local file path (Node fs)', () => {
            const FILENAME = '/path/to/image.heic';
            const FILE_DESCRIPTOR = 42;
            const FULL_SIZE = 300000;
            let fsCalls;
            let originalRequire;

            beforeEach(() => {
                fsCalls = {open: 0, stat: 0, read: [], close: 0};
                originalRequire = global.__non_webpack_require__;
                global.__non_webpack_require__ = function (moduleName) {
                    if (moduleName === 'fs') {
                        return {
                            open(_filename, callback) {
                                fsCalls.open++;
                                callback(undefined, FILE_DESCRIPTOR);
                            },
                            stat(_filename, callback) {
                                fsCalls.stat++;
                                callback(undefined, {size: FULL_SIZE});
                            },
                            read(fd, {buffer, length, position}, callback) {
                                fsCalls.read.push({fd, length, position});
                                buffer.fill(0x42);
                                callback(undefined);
                            },
                            close(_fd, callback) {
                                fsCalls.close++;
                                callback(undefined);
                            }
                        };
                    }
                };
            });

            afterEach(() => {
                global.__non_webpack_require__ = originalRequire;
            });

            it('should converge in 2 reads when metadata is past the initial 128 KiB', async () => {
                rewireForAutoTest({end: 200000});

                const tags = await ExifReader.load(FILENAME, AUTO_OPTIONS);

                expect(fsCalls.read).to.have.lengthOf(2);
                expect(fsCalls.read[0].position).to.equal(0);
                expect(fsCalls.read[0].length).to.equal(131072);
                expect(fsCalls.read[1].position).to.equal(131072);
                expect(tags.metadataRange.requests).to.equal(2);
                expect(tags.metadataRange.complete).to.equal(true);
                expect(Buffer.isBuffer(tags.metadataRange.buffer)).to.equal(true);
                expect(fsCalls.close).to.equal(2);
            });

            it('should stat once on the first read and skip stat on subsequent reads', async () => {
                rewireForAutoTest({end: 200000});

                await ExifReader.load(FILENAME, AUTO_OPTIONS);

                expect(fsCalls.stat).to.equal(1);
            });
        });

        describe('browser File object', () => {
            const FULL_SIZE = 300000;
            let originalWindow, originalFile, originalFileReader;
            let fileSlices;

            beforeEach(() => {
                originalWindow = global.window;
                originalFile = global.File;
                originalFileReader = global.FileReader;
                global.window = {};
                global.File = function MockFile() {
                    // Stub constructor for the mocked File global.
                };
                fileSlices = [];
                global.FileReader = function () {
                    this.readAsArrayBuffer = (input) => {
                        setTimeout(() => {
                            const size = input && typeof input.size === 'number' ? input.size : FULL_SIZE;
                            this.onload({target: {result: new ArrayBuffer(size)}});
                        }, 0);
                    };
                };
            });

            afterEach(() => {
                global.window = originalWindow;
                global.File = originalFile;
                global.FileReader = originalFileReader;
            });

            it('should converge in 2 reads when metadata extends past the initial 128 KiB', async () => {
                rewireForAutoTest({end: 200000});

                const file = new global.File();
                file.size = FULL_SIZE;
                file.slice = (start, end) => {
                    fileSlices.push({start, end});
                    return {size: end - start};
                };

                const tags = await ExifReader.load(file, AUTO_OPTIONS);

                expect(fileSlices.length).to.be.at.least(2);
                expect(fileSlices[0]).to.deep.equal({start: 0, end: 131072});
                expect(fileSlices[1].start).to.equal(131072);
                expect(tags.metadataRange.requests).to.equal(2);
                expect(tags.metadataRange.complete).to.equal(true);
                expect(tags.metadataRange.buffer).to.be.instanceOf(ArrayBuffer);
            });
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

function rewireImageHeaderDynamic(parseAppMarkersImpl) {
    ExifReaderRewireAPI.__Rewire__('ImageHeader', {parseAppMarkers: parseAppMarkersImpl});
}

function rewireTagsRead(tagsObject, tagsValue) {
    ExifReaderRewireAPI.__Rewire__(tagsObject, {
        read(dataView, offset) {
            if (Array.isArray(dataView) || (offset === OFFSET_TEST_VALUE)) {
                if (tagsObject === 'Tags') {
                    return {tags: tagsValue, byteOrder: BIG_ENDIAN};
                }
                return tagsValue;
            }
            if (tagsObject === 'Tags') {
                return {tags: {}, byteOrder: BIG_ENDIAN};
            }
            return {};
        },
    });
}

function rewireMpfTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('MpfTags', {
        read(dataView, offset) {
            if (Array.isArray(dataView) || (offset === OFFSET_TEST_VALUE)) {
                return tagsValue;
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

function rewireIccTagsRead(tagsValue, async = false) {
    ExifReaderRewireAPI.__Rewire__('IccTags', {
        read(dataView, iccData) {
            if (async && iccData.length === 1 && iccData[0] === OFFSET_TEST_VALUE_ICC2_3) {
                return Promise.resolve(tagsValue);
            }
            if (((iccData.length === 2) && (iccData[0] === OFFSET_TEST_VALUE_ICC2_1) && (iccData[1] === OFFSET_TEST_VALUE_ICC2_2))
                || (iccData.length === 1) && (iccData[0].offset === 0) && (iccData[0].length === dataView.length)) {
                return tagsValue;
            }
            return {};
        }
    });
}

function rewireMakerNoteTagsRead(tagsValue, type) {
    ExifReaderRewireAPI.__Rewire__(type, {
        read(dataView, tiffHeaderOffset, makerNoteOffset) {
            if (tiffHeaderOffset === OFFSET_TEST_VALUE && makerNoteOffset === OFFSET_TEST_VALUE_MAKER_NOTE) {
                return tagsValue;
            }
            return {};
        }
    });
}

function rewirePngTextTagsRead(tagsValue, asyncTagsValue) {
    ExifReaderRewireAPI.__Rewire__('PngTextTags', {
        read(dataView, pngTextChunks, async) {
            if ((pngTextChunks[0].type === 'tEXt' && pngTextChunks[0].offset === OFFSET_TEST_VALUE) && (pngTextChunks[0].length === PNG_FIELD_LENGTH_TEST_VALUE)
                && (pngTextChunks[1].type === 'zTXt' && pngTextChunks[1].offset === OFFSET_TEST_VALUE) && (pngTextChunks[1].length === PNG_FIELD_LENGTH_TEST_VALUE)) {
                return {readTags: tagsValue, readTagsPromise: async ? Promise.resolve([asyncTagsValue]) : undefined};
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

function rewireVp8xTagsRead(tagsValue) {
    ExifReaderRewireAPI.__Rewire__('Vp8xTags', {
        read(dataView, vp8xChunkOffset) {
            if (vp8xChunkOffset === OFFSET_TEST_VALUE) {
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
