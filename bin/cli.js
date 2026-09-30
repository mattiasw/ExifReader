#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */

const path = require('path');
const fs = require('fs');
const {readMarker, markerMatches} = require('./custom-build-marker');
const {collectImagePaths, loadFullParser, resolveDomParser, analyzeImages, deriveConfig, writeConfigToPackageJson} = require('./analyze');
const {verifyImages, loadCustomParser} = require('./verify-build');

const EXIFREADER_ROOT_DIR = path.join(__dirname, '..');

module.exports = {parseArgs, run, checkLocalInstall, readConfigFile};

// build.js is required lazily (only when run) so importing this file in unit
// tests does not pull its integration-tested build logic into coverage.
if (require.main === module) {
    run(process.argv, {
        cwd: () => process.cwd(),
        env: process.env,
        version: () => require(path.join(EXIFREADER_ROOT_DIR, 'package.json')).version,
        resolveConfig: (directory) => require('./findDependentConfig').forCli(directory),
        readConfigFile,
        readMarker,
        checkLocalInstall,
        build: (options) => require('./build').runBuild(options),
        fs,
        loadFullParser,
        loadCustomParser,
        resolveDomParser,
        log: console.log,
        error: console.error,
        exit: (code) => process.exit(code)
    });
}

function run(argv, deps) {
    const args = parseArgs(argv);

    if (args.version) {
        deps.log(deps.version());
        deps.exit(0);
        return;
    }

    if (args.help) {
        deps.log(helpText());
        deps.exit(0);
        return;
    }

    if (args.command === 'build') {
        return runBuildCommand(args, deps);
    }

    if (args.command === 'analyze') {
        return runAnalyzeCommand(args, deps);
    }

    if (args.command) {
        deps.error(`Unknown command: ${args.command}`);
    }
    deps.log(helpText());
    deps.exit(1);
}

function parseArgs(argv) {
    const args = argv.slice(2);
    return {
        command: positionals(args)[0],
        help: args.includes('-h') || args.includes('--help'),
        version: args.includes('-v') || args.includes('--version'),
        check: args.includes('--check'),
        ifNeeded: args.includes('--if-needed'),
        config: configPath(args),
        write: args.includes('--write'),
        auto: args.includes('--auto'),
        verify: args.includes('--verify'),
        paths: positionals(args).slice(1)
    };
}

function positionals(args) {
    return args.filter((arg, index) => !arg.startsWith('-') && args[index - 1] !== '--config');
}

// Returns undefined when --config is absent and '' when it has no value.
function configPath(args) {
    const index = args.findIndex((arg) => arg === '--config' || arg.startsWith('--config='));
    if (index === -1) {
        return undefined;
    }
    if (args[index] !== '--config') {
        return args[index].slice('--config='.length);
    }
    const next = args[index + 1];
    return next !== undefined && !next.startsWith('-') ? next : '';
}

function helpText() {
    return 'Usage: npx exifreader <command> [options]\n'
        + '\n'
        + 'Commands:\n'
        + '  build              Rebuild dist/exif-reader.js using the "exifreader" custom build\n'
        + '                     configuration (include/exclude) from --config, the\n'
        + '                     EXIFREADER_CUSTOM_BUILD env var, or your project\'s package.json.\n'
        + '  analyze <paths...> Read the given image files and directories with the full parser\n'
        + '                     and print the include configuration that reads everything found\n'
        + '                     in them.\n'
        + '\n'
        + 'Options for build:\n'
        + '  --check            Exit with an error if the installed bundle was not built from\n'
        + '                     the current configuration and exifreader version. Never builds.\n'
        + '  --if-needed        Build only if the installed bundle is not already up to date.\n'
        + '  --config <path>    Read the configuration from a JSON file holding the\n'
        + '                     include/exclude object.\n'
        + '  --auto <paths...>  Build the configuration that analyze prints for these images\n'
        + '                     instead of reading one. The configuration is not saved.\n'
        + '  --verify <paths...>\n'
        + '                     After building, read these images with the full parser and\n'
        + '                     with the installed bundle, and fail on any difference.\n'
        + '\n'
        + 'Options for analyze:\n'
        + '  --write            Put the configuration in your project\'s package.json, replacing\n'
        + '                     its include or exclude section.\n'
        + '\n'
        + 'Options:\n'
        + '  -h, --help         Show this help.\n'
        + '  -v, --version      Show the exifreader version.\n'
        + '\n'
        + 'Run this after installing exifreader and adding an "exifreader" section to your\n'
        + 'package.json. It replaces the deprecated automatic postinstall rebuild.';
}

