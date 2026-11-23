/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import babel from '@babel/core';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import TagFilterPlugin from '../../bin/TagFilterPlugin.js';
import TagNames0thIfd from '../../src/tag-names-0th-ifd.js';
import TagNamesExifIfd from '../../src/tag-names-exif-ifd.js';
import TagNamesGpsIfd from '../../src/tag-names-gps-ifd.js';
import TagNamesInteroperabilityIfd from '../../src/tag-names-interoperability-ifd.js';
import IptcTagNames from '../../src/iptc-tag-names.js';
import TagNamesMpfIfd from '../../src/tag-names-mpf-ifd.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXIF_0TH_FILENAME = path.join(REPO_ROOT, 'src', 'tag-names-0th-ifd.js');
const EXIF_FILENAME = path.resolve('/x', 'src', 'tag-names-0th-ifd.js');
const IPTC_FILENAME = path.resolve('/x', 'src', 'iptc-tag-names.js');
const REAL_DICTIONARIES = [
    {fileName: 'tag-names-0th-ifd.js', moduleType: 'exif', dictionary: TagNames0thIfd},
    {fileName: 'tag-names-exif-ifd.js', moduleType: 'exif', dictionary: TagNamesExifIfd},
    {fileName: 'tag-names-gps-ifd.js', moduleType: 'exif', dictionary: TagNamesGpsIfd},
    {fileName: 'tag-names-interoperability-ifd.js', moduleType: 'exif', dictionary: TagNamesInteroperabilityIfd},
    {fileName: 'iptc-tag-names.js', moduleType: 'iptc', dictionary: IptcTagNames},
    {fileName: 'tag-names-mpf-ifd.js', moduleType: 'mpf', dictionary: TagNamesMpfIfd}
];

