/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import babel from '@babel/core';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import TagFilterPlugin from '../../bin/TagFilterPlugin.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXIF_0TH_FILENAME = path.join(REPO_ROOT, 'src', 'tag-names-0th-ifd.js');
const EXIF_FILENAME = path.join('/x', 'src', 'tag-names-0th-ifd.js');
const IPTC_FILENAME = path.join('/x', 'src', 'iptc-tag-names.js');

describe('TagFilterPlugin', () => {
    it('keeps the value descriptions of an included tag in the real source', () => {
        const code = fs.readFileSync(EXIF_0TH_FILENAME, 'utf8');

        const output = transform(code, EXIF_0TH_FILENAME, {exif: ['FillOrder']});

        expect(output).to.contain('\'Normal\'');
        expect(output).to.contain('\'Reversed\'');
        expect(output).to.not.contain('\'ProcessingSoftware\'');
    });

    it('removes a string entry that is not in the list and keeps one that is, ignoring case', () => {
        const code = 'export default {0x000b: \'ProcessingSoftware\', 0x000c: \'OtherTag\'};';

        const output = transform(code, EXIF_FILENAME, {exif: ['processingsoftware']});

        expect(output).to.contain('\'ProcessingSoftware\'');
        expect(output).to.not.contain('\'OtherTag\'');
    });

    it('keeps or removes an object entry by its name and keeps the lookup table of a kept one', () => {
        const code = 'export default {'
            + '0x010a: {name: \'Kept\', description: (value) => ({1: \'Normal\'})[value]},'
            + '0x010b: {name: \'Dropped\', description: (value) => ({1: \'Other\'})[value]}'
            + '};';

        const output = transform(code, EXIF_FILENAME, {exif: ['Kept']});

        expect(output).to.contain('\'Kept\'');
        expect(output).to.contain('\'Normal\'');
        expect(output).to.not.contain('\'Dropped\'');
        expect(output).to.not.contain('\'Other\'');
    });

    it('filters the tags nested under a non-numeric key and keeps their lookup tables', () => {
        const code = 'export default {\'iptc\': {'
            + '0x0250: {name: \'By-line\'},'
            + '0x0219: \'Keywords\','
            + '0x0114: {name: \'File Format\', description: (v) => ({1: \'A\'})[v]}'
            + '}};';

        const output = transform(code, IPTC_FILENAME, {iptc: ['File Format', 'Keywords']});

        expect(output).to.not.contain('By-line');
        expect(output).to.contain('\'Keywords\'');
        expect(output).to.contain('\'File Format\'');
        expect(output).to.contain('\'A\'');
    });

    it('leaves spread elements and non-numeric keys with plain values in place', () => {
        const code = 'export default {...other, \'label\': \'Kept\', 0x000b: \'Dropped\'};';

        const output = transform(code, EXIF_FILENAME, {exif: ['FillOrder']});

        expect(output).to.contain('...other');
        expect(output).to.contain('\'Kept\'');
        expect(output).to.not.contain('\'Dropped\'');
    });

    it('leaves an export that is not an object literal untouched', () => {
        const code = 'const tags = {0x000b: \'ProcessingSoftware\'};\nexport default tags;';

        const output = transform(code, EXIF_FILENAME, {exif: ['FillOrder']});

        expect(output).to.contain('\'ProcessingSoftware\'');
    });

    it('leaves a file outside the module list untouched', () => {
        const code = 'export default {0x000b: \'ProcessingSoftware\'};';

        const output = transform(code, path.join('/x', 'src', 'other.js'), {exif: ['FillOrder']});

        expect(output).to.contain('\'ProcessingSoftware\'');
    });

    it('leaves the code untouched when the include option is not a tag list', () => {
        const code = 'export default {0x000b: \'ProcessingSoftware\'};';

        const output = transform(code, EXIF_FILENAME, {exif: true});

        expect(output).to.contain('\'ProcessingSoftware\'');
    });
});

function transform(code, filename, include) {
    return babel.transformSync(code, {
        filename,
        configFile: false,
        babelrc: false,
        plugins: [[TagFilterPlugin, {include}]]
    }).code;
}