function runBuildCommand(args, deps) {
    const cwd = deps.cwd();
    const install = deps.checkLocalInstall(cwd);
    if (!install.ok) {
        fail(deps, install.message);
        return undefined;
    }

    if (args.check && args.ifNeeded) {
        fail(deps, '--check and --if-needed cannot be used together. Use --check to only verify the '
            + 'installed bundle, or --if-needed to build it when it is out of date.');
        return undefined;
    }

    const sampleError = sampleOptionError(args);
    if (sampleError) {
        fail(deps, sampleError);
        return undefined;
    }

    let imagePaths;
    if (args.auto || args.verify) {
        imagePaths = collectImages(args.paths, cwd, deps);
        if (!imagePaths) {
            return undefined;
        }
    }

    if (args.auto) {
        return runAutoBuild(args, cwd, imagePaths, install, deps);
    }

    const resolved = resolveBuildConfig(args, cwd, deps);
    if (resolved.error) {
        fail(deps, resolved.error);
        return undefined;
    }
    const config = resolved.config;

    if (args.check) {
        runCheck(config, install, deps);
        return undefined;
    }

    if (!config) {
        fail(deps, noConfigMessage());
        return undefined;
    }

    buildUnlessUpToDate(config, args, install, deps);

    if (args.verify) {
        return failOnRejection(verifyBuild(imagePaths, cwd, install, deps), deps);
    }
    return undefined;
}

function fail(deps, message) {
    deps.error(message);
    deps.exit(1);
}

function sampleOptionError(args) {
    if (args.write) {
        return '--write is an option of analyze, not build. To save the configuration, run '
            + '"npx exifreader analyze <paths...> --write", then "npx exifreader build".';
    }
    if (args.auto && args.config !== undefined) {
        return '--auto and --config cannot be used together. --auto builds the configuration it derives '
            + 'from the images, so leave out --config.';
    }
    if (args.auto && args.check) {
        return '--auto and --check cannot be used together. --check never builds, and --auto does not '
            + 'save the configuration it derives, so there is nothing for --check to compare against.';
    }
    if (args.verify && args.check) {
        return '--verify and --check cannot be used together. To compare the installed bundle with the '
            + 'full parser without rebuilding an up-to-date one, use --verify with --if-needed.';
    }
    if ((args.auto || args.verify) && args.paths.length === 0) {
        const flag = args.auto ? '--auto' : '--verify';
        return `${flag} needs the image files or directories to read, for example `
            + `"npx exifreader build ${flag} ./samples".`;
    }
    if (!args.auto && !args.verify && args.paths.length > 0) {
        return `Unexpected argument: ${args.paths.join(' ')}. Image paths are only read with --auto or `
            + '--verify, for example "npx exifreader build --auto ./samples".';
    }
    return undefined;
}

function collectImages(paths, cwd, deps) {
    let collected;
    try {
        collected = collectImagePaths(paths.map((imagePath) => path.resolve(cwd, imagePath)), deps.fs);
    } catch (error) {
        fail(deps, error.message);
        return undefined;
    }
    reportSkipped(collected.skipped, deps);
    if (collected.paths.length === 0) {
        fail(deps, `No files were found in ${paths.join(', ')}.`);
        return undefined;
    }
    return collected.paths;
}

function reportSkipped(skipped, deps) {
    for (const entry of skipped) {
        deps.error(`Skipped ${entry.path}: ${entry.message}`);
    }
}

