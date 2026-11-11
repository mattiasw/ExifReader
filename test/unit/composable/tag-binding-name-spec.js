/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getTagBindingName} from '../../../src/composable/tag-binding-name.js';
import TagNames0thIfd from '../../../src/tag-names-0th-ifd.js';
import TagNamesExifIfd from '../../../src/tag-names-exif-ifd.js';
import TagNamesGpsIfd from '../../../src/tag-names-gps-ifd.js';
import TagNamesInteroperabilityIfd from '../../../src/tag-names-interoperability-ifd.js';
import IptcTagNames from '../../../src/iptc-tag-names.js';

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RESERVED_WORDS = [
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
    'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
    'new', 'return', 'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while',
    'with', 'yield',
    'enum', 'implements', 'interface', 'let', 'package', 'private', 'protected', 'public', 'static', 'await',
    'null', 'true', 'false',
    'undefined', 'NaN', 'Infinity', 'arguments', 'eval'
];
const OUTPUT_FILES = {
    exif: [TagNames0thIfd, TagNamesExifIfd, TagNamesGpsIfd, TagNamesInteroperabilityIfd],
    iptc: [IptcTagNames.iptc]
};

describe('composable/tag-binding-name', () => {
    describe('getTagBindingName', () => {
        [
            ['By-line', 'ByLine'],
            ['Date Created', 'DateCreated'],
            ['IPTC-NAA', 'IPTCNAA'],
            ['Exif IFD Pointer', 'ExifIFDPointer'],
            ['DateTimeOriginal', 'DateTimeOriginal'],
            ['Record 2 destination', 'Record2Destination']
        ].forEach(([name, binding]) => {
            it(`should turn ${name} into ${binding}`, () => {
                expect(getTagBindingName(name)).to.equal(binding);
            });
        });
    });

    for (const file of Object.keys(OUTPUT_FILES)) {
        describe(`every name of the ${file} dictionaries`, () => {
            const names = getNames(OUTPUT_FILES[file]);
            const bindings = names.map(getTagBindingName);

            it('should give an identifier', () => {
                for (const binding of bindings) {
                    expect(binding).to.match(IDENTIFIER);
                }
            });

            it('should give a binding no other binding equals ignoring case', () => {
                expect(new Set(bindings.map((binding) => binding.toLowerCase())).size).to.equal(names.length);
            });

            it('should give neither a reserved word, an Object.prototype member nor a global', () => {
                const prototypeMembers = Object.getOwnPropertyNames(Object.prototype);
                for (const binding of bindings) {
                    expect(RESERVED_WORDS, binding).to.not.include(binding);
                    expect(prototypeMembers, binding).to.not.include(binding);
                    expect(binding in globalThis, binding).to.equal(false);
                }
            });
        });
    }

    it('should change only these Exif names', () => {
        expect(getChangedNames(OUTPUT_FILES.exif)).to.deep.equal(['IPTC-NAA', 'Exif IFD Pointer', 'GPS Info IFD Pointer', 'Interoperability IFD Pointer']);
    });
});

function getChangedNames(dictionaries) {
    return getNames(dictionaries).filter((name) => getTagBindingName(name) !== name);
}

// The distinct names, in dictionary order; a function-valued name gives both of
// the names it can return.
function getNames(dictionaries) {
    const names = [];
    for (const dictionary of dictionaries) {
        for (const id of Object.keys(dictionary)) {
            for (const name of getEntryNames(dictionary[id])) {
                if (!names.includes(name)) {
                    names.push(name);
                }
            }
        }
    }
    return names;
}

function getEntryNames(entry) {
    if (typeof entry === 'string') {
        return [entry];
    }
    if (typeof entry.name === 'function') {
        return [entry.name([0, 0]), entry.name([0])];
    }
    return [entry.name];
}
