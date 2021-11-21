/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-env node */

const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
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
    mode: process.env.NODE_ENV || 'production',
    optimization: {
        minimizer: [new TerserPlugin({
            terserOptions: {
                compress: {
                    arguments: true,
                    booleans_as_integers: true,
                    passes: 3,
                    typeofs: false, // IE10 needs typeofs to be false.
                    unsafe: true,
                },
                sourceMap: true,
            }
        })]
    },
    entry: {
        'exif-reader': path.resolve('./src/exif-reader.js')
    },
    output: {
        library: {
            name: 'ExifReader',
            type: 'umd'
        },
        globalObject: 'typeof self !== \'undefined\' ? self : this'
    },
    devtool: 'source-map',
    devServer: {
        static: [
            {
                directory: path.join(__dirname, 'examples'),
                publicPath: '/',
                watch: !process.env.CI
            },
            {
                directory: path.join(__dirname, 'src'),
                publicPath: '/src',
                watch: !process.env.CI
            }
        ],
        https: true,
        open: !process.env.CI,
        liveReload: !process.env.CI
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules(?!.exifreader)/,
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
                test: /\/(exif-reader|image-header-?(tiff|jpeg|png|heic|webp)?|tag-names)\.js$/,
                loader: 'string-replace-loader',
                options: {
                    multiple: getConstantReplacements(includedModules)
                }
            }
        ]
    }
};

function parseConfig({include: includesConfig, exclude: excludesConfig}) {
    const modules = [
        'file',
        'jfif',
        'png_file',
        'exif',
        'iptc',
        'xmp',
        'icc',
        'mpf',
        'thumbnail',
        'tiff',
        'jpeg',
        'png',
        'heic',
        'webp'
    ];

    if (includesConfig) {
        const includes = {};
        for (const module of modules) {
            includes[module] =
                (
                    Object.keys(includesConfig).includes(module)
                    || ((module === 'exif') && Object.keys(includesConfig).includes('thumbnail'))
                    || ((module === 'exif') && Object.keys(includesConfig).includes('mpf'))
                )
                && includesConfig[module];
        }
        return includes;
    }

    if (excludesConfig) {
        const includes = {};
        for (const module of modules) {
            includes[module] =
                !(
                    excludesConfig.includes(module)
                    || ((module === 'thumbnail') && excludesConfig.includes('exif'))
                    || ((module === 'mpf') && excludesConfig.includes('exif'))
                );
        }
        return includes;
    }

    return false;
}

function getConfig() {
    const packageJson = getPackageJson();

    if (packageJson && packageJson.include) {
        if (Array.isArray(packageJson.include.exif)) {
            // Mandatory tags that are needed to be able to find the rest of them.
            packageJson.include.exif.push('Exif IFD Pointer');
            if (includesGpsTag(packageJson.include.exif)) {
                packageJson.include.exif.push('GPS Info IFD Pointer');
            }
            if (includesInteroperabilityTag(packageJson.include.exif)) {
                packageJson.include.exif.push('Interoperability IFD Pointer');
            }
            if (packageJson.include.iptc) {
                packageJson.include.exif.push('IPTC-NAA');
            }
            if (packageJson.include.xmp) {
                packageJson.include.exif.push('ApplicationNotes');
            }
            if (packageJson.include.icc) {
                packageJson.include.exif.push('ICC_Profile');
            }
        }
        return {include: packageJson.include};
    }
    if (packageJson && packageJson.exclude) {
        return {exclude: getConfigValues(packageJson.exclude)};
    }

    return false;
}

function getPackageJson() {
    if (process.env.EXIFREADER_CUSTOM_BUILD) {
        return JSON.parse(process.env.EXIFREADER_CUSTOM_BUILD);
    }
    return findConfigFromClosestPackageJson();
}

function includesGpsTag(tags) {
    for (const tag of tags) {
        if (tag.toLowerCase().startsWith('gps')) {
            return true;
        }
    }
    return false;
}

function includesInteroperabilityTag(tags) {
    for (const tag of tags) {
        if (tag.toLowerCase().startsWith('interoperability') || tag.toLowerCase().startsWith('relatedimage')) {
            return true;
        }
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
