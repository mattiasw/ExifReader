#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */

const path = require('path');
const fs = require('fs');
const {readMarker, markerMatches} = require('./custom-build-marker');

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
        runBuildCommand(args, deps);
        return;
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
        config: configPath(args)
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
        + '\n'
        + 'Options for build:\n'
        + '  --check            Exit with an error if the installed bundle was not built from\n'
        + '                     the current configuration and exifreader version. Never builds.\n'
        + '  --if-needed        Build only if the installed bundle is not already up to date.\n'
        + '  --config <path>    Read the configuration from a JSON file holding the\n'
        + '                     include/exclude object.\n'
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
        return;
    }

    if (args.check && args.ifNeeded) {
        fail(deps, '--check and --if-needed cannot be used together. Use --check to only verify the '
            + 'installed bundle, or --if-needed to build it when it is out of date.');
        return;
    }

    const resolved = resolveBuildConfig(args, cwd, deps);
    if (resolved.error) {
        fail(deps, resolved.error);
        return;
    }
    const config = resolved.config;

    if (args.check) {
        runCheck(config, install, deps);
        return;
    }

    if (!config) {
        fail(deps, noConfigMessage());
        return;
    }

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

function fail(deps, message) {
    deps.error(message);
    deps.exit(1);
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
