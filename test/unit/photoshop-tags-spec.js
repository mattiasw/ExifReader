/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {__RewireAPI__ as PhotoshopTagsRewireAPI} from '../../src/photoshop-tags';
import {getByteStringFromNumber} from './test-utils';
import PhotoshopTags from '../../src/photoshop-tags';
import {getCharacterArray} from '../../src/utils';

describe('photoshop-tags', () => {
    const read = PhotoshopTags.__get__('read');

    afterEach(() => {
        PhotoshopTagsRewireAPI.__ResetDependency__('TagNames');
    });

    it('should use hard-coded tag name for tags with null name', () => {
        PhotoshopTags.__set__('TagNames', {0x4711: {name: 'DefaultTagName'}});
        const bytes = getPhotoshopBytes({id: 0x4711});
        expect(read(bytes).DefaultTagName).to.deep.include({id: 0x4711});
    });

    it('should use encoded tag name when it exists', () => {
        PhotoshopTags.__set__('TagNames', {0x4711: {name: 'DefaultTagName'}});
        const bytes = getPhotoshopBytes({id: 0x4711, name: 'TagName'});
        expect(read(bytes).TagName).to.deep.include({id: 0x4711});
    });

    it('should handle padded encoded tag name', () => {
        PhotoshopTags.__set__('TagNames', {0x4711: {name: 'DefaultTagName'}});
        const bytes = getPhotoshopBytes({id: 0x4711, name: 'TagName1'});
        expect(read(bytes).TagName1).to.deep.include({id: 0x4711});
    });

    it('should be able to read tag content', () => {
        PhotoshopTags.__set__(
            'TagNames',
            {
                0x4711: {
                    name: 'MyTag',
                    description: (value) => {
                        let description = '';
                        for (let i = 0; i < value.byteLength; i++) {
                            description += value.getUint8(i).toString(16);
                        }
                        return description;
                    }
                }
            }
        );
        const bytes = getPhotoshopBytes({id: 0x4711, resource: '\x42\x43'});
        expect(read(bytes)).to.deep.equal({
            MyTag: {
                id: 0x4711,
                value: '\x42\x43',
                description: '4243'
            }
        });
    });

    it('should ignore unknown tags', () => {
        PhotoshopTags.__set__('TagNames', {});
        const bytes = getPhotoshopBytes({id: 0x4711, resource: '\x42\x43'});
        expect(read(bytes)).to.deep.equal({});
    });

    it('should include unknown tags if specified', () => {
        PhotoshopTags.__set__('TagNames', {});
        const bytes = getPhotoshopBytes({id: 0x4711, resource: '\x42\x43'});
        expect(read(bytes, true)).to.deep.equal({'undefined-18193': {id: 0x4711, value: '\x42\x43'}});
    });

    function getPhotoshopBytes({id, name = '', resource = ''}) {
        const signature = '8BIM';
        return getCharacterArray(
            signature
            + getByteStringFromNumber(id, 2)
            + getPaddedPascalString(name)
            + getByteStringFromNumber(resource.length, 4) + getPaddedResourceData(resource)
        );
    }

    function getPaddedPascalString(string) {
        if (string.length > 255) {
            throw new Error('Can\'t handle string longer than 255.');
        }
        return String.fromCharCode(string.length) + string + (string.length % 2 === 0 ? '\0' : '');
    }

    function getPaddedResourceData(resource) {
        return resource + (resource.length % 2 === 0 ? '' : '\0');
    }
});