describe('TagFilterPlugin', () => {
    it('keeps the description of an included tag in the real source', () => {
        const code = fs.readFileSync(EXIF_0TH_FILENAME, 'utf8');

        const output = transform(code, EXIF_0TH_FILENAME, {exif: ['FillOrder']});

        expect(output).to.match(/description: getFillOrderDescription\b/);
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

    it('reads both branches of a conditional in an expression-bodied name arrow', () => {
        const code = 'export default {'
            + '0x0001: {name: (value) => (value.length === 2 ? \'First\' : \'Second\')},'
            + '0x0002: {name: (value) => (value.length === 2 ? \'Third\' : \'Fourth\')}'
            + '};';

        expect(getKeptIds(transform(code, EXIF_FILENAME, {exif: ['first']}))).to.deep.equal([0x0001]);
        expect(getKeptIds(transform(code, EXIF_FILENAME, {exif: ['SECOND']}))).to.deep.equal([0x0001]);
        expect(getKeptIds(transform(code, EXIF_FILENAME, {exif: ['Other']}))).to.deep.equal([]);
    });

    it('reads both operands of a logical expression', () => {
        const code = 'export default {'
            + '0x0001: {name: (value) => \'Left\' || \'Right\'},'
            + '0x0002: {name: \'Other\' ?? \'Unused\'}'
            + '};';

        expect(getKeptIds(transform(code, EXIF_FILENAME, {exif: ['left']}))).to.deep.equal([0x0001]);
        expect(getKeptIds(transform(code, EXIF_FILENAME, {exif: ['right']}))).to.deep.equal([0x0001]);
    });

    it('rejects a logical expression whose left operand is not a string', () => {
        const code = 'export default {0x0001: {name: (value) => value.length === 2 && \'A\'}};';

        const error = getTransformError(code, EXIF_FILENAME, {exif: ['A']});

        expectUnreadableName(error, 'BinaryExpression');
    });

    it('reads the cooked value of a template literal without expressions', () => {
        const code = 'export default {0x0001: {name: `Pl\\x61in`}};';

        expect(getKeptIds(transform(code, EXIF_FILENAME, {exif: ['plain']}))).to.deep.equal([0x0001]);
    });

    it('rejects a template literal with expressions', () => {
        const code = 'export default {0x0001: {name: `Name ${suffix}`}};';

        const error = getTransformError(code, EXIF_FILENAME, {exif: ['A']});

        expectUnreadableName(error, 'TemplateLiteral');
    });

    it('reads a conditional returned by a block-bodied name arrow', () => {
        const code = 'export default {0x0001: {name: (value) => { return value.length === 2 ? \'Two\' : \'One\'; }}};';

        expect(getKeptIds(transform(code, EXIF_FILENAME, {exif: ['one']}))).to.deep.equal([0x0001]);
        expect(getKeptIds(transform(code, EXIF_FILENAME, {exif: ['two']}))).to.deep.equal([0x0001]);
    });

    it('does not take a string returned inside a nested function for a name', () => {
        const code = 'export default {0x0001: {name: (value) => {'
            + 'const inner = () => { return \'Inner\'; };'
            + 'const other = function () { return \'Inner\'; };'
            + 'return \'Outer\';'
            + '}}};';

        expect(getKeptIds(transform(code, EXIF_FILENAME, {exif: ['inner']}))).to.deep.equal([]);
        expect(getKeptIds(transform(code, EXIF_FILENAME, {exif: ['outer']}))).to.deep.equal([0x0001]);
    });

    it('rejects a return statement without an argument in a name arrow', () => {
        const code = 'export default {0x0001: {name: (value) => { return; }}};';

        const error = getTransformError(code, EXIF_FILENAME, {exif: ['A']});

        expectUnreadableName(error, 'ReturnStatement without an argument');
    });

    it('rejects a returned identifier in a name arrow', () => {
        const code = 'export default {0x0001: {name: (value) => { return label; }}};';

        const error = getTransformError(code, EXIF_FILENAME, {exif: ['A']});

        expectUnreadableName(error, 'Identifier');
    });

    it('rejects a block-bodied name arrow without a return statement', () => {
        const code = 'export default {0x0001: {name: (value) => { value.length; }}};';

        const error = getTransformError(code, EXIF_FILENAME, {exif: ['A']});

        expectUnreadableName(error, 'ArrowFunctionExpression without a return statement');
    });

    it('rejects a name that refers to an imported function, naming the file and the tag', () => {
        const code = 'import {getName} from \'./x.js\'; export default {iptc: {0x02c8: {\'name\': getName}}};';

        const error = getTransformError(code, IPTC_FILENAME, {iptc: ['A Name']});

        expectUnreadableName(error, 'Identifier', {hexId: '0x02c8', filename: IPTC_FILENAME});
    });

    it('rejects a name built by a call', () => {
        const code = 'export default {0x0001: {name: getName()}};';

        const error = getTransformError(code, EXIF_FILENAME, {exif: ['A']});

        expectUnreadableName(error, 'CallExpression');
    });

    it('rejects a name that is a function expression', () => {
        const code = 'export default {0x0001: {name: function () { return \'A\'; }}};';

        const error = getTransformError(code, EXIF_FILENAME, {exif: ['A']});

        expectUnreadableName(error, 'FunctionExpression');
    });

    it('rejects a name method', () => {
        const code = 'export default {0x0001: {name(value) { return \'A\'; }}};';

        const error = getTransformError(code, EXIF_FILENAME, {exif: ['A']});

        expectUnreadableName(error, 'ObjectMethod');
    });

    it('rejects a spread inside an entry, which may hold the name', () => {
        const code = 'export default {0x0001: {name: \'A\', ...other}};';

        const error = getTransformError(code, EXIF_FILENAME, {exif: ['A']});

        expectUnreadableName(error, 'SpreadElement');
    });

    it('rejects a computed key inside an entry, which may be the name', () => {
        const code = 'export default {0x0001: {[key]: \'A\'}};';

        const error = getTransformError(code, EXIF_FILENAME, {exif: ['A']});

        expectUnreadableName(error, 'a computed key');
    });

    it('rejects a computed identifier key spelled like the name key', () => {
        const code = 'export default {0x0001: {[name]: \'A\'}};';

        const error = getTransformError(code, EXIF_FILENAME, {exif: ['A']});

        expectUnreadableName(error, 'a computed key');
    });

    it('rejects an entry without a name', () => {
        const code = 'export default {0x0001: {description: \'A\'}};';

        const error = getTransformError(code, EXIF_FILENAME, {exif: ['A']});

        expectUnreadableName(error, 'an entry without a name');
    });

    it('rejects an entry value that is an identifier', () => {
        const code = 'export default {0x0001: tagName};';

        const error = getTransformError(code, EXIF_FILENAME, {exif: ['A']});

        expectUnreadableName(error, 'Identifier');
    });

    it('reads a computed string key as the name key', () => {
        const code = 'export default {0x0001: {[\'name\']: \'A\'}};';

        expect(getKeptIds(transform(code, EXIF_FILENAME, {exif: ['a']}))).to.deep.equal([0x0001]);
    });

    it('reads the last of several name members, as the object holds at runtime', () => {
        const code = 'export default {0x0001: {name: \'First\', name: \'Last\'}};';

        expect(getKeptIds(transform(code, EXIF_FILENAME, {exif: ['last']}))).to.deep.equal([0x0001]);
        expect(getKeptIds(transform(code, EXIF_FILENAME, {exif: ['first']}))).to.deep.equal([]);
    });

    REAL_DICTIONARIES.forEach(({fileName, moduleType, dictionary}) => {
        it(`keeps exactly the entries of each name of ${fileName} when it is listed alone`, function () {
            this.timeout(20000);
            const filename = path.join(REPO_ROOT, 'src', fileName);
            const code = fs.readFileSync(filename, 'utf8');
            const entries = getRuntimeEntries(dictionary);
            const mismatches = entries
                .filter((entry) => entry.names.length === 0)
                .map((entry) => `${fileName} ${getHex(entry.id)}: no name`);
            const names = getDistinctNames(entries);

            for (const name of names) {
                const keptIds = getKeptIds(transform(code, filename, {[moduleType]: [name]}));
                const expectedIds = entries
                    .filter((entry) => entry.names.some((entryName) => entryName.toLowerCase() === name.toLowerCase()))
                    .map((entry) => entry.id)
                    .sort((left, right) => left - right);
                if (JSON.stringify(keptIds) !== JSON.stringify(expectedIds)) {
                    mismatches.push(`${fileName} '${name}': kept [${keptIds.map(getHex)}], expected [${expectedIds.map(getHex)}]`);
                }
            }

            expect(names.length).to.be.above(0);
            expect(mismatches).to.deep.equal([]);
        });
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

function getKeptIds(code) {
    const ast = babel.parseSync(code, {sourceType: 'module', configFile: false, babelrc: false});
    const exportDeclaration = ast.program.body.find((node) => node.type === 'ExportDefaultDeclaration');
    return collectNumericKeys(exportDeclaration.declaration).sort((left, right) => left - right);
}

function collectNumericKeys(objectExpression) {
    const ids = [];
    for (const member of objectExpression.properties) {
        if (member.type !== 'ObjectProperty') {
            continue;
        }
        if (member.key.type === 'NumericLiteral') {
            ids.push(member.key.value);
        } else if (member.value.type === 'ObjectExpression') {
            ids.push(...collectNumericKeys(member.value));
        }
    }
    return ids;
}

function getTransformError(code, filename, include) {
    try {
        transform(code, filename, include);
    } catch (error) {
        return error;
    }
    return expect.fail('the transform did not throw');
}

function expectUnreadableName(error, found, {hexId = '0x0001', filename = EXIF_FILENAME} = {}) {
    expect(error.constructor).to.equal(Error);
    expect(error.message).to.contain(
        `Cannot read the name of tag ${hexId} in ${filename} for a custom build with a tag list: found ${found}.`
    );
    expect(error.message).to.contain('A tag name must be a string literal, a template literal without expressions,'
        + ' a conditional or logical expression of these, or an arrow function whose body or return statements'
        + ' are one of these.');
}

function getHex(id) {
    return '0x' + id.toString(16).padStart(4, '0');
}

function getRuntimeEntries(dictionary) {
    const entries = [];
    for (const key of Object.keys(dictionary)) {
        const value = dictionary[key];
        if (/^\d+$/.test(key)) {
            entries.push({id: Number(key), names: getEntryNames(value)});
        } else if (typeof value === 'object' && value !== null) {
            entries.push(...getRuntimeEntries(value));
        }
    }
    return entries;
}

function getEntryNames(entry) {
    if (typeof entry === 'string') {
        return [entry];
    }
    if (typeof entry.name === 'string') {
        return [entry.name];
    }
    if (typeof entry.name === 'function') {
        return [...new Set([entry.name([0, 0]), entry.name([0])])];
    }
    return [];
}

function getDistinctNames(entries) {
    const names = new Map();
    for (const entry of entries) {
        for (const name of entry.names) {
            if (!names.has(name.toLowerCase())) {
                names.set(name.toLowerCase(), name);
            }
        }
    }
    return [...names.values()];
}
