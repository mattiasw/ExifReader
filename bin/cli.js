#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */

const path = require('path');
const fs = require('fs');

const EXIFREADER_ROOT_DIR = path.join(__dirname, '..');

module.exports = {parseArgs, run, checkLocalInstall};

// build.js is required lazily (only when run) so importing this file in unit
// tests does not pull its integration-tested build logic into coverage.
if (require.main === module) {
    run(process.argv, {
        cwd: () => process.cwd(),
        env: process.env,
        version: () => require(path.join(EXIFREADER_ROOT_DIR, 'package.json')).version,
        resolveConfig: (directory) => require('./findDependentConfig').forCli(directory),
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
        runBuildCommand(deps);
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
        command: args.filter((arg) => !arg.startsWith('-'))[0],
        help: args.includes('-h') || args.includes('--help'),
        version: args.includes('-v') || args.includes('--version')
    };
}

function helpText() {
    return 'Usage: npx exifreader <command>\n'
        + '\n'
        + 'Commands:\n'
        + '  build          Rebuild dist/exif-reader.js using the "exifreader" custom build\n'
        + '                 configuration (include/exclude) in your project\'s package.json.\n'
        + '\n'
        + 'Options:\n'
        + '  -h, --help     Show this help.\n'
        + '  -v, --version  Show the exifreader version.\n'
        + '\n'
        + 'Run this after installing exifreader and adding an "exifreader" section to your\n'
        + 'package.json. It replaces the deprecated automatic postinstall rebuild.';
}

function runBuildCommand(deps) {
    const cwd = deps.cwd();
    const install = deps.checkLocalInstall(cwd);
    if (!install.ok) {
        deps.error(install.message);
        deps.exit(1);
        return;
    }

    // An explicit EXIFREADER_CUSTOM_BUILD env var overrides package.json. Webpack
    // reads it directly, so skip resolution and build.
    if (deps.env.EXIFREADER_CUSTOM_BUILD) {
        deps.build();
        return;
    }

    const config = deps.resolveConfig(cwd);
    if (!config) {
        deps.error(noConfigMessage());
        deps.exit(1);
        return;
    }

    deps.log(`Building a custom exifreader bundle at ${install.distPath}`);
    deps.build({config});
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

    return {ok: true, distPath: path.join(installed, 'dist', 'exif-reader.js')};
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
