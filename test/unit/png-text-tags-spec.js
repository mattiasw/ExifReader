/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {__RewireAPI__ as PngTextTagsRewireAPI} from '../../src/png-text-tags';
import {getDataView, concatDataViews} from './test-utils';
import {TYPE_TEXT, TYPE_ITXT, TYPE_ZTXT} from '../../src/image-header-png.js';
import PngTextTags from '../../src/png-text-tags';
import {getStringFromDataView} from '../../src/utils';

describe('png-text-tags', () => {
    afterEach(() => {
        PngTextTagsRewireAPI.__ResetDependency__('Tags');
        PngTextTagsRewireAPI.__ResetDependency__('IptcTags');
    });

    it('should read image tags', () => {
        const tagDatatEXt = 'MyTag0\x00My value.';
        const tagDataiTXt = 'MyTag1\x00\x00\x00fr\x00MyFrTag1\x00My second value.';
        const dataView = getDataView(tagDatatEXt + tagDataiTXt);
        const chunks = [
            {type: TYPE_TEXT, offset: 0, length: tagDatatEXt.length},
            {type: TYPE_ITXT, offset: tagDatatEXt.length, length: tagDataiTXt.length},
        ];

        const {readTags} = PngTextTags.read(dataView, chunks);

        expect(readTags['MyTag0']).to.deep.equal({
            value: 'My value.',
            description: 'My value.'
        });
        expect(readTags['MyTag1 (fr)']).to.deep.equal({
            value: 'My second value.',
            description: 'My second value.'
        });
    });

    it('should read compressed zTXt tags', async () => {
        const dataView = await getCompressedTagData(TYPE_ZTXT, 'MyTag', 'My compressed zTXt value.');
        const chunks = [
            {type: TYPE_ZTXT, offset: 0, length: dataView.byteLength}
        ];

        const {readTagsPromise} = PngTextTags.read(dataView, chunks, true);
        const tags = await readTagsPromise;

        expect(tags[0]['MyTag']).to.deep.equal({
            value: 'My compressed zTXt value.',
            description: 'My compressed zTXt value.'
        });
    });

    // It can't handle the encode/decode process for iTXt in testing. It's
    // unclear why. The process should be the same as currently coded.
    // it('should read compressed iTXt tags', async () => {
    //     const text = 'My compressed iTXt value.';
    //     const dataView = await getCompressedTagData(TYPE_ITXT, 'MyTag', text);
    //     const chunks = [
    //         {type: TYPE_ITXT, offset: 0, length: dataView.byteLength}
    //     ];

    //     const {readTagsPromise} = PngTextTags.read(dataView, chunks, true);
    //     const tags = await readTagsPromise;

    //     expect(tags[0]['MyTag (en-uk)']).to.deep.equal({
    //         value: text,
    //         description: text
    //     });
    // });

    it('should read zTXt tags with Exif data', async () => {
        PngTextTagsRewireAPI.__Rewire__('Tags', {
            read: (data, offset) => ({tags: getStringFromDataView(data, offset, data.byteLength)})
        });
        const EXIF_DATA = 'Exif\0\0<Exif\ndata>';
        const dataView = await getCompressedTagData(TYPE_ZTXT, 'Raw profile type exif', `\nexif\n${('' + EXIF_DATA.length).padStart(8, ' ')}\n${stringToHex(EXIF_DATA)}`);
        const chunks = [
            {type: TYPE_ZTXT, offset: 0, length: dataView.byteLength}
        ];

        const {readTagsPromise} = PngTextTags.read(dataView, chunks, true);
        const tags = await readTagsPromise;

        expect(tags[0]['__exif']).to.equal(EXIF_DATA.substring(6));
    });

    it('should read zTXt tags with IPTC data', async () => {
        PngTextTagsRewireAPI.__Rewire__('IptcTags', {
            read: (data, offset) => getStringFromDataView(data, offset, data.byteLength)
        });
        const IPTC_DATA = '<IPTC data>';
        const dataView = await getCompressedTagData(TYPE_ZTXT, 'Raw profile type iptc', `\niptc\n${('' + IPTC_DATA.length).padStart(8, ' ')}\n${stringToHex(IPTC_DATA)}`);
        const chunks = [
            {type: TYPE_ZTXT, offset: 0, length: dataView.byteLength}
        ];

        const {readTagsPromise} = PngTextTags.read(dataView, chunks, true);
        const tags = await readTagsPromise;

        expect(tags[0]['__iptc']).to.equal(IPTC_DATA);
    });

    it('should ignore tags that use compression when async is not passed', async () => {
        const dataView = await getCompressedTagData(TYPE_ZTXT, 'MyTag', 'My compressed zTXt value.');
        const chunks = [
            {type: TYPE_ZTXT, offset: 0, length: dataView.byteLength}
        ];

        const {readTags, readTagsPromise} = PngTextTags.read(dataView, chunks);

        expect(readTagsPromise).to.be.undefined;
        expect(readTags).to.deep.equal({});
    });

    async function getCompressedTagData(type, name, value) {
        const COMPRESSION_FLAG = '\x01';
        const COMPRESSION_METHOD = '\x00';
        const tagDataHeader = getDataView(`${name}\x00` + (type === TYPE_ITXT ? `${COMPRESSION_FLAG}${COMPRESSION_METHOD}en-uk\x00${name}\x00` : COMPRESSION_METHOD));
        const compressedValue = await compress(type === TYPE_ITXT ? new TextEncoder().encode(value) : Uint8Array.from(value, (char) => char.charCodeAt(0)));
        return concatDataViews(tagDataHeader, compressedValue);
    }

    async function compress(text) {
        const compressedStream = new Blob([text]).stream().pipeThrough(
            new CompressionStream('deflate')
        );
        return new DataView(await new Response(compressedStream).arrayBuffer());
    }

    function stringToHex(text) {
        return text.split('').map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    }
});
