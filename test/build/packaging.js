/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const {expect} = require('chai');
const {execFileSync, spawnSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {pathToFileURL} = require('url');
const webpack = require('webpack');
const {packAndExtract} = require('../packaging/pack-tarball.js');

const ROOT_PATH = path.join(__dirname, '..', '..');
const PACK_TIMEOUT_MS = 60000;

const API_SHAPE = {load: 'function', loadView: 'function', errors: 'object'};
const SPECIFIERS = [
    {specifier: 'exifreader', file: 'dist/exif-reader.js', shape: API_SHAPE},
    {specifier: 'exifreader/package.json', file: 'package.json', shape: {name: 'exifreader'}},
    {specifier: 'exifreader/src/exif-reader.js', file: 'src/exif-reader.js', shape: API_SHAPE},
    {specifier: 'exifreader/dist/exif-reader.js', file: 'dist/exif-reader.js', shape: API_SHAPE},
    {specifier: 'exifreader/src/exif-reader', file: 'src/exif-reader.js', shape: API_SHAPE},
    {specifier: 'exifreader/dist/exif-reader', file: 'dist/exif-reader.js', shape: API_SHAPE}
];
const BLOCKED_SPECIFIERS = ['exifreader/bin/cli.js', 'exifreader/src/composable/core.js'];
const NOT_EXPORTED_CODE = 'ERR_PACKAGE_PATH_NOT_EXPORTED';

// Bundlers that honour the module condition keep getting the ES module source;
// those targeting Node stop at the node condition and get the UMD that Node loads.
const WEBPACK_ROOT_FILE = 'src/exif-reader.js';
const WEBPACK_NODE_ROOT_FILE = 'dist/exif-reader.js';
const WEBPACK_NODE_MAIN_FIELDS = [['module', 'main'], ['main', 'module']];
const WEBPACK_DEPENDENCY_TYPES = ['esm', 'commonjs'];
// Cloudflare's Wrangler bundles with these esbuild conditions and no module condition.
const WRANGLER_CONDITION_NAMES = ['workerd', 'worker', 'browser'];

const XMLDOM_PATH = path.join(ROOT_PATH, 'node_modules', '@xmldom', 'xmldom');
const FIXTURE_PATH = path.join(ROOT_PATH, 'test', 'fixtures', 'images', 'test-iptc.jpg');
const FIXTURE_SUB_LOCATION = 'My Sublocation';
const FIXTURE_XMP_KEY = 'AuthorsPosition';
const DOM_PARSER_WARNING = 'DOMParser is not available';
const WITH_DOM_PARSER = 'with-dom-parser';
const LOAD_SOURCES = ['path', 'url'];
// Outside webpack the source gets no implicit @xmldom/xmldom; the dist's literal require finds it.
const LOAD_LEGS = [
    {script: 'consumer-load.cjs', loader: 'src', domParser: false, expectsXmp: false},
    {script: 'consumer-load.mjs', loader: 'src', domParser: false, expectsXmp: false},
    {script: 'consumer-load.mjs', loader: 'src', domParser: true, expectsXmp: true},
    {script: 'consumer-load.cjs', loader: 'dist', domParser: false, expectsXmp: true},
    {script: 'consumer-load.mjs', loader: 'dist', domParser: false, expectsXmp: true}
];
const DIST_NODE_MODULES = ['fs', 'http', 'https', '@xmldom/xmldom'];

const OPTIONAL_PACKAGE = '@xmldom/xmldom';
const BUNDLE_SPECIFIERS = ['exifreader', 'exifreader/dist/exif-reader.js'];
const WEB_BUNDLE_SPECIFIER = 'exifreader/dist/exif-reader.js';
// As in 4.49.0, the dist requires http and https with no try, so a web build stubs them.
const WEB_FALLBACKS = {http: false, https: false};

const TYPE_CONSUMERS_PATH = path.join(ROOT_PATH, 'test', 'types', 'packed');
const TYPE_CONSUMER_FILES = ['consumer.ts', 'consumer.mts'];
const TSC_PATH = path.join(ROOT_PATH, 'node_modules', 'typescript', 'bin', 'tsc');
const TYPE_MODES = [
    {moduleResolution: 'bundler', module: 'esnext'},
    {moduleResolution: 'node16', module: 'node16'},
    {moduleResolution: 'nodenext', module: 'nodenext'}
];

describe('packaging', function () {
    this.timeout(PACK_TIMEOUT_MS);

    let tempRoot;
    let consumerDir;
    let installedDir;
    let packedFiles;

    before(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-packaging-'));
        ({consumerDir, installedDir, packedFiles} = packAndExtract(tempRoot));
        fs.writeFileSync(path.join(consumerDir, 'consumer.cjs'), buildRequireScript());
        fs.writeFileSync(path.join(consumerDir, 'consumer.mjs'), buildImportScript());
    });

    after(() => {
        fs.rmSync(tempRoot, {recursive: true, force: true});
    });

    it('ships src/package.json and no custom build marker in the npm tarball', () => {
        expect(packedFiles).to.include('src/package.json');
        expect(packedFiles).to.not.include('dist/.exifreader-custom-build.json');
    });

    it('ships a dist without webpack\'s __non_webpack_require__', () => {
        const dist = fs.readFileSync(path.join(installedDir, 'dist', 'exif-reader.js'), 'utf8');
        expect(dist).to.not.include('__non_webpack_require__');
    });

    DIST_NODE_MODULES.forEach((moduleName) => {
        it(`ships a dist that requires ${moduleName} by a literal name`, () => {
            const dist = fs.readFileSync(path.join(installedDir, 'dist', 'exif-reader.js'), 'utf8');
            expect(dist).to.include(`require("${moduleName}")`);
        });
    });

    it('declares src as side-effect-free ES modules and nothing else', () => {
        const content = JSON.parse(fs.readFileSync(path.join(ROOT_PATH, 'src', 'package.json'), 'utf8'));
        expect(content).to.deep.equal({type: 'module', sideEffects: false});
    });

    describe('under require', () => {
        let results;

        before(() => {
            results = runConsumerScript('consumer.cjs');
        });

        SPECIFIERS.forEach(({specifier, file, shape}) => {
            it(`resolves and loads ${specifier}`, () => {
                const result = results.resolutions[specifier];
                expect(result.error, 'resolution error').to.equal(undefined);
                expect(result.resolved).to.equal(path.join(installedDir, file));
                expect(result.loaded).to.deep.equal(shape);
            });
        });

        BLOCKED_SPECIFIERS.forEach((specifier) => {
            it(`refuses ${specifier} as not exported`, () => {
                expect(results.blocked[specifier]).to.deep.equal({error: NOT_EXPORTED_CODE});
            });
        });

        it('lets a custom build find the copy the project installed', () => {
            expect(results.install).to.include({
                ok: true,
                distPath: path.join(installedDir, 'dist', 'exif-reader.js')
            });
        });
    });

    describe('under import', () => {
        let results;

        before(() => {
            results = runConsumerScript('consumer.mjs');
        });

        SPECIFIERS.forEach(({specifier, file, shape}) => {
            it(`resolves and loads ${specifier}`, () => {
                const result = results.resolutions[specifier];
                expect(result.error, 'resolution error').to.equal(undefined);
                expect(result.resolved).to.equal(pathToFileURL(path.join(installedDir, file)).href);
                expect(result.loaded).to.deep.equal(shape);
            });
        });

        BLOCKED_SPECIFIERS.forEach((specifier) => {
            it(`refuses ${specifier} as not exported`, () => {
                expect(results.blocked[specifier]).to.deep.equal({error: NOT_EXPORTED_CODE});
            });
        });

        it('imports exifreader statically as a default export', () => {
            expect(results.staticDefaultImport).to.deep.equal(API_SHAPE);
        });
    });

    describe('under webpack\'s resolver', () => {
        let compiler;

        before(() => {
            compiler = webpack({context: consumerDir, mode: 'production'});
        });

        WEBPACK_DEPENDENCY_TYPES.forEach((dependencyType) => {
            describe(`as ${dependencyType}`, () => {
                it(`resolves exifreader to ${WEBPACK_ROOT_FILE} through the module condition`, async () => {
                    const resolved = await resolveWithWebpack(compiler, dependencyType, consumerDir, 'exifreader');
                    expect(toForwardSlashes(path.relative(installedDir, resolved))).to.equal(WEBPACK_ROOT_FILE);
                });

                SPECIFIERS.filter(({specifier}) => specifier !== 'exifreader').forEach(({specifier, file}) => {
                    it(`resolves ${specifier} to its own file`, async () => {
                        const resolved = await resolveWithWebpack(compiler, dependencyType, consumerDir, specifier);
                        expect(toForwardSlashes(path.relative(installedDir, resolved))).to.equal(file);
                    });
                });

                BLOCKED_SPECIFIERS.forEach((specifier) => {
                    it(`refuses ${specifier} as not exported`, async () => {
                        const error = await resolveWithWebpack(compiler, dependencyType, consumerDir, specifier)
                            .then(() => undefined, (resolveError) => resolveError);
                        expect(error, 'resolution error').to.be.an('error');
                        expect(error.message).to.match(/is not exported/);
                    });
                });
            });
        });
    });

    describe('under webpack\'s resolver for target node', () => {
        WEBPACK_NODE_MAIN_FIELDS.forEach((mainFields) => {
            describe(`with mainFields ${mainFields.join(', ')}`, () => {
                let compiler;

                before(() => {
                    compiler = webpack({context: consumerDir, mode: 'production', target: 'node', resolve: {mainFields}});
                });

                WEBPACK_DEPENDENCY_TYPES.forEach((dependencyType) => {
                    it(`resolves exifreader to ${WEBPACK_NODE_ROOT_FILE} through the node condition as ${dependencyType}`, async () => {
                        const resolved = await resolveWithWebpack(compiler, dependencyType, consumerDir, 'exifreader');
                        expect(toForwardSlashes(path.relative(installedDir, resolved))).to.equal(WEBPACK_NODE_ROOT_FILE);
                    });
                });
            });
        });
    });

    describe('under webpack\'s resolver with Wrangler\'s conditions', () => {
        let compiler;

        before(() => {
            compiler = webpack({context: consumerDir, mode: 'production', resolve: {conditionNames: WRANGLER_CONDITION_NAMES}});
        });

        WEBPACK_DEPENDENCY_TYPES.forEach((dependencyType) => {
            it(`resolves exifreader to ${WEBPACK_ROOT_FILE} through the browser condition as ${dependencyType}`, async () => {
                const resolved = await resolveWithWebpack(compiler, dependencyType, consumerDir, 'exifreader');
                expect(toForwardSlashes(path.relative(installedDir, resolved))).to.equal(WEBPACK_ROOT_FILE);
            });
        });
    });

    describe('loading a fixture by path and by URL', () => {
        before(() => {
            fs.cpSync(XMLDOM_PATH, path.join(consumerDir, 'node_modules', '@xmldom', 'xmldom'), {recursive: true});
            fs.writeFileSync(path.join(consumerDir, 'consumer-load.cjs'), buildLoadScript('cjs'));
            fs.writeFileSync(path.join(consumerDir, 'consumer-load.mjs'), buildLoadScript('mjs'));
        });

        LOAD_LEGS.forEach(({script, loader, domParser, expectsXmp}) => {
            describe(`from ${script} through ${loader}${domParser ? ' with a domParser option' : ''}`, () => {
                let results;

                before(() => {
                    results = runConsumerScript(script, [loader, FIXTURE_PATH, domParser ? WITH_DOM_PARSER : '']);
                });

                LOAD_SOURCES.forEach((source) => {
                    it(`loads the fixture by ${source}`, () => {
                        expect(results[source].error, 'load error').to.equal(undefined);
                        expect(results[source].subLocation).to.equal(FIXTURE_SUB_LOCATION);
                    });

                    if (expectsXmp) {
                        it(`parses XMP when loading by ${source}`, () => {
                            expect(results[source].xmpKeys).to.include(FIXTURE_XMP_KEY);
                        });
                    } else {
                        it(`leaves XMP unparsed when loading by ${source}`, () => {
                            expect(results[source].xmpKeys).to.deep.equal([]);
                        });
                    }
                });

                it(expectsXmp ? 'has a DOMParser' : 'warns that no DOMParser is available', () => {
                    const domParserWarnings = results.warnings.filter((warning) => warning.includes(DOM_PARSER_WARNING));
                    expect(domParserWarnings.length > 0).to.equal(!expectsXmp);
                });
            });
        });
    });

    describe('types through the packed package', () => {
        before(() => {
            TYPE_CONSUMER_FILES.forEach((fileName) => {
                fs.copyFileSync(path.join(TYPE_CONSUMERS_PATH, fileName), path.join(consumerDir, fileName));
            });
        });

        TYPE_MODES.forEach(({moduleResolution, module}) => {
            it(`type-checks both consumers against exif-reader.d.ts under moduleResolution ${moduleResolution}`, () => {
                const tsconfigPath = writeTsconfig(consumerDir, moduleResolution, module);

                const result = spawnSync(process.execPath, [TSC_PATH, '-p', tsconfigPath, '--listFiles'], {
                    cwd: consumerDir,
                    encoding: 'utf8',
                    timeout: PACK_TIMEOUT_MS
                });

                expect(result.status, [result.stdout, result.stderr, result.error].filter(Boolean).join('\n')).to.equal(0);
                const listedFiles = result.stdout.split(/\r?\n/).map(toForwardSlashes);
                expect(listedFiles).to.include(toForwardSlashes(path.join(installedDir, 'exif-reader.d.ts')));
            });
        });
    });

    describe('bundling without @xmldom/xmldom', () => {
        let bundleDir;

        before(() => {
            bundleDir = path.join(path.dirname(consumerDir), 'bundle-consumer');
            fs.mkdirSync(path.join(bundleDir, 'node_modules'), {recursive: true});
            fs.writeFileSync(path.join(bundleDir, 'package.json'), JSON.stringify({private: true}));
            // A copy, not a symlink: webpack resolves a symlink to its real path, inside the shared consumer.
            fs.cpSync(installedDir, path.join(bundleDir, 'node_modules', 'exifreader'), {recursive: true});
        });

        it(`cannot resolve ${OPTIONAL_PACKAGE} from the bundle consumer`, async () => {
            const compiler = webpack({context: bundleDir, mode: 'production', target: 'node'});
            try {
                const resolved = await resolveWithWebpack(compiler, 'commonjs', bundleDir, OPTIONAL_PACKAGE).catch(() => null);
                expect(resolved).to.equal(null);
            } finally {
                await closeCompiler(compiler);
            }
        });

        BUNDLE_SPECIFIERS.forEach((specifier, index) => {
            it(`builds an import of ${specifier} for Node without errors and runs the bundle`, async () => {
                const entry = path.join(bundleDir, `entry-${index}.js`);
                const outputPath = path.join(bundleDir, `out-${index}`);
                fs.writeFileSync(entry, `import ExifReader from '${specifier}';\nprocess.stdout.write(typeof ExifReader.load);\n`);

                const stats = await bundleWithWebpack({context: bundleDir, target: 'node', entry, outputPath});

                const errors = stats.toJson({all: false, errors: true}).errors.map((error) => error.message);
                expect(errors, errors.join('\n')).to.deep.equal([]);
                const output = execFileSync(process.execPath, [path.join(outputPath, 'main.js')], {
                    cwd: bundleDir,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    timeout: PACK_TIMEOUT_MS
                });
                expect(output.toString()).to.equal('function');
            });
        });

        it(`builds an import of ${WEB_BUNDLE_SPECIFIER} for the web without errors when only http and https are stubbed`, async () => {
            const entry = path.join(bundleDir, 'entry-web.js');
            fs.writeFileSync(entry, `import ExifReader from '${WEB_BUNDLE_SPECIFIER}';\nexport default ExifReader.load;\n`);

            const stats = await bundleWithWebpack({
                context: bundleDir,
                target: 'web',
                entry,
                outputPath: path.join(bundleDir, 'out-web'),
                resolveOptions: {fallback: WEB_FALLBACKS}
            });

            const errors = stats.toJson({all: false, errors: true}).errors.map((error) => error.message);
            expect(errors, errors.join('\n')).to.deep.equal([]);
        });
    });

    // With an exports map, self-reference beats the paths option, so every resolution
    // runs in a child process whose script lives in the consumer. A failing script
    // surfaces its stderr in the thrown error's message.
    function runConsumerScript(scriptName, args = []) {
        const output = execFileSync(process.execPath, [path.join(consumerDir, scriptName), ...args], {
            cwd: consumerDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: PACK_TIMEOUT_MS
        });
        return JSON.parse(output.toString());
    }
});

