/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// On-demand resolver matrix: resolves the exifreader specifiers with the real
// bundlers, resolvers and runtimes and compares the files with EXPECTED.
// Usage: npm run test:packaging [-- --tarball <path to exifreader-x.y.z.tgz>]

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import webpack from 'webpack';
import {packAndExtract} from './pack-tarball.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_PATH = path.join(SCRIPT_DIR, '..', '..');
const TOOLS_DIR = path.join(SCRIPT_DIR, 'tools');
const SMOKE_SCRIPT_PATH = path.join(SCRIPT_DIR, 'runtime-smoke.mjs');
const FIXTURE_PATH = path.join(ROOT_PATH, 'test', 'fixtures', 'images', 'test.jpg');
const RUNTIME_TIMEOUT_MS = 60000;
const MAX_MESSAGE_LENGTH = 100;
const VIRTUAL_ENTRY = 'virtual-entry';

const toolsRequire = createRequire(path.join(TOOLS_DIR, 'package.json'));

const SPECIFIERS = [
    'exifreader',
    'exifreader/package.json',
    'exifreader/src/exif-reader.js',
    'exifreader/dist/exif-reader.js',
    'exifreader/src/exif-reader',
    'exifreader/dist/exif-reader',
    'exifreader/src/composable/x.js'
];

