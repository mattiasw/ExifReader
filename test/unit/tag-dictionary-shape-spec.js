/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import babel from '@babel/core';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DICTIONARY_FILES = [
    'tag-names-0th-ifd.js',
    'tag-names-exif-ifd.js',
    'tag-names-gps-ifd.js',
    'tag-names-interoperability-ifd.js',
    'tag-names-mpf-ifd.js',
    'iptc-tag-names.js'
];
const LITERAL_TYPES = ['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral'];

describe('tag-dictionary-shape', () => {
    DICTIONARY_FILES.forEach((fileName) => {
        it(`keeps ${fileName} a literal of plain values and references`, () => {
            const source = fs.readFileSync(path.join(REPO_ROOT, 'src', fileName), 'utf8');

            expect(getShapeViolations(source, fileName)).to.deep.equal([]);
        });
    });

    it('rejects a description built by a call', () => {
        const source = 'export default {0x0001: {name: \'A\', description: makeDescription(table)}};';

        expect(getShapeViolations(source, 'x.js')).to.deep.equal(['x.js 0x0001.description: CallExpression']);
    });

    it('rejects an inline description arrow', () => {
        const source = 'export default {0x0001: {name: \'A\', description: (value) => value}};';

        expect(getShapeViolations(source, 'x.js')).to.deep.equal(['x.js 0x0001.description: ArrowFunctionExpression']);
    });

    it('rejects a description method', () => {
        const source = 'export default {0x0001: {name: \'A\', description(value) { return value; }}};';

        expect(getShapeViolations(source, 'x.js')).to.deep.equal(['x.js 0x0001.<ObjectMethod>: ObjectMethod']);
    });

    it('rejects a spread inside an entry', () => {
        const source = 'export default {0x0001: {name: \'A\', ...other}};';

        expect(getShapeViolations(source, 'x.js')).to.deep.equal(['x.js 0x0001.<SpreadElement>: SpreadElement']);
    });

    it('rejects a member expression on a call', () => {
        const source = 'export default {0x0001: {name: \'A\', description: getCommon().X}};';

        expect(getShapeViolations(source, 'x.js')).to.deep.equal(['x.js 0x0001.description: MemberExpression']);
    });

    it('rejects a member expression with a computed key', () => {
        const source = 'export default {0x0001: {name: \'A\', description: TagNamesCommon[key]}};';

        expect(getShapeViolations(source, 'x.js')).to.deep.equal(['x.js 0x0001.description: MemberExpression']);
    });

    it('rejects a name that is not a string or an arrow', () => {
        const source = 'export default {0x0001: {name: tagName}};';

        expect(getShapeViolations(source, 'x.js')).to.deep.equal(['x.js 0x0001.name: Identifier']);
    });

    it('accepts a name arrow with an expression body', () => {
        const source = 'export default {0x0001: {name: (value) => (value.length === 2 ? \'A\' : \'B\')}};';

        expect(getShapeViolations(source, 'x.js')).to.deep.equal([]);
    });

    it('rejects a description bound to a variable in the dictionary file', () => {
        const source = 'const describe = (value) => value; export default {0x0001: {name: \'A\', description: describe}};';

        expect(getShapeViolations(source, 'x.js')).to.deep.equal(['x.js: top-level VariableDeclaration']);
    });

    it('rejects a description function declared in the dictionary file', () => {
        const source = 'function describe(value) { return value; } export default {0x0001: {name: \'A\', description: describe}};';

        expect(getShapeViolations(source, 'x.js')).to.deep.equal(['x.js: top-level FunctionDeclaration']);
    });

    it('accepts imports, literals, references, static member expressions and a name arrow', () => {
        const source = 'import TagNamesCommon from \'./tag-names-common.js\';'
            + 'export default {0x0001: {'
            + 'name: (value) => { return \'A\'; }, '
            + 'description: TagNamesCommon[\'A\'], '
            + 'other: TagNamesCommon.B, '
            + 'repeatable: true, '
            + 'count: 1, '
            + 'nothing: null'
            + '}};';

        expect(getShapeViolations(source, 'x.js')).to.deep.equal([]);
    });

    it('rejects a default export that is not an object literal', () => {
        const source = 'export default makeDictionary();';

        expect(getShapeViolations(source, 'x.js')).to.deep.equal(['x.js: the default export is not an object literal']);
    });
});

function getShapeViolations(source, fileName) {
    const ast = babel.parseSync(source, {sourceType: 'module', configFile: false, babelrc: false});
    const topLevelViolations = ast.program.body
        .filter((node) => node.type !== 'ImportDeclaration' && node.type !== 'ExportDefaultDeclaration')
        .map((node) => `${fileName}: top-level ${node.type}`);
    const exportDeclaration = ast.program.body.find((node) => node.type === 'ExportDefaultDeclaration');
    if (!exportDeclaration || exportDeclaration.declaration.type !== 'ObjectExpression') {
        return topLevelViolations.concat(`${fileName}: the default export is not an object literal`);
    }
    return topLevelViolations.concat(getObjectViolations(exportDeclaration.declaration, []).map(
        (violation) => `${fileName} ${violation}`
    ));
}

function getObjectViolations(objectExpression, keyPath) {
    const violations = [];
    for (const member of objectExpression.properties) {
        if (member.type !== 'ObjectProperty') {
            violations.push(`${keyPath.concat(`<${member.type}>`).join('.')}: ${member.type}`);
            continue;
        }
        const memberPath = keyPath.concat(getKeyText(member.key));
        if (member.value.type === 'ObjectExpression' && !isNameKey(member.key)) {
            violations.push(...getObjectViolations(member.value, memberPath));
        } else if (!isAllowedValue(member)) {
            violations.push(`${memberPath.join('.')}: ${member.value.type}`);
        }
    }
    return violations;
}

function getKeyText(key) {
    if (key.type === 'NumericLiteral') {
        return '0x' + key.value.toString(16).padStart(4, '0');
    }
    if (key.type === 'Identifier') {
        return key.name;
    }
    return String(key.value);
}

function isAllowedValue(property) {
    const value = property.value;
    if (isNameKey(property.key)) {
        // bin/TagFilterPlugin.js reads a string name and the strings a name arrow evaluates to or returns.
        return value.type === 'StringLiteral' || value.type === 'ArrowFunctionExpression';
    }
    return LITERAL_TYPES.includes(value.type)
        || value.type === 'Identifier'
        || isStaticMemberExpression(value);
}

function isNameKey(key) {
    return (key.type === 'Identifier' && key.name === 'name')
        || (key.type === 'StringLiteral' && key.value === 'name');
}

function isStaticMemberExpression(value) {
    if (value.type !== 'MemberExpression' || value.object.type !== 'Identifier') {
        return false;
    }
    const staticKeyType = value.computed ? 'StringLiteral' : 'Identifier';
    return value.property.type === staticKeyType;
}