function runAutoBuild(args, cwd, imagePaths, install, deps) {
    return failOnRejection(analyzeSample(imagePaths, cwd, deps).then((analysis) => {
        if (!analysis) {
            return undefined;
        }
        buildUnlessUpToDate(analysis.config, args, install, deps);
        return args.verify ? verifyBuild(analysis.imagePaths, cwd, install, deps) : undefined;
    }), deps);
}

function failOnRejection(promise, deps) {
    return promise.catch((error) => fail(deps, error.message));
}

// Prints the derived configuration on stdout and the summary on stderr, and
// resolves to the configuration and the images it was derived from. Resolves
// to undefined after failing when no image could be read.
async function analyzeSample(imagePaths, cwd, deps) {
    const domParser = deps.resolveDomParser(cwd);
    if (!domParser) {
        deps.error('@xmldom/xmldom was not found, so the XMP content of the images was not read. '
            + 'XMP is still included in the configuration when an image has it.');
    }
    const parser = await deps.loadFullParser();
    const {results, skipped} = await withoutConsoleWarnings(!domParser, () => analyzeImages(imagePaths, {fs: deps.fs, parser, domParser}));
    reportSkipped(skipped, deps);
    if (results.length === 0) {
        fail(deps, 'None of the given files could be read as an image, so there is nothing to analyze.');
        return undefined;
    }

    const derived = deriveConfig(results.map((result) => result.tags));
    deps.log(JSON.stringify(derived.config, null, 2));
    deps.error(`Analyzed ${countOf(results.length, 'image')} (${derived.fileTypes.join(', ')}).`);
    for (const warning of derived.warnings) {
        deps.error(warning);
    }
    return {config: derived.config, imagePaths: results.map((result) => result.path)};
}

// Without a DOM parser, ExifReader warns on the console for every image with
// XMP. The CLI prints one line about it instead.
async function withoutConsoleWarnings(silence, action) {
    if (!silence) {
        return action();
    }
    const originalWarn = console.warn;
    console.warn = ignoreWarning;
    try {
        return await action();
    } finally {
        console.warn = originalWarn;
    }
}

function ignoreWarning() {
    return undefined;
}

