/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-env node */

const path = require('path');
const findConfigFromClosestPackageJson = require('./bin/findDependentConfig');
const TagFilterPlugin = require('./bin/TagFilterPlugin');

const config = getConfig();
const includedModules = parseConfig(config);

if (includedModules) {
    // eslint-disable-next-line no-console
    console.log(
        '[INFO] Building custom bundle from this config: '
        + (config.include ? `including ${JSON.stringify(config.include)}` : '')
        + (config.exclude ? `excluding ${JSON.stringify(config.exclude)}` : '')
        + '\n'
    );
}

module.exports = {
    mode: 'production',
    entry: {
        'exif-reader': path.resolve('./src/exif-reader.js')
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        library: 'ExifReader',
        libraryTarget: 'umd',
        globalObject: 'typeof self !== \'undefined\' ? self : this'
    },
    devtool: 'source-map',
    devServer: {
        contentBase: [path.join(__dirname, 'examples'), path.join(__dirname, 'src')],
        contentBasePublicPath: ['/', '/src'],
        https: true,
        open: !process.env.CI,
        watchContentBase: !process.env.CI,
        liveReload: !process.env.CI
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        plugins: includedModules ? [
                            [TagFilterPlugin, {include: includedModules}]
                        ] : []
                    }
                }
            },
            {
                test: /\/(exif-reader|image-header-?(tiff|jpeg|png|heic)?)\.js$/,
                loader: 'string-replace-loader',
                options: {
                    multiple: getConstantReplacements(includedModules)
                }
            }
        ]
    },
    node: {
        Buffer: false
    }
};

function parseConfig({include: includesConfig, exclude: excludesConfig}) {
    const modules = [
        'file',
        'exif',
        'iptc',
        'xmp',
        'icc',
        'thumbnail',
        'tiff',
        'jpeg',
        'png',
        'heic'
    ];

    if (includesConfig) {
        const includes = {};
        for (const module of modules) {
            includes[module] = (Object.keys(includesConfig).includes(module)
                || ((module === 'exif') && Object.keys(includesConfig).includes('thumbnail')))
                && includesConfig[module];
        }
        return includes;
    }

    if (excludesConfig) {
        const includes = {};
        for (const module of modules) {
            includes[module] = !(excludesConfig.includes(module)
                || ((module === 'thumbnail') && excludesConfig.includes('exif')));
        }
        return includes;
    }

    return false;
}

function getConfig() {
    const packageJson = findConfigFromClosestPackageJson();

    if (packageJson && packageJson.include) {
        if (Array.isArray(packageJson.include.exif)) {
            // Mandatory tags that are needed to be able to find the rest of them.
            packageJson.include.exif.push('Exif IFD Pointer');
            packageJson.include.exif.push('GPS Info IFD Pointer');
            packageJson.include.exif.push('Interoperability IFD Pointer');
            packageJson.include.exif.push('IPTC-NAA');
            packageJson.include.exif.push('ApplicationNotes');
        }
        return {include: packageJson.include};
    }
    if (packageJson && packageJson.exclude) {
        return {exclude: getConfigValues(packageJson.exclude)};
    }

    return false;
}

function getConfigValues(configObject) {
    return Object.keys(configObject).filter((key) => !!configObject[key]);
}

function getConstantReplacements(modules) {
    const replacements = [];

    if (modules) {
        for (const module in modules) {
            replacements.push({
                search: `Constants\\.USE_${module.toUpperCase()}`,
                flags: 'g',
                replace: JSON.stringify(!!modules[module])
            });
        }
    }

    return replacements;
}