function buildRequireScript() {
    return `
${summarizeSource()}
const resolutions = {};
${specifiersSource()}.forEach((specifier) => {
    try {
        const resolved = require.resolve(specifier);
        const loaded = require(specifier);
        resolutions[specifier] = {resolved, loaded: summarize(loaded)};
    } catch (error) {
        resolutions[specifier] = {error: error.code || error.message};
    }
});

const blocked = {};
${blockedSpecifiersSource()}.forEach((specifier) => {
    try {
        blocked[specifier] = {resolved: require.resolve(specifier)};
    } catch (error) {
        blocked[specifier] = {error: error.code || error.message};
    }
});

let install;
try {
    install = require('./node_modules/exifreader/bin/cli.js').checkLocalInstall(process.cwd());
} catch (error) {
    install = {error: error.code || error.message};
}
process.stdout.write(JSON.stringify({resolutions, blocked, install}));
`;
}

function buildImportScript() {
    return `
import exifReader from 'exifreader';
${summarizeSource()}
const resolutions = {};
for (const specifier of ${specifiersSource()}) {
    try {
        const resolved = import.meta.resolve(specifier);
        const options = specifier.endsWith('.json') ? {with: {type: 'json'}} : undefined;
        const loaded = await import(specifier, options);
        resolutions[specifier] = {resolved, loaded: summarize(loaded.default)};
    } catch (error) {
        resolutions[specifier] = {error: error.code || error.message};
    }
}

const blocked = {};
for (const specifier of ${blockedSpecifiersSource()}) {
    try {
        blocked[specifier] = {resolved: import.meta.resolve(specifier)};
    } catch (error) {
        blocked[specifier] = {error: error.code || error.message};
    }
}

process.stdout.write(JSON.stringify({resolutions, blocked, staticDefaultImport: summarize(exifReader)}));
`;
}