function countOf(count, noun) {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function buildUnlessUpToDate(config, args, install, deps) {
    if (args.ifNeeded && bundleState(config, install, deps) === 'up to date') {
        deps.log(upToDateMessage(install.distPath));
        return;
    }

    if (install.shared) {
        deps.error(sharedInstallMessage(install.distPath));
    }
    deps.log(`Building a custom exifreader bundle at ${install.distPath}`);
    deps.build({config});
}

async function verifyBuild(imagePaths, cwd, install, deps) {
    const domParser = deps.resolveDomParser(cwd);
    if (!domParser) {
        deps.error('@xmldom/xmldom was not found, so XMP was compared at group level only.');
    }
    const fullParser = await deps.loadFullParser();
    const customParser = deps.loadCustomParser(install.distPath);
    const {results, skipped} = await withoutConsoleWarnings(
        !domParser,
        () => verifyImages(imagePaths, {fs: deps.fs, fullParser, customParser, domParser})
    );
    reportSkipped(skipped, deps);
    if (results.length === 0) {
        fail(deps, 'None of the given files could be read as an image, so nothing was verified.');
        return;
    }

    const differing = results.filter((result) => result.differences.length > 0);
    for (const result of differing) {
        deps.error(result.path);
        for (const difference of result.differences) {
            deps.error(`  ${difference}`);
        }
    }
    if (differing.length > 0) {
        fail(deps, `${differing.length} of ${countOf(results.length, 'image')} gave a different result with the `
            + 'custom build than with the full parser.');
        return;
    }
    deps.log(`${results.length === 1 ? 'The image' : `All ${results.length} images`} gave the same result with the `
        + 'custom build as with the full parser.');
}

function runAnalyzeCommand(args, deps) {
    const cwd = deps.cwd();
    if (args.paths.length === 0) {
        fail(deps, 'analyze needs the image files or directories to read, for example '
            + '"npx exifreader analyze ./samples".');
        return undefined;
    }

    let packageDir;
    if (args.write) {
        packageDir = nearestPackageDir(cwd, deps.fs.existsSync);
        if (!packageDir) {
            fail(deps, `No package.json found in ${cwd} or any directory above it, so there is nowhere to `
                + 'write the configuration. Run the command from your project, or leave out --write.');
            return undefined;
        }
    }

    const imagePaths = collectImages(args.paths, cwd, deps);
    if (!imagePaths) {
        return undefined;
    }

    return failOnRejection(analyzeSample(imagePaths, cwd, deps).then((analysis) => {
        if (!analysis) {
            return;
        }
        if (packageDir) {
            writeToPackageJson(path.join(packageDir, 'package.json'), analysis.config.include, deps);
            return;
        }
        deps.error('To use it, set it as the "exifreader" section of your package.json and run '
            + '"npx exifreader build", or save it to a file and run "npx exifreader build --config <file>". '
            + 'Run this command again with --write to update package.json for you.');
    }), deps);
}

function writeToPackageJson(filePath, include, deps) {
    let outcome;
    try {
        outcome = writeConfigToPackageJson(filePath, include, deps.fs);
    } catch (error) {
        fail(deps, `Could not write the configuration to ${filePath}: ${error.message}`);
        return;
    }
    if (outcome.created) {
        deps.error(`Added an "exifreader" section with this configuration to ${filePath}.`);
    } else if (outcome.replaced) {
        deps.error(`Replaced ${JSON.stringify(outcome.replaced)} in the "exifreader" section of ${filePath}.`);
    } else {
        deps.error(`Added this configuration to the "exifreader" section of ${filePath}.`);
    }
    deps.error('Run "npx exifreader build" to build it.');
}

function resolveBuildConfig(args, cwd, deps) {
    if (args.config !== undefined) {
        return configFromFile(args.config, cwd, deps);
    }
    if (deps.env.EXIFREADER_CUSTOM_BUILD) {
        return configFromEnv(deps.env.EXIFREADER_CUSTOM_BUILD);
    }
    return {config: deps.resolveConfig(cwd)};
}

function configFromFile(configArg, cwd, deps) {
    if (configArg === '') {
        return {error: '--config needs a path to a JSON file with the custom build configuration, '
            + 'for example "npx exifreader build --config exifreader.json".'};
    }

    const filePath = path.resolve(cwd, configArg);
    let config;
    try {
        config = deps.readConfigFile(filePath);
    } catch (error) {
        return {error: `Could not read the custom build configuration file ${filePath}: ${error.message}`};
    }
    return checkedConfig(config, `The custom build configuration file ${filePath}`);
}

/**
 * Read a JSON file, ignoring a leading UTF-8 byte order mark.
 *
 * @param {string} filePath Absolute path of the file.
 * @returns {*} The parsed JSON value. Throws when the file cannot be read or is
 *   not valid JSON.
 */
function readConfigFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function checkedConfig(config, source) {
    if (config && (config.include || config.exclude)) {
        return {config};
    }
    return {error: `${source} must hold a JSON object with an "include" or "exclude" section, `
        + 'for example {"include": {"jpeg": true}}.'};
}

function configFromEnv(value) {
    let config;
    try {
        config = JSON.parse(value);
    } catch (error) {
        return {error: `EXIFREADER_CUSTOM_BUILD is not valid JSON: ${error.message}. Set it to the custom `
            + 'build configuration object, for example {"include": {"jpeg": true}}, or unset it.'};
    }
    return checkedConfig(config, 'EXIFREADER_CUSTOM_BUILD');
}

function runCheck(config, install, deps) {
    if (!config) {
        deps.log('No ExifReader custom build configuration found, so there is nothing to check.');
        deps.exit(0);
        return;
    }

    const state = bundleState(config, install, deps);
    if (state === 'up to date') {
        deps.log(upToDateMessage(install.distPath));
        deps.exit(0);
        return;
    }
    fail(deps, state === 'stock' ? stockBundleMessage(install.distPath) : staleBundleMessage(install.distPath));
}

function bundleState(config, install, deps) {
    const marker = deps.readMarker(path.dirname(install.distPath));
    if (markerMatches(marker, config, deps.version())) {
        return 'up to date';
    }
    return marker === undefined ? 'stock' : 'stale';
}

function upToDateMessage(distPath) {
    return `The custom exifreader bundle at ${distPath} is up to date.`;
}

function stockBundleMessage(distPath) {
    return `The exifreader bundle at ${distPath} is the stock full build, not a custom build. `
        + 'Run "npx exifreader build" to build it from your configuration.';
}

function staleBundleMessage(distPath) {
    return `The custom exifreader bundle at ${distPath} was built from a different configuration or `
        + 'exifreader version. Run "npx exifreader build" to rebuild it.';
}

function sharedInstallMessage(distPath) {
    return `Warning: ${distPath} is shared by every workspace package that uses this exifreader copy, `
        + 'so they all get the same bundle and the last build wins.';
}

function noConfigMessage() {
    return 'No ExifReader custom build configuration found. Add an "exifreader" section with '
        + '"include" or "exclude" to your project\'s package.json, then run "npx exifreader build" '
        + 'again. See https://github.com/mattiasw/ExifReader#configure-a-custom-build';
}

function checkLocalInstall(cwd, options) {
    options = options || {};
    const resolve = options.resolve || defaultResolve;
    const realpath = options.realpath || fs.realpathSync;
    const rootDir = options.rootDir || EXIFREADER_ROOT_DIR;
    const exists = options.exists || fs.existsSync;
    const isPnp = options.isPnp !== undefined ? options.isPnp : !!process.versions.pnp;

    let resolvedDir;
    try {
        resolvedDir = path.dirname(resolve(cwd));
    } catch (error) {
        return {ok: false, message: notInstalledMessage(isPnp)};
    }

    const running = safeRealpath(realpath, rootDir);
    const installed = safeRealpath(realpath, resolvedDir);
    if (running !== installed) {
        return {ok: false, message: mismatchMessage(installed)};
    }

    return {
        ok: true,
        distPath: path.join(installed, 'dist', 'exif-reader.js'),
        shared: isSharedInstall(cwd, installed, exists, realpath)
    };
}

function defaultResolve(cwd) {
    return require.resolve('exifreader/package.json', {paths: [cwd]});
}

function notInstalledMessage(isPnp) {
    if (isPnp) {
        return 'exifreader could not be resolved under Yarn Plug\'n\'Play. Custom builds require a '
            + 'node_modules install: set nodeLinker: node-modules in .yarnrc.yml, run yarn, then '
            + 'run "npx exifreader build".';
    }
    return 'exifreader is not installed in this project. Run "npm install exifreader" first, then '
        + '"npx exifreader build".';
}

function safeRealpath(realpath, target) {
    try {
        return realpath(target);
    } catch (error) {
        return target;
    }
}

function mismatchMessage(installedDir) {
    return 'A different exifreader copy is installed in this project than the one being run '
        + `(installed at ${installedDir}). This usually means you ran "npx exifreader@<version>" with `
        + 'a version other than the installed one. Run "npx exifreader build" without a version pin.';
}

function isSharedInstall(cwd, installed, exists, realpath) {
    const packageDir = nearestPackageDir(cwd, exists);
    if (!packageDir) {
        return false;
    }
    return !installed.startsWith(safeRealpath(realpath, path.join(packageDir, 'node_modules')) + path.sep);
}

function nearestPackageDir(directory, exists) {
    if (exists(path.join(directory, 'package.json'))) {
        return directory;
    }
    const parent = path.dirname(directory);
    return parent === directory ? undefined : nearestPackageDir(parent, exists);
}
