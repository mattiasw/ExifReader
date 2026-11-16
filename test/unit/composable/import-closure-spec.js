/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import babel from '@babel/core';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const COMPOSABLE_PREFIX = './src/composable/';

describe('composable import closure', () => {
    it('derives every composable subpath entry from the exports map', () => {
        const tagsPath = fromRoot('src/composable/tags');
        const tagFiles = fs.readdirSync(tagsPath)
            .filter((fileName) => fileName.endsWith('.js'))
            .map((fileName) => path.join(tagsPath, fileName))
            .sort();
        const entries = getComposableEntries();

        expect(tagFiles).to.not.be.empty;
        expect(entries.filter((entry) => entry.startsWith(tagsPath + path.sep))).to.deep.equal(tagFiles);
        expect(entries).to.include.members([
            fromRoot('src/composable/core.js'),
            fromRoot('src/composable/formats.js'),
            fromRoot('src/composable/groups.js')
        ]);
    });

    it('names only files that exist in every composable target of the exports map', () => {
        const packageJson = JSON.parse(fs.readFileSync(fromRoot('package.json'), 'utf8'));
        const targets = collectExportTargets(packageJson.exports).filter((target) => target.startsWith(COMPOSABLE_PREFIX));
        const missing = targets.filter((target) => !fs.existsSync(fromRoot(target)));

        expect(targets).to.not.be.empty;
        expect(missing).to.deep.equal([]);
    });

    it('keeps the generated tag modules and the IPTC block reader out of the default entry', () => {
        const closure = Array.from(getImportClosure([fromRoot('src/exif-reader.js')]));

        expect(closure).to.include(fromRoot('src/composable/groups/iptc.js'));
        expect(closure.filter((filePath) => filePath.startsWith(fromRoot('src/composable/tags') + path.sep))).to.deep.equal([]);
        expect(closure).to.not.include(fromRoot('src/composable/iptc-block-reader.js'));
    });

    it('brings decompression.js only with the png and jxl formats', () => {
        const decompressionModule = fromRoot('src/decompression.js');

        expect(getImportClosure([fromRoot('src/composable/formats/png.js')])).to.include(decompressionModule);
        expect(getImportClosure([fromRoot('src/composable/formats/jxl.js')])).to.include(decompressionModule);
        expect(getImportClosure([
            fromRoot('src/composable/core.js'),
            fromRoot('src/composable/formats/jpeg.js'),
            fromRoot('src/composable/groups/exif.js')
        ])).to.not.include(decompressionModule);
    });

    it('reports code references to Buffer', () => {
        const source = 'if (typeof Buffer !== \'undefined\') {\n    use(Buffer.from(x));\n}';

        expect(findFreeReferences(source, 'Buffer')).to.deep.equal([1, 2]);
    });

    it('does not report Buffer in strings, comments or member properties', () => {
        const source = 'const message = \'a Node Buffer\';\n// Buffer\nconst b = globalThis.Buffer;';

        expect(findFreeReferences(source, 'Buffer')).to.deep.equal([]);
    });

    it('keeps Buffer out of every module the composable subpaths import', () => {
        const hits = [];
        getImportClosure(getComposableEntries()).forEach((filePath) => {
            const source = fs.readFileSync(filePath, 'utf8');
            findFreeReferences(source, 'Buffer').forEach((line) => {
                hits.push(`${path.relative(REPO_ROOT, filePath)}:${line}`);
            });
        });

        expect(hits).to.deep.equal([]);
    });
});

function fromRoot(relativePath) {
    return path.join(REPO_ROOT, relativePath);
}

function getComposableEntries() {
    const packageJson = JSON.parse(fs.readFileSync(fromRoot('package.json'), 'utf8'));
    const entries = new Set();
    collectExportTargets(packageJson.exports).forEach((target) => {
        if (target.startsWith(COMPOSABLE_PREFIX) && target.endsWith('.js')) {
            entries.add(fromRoot(target));
        }
    });
    return Array.from(entries).sort();
}

function collectExportTargets(value) {
    if (typeof value === 'string') {
        return [value];
    }
    if (value === null || typeof value !== 'object') {
        return [];
    }
    return Object.values(value).flatMap(collectExportTargets);
}

function getImportClosure(entryFiles) {
    const closure = new Set(entryFiles);
    const queue = entryFiles.slice();
    while (queue.length > 0) {
        const filePath = queue.shift();
        getRelativeImports(filePath).forEach((importedPath) => {
            if (!closure.has(importedPath)) {
                closure.add(importedPath);
                queue.push(importedPath);
            }
        });
    }
    return closure;
}

function getRelativeImports(filePath) {
    const ast = parse(fs.readFileSync(filePath, 'utf8'));
    return ast.program.body
        .filter(isStaticImportWithSource)
        .map((node) => node.source.value)
        .filter((specifier) => specifier.startsWith('.'))
        .map((specifier) => {
            const importedPath = path.resolve(path.dirname(filePath), specifier);
            if (!fs.existsSync(importedPath)) {
                throw new Error(`${path.relative(REPO_ROOT, filePath)} imports ${specifier}, which does not exist.`);
            }
            return importedPath;
        });
}

function isStaticImportWithSource(node) {
    return (node.type === 'ImportDeclaration'
        || node.type === 'ExportNamedDeclaration'
        || node.type === 'ExportAllDeclaration')
        && !!node.source;
}

function findFreeReferences(source, name) {
    const lines = [];
    babel.traverse(parse(source), {
        // getBinding, not hasBinding: hasBinding also answers true for Babel's list of known globals.
        ReferencedIdentifier(nodePath) {
            if (nodePath.node.name === name && !nodePath.scope.getBinding(name)) {
                lines.push(nodePath.node.loc.start.line);
            }
        }
    });
    return lines;
}

function parse(source) {
    return babel.parseSync(source, {sourceType: 'module', configFile: false, babelrc: false});
}