// Deleting fetch sends URLs through Node's http module. Each source catches its
// own failure so one failing load still reports the other.
function buildLoadScript(format) {
    const scriptLocation = format === 'cjs' ? '__filename' : 'import.meta.url';
    const body = `
const fs = (await import('node:fs')).default;
const http = (await import('node:http')).default;
const {createRequire} = await import('node:module');
const requireFromScript = createRequire(${scriptLocation});
const [loader, fixturePath, domParserFlag] = process.argv.slice(2);

const warnings = [];
console.warn = (...args) => warnings.push(args.map(String).join(' '));
delete globalThis.fetch;

const fixtureBytes = fs.readFileSync(fixturePath);
const server = http.createServer((request, response) => {
    response.writeHead(200, {'content-length': fixtureBytes.length});
    response.end(fixtureBytes);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const exifReader = loader === 'src'
    ? (await import('exifreader/src/exif-reader.js')).default
    : requireFromScript('exifreader');
const options = {expanded: true};
if (domParserFlag === '${WITH_DOM_PARSER}') {
    const {DOMParser, onErrorStopParsing} = requireFromScript('@xmldom/xmldom');
    options.domParser = new DOMParser({onError: onErrorStopParsing});
}

async function summarizeLoad(source) {
    try {
        const tags = await exifReader.load(source, options);
        const subLocation = tags.iptc && tags.iptc['Sub-location'];
        return {
            subLocation: subLocation && subLocation.description,
            xmpKeys: Object.keys(tags.xmp || {})
        };
    } catch (error) {
        return {error: error.message};
    }
}

const results = {
    path: await summarizeLoad(fixturePath),
    url: await summarizeLoad('http://127.0.0.1:' + server.address().port + '/test-iptc.jpg')
};
server.closeAllConnections();
server.close();
process.stdout.write(JSON.stringify({...results, warnings}));
`;
    return format === 'cjs' ? `(async () => {${body}})();\n` : body;
}

