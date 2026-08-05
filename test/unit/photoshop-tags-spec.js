/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getByteStringFromNumber, swapProperties} from './test-utils.js';
import PhotoshopTags from '../../src/photoshop-tags.js';
import TagNames from '../../src/photoshop-tag-names.js';
import {getCharacterArray} from '../../src/utils.js';

describe('photoshop-tags', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should use hard-coded tag name for tags with null name', () => {
        restores.push(swapProperties(TagNames, {0x4711: {name: 'DefaultTagName'}}));
        const bytes = getPhotoshopBytes({id: 0x4711});
        expect(PhotoshopTags.read(bytes).DefaultTagName).to.deep.include({id: 0x4711});
    });

    it('should use encoded tag name when it exists', () => {
        restores.push(swapProperties(TagNames, {0x4711: {name: 'DefaultTagName'}}));
        const bytes = getPhotoshopBytes({id: 0x4711, name: 'TagName'});
        expect(PhotoshopTags.read(bytes).TagName).to.deep.include({id: 0x4711});
    });

    it('should handle padded encoded tag name', () => {
        restores.push(swapProperties(TagNames, {0x4711: {name: 'DefaultTagName'}}));
        const bytes = getPhotoshopBytes({id: 0x4711, name: 'TagName1'});
        expect(PhotoshopTags.read(bytes).TagName1).to.deep.include({id: 0x4711});
    });

    it('should be able to read tag content', () => {
        restores.push(swapProperties(
            TagNames,
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
        ));
        const bytes = getPhotoshopBytes({id: 0x4711, resource: '\x42\x43'});
        expect(PhotoshopTags.read(bytes)).to.deep.equal({
            MyTag: {
                id: 0x4711,
                value: '\x42\x43',
                description: '4243'
            }
        });
    });

    it('should keep earlier tags and truncate the value when a resource size overruns the buffer', () => {
        restores.push(swapProperties(TagNames, {0x4711: {name: 'FirstTag'}, 0x4712: {name: 'SecondTag'}}));
        const overrunningBlock = '8BIM'
            + getByteStringFromNumber(0x4712, 2)
            + '\x00\x00'
            + getByteStringFromNumber(0xffffffff, 4)
            + '\x42\x43';
        const bytes = getCharacterArray(getPhotoshopBlockString({id: 0x4711, resource: 'ab'}) + overrunningBlock);

        const tags = PhotoshopTags.read(bytes);

        expect(tags.FirstTag).to.deep.include({id: 0x4711, value: 'ab'});
        expect(tags.SecondTag).to.deep.include({id: 0x4712, value: '\x42\x43'});
    });

    it('should emit an empty value when the data ends at the resource header', () => {
        restores.push(swapProperties(TagNames, {0x4711: {name: 'FirstTag'}}));
        const bytes = getCharacterArray(
            '8BIM' + getByteStringFromNumber(0x4711, 2) + '\x00\x00' + getByteStringFromNumber(5, 4)
        );
        expect(PhotoshopTags.read(bytes).FirstTag).to.deep.include({id: 0x4711, value: ''});
    });

    it('should keep earlier tags when the buffer ends inside a resource header', () => {
        restores.push(swapProperties(TagNames, {0x4711: {name: 'FirstTag'}}));
        const truncatedHeader = '8BIM' + getByteStringFromNumber(0x4712, 2);
        const bytes = getCharacterArray(getPhotoshopBlockString({id: 0x4711, resource: 'ab'}) + truncatedHeader);

        const tags = PhotoshopTags.read(bytes);

        expect(tags.FirstTag).to.deep.include({id: 0x4711, value: 'ab'});
        expect(Object.keys(tags)).to.have.lengthOf(1);
    });

    it('should keep earlier tags when a resource name runs past the end of the buffer', () => {
        restores.push(swapProperties(TagNames, {0x4711: {name: 'FirstTag'}}));
        const nameOverrunningHeader = '8BIM' + getByteStringFromNumber(0x4712, 2) + '\x20' + 'ABCDEF';
        const bytes = getCharacterArray(getPhotoshopBlockString({id: 0x4711, resource: 'ab'}) + nameOverrunningHeader);

        const tags = PhotoshopTags.read(bytes);

        expect(tags.FirstTag).to.deep.include({id: 0x4711, value: 'ab'});
        expect(Object.keys(tags)).to.have.lengthOf(1);
    });

    // Tag id 0x4711 does not exist in the real TagNames dictionary so the
    // unknown-tag tests below need no swapping.
    it('should ignore unknown tags', () => {
        const bytes = getPhotoshopBytes({id: 0x4711, resource: '\x42\x43'});
        expect(PhotoshopTags.read(bytes)).to.deep.equal({});
    });

    it('should include unknown tags if specified', () => {
        const bytes = getPhotoshopBytes({id: 0x4711, resource: '\x42\x43'});
        expect(PhotoshopTags.read(bytes, true)).to.deep.equal({'undefined-18193': {id: 0x4711, value: '\x42\x43'}});
    });

    function getPhotoshopBytes(block) {
        return getCharacterArray(getPhotoshopBlockString(block));
    }

    function getPhotoshopBlockString({id, name = '', resource = ''}) {
        const signature = '8BIM';
        return signature
            + getByteStringFromNumber(id, 2)
            + getPaddedPascalString(name)
            + getByteStringFromNumber(resource.length, 4) + getPaddedResourceData(resource);
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
