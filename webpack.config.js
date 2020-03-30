/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-env node */

const path = require('path');
const webpack = require('webpack');

const plugins = [];
const excludedModules = parseConfig();

if (excludedModules) {
    console.log(
        '[INFO] Building custom bundle from this config: '
        + (process.env.npm_package_config_include ? `including ${process.env.npm_package_config_include}` : '')
        + (process.env.npm_package_config_exclude ? `excluding ${process.env.npm_package_config_exclude}` : '')
        + '\n'
    );

    plugins.push(new webpack.NormalModuleReplacementPlugin(
        new RegExp('^\\./(' + flatten(Object.values(excludedModules)).join('|') + ')$'),
        './dummy.js'
    ));
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
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                loader: 'babel-loader'
            },
            {
                test: /\/image-header-(tiff|jpeg|png|heic)\.js$/,
                loader: 'string-replace-loader',
                options: {
                    multiple: getConstantReplacements(excludedModules)
                }
            }
        ]
    },
    node: {
        Buffer: false
    },
    plugins
};

function parseConfig() {
    const excludeModules = {
        'file': 'file-tags',
        'exif': ['tags', 'thumbnail'],
        'iptc': 'iptc-tags',
        'xmp': 'xmp-tags',
        'icc': 'icc-tags',
        'thumbnail': 'thumbnail',
        'tiff': 'image-header-tiff',
        'jpeg': ['file-tags', 'iptc-tags', 'icc-tags', 'thumbnail', 'image-header-jpeg'],
        'png': ['png-file-tags', 'image-header-png'],
        'heic': 'image-header-heic'
    };

    if (process.env.npm_package_config_include) {
        const excludes = {};
        const includes = process.env.npm_package_config_include.split(',');
        for (const module in excludeModules) {
            if (!includes.includes(module) && ((module !== 'exif') || !includes.includes('thumbnail'))) {
                excludes[module] = excludeModules[module];
            }
        }
        return excludes;
    }

    if (process.env.npm_package_config_exclude) {
        const excludes = {};
        process.env.npm_package_config_exclude
            .split(',')
            .map((module) => excludeModules[module] && module)
            .filter((module) => module !== undefined)
            .forEach((module) => excludes[module] = excludeModules[module]);
        return excludes;
    }

    return false;
}

function flatten(array) {
    return [].concat(...array);
}

function getConstantReplacements(excludes) {
    const uses = {
        'file': true,
        'exif': true,
        'iptc': true,
        'xmp': true,
        'icc': true
    };
    const replacements = [];
    if (excludes) {
        for (const use in uses) {
            replacements.push({
                search: `Constants\\.USE_${use.toUpperCase()}`,
                flags: 'g',
                replace: JSON.stringify(!excludes[use])
            });
        }
    }

    return replacements;
}