function summarizeSource() {
    return `
function summarize(value) {
    const summary = {};
    ['load', 'loadView', 'errors'].forEach((key) => {
        if (value[key] !== undefined) {
            summary[key] = typeof value[key];
        }
    });
    if (typeof value.name === 'string') {
        summary.name = value.name;
    }
    return summary;
}
`;
}

function specifiersSource() {
    return JSON.stringify(SPECIFIERS.map(({specifier}) => specifier));
}

function blockedSpecifiersSource() {
    return JSON.stringify(BLOCKED_SPECIFIERS);
}

function resolveWithWebpack(compiler, dependencyType, context, specifier) {
    const resolver = compiler.resolverFactory.get('normal', {dependencyType});
    return new Promise((resolve, reject) => {
        resolver.resolve({}, context, specifier, {}, (error, resolved) => {
            if (error) {
                reject(error);
            } else {
                resolve(resolved);
            }
        });
    });
}

function writeTsconfig(consumerDir, moduleResolution, module) {
    const tsconfigPath = path.join(consumerDir, `tsconfig.${moduleResolution}.json`);
    const tsconfig = {
        compilerOptions: {
            strict: true,
            noEmit: true,
            target: 'es2022',
            module,
            moduleResolution,
            typeRoots: [path.join(ROOT_PATH, 'node_modules', '@types')],
            types: ['node']
        },
        files: TYPE_CONSUMER_FILES
    };
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 4));
    return tsconfigPath;
}

function toForwardSlashes(filePath) {
    return filePath.replace(/\\/g, '/');
}

function bundleWithWebpack({context, target, entry, outputPath, resolveOptions = {}}) {
    const compiler = webpack({
        context,
        mode: 'production',
        target,
        entry,
        output: {path: outputPath},
        optimization: {minimize: false},
        resolve: resolveOptions
    });
    return new Promise((resolve, reject) => {
        compiler.run((runError, stats) => {
            closeCompiler(compiler).then(() => (runError ? reject(runError) : resolve(stats)), reject);
        });
    });
}

function closeCompiler(compiler) {
    return new Promise((resolve, reject) => {
        compiler.close((error) => (error ? reject(error) : resolve()));
    });
}