// What each tool resolves with the exports map as shipped, in SPECIFIERS
// order; null means an error. Against 4.49.0, the last release without a
// map, the root column differs in three cells. esbuild browser require gets the
// source: esbuild applies the module condition to every platform and import
// kind and had chosen the UMD there only through its main-field heuristics.
// webpack node module-first gets the UMD through the node condition, where
// its mainFields had picked the source. metro web gets the source through the
// browser condition, where its main field had picked the UMD. The two
// extension-less columns came with their explicit map entries. See README.md
// to refresh it.
const EXPECTED = {
    'webpack esm': ['src/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'webpack commonjs': ['src/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'webpack node module-first': ['dist/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'webpack node main-first': ['dist/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'esbuild browser import': ['src/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'esbuild browser require': ['src/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'esbuild node import': ['dist/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'esbuild node require': ['dist/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'esbuild browser conditions': ['src/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'vite': ['src/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'rollup + node-resolve': ['src/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'parcel': ['src/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'parcel packageExports': ['src/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'metro exports on import': ['dist/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'metro exports on require': ['dist/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'metro exports off': ['dist/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'metro web': ['src/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'tsc 5 node10': ['exif-reader.d.ts', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'node import': ['dist/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'node require': ['dist/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'bun import': ['dist/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'bun require': ['dist/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'deno import': ['dist/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null],
    'deno require': ['dist/exif-reader.js', 'package.json', 'src/exif-reader.js', 'dist/exif-reader.js', 'src/exif-reader.js', 'dist/exif-reader.js', null]
};

// Legs whose refusal message says "not exported". The others report only a missing
// module (esbuild, Metro, Bun), return null (Rollup, tsc) or ignore exports (Parcel defaults).
const REFUSAL_LEGS = [
    'webpack esm',
    'webpack commonjs',
    'webpack node module-first',
    'webpack node main-first',
    'node import',
    'node require',
    'deno import',
    'deno require',
    'vite',
    'parcel packageExports'
];
const REFUSAL_PATTERN = /not exported|ERR_PACKAGE_PATH_NOT_EXPORTED/i;
const REFUSAL_SPECIFIER = 'exifreader/src/composable/x.js';

const TOOL_PACKAGES = [
    'esbuild',
    'vite',
    'rollup',
    '@rollup/plugin-node-resolve',
    'metro-resolver',
    '@parcel/core',
    '@parcel/config-default',
    'typescript'
];
const RUNTIMES = [
    {name: 'node', command: process.execPath, args: []},
    {name: 'bun', command: 'bun', args: [], installer: 'curl -fsSL https://bun.sh/install | bash'},
    {
        name: 'deno',
        command: 'deno',
        args: ['run', '--node-modules-dir=manual', '--allow-read'],
        installer: 'curl -fsSL https://deno.land/install.sh | sh'
    }
];

// React Native 0.79 defaults, from @react-native/metro-config 0.79.7 dist/index.js
// (resolverMainFields, unstable_conditionNames). Metro adds default, import and require itself.
const METRO_MAIN_FIELDS = ['react-native', 'browser', 'main'];
const METRO_CONDITION_NAMES = ['react-native'];
// From cloudflare/workers-sdk packages/wrangler/src/deployment-bundle/bundle.ts.
const ESBUILD_WRANGLER_CONDITIONS = ['workerd', 'worker', 'browser'];

const LEG_GROUPS = [
    {
        legs: ['webpack esm', 'webpack commonjs', 'webpack node module-first', 'webpack node main-first'],
        run: resolveWithWebpack
    },
    {
        legs: ['esbuild browser import', 'esbuild browser require', 'esbuild node import', 'esbuild node require', 'esbuild browser conditions'],
        run: resolveWithEsbuild
    },
    {legs: ['vite'], run: resolveWithVite},
    {legs: ['rollup + node-resolve'], run: resolveWithRollup},
    {legs: ['parcel', 'parcel packageExports'], run: resolveWithParcel},
    {legs: ['metro exports on import', 'metro exports on require', 'metro exports off', 'metro web'], run: resolveWithMetro},
    {legs: ['tsc 5 node10'], run: resolveWithTypeScript},
    ...RUNTIMES.map((runtime) => ({
        legs: [`${runtime.name} import`, `${runtime.name} require`],
        run: (context) => runSmokeScript(context, runtime)
    }))
];

const tarball = parseTarballArgument(process.argv.slice(2));
checkPreconditions();
const exitCode = await runMatrix(tarball);
process.exitCode = exitCode;

function parseTarballArgument(args) {
    const index = args.indexOf('--tarball');
    if (index === -1) {
        return undefined;
    }
    // npm run starts scripts in the package root; INIT_CWD is where it was invoked.
    const tarballPath = args[index + 1] ? path.resolve(process.env.INIT_CWD || process.cwd(), args[index + 1]) : undefined;
    if (!tarballPath || !fs.existsSync(tarballPath)) {
        exitWithMessage(`--tarball needs the path of an existing .tgz file (got ${args[index + 1]}).`);
    }
    return tarballPath;
}

function exitWithMessage(message) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}

function checkPreconditions() {
    TOOL_PACKAGES.forEach((name) => {
        if (readToolVersion(name) === undefined) {
            exitWithMessage(`Run \`npm run test:packaging:install\` first (missing ${name}).`);
        }
    });
    const typeScriptVersion = readToolVersion('typescript');
    if (!typeScriptVersion.startsWith('5.')) {
        exitWithMessage(`The node10 leg needs TypeScript 5.x, found ${typeScriptVersion}. Run \`npm run test:packaging:install\`.`);
    }
    RUNTIMES.filter(({installer}) => installer).forEach(({name, command, installer}) => {
        const result = spawnSync(command, ['--version'], {encoding: 'utf8'});
        if (result.error) {
            exitWithMessage(`${name} is missing. Install it with \`${installer}\` and put its bin directory on PATH.`);
        }
    });
}

function readToolVersion(name) {
    try {
        const packageJsonPath = path.join(TOOLS_DIR, 'node_modules', name, 'package.json');
        return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
    } catch (error) {
        return undefined;
    }
}

async function runMatrix(tarballPath) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-matrix-'));
    try {
        const {consumerDir, installedDir} = packAndExtract(tempRoot, {tarball: tarballPath});
        fs.copyFileSync(SMOKE_SCRIPT_PATH, path.join(consumerDir, 'runtime-smoke.mjs'));
        const context = {tempRoot, consumerDir, installedDir, runtimeFailures: []};

        const rows = await runLegs(context);
        const cells = normalizeRows(rows, context);
        const hasExportsMap = readInstalledPackageJson(installedDir).exports !== undefined;

        printTable(cells);
        printErrors(cells);
        const deviations = findDeviations(cells);
        const refusalFailures = hasExportsMap ? findRefusalFailures(rows) : [];
        printLines([...deviations, ...refusalFailures, ...context.runtimeFailures]);

        const failureCount = deviations.length + refusalFailures.length + context.runtimeFailures.length;
        return failureCount > 0 ? 1 : 0;
    } finally {
        fs.rmSync(tempRoot, {recursive: true, force: true});
    }
}

async function runLegs(context) {
    const rows = {};
    for (const {legs, run} of LEG_GROUPS) {
        try {
            Object.assign(rows, await run(context));
        } catch (error) {
            legs.forEach((leg) => {
                rows[leg] = Object.fromEntries(SPECIFIERS.map((specifier) => [
                    specifier,
                    {error: `leg failed: ${messageOf(error)}`}
                ]));
            });
        }
    }
    return rows;
}

async function resolveWithWebpack({consumerDir}) {
    const variants = [
        {leg: 'webpack esm', config: {}, dependencyType: 'esm'},
        {leg: 'webpack commonjs', config: {}, dependencyType: 'commonjs'},
        {leg: 'webpack node module-first', config: {target: 'node', resolve: {mainFields: ['module', 'main']}}, dependencyType: 'esm'},
        {leg: 'webpack node main-first', config: {target: 'node', resolve: {mainFields: ['main', 'module']}}, dependencyType: 'esm'}
    ];
    const rows = {};
    for (const {leg, config, dependencyType} of variants) {
        const compiler = webpack({context: consumerDir, mode: 'production', entry: './index.js', ...config});
        const resolver = compiler.resolverFactory.get('normal', {dependencyType});
        rows[leg] = await resolveEach((specifier) => new Promise((resolve, reject) => {
            resolver.resolve({}, consumerDir, specifier, {}, (error, resolved) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(resolved);
                }
            });
        }));
    }
    return rows;
}

async function resolveEach(resolveSpecifier) {
    const outcomes = {};
    for (const specifier of SPECIFIERS) {
        try {
            const file = await resolveSpecifier(specifier);
            outcomes[specifier] = file ? {file} : {error: 'unresolved'};
        } catch (error) {
            outcomes[specifier] = {error: messageOf(error)};
        }
    }
    return outcomes;
}

function messageOf(error) {
    if (Array.isArray(error && error.diagnostics)) {
        return error.diagnostics.map(({message}) => message).join('; ');
    }
    return (error && error.message) || String(error);
}

async function resolveWithEsbuild({consumerDir}) {
    const esbuild = toolsRequire('esbuild');
    const variants = [
        {leg: 'esbuild browser import', platform: 'browser', kind: 'import-statement'},
        {leg: 'esbuild browser require', platform: 'browser', kind: 'require-call'},
        {leg: 'esbuild node import', platform: 'node', kind: 'import-statement'},
        {leg: 'esbuild node require', platform: 'node', kind: 'require-call'},
        // Wrangler's build conditions; an explicit list drops esbuild's implicit module condition.
        {leg: 'esbuild browser conditions', platform: 'browser', kind: 'import-statement', conditions: ESBUILD_WRANGLER_CONDITIONS}
    ];
    const rows = {};
    for (const {leg, platform, kind, conditions} of variants) {
        const probe = {
            name: 'probe',
            setup(build) {
                build.onStart(async () => {
                    rows[leg] = await resolveEach(async (specifier) => {
                        const result = await build.resolve(specifier, {kind, resolveDir: consumerDir});
                        if (result.errors.length > 0) {
                            throw new Error(result.errors.map(({text}) => text).join('; '));
                        }
                        return result.path;
                    });
                });
            }
        };
        await esbuild.build({
            stdin: {contents: '', resolveDir: consumerDir},
            bundle: true,
            write: false,
            platform,
            conditions,
            logLevel: 'silent',
            plugins: [probe]
        });
    }
    return rows;
}

async function resolveWithVite({consumerDir}) {
    const vite = await import(pathToFileURL(toolsRequire.resolve('vite')).href);
    const probe = createProbePlugin(path.join(consumerDir, 'entry.js'));
    await runUntilProbed(probe, () => vite.build({
        root: consumerDir,
        configFile: false,
        logLevel: 'silent',
        build: {write: false, rollupOptions: {input: VIRTUAL_ENTRY}},
        plugins: [virtualEntryPlugin(), probe.plugin]
    }));
    return {vite: probe.outcomes};
}

// Stops the build with an error once the probe has resolved every specifier.
function createProbePlugin(importer) {
    const probe = {outcomes: undefined};
    probe.plugin = {
        name: 'probe',
        async buildStart() {
            probe.outcomes = await resolveEach(async (specifier) => {
                const resolved = await this.resolve(specifier, importer);
                return resolved && resolved.id;
            });
            throw new Error('probe finished');
        }
    };
    return probe;
}

async function runUntilProbed(probe, build) {
    try {
        await build();
    } catch (error) {
        if (!probe.outcomes) {
            throw error;
        }
    }
}

function virtualEntryPlugin() {
    return {
        name: 'virtual-entry',
        resolveId(id) {
            return id === VIRTUAL_ENTRY ? id : null;
        },
        load(id) {
            return id === VIRTUAL_ENTRY ? 'export {};' : null;
        }
    };
}

async function resolveWithRollup({consumerDir}) {
    const {rollup} = toolsRequire('rollup');
    const {nodeResolve} = toolsRequire('@rollup/plugin-node-resolve');
    const probe = createProbePlugin(path.join(consumerDir, 'entry.js'));
    await runUntilProbed(probe, () => rollup({
        input: VIRTUAL_ENTRY,
        plugins: [virtualEntryPlugin(), nodeResolve(), probe.plugin],
        onwarn: () => undefined
    }));
    return {'rollup + node-resolve': probe.outcomes};
}

async function resolveWithParcel({consumerDir, tempRoot}) {
    const {Parcel, createWorkerFarm} = toolsRequire('@parcel/core');
    const entry = path.join(consumerDir, 'parcel-entry.js');
    fs.writeFileSync(entry, '');
    const packageJsonPath = path.join(consumerDir, 'package.json');
    const originalPackageJson = fs.readFileSync(packageJsonPath, 'utf8');
    const previousCwd = process.cwd();
    // Parcel takes its project root from the working directory, and its worker
    // farm keeps the process alive until it is ended.
    const workerFarm = createWorkerFarm();
    process.chdir(consumerDir);
    try {
        const rows = {parcel: await resolveWithParcelInstance(Parcel, entry, tempRoot, workerFarm)};
        fs.writeFileSync(packageJsonPath, JSON.stringify({
            private: true,
            '@parcel/resolver-default': {packageExports: true}
        }));
        // The package.json and build caches outlive a Parcel instance; this is
        // the reset Parcel itself runs between builds.
        toolsRequire('@parcel/core/lib/worker.js').clearConfigCache();
        rows['parcel packageExports'] = await resolveWithParcelInstance(Parcel, entry, tempRoot, workerFarm);
        return rows;
    } finally {
        fs.writeFileSync(packageJsonPath, originalPackageJson);
        process.chdir(previousCwd);
        await workerFarm.end();
    }
}

function resolveWithParcelInstance(Parcel, entry, tempRoot, workerFarm) {
    const bundler = new Parcel({
        entries: entry,
        defaultConfig: toolsRequire.resolve('@parcel/config-default'),
        shouldDisableCache: true,
        cacheDir: path.join(tempRoot, 'parcel-cache'),
        mode: 'production',
        logLevel: 'none',
        shouldPatchConsole: false,
        workerFarm
    });
    return resolveEach(async (specifier) => {
        const result = await bundler.unstable_resolve({specifier, specifierType: 'esm', resolveFrom: entry});
        return result && result.filePath;
    });
}

async function resolveWithMetro({consumerDir}) {
    const {resolve} = toolsRequire('metro-resolver');
    const variants = [
        {leg: 'metro exports on import', enablePackageExports: true, isESMImport: true, platform: 'ios'},
        {leg: 'metro exports on require', enablePackageExports: true, isESMImport: false, platform: 'ios'},
        {leg: 'metro exports off', enablePackageExports: false, isESMImport: false, platform: 'ios'},
        {leg: 'metro web', enablePackageExports: true, isESMImport: true, platform: 'web'}
    ];
    const rows = {};
    for (const {leg, enablePackageExports, isESMImport, platform} of variants) {
        const context = createMetroContext(consumerDir, enablePackageExports, isESMImport);
        rows[leg] = await resolveEach((specifier) => {
            const result = resolve(context, specifier, platform);
            if (result.type !== 'sourceFile') {
                throw new Error(`resolved to a ${result.type}`);
            }
            return result.filePath;
        });
    }
    return rows;
}

function createMetroContext(consumerDir, enablePackageExports, isESMImport) {
    return {
        allowHaste: false,
        assetExts: new Set(['png', 'jpg']),
        customResolverOptions: {},
        disableHierarchicalLookup: false,
        doesFileExist: (filePath) => isFile(filePath),
        extraNodeModules: null,
        dev: false,
        getPackage: readJsonOrNull,
        getPackageForModule: findPackageForModule,
        isESMImport,
        fileSystemLookup: lookUpFile,
        mainFields: METRO_MAIN_FIELDS,
        originModulePath: path.join(consumerDir, 'index.js'),
        nodeModulesPaths: [],
        preferNativePlatform: true,
        resolveAsset: () => null,
        redirectModulePath: (modulePath) => modulePath,
        resolveHasteModule: () => null,
        resolveHastePackage: () => null,
        resolveRequest: null,
        sourceExts: ['js', 'jsx', 'json', 'ts', 'tsx'],
        unstable_conditionNames: METRO_CONDITION_NAMES,
        unstable_conditionsByPlatform: {web: ['browser']},
        unstable_enablePackageExports: enablePackageExports,
        unstable_logWarning: () => undefined
    };
}

function isFile(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch (error) {
        return false;
    }
}

function isDirectory(filePath) {
    try {
        return fs.statSync(filePath).isDirectory();
    } catch (error) {
        return false;
    }
}

function readJsonOrNull(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        return null;
    }
}

// Metro's file map looks in the path itself first when it is a directory, which is
// how a bare package specifier finds the package's own package.json.
function findPackageForModule(modulePath) {
    let directory = isDirectory(modulePath) ? modulePath : path.dirname(modulePath);
    while (path.basename(directory) !== 'node_modules') {
        const packageJson = readJsonOrNull(path.join(directory, 'package.json'));
        if (packageJson) {
            return {packageJson, rootPath: directory, packageRelativePath: path.relative(directory, modulePath)};
        }
        const parent = path.dirname(directory);
        if (parent === directory) {
            return null;
        }
        directory = parent;
    }
    return null;
}

function lookUpFile(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return {exists: true, type: stats.isDirectory() ? 'd' : 'f', realPath: fs.realpathSync(filePath)};
    } catch (error) {
        return {exists: false};
    }
}

async function resolveWithTypeScript({consumerDir}) {
    const ts = toolsRequire('typescript');
    const containingFile = path.join(consumerDir, 'index.ts');
    const options = {moduleResolution: ts.ModuleResolutionKind.Node10, resolveJsonModule: true};
    return {
        'tsc 5 node10': await resolveEach((specifier) => {
            const {resolvedModule} = ts.resolveModuleName(specifier, containingFile, options, ts.sys);
            return resolvedModule && resolvedModule.resolvedFileName;
        })
    };
}

function runSmokeScript({consumerDir, runtimeFailures}, {name, command, args}) {
    const result = spawnSync(command, [...args, 'runtime-smoke.mjs', FIXTURE_PATH], {
        cwd: consumerDir,
        encoding: 'utf8',
        timeout: RUNTIME_TIMEOUT_MS
    });
    if (result.status !== 0) {
        runtimeFailures.push(`RUNTIME SMOKE ${name} exited with ${result.status}: ${result.stderr || result.error}`);
    }
    const report = JSON.parse(result.stdout.split('\n')[0]);
    return {
        [`${name} import`]: smokeOutcomes(report.import),
        [`${name} require`]: smokeOutcomes(report.require)
    };
}

function smokeOutcomes(resolutions) {
    return Object.fromEntries(SPECIFIERS.map((specifier) => {
        const resolved = resolutions[specifier];
        return [specifier, typeof resolved === 'string' ? {file: resolved} : {error: resolved.error}];
    }));
}

function normalizeRows(rows, context) {
    return Object.fromEntries(Object.entries(rows).map(([leg, outcomes]) => [
        leg,
        Object.fromEntries(SPECIFIERS.map((specifier) => [specifier, normalizeOutcome(outcomes[specifier], context)]))
    ]));
}

// import.meta.resolve does not check that the file exists, so a missing file is an error.
function normalizeOutcome(outcome, {consumerDir, tempRoot, installedDir}) {
    if (outcome.error !== undefined) {
        const firstLine = String(outcome.error).split('\n')[0]
            .split(consumerDir).join('<consumer>')
            .split(tempRoot).join('<temp>');
        return {error: firstLine.slice(0, MAX_MESSAGE_LENGTH)};
    }
    if (!fs.existsSync(outcome.file)) {
        return {error: 'no such file'};
    }
    return {file: path.relative(installedDir, outcome.file).split(path.sep).join('/')};
}

function readInstalledPackageJson(installedDir) {
    return JSON.parse(fs.readFileSync(path.join(installedDir, 'package.json'), 'utf8'));
}

function printTable(cells) {
    const lines = [
        `| leg | ${SPECIFIERS.join(' | ')} |`,
        `|---|${SPECIFIERS.map(() => '---').join('|')}|`,
        ...Object.entries(cells).map(([leg, outcomes]) => {
            const values = SPECIFIERS.map((specifier) => outcomes[specifier].file || 'error');
            return `| ${leg} | ${values.join(' | ')} |`;
        })
    ];
    printLines(['', ...lines, '']);
}

function printErrors(cells) {
    const lines = [];
    Object.entries(cells).forEach(([leg, outcomes]) => {
        SPECIFIERS.forEach((specifier) => {
            if (outcomes[specifier].error !== undefined) {
                lines.push(`- ${leg} ${specifier}: ${outcomes[specifier].error}`);
            }
        });
    });
    printLines(['Errors:', ...lines, '']);
}

function findDeviations(cells) {
    const deviations = [];
    Object.entries(cells).forEach(([leg, outcomes]) => {
        SPECIFIERS.forEach((specifier, index) => {
            const expected = EXPECTED[leg] ? EXPECTED[leg][index] : undefined;
            const actual = outcomes[specifier].file || null;
            if (expected !== actual) {
                deviations.push(`DEVIATION ${leg} ${specifier}: expected ${describeFile(expected)}, got ${describeFile(actual)}`);
            }
        });
    });
    return deviations;
}

function describeFile(file) {
    if (file === undefined) {
        return 'no EXPECTED entry';
    }
    return file === null ? 'error' : file;
}

function findRefusalFailures(rows) {
    return REFUSAL_LEGS
        .filter((leg) => !REFUSAL_PATTERN.test(String(rows[leg][REFUSAL_SPECIFIER].error)))
        .map((leg) => {
            const outcome = rows[leg][REFUSAL_SPECIFIER];
            return `NOT REFUSED ${leg}: ${outcome.error === undefined ? outcome.file : outcome.error}`;
        });
}

function printLines(lines) {
    if (lines.length > 0) {
        process.stdout.write(`${lines.join('\n')}\n`);
    }
}
