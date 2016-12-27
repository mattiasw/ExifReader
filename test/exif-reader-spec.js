import {expect} from 'chai';
import {getDataView} from './utils';
import * as ExifReader from '../src/exif-reader';

describe('exif-reader', () => {
    it('should fail when no Exif identifier for APP1', () => {
        const dataView = getDataView('\xff\xd8\xff\xe1--------');
        expect(() => ExifReader.loadView(dataView)).to.throw(/No Exif data/);
    });

    it('should fail gracefully for faulty APP markers', () => {
        const dataView = getDataView('\xff\xd8\xfe\xdc\x00\x6fJFIF\x65\x01\x01\x01\x00\x48');
        expect(() => ExifReader.loadView(dataView)).to.throw(/No Exif data/);
    });
});
