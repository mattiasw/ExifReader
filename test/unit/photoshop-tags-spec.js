/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getByteStringFromNumber, swapProperties} from './test-utils.js';
import PhotoshopTags from '../../src/photoshop-tags.js';
import TagNames, {MAX_PATH_RECORDS} from '../../src/photoshop-tag-names.js';
import {getCharacterArray} from '../../src/utils.js';
import {createTagFilter} from '../../src/tag-filter.js';

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

    it('should keep a tag with the encoded name __proto__ as an own tag', () => {
        restores.push(swapProperties(TagNames, {0x4711: {name: 'DefaultTagName', description: () => 'MyDescription'}}));
        const bytes = getPhotoshopBytes({id: 0x4711, name: '__proto__', resource: '\x42\x43'});

        const tags = PhotoshopTags.read(bytes);

        expect(Object.keys(tags)).to.deep.equal(['__proto__']);
        expect(Object.getPrototypeOf(tags)).to.equal(Object.prototype);
        expect(Object.getOwnPropertyDescriptor(tags, '__proto__').value).to.deep.equal({
            id: 0x4711,
            value: '\x42\x43',
            description: 'MyDescription'
        });
    });

    it('should append _ to a tag with the encoded name of an Object.prototype method', () => {
        restores.push(swapProperties(TagNames, {0x4711: {name: 'DefaultTagName', description: () => 'MyDescription'}}));
        const bytes = getPhotoshopBytes({id: 0x4711, name: 'hasOwnProperty', resource: '\x42\x43'});

        const tags = PhotoshopTags.read(bytes);

        expect(tags).to.deep.equal({
            hasOwnProperty_: {
                id: 0x4711,
                value: '\x42\x43',
                description: 'MyDescription'
            }
        });
        expect(tags.hasOwnProperty).to.equal(Object.prototype.hasOwnProperty);
    });

    it('should match a tag with the encoded name of an Object.prototype method by its returned name when filtering', () => {
        restores.push(swapProperties(TagNames, {0x4711: {name: 'DefaultTagName', description: () => 'MyDescription'}}));
        const bytes = getPhotoshopBytes({id: 0x4711, name: 'hasOwnProperty', resource: '\x42\x43'});

        const tags = PhotoshopTags.read(bytes, false, createTagFilter({includeTags: {photoshop: ['hasOwnProperty_']}}));

        expect(Object.keys(tags)).to.deep.equal(['hasOwnProperty_']);
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

    it('should share one path record budget between the PathInformation resources of a read', () => {
        const FILL_RULE_RECORD = '\x00\x06' + '\x00'.repeat(24);
        const firstResource = FILL_RULE_RECORD.repeat(MAX_PATH_RECORDS - 1);
        const secondResource = FILL_RULE_RECORD.repeat(2);
        const bytes = getCharacterArray(
            getPhotoshopBlockString({id: 0x07d0, name: 'A', resource: firstResource})
            + getPhotoshopBlockString({id: 0x07d0, name: 'B', resource: secondResource})
        );

        const tags = PhotoshopTags.read(bytes);

        expect(JSON.parse(tags.A.description).paths).to.have.lengthOf(MAX_PATH_RECORDS - 1);
        expect(JSON.parse(tags.B.description).paths).to.have.lengthOf(1);
        expect(tags.A.value).to.equal(firstResource);
        expect(tags.B.value).to.equal(secondResource);
        expect(PhotoshopTags.read(bytes)).to.deep.equal(tags);
    });

    it('should keep one character per byte in the value of a resource longer than 8192 bytes', () => {
        const longResource = Array.from({length: 10000}, (_, index) => String.fromCharCode(index % 256)).join('');
        const bytes = getCharacterArray(
            getPhotoshopBlockString({id: 0x4711, resource: 'ab'})
            + getPhotoshopBlockString({id: 0x4712, resource: longResource})
        );

        expect(PhotoshopTags.read(bytes, true)['undefined-18194'].value).to.equal(longResource);
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

    it('should match an unknown tag by its returned name when filtering', () => {
        const bytes = getPhotoshopBytes({id: 0x4711, name: 'Foo', resource: '\x42\x43'});

        const tags = PhotoshopTags.read(bytes, true, createTagFilter({includeTags: {photoshop: ['undefined-18193']}}));

        expect(tags).to.deep.equal({'undefined-18193': {id: 0x4711, value: '\x42\x43'}});
    });

    it('should not match an unknown tag by its encoded name when filtering', () => {
        const bytes = getPhotoshopBytes({id: 0x4711, name: 'Foo', resource: '\x42\x43'});

        const tags = PhotoshopTags.read(bytes, true, createTagFilter({includeTags: {photoshop: ['Foo']}}));

        expect(tags).to.deep.equal({});
    });

    it('should read no tags when handed a faulty value string instead of bytes', () => {
        expect(PhotoshopTags.read('<faulty value>')).to.deep.equal({});
    });

    it('should read no tags when handed a number instead of bytes', () => {
        expect(PhotoshopTags.read(Number.MAX_SAFE_INTEGER)).to.deep.equal({});
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
